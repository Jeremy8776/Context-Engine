#!/usr/bin/env python3
"""
tokenomics.py — Benchmark CE's token efficiency vs the no-CE baseline.

For each task in a corpus, measures three numbers and compares them
apples-to-apples (same tokenizer, same content type — full skill bodies):

  raw_all   — tokens an MCP host pulls if it loads every active skill in
              full. The realistic ceiling: this is what a naive integration
              consumes when it "just gets all the context up front".
  smart     — tokens after CE's smart-compile picks the relevant skills
              for THIS task. Same content type as raw_all (full bodies),
              just a subset.
  search    — tokens an MCP host (Claude Desktop / Codex) actually pulls
              via `context_engine_search` — chunks, not whole skills.

Savings columns compare smart and search against raw_all (the realistic
no-CE baseline).

Reference: CONTEXT.md is also reported. CE pre-compresses every active
skill into a system-prompt summary; that's a *different* path from the
raw-body comparison above (it's what a CE-using-with-no-smart-compile
user puts in their system prompt today). Reported so the user can see
both numbers, not as the main comparison.

Token counts use tiktoken's cl100k_base (close to Anthropic's tokenizer;
within ~5% on prose; consistent across runs). When tiktoken isn't
installed, falls back to a ~4-chars-per-token heuristic.

CE must be running locally. Default base URL is http://127.0.0.1:3847.

Usage:
    python bench/tokenomics.py
    python bench/tokenomics.py --ce-url http://127.0.0.1:3847
    python bench/tokenomics.py --tasks bench/tasks.json --out bench/results.json
    python bench/tokenomics.py --max-tokens 4000   # small-context model
    python bench/tokenomics.py --search-limit 10   # MCP retrieval depth

Exit codes:
    0  ran cleanly (even if some tasks failed individually)
    1  CE not reachable or fatal config error
"""

from __future__ import annotations

import argparse
import io
import json
import os
import statistics
import sys
import time
from dataclasses import asdict, dataclass, field
from typing import Optional

# Force stdout to UTF-8 on Windows so the pretty table (with arrows, deltas,
# pipes, etc.) doesn't blow up under cp1252. Safe no-op elsewhere.
if hasattr(sys.stdout, "reconfigure"):
    try:
        sys.stdout.reconfigure(encoding="utf-8")  # type: ignore[attr-defined]
    except Exception:
        pass

try:
    import requests
except ImportError:
    sys.stderr.write(
        "tokenomics.py needs the `requests` package.\n"
        "Install it:  python -m pip install requests tiktoken\n"
    )
    sys.exit(1)

# --- Token counting --------------------------------------------------------

_TIKTOKEN_AVAILABLE = False
try:
    import tiktoken

    _ENC = tiktoken.get_encoding("cl100k_base")
    _TIKTOKEN_AVAILABLE = True

    def count_tokens(text: str) -> int:
        return len(_ENC.encode(text or "", disallowed_special=()))

except ImportError:

    def count_tokens(text: str) -> int:
        # Crude fallback. Off by ~10% vs real BPE on English prose but
        # consistent across runs so saving percentages remain comparable.
        return max(1, len(text or "") // 4)


# --- Defaults --------------------------------------------------------------

DEFAULT_CE_URL = "http://127.0.0.1:3847"
DEFAULT_MAX_TOKENS = 16000
DEFAULT_SEARCH_LIMIT = 8
HERE = os.path.dirname(os.path.abspath(__file__))
DEFAULT_TASKS_PATH = os.path.join(HERE, "tasks.json")
DEFAULT_OUT_PATH = os.path.join(HERE, "results-latest.json")


# --- HTTP helpers ----------------------------------------------------------


def get_json(ce_url: str, path: str, timeout: float = 15.0):
    resp = requests.get(f"{ce_url}{path}", timeout=timeout)
    resp.raise_for_status()
    return resp.json()


def post_json(ce_url: str, path: str, payload: dict, timeout: float = 60.0):
    resp = requests.post(f"{ce_url}{path}", json=payload, timeout=timeout)
    resp.raise_for_status()
    return resp.json()


def reachable(ce_url: str) -> bool:
    try:
        requests.get(f"{ce_url}/api/health", timeout=4.0).raise_for_status()
        return True
    except Exception:
        return False


# --- Baseline / smart / search measurements --------------------------------


def fetch_compiled_baseline(ce_url: str) -> str:
    """All-active compiled prompt — what CE would emit as CONTEXT.md."""
    data = get_json(ce_url, "/api/context-md")
    if isinstance(data, dict):
        return data.get("content") or data.get("contextMd") or ""
    return str(data or "")


def fetch_active_skill_bodies(ce_url: str) -> dict[str, str]:
    """Map of {skill_id: body} for every skill marked active.

    Used to compute smart_tokens (sum of selected skill bodies) without
    relying on CE's own estimator — gives an independent verification of
    the savings number CE's smart-compile response reports.
    """
    skills = get_json(ce_url, "/api/skills")
    states_resp = get_json(ce_url, "/api/states")
    states = states_resp.get("states", states_resp) if isinstance(states_resp, dict) else {}
    bodies: dict[str, str] = {}
    for s in skills:
        sid = s.get("id")
        if not sid:
            continue
        # Active if explicitly true OR (no entry AND not 'external' type)
        if sid in states:
            if not states[sid]:
                continue
        elif s.get("type") == "external":
            continue
        try:
            detail = get_json(ce_url, f"/api/skills/{sid}", timeout=10.0)
            bodies[sid] = detail.get("body") or ""
        except Exception:
            bodies[sid] = ""
    return bodies


@dataclass
class TaskResult:
    task_id: str
    category: str
    prompt: str
    raw_all_tokens: int = 0            # naive MCP: load all active skills in full
    smart_tokens: int = 0              # smart-compile selection in full
    search_tokens: int = 0             # MCP search response (chunks)
    contextmd_tokens: int = 0          # reference: compressed CONTEXT.md
    selected_skill_count: int = 0
    active_skill_count: int = 0
    search_chunk_count: int = 0
    ce_reported_selected: int = 0      # CE's own estimate from smart-compile
    ce_reported_all_on: int = 0        # CE's own all-on estimate
    smart_saving_pct: float = 0.0
    search_saving_pct: float = 0.0
    latency_ms: int = 0
    error: str = ""


def benchmark_task(
    ce_url: str,
    task: dict,
    raw_all_tokens: int,
    contextmd_tokens: int,
    active_bodies: dict[str, str],
    max_tokens: int,
    search_limit: int,
) -> TaskResult:
    res = TaskResult(
        task_id=task.get("id", "?"),
        category=task.get("category", ""),
        prompt=task.get("prompt", ""),
        raw_all_tokens=raw_all_tokens,
        contextmd_tokens=contextmd_tokens,
        active_skill_count=len(active_bodies),
    )

    t0 = time.time()
    try:
        smart = post_json(
            ce_url,
            "/api/compile/smart",
            {"task": res.prompt, "maxTokens": max_tokens},
        )
    except Exception as e:
        res.error = f"smart_compile_failed: {e}"
        res.latency_ms = int((time.time() - t0) * 1000)
        return res

    res.latency_ms = int((time.time() - t0) * 1000)

    if smart.get("ok") is False:
        res.error = f"smart_compile_error: {smart.get('error', 'unknown')}"
        return res

    selected = smart.get("selectedSkillIds") or []
    res.selected_skill_count = len(selected)
    # Apples-to-apples: tiktoken-count the same content type (full bodies) for
    # both raw_all (sum of every active body) and smart (sum of selected
    # bodies). That makes the savings % a real measurement of skill-set
    # narrowing, not an artefact of comparing two different content types.
    res.smart_tokens = sum(count_tokens(active_bodies.get(sid, "")) for sid in selected)

    budget = smart.get("budget") or {}
    res.ce_reported_selected = int(budget.get("selectedTokens") or 0)
    res.ce_reported_all_on = int(budget.get("allOnTokens") or 0)

    # MCP search path — what a host app would pull on demand.
    try:
        search = post_json(
            ce_url,
            "/api/search",
            {"query": res.prompt, "limit": search_limit},
        )
        results = search.get("results") or []
        res.search_chunk_count = len(results)
        res.search_tokens = sum(count_tokens(r.get("text", "")) for r in results)
    except Exception as e:
        # Search needs the vector index to be built. Non-fatal — record 0
        # and keep the smart-compile numbers.
        res.search_tokens = 0
        if not res.error:
            res.error = f"search_unavailable: {e}"

    if raw_all_tokens > 0:
        res.smart_saving_pct = round(100 * (1 - res.smart_tokens / raw_all_tokens), 1)
        if res.search_tokens > 0:
            res.search_saving_pct = round(100 * (1 - res.search_tokens / raw_all_tokens), 1)

    return res


# --- Pretty printing -------------------------------------------------------


def _fmt_int(n: int) -> str:
    return f"{n:,}"


def _fmt_pct(p: float) -> str:
    if p == 0:
        return "—"
    return f"{p:.1f}%"


def print_table(results: list[TaskResult]):
    # Column spec: (heading, width, accessor, formatter)
    cols = [
        ("Task", 22, lambda r: r.task_id, str),
        ("Category", 11, lambda r: r.category or "-", str),
        ("Raw all", 9, lambda r: r.raw_all_tokens, _fmt_int),
        ("Smart", 9, lambda r: r.smart_tokens, _fmt_int),
        ("Search", 9, lambda r: r.search_tokens, _fmt_int),
        ("Sel/Act", 9, lambda r: f"{r.selected_skill_count}/{r.active_skill_count}", str),
        ("Smart saved", 12, lambda r: r.smart_saving_pct, _fmt_pct),
        ("Search saved", 13, lambda r: r.search_saving_pct, _fmt_pct),
        ("Latency", 8, lambda r: f"{r.latency_ms}ms", str),
    ]
    header = "  ".join(name.ljust(width) for name, width, _, _ in cols)
    print(header)
    print("-" * len(header))
    for r in results:
        cells = []
        for _, width, accessor, fmt in cols:
            value = accessor(r)
            cells.append(fmt(value).ljust(width))
        line = "  ".join(cells)
        if r.error:
            line += f"   ! {r.error}"
        print(line)


def print_summary(results: list[TaskResult]):
    valid = [r for r in results if r.raw_all_tokens > 0 and r.smart_tokens > 0]
    if not valid:
        print("\nNo valid measurements to summarise.")
        return

    smart_savings = [r.smart_saving_pct for r in valid]
    search_savings = [r.search_saving_pct for r in valid if r.search_saving_pct > 0]

    total_raw_all = sum(r.raw_all_tokens for r in valid)
    total_smart = sum(r.smart_tokens for r in valid)
    total_search = sum(r.search_tokens for r in valid)
    sample_contextmd = valid[0].contextmd_tokens

    print()
    print("=" * 78)
    print(f"SUMMARY  ({len(valid)} valid tasks)".center(78))
    print("=" * 78)

    print("\nBaseline definition: raw_all = sum of every active skill's full body")
    print("                     (what a naive MCP host would load up front).")
    print("                     All savings %s below are vs this number.")

    print("\nSmart-compile path:")
    print(f"  median  {statistics.median(smart_savings):>6.1f}%")
    print(f"  mean    {statistics.mean(smart_savings):>6.1f}%")
    print(f"  min     {min(smart_savings):>6.1f}%   ({min(valid, key=lambda r: r.smart_saving_pct).task_id})")
    print(f"  max     {max(smart_savings):>6.1f}%   ({max(valid, key=lambda r: r.smart_saving_pct).task_id})")

    if search_savings:
        print(f"\nMCP search path:")
        print(f"  median  {statistics.median(search_savings):>6.1f}%")
        print(f"  mean    {statistics.mean(search_savings):>6.1f}%")
        print(f"  min     {min(search_savings):>6.1f}%")
        print(f"  max     {max(search_savings):>6.1f}%")
    else:
        print("\nMCP search path: no data (vector index not built?)")

    print("\nAggregate (sum across all valid tasks):")
    print(f"  Raw all total:   {_fmt_int(total_raw_all):>12}  tokens")
    print(f"  Smart total:     {_fmt_int(total_smart):>12}  tokens   "
          f"({100 * (1 - total_smart / total_raw_all):.1f}% saved)")
    if total_search > 0:
        print(f"  Search total:    {_fmt_int(total_search):>12}  tokens   "
              f"({100 * (1 - total_search / total_raw_all):.1f}% saved)")

    if sample_contextmd > 0:
        print("\nReference (different path; not part of the savings comparison):")
        print(f"  CONTEXT.md size: {_fmt_int(sample_contextmd):>12}  tokens")
        print(f"  This is the *compressed* CE summary a user puts in their host's")
        print(f"  system prompt today. It's much smaller than raw_all because CE")
        print(f"  pre-summarises every skill into the CONTEXT.md index; reported")
        print(f"  here so you can see the two CE delivery paths side by side.")

    # Confidence check: does CE's own estimator agree with tiktoken?
    ce_estimates = [(r.ce_reported_selected, r.smart_tokens) for r in valid if r.ce_reported_selected > 0]
    if ce_estimates:
        ratios = [ce / tt for ce, tt in ce_estimates if tt > 0]
        if ratios:
            print(f"\nCE's internal estimator vs tiktoken cl100k_base:")
            print(f"  Mean ratio CE/tiktoken: {statistics.mean(ratios):.2f}x")
            print(f"  (1.0 = perfect agreement; >1 = CE over-counts, <1 = CE under-counts)")


def category_breakdown(results: list[TaskResult]):
    by_cat: dict[str, list[TaskResult]] = {}
    for r in results:
        if r.raw_all_tokens == 0:
            continue
        by_cat.setdefault(r.category or "uncategorised", []).append(r)
    if len(by_cat) <= 1:
        return
    print("\nPer-category median savings:")
    for cat in sorted(by_cat.keys()):
        rows = by_cat[cat]
        med = statistics.median(r.smart_saving_pct for r in rows)
        print(f"  {cat.ljust(20)} n={len(rows):<3}  median {med:>5.1f}%")


# --- Entry point -----------------------------------------------------------


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Benchmark Context Engine's token efficiency."
    )
    parser.add_argument("--ce-url", default=os.environ.get("CE_URL", DEFAULT_CE_URL))
    parser.add_argument("--tasks", default=DEFAULT_TASKS_PATH)
    parser.add_argument("--out", default=DEFAULT_OUT_PATH)
    parser.add_argument("--max-tokens", type=int, default=DEFAULT_MAX_TOKENS,
                        help="Smart-compile token budget per task.")
    parser.add_argument("--search-limit", type=int, default=DEFAULT_SEARCH_LIMIT,
                        help="MCP search depth — how many chunks the host pulls per task.")
    parser.add_argument("--no-out", action="store_true",
                        help="Skip writing the JSON sidecar.")
    args = parser.parse_args()

    print(f"Context Engine tokenomics benchmark")
    print(f"  CE URL:        {args.ce_url}")
    print(f"  Token counter: {'tiktoken cl100k_base' if _TIKTOKEN_AVAILABLE else 'char/4 heuristic (install tiktoken for better)'}")
    print(f"  Max tokens:    {args.max_tokens}")
    print(f"  Search depth:  {args.search_limit}")
    print()

    if not reachable(args.ce_url):
        sys.stderr.write(
            f"[!] Could not reach Context Engine at {args.ce_url}.\n"
            f"    Make sure CE is running (npm start, or launch the desktop app).\n"
        )
        return 1

    # Load tasks
    try:
        with open(args.tasks, encoding="utf-8") as f:
            tasks = json.load(f)
    except FileNotFoundError:
        sys.stderr.write(
            f"[!] Task corpus not found: {args.tasks}\n"
            f"    Create a tasks.json with [{{ id, category, prompt }}, ...] entries.\n"
        )
        return 1

    if not tasks:
        sys.stderr.write("[!] Task corpus is empty.\n")
        return 1

    # One-time fetch of baselines (shared across tasks).
    print(f"Loading active skill bodies + CONTEXT.md baseline...")
    try:
        compiled = fetch_compiled_baseline(args.ce_url)
        contextmd_tokens = count_tokens(compiled)
        active_bodies = fetch_active_skill_bodies(args.ce_url)
    except Exception as e:
        sys.stderr.write(f"[!] Baseline fetch failed: {e}\n")
        return 1

    # raw_all = sum of every active skill body. This is the realistic "no
    # smart selection" ceiling — what a naive MCP host would consume if it
    # pulled all active skills in full. All savings % below compare against
    # this number.
    raw_all_tokens = sum(count_tokens(body) for body in active_bodies.values())
    if raw_all_tokens == 0:
        sys.stderr.write("[!] No active skill bodies returned. Check skill-states / active list.\n")
        return 1
    print(f"  Active skills:  {len(active_bodies)}")
    print(f"  Raw all bodies: {_fmt_int(raw_all_tokens)} tokens  (this is the baseline)")
    if contextmd_tokens > 0:
        ratio = raw_all_tokens / contextmd_tokens if contextmd_tokens else 0
        print(f"  CONTEXT.md:     {_fmt_int(contextmd_tokens)} tokens  "
              f"(reference: CE pre-compresses {ratio:.0f}x for the system prompt)")
    print()

    # Run each task
    print(f"Running {len(tasks)} tasks...")
    results: list[TaskResult] = []
    for i, task in enumerate(tasks, 1):
        tid = task.get("id", f"task-{i}")
        print(f"  [{i:>2}/{len(tasks)}] {tid:<28}", end=" ", flush=True)
        r = benchmark_task(args.ce_url, task, raw_all_tokens, contextmd_tokens,
                           active_bodies, args.max_tokens, args.search_limit)
        results.append(r)
        if r.error and r.smart_tokens == 0:
            print(f"FAIL  {r.error}")
        else:
            tail = " (search n/a)" if r.error and r.search_tokens == 0 else ""
            print(f"smart {r.smart_saving_pct:>5.1f}% / search {r.search_saving_pct:>5.1f}%{tail}")

    print()
    print_table(results)
    print_summary(results)
    category_breakdown(results)

    if not args.no_out:
        payload = {
            "ce_url": args.ce_url,
            "max_tokens": args.max_tokens,
            "search_limit": args.search_limit,
            "counter": "tiktoken_cl100k_base" if _TIKTOKEN_AVAILABLE else "char_div_4",
            "raw_all_tokens": raw_all_tokens,
            "contextmd_tokens": contextmd_tokens,
            "active_skill_count": len(active_bodies),
            "task_count": len(tasks),
            "ran_at": time.strftime("%Y-%m-%dT%H:%M:%S"),
            "results": [asdict(r) for r in results],
        }
        os.makedirs(os.path.dirname(args.out) or ".", exist_ok=True)
        with open(args.out, "w", encoding="utf-8") as f:
            json.dump(payload, f, indent=2)
        print(f"\nWrote {args.out}")

    return 0


if __name__ == "__main__":
    sys.exit(main())
