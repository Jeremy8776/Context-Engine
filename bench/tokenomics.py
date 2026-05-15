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

Quality grading (optional):
  Pass --grade to actually run each task through Claude in smart and
  search modes, capture the response, and grade it 1-10 via a judge
  model. Requires ANTHROPIC_API_KEY. Defaults to Haiku for cheap runs
  (~$0.10 per full benchmark); override with --task-model / --grader-model
  for higher-quality measurement. Prints a combined tokens-plus-quality
  table so you can see the trade-off.

Usage:
    python bench/tokenomics.py
    python bench/tokenomics.py --grade
    python bench/tokenomics.py --ce-url http://127.0.0.1:3847
    python bench/tokenomics.py --tasks bench/tasks.json --out bench/results.json
    python bench/tokenomics.py --max-tokens 4000   # small-context model
    python bench/tokenomics.py --search-limit 10   # MCP retrieval depth
    python bench/tokenomics.py --grade --task-model claude-sonnet-4-5

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

# Defaults for the optional --grade pass. Haiku is cheap enough that a full
# 15-task benchmark costs ~$0.10. Override if you want a more discerning judge
# or a stronger task-runner.
DEFAULT_TASK_MODEL = "claude-haiku-4-5"
DEFAULT_GRADER_MODEL = "claude-haiku-4-5"
DEFAULT_TASK_MAX_OUTPUT = 600
DEFAULT_GRADER_MAX_OUTPUT = 200


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
    # Quality grading fields — populated only when --grade is set.
    smart_response: str = ""
    smart_response_input_tokens: int = 0   # what Anthropic billed (may differ from tiktoken)
    smart_response_output_tokens: int = 0
    smart_quality: int = 0                  # 1-10
    smart_quality_reason: str = ""
    search_response: str = ""
    search_response_input_tokens: int = 0
    search_response_output_tokens: int = 0
    search_quality: int = 0
    search_quality_reason: str = ""
    error: str = ""


JUDGE_RUBRIC = """You are grading an AI assistant's response to a user task.

Score the response 1-10 considering:
- Specificity   (1=generic platitudes, 10=concrete and task-specific)
- Actionability (1=vague, 10=clear next steps the user can follow)
- Plausibility  (1=likely wrong, 10=appears correct + well-reasoned)

Output EXACTLY two lines, nothing else:
SCORE: <integer 1-10>
REASON: <one short sentence explaining the score>"""


def build_context_text(skill_ids, active_bodies: dict[str, str]) -> str:
    """Build the system prompt section a host app would receive when given
    a specific subset of skills in full. Each skill body is delimited so
    the model can see the boundary between skills."""
    parts = []
    for sid in skill_ids:
        body = active_bodies.get(sid, "")
        if not body:
            continue
        parts.append(f"--- SKILL: {sid} ---\n{body}".rstrip())
    return "\n\n".join(parts)


def build_search_context_text(search_chunks) -> str:
    """System-prompt section from MCP search results — labelled chunks
    instead of full skills."""
    parts = []
    for i, chunk in enumerate(search_chunks, 1):
        sid = chunk.get("skillId") or "?"
        section = chunk.get("section") or "?"
        text = chunk.get("text") or ""
        parts.append(f"--- CHUNK {i}: skill={sid} section={section} ---\n{text}".rstrip())
    return "\n\n".join(parts)


def call_claude(client, model: str, system_text: str, user_text: str, max_output: int):
    """One Anthropic call; returns text + token usage."""
    resp = client.messages.create(
        model=model,
        max_tokens=max_output,
        system=system_text,
        messages=[{"role": "user", "content": user_text}],
    )
    text = ""
    for block in resp.content:
        if getattr(block, "type", None) == "text":
            text += block.text
    return {
        "text": text.strip(),
        "input_tokens": int(resp.usage.input_tokens),
        "output_tokens": int(resp.usage.output_tokens),
    }


def grade_response(client, model: str, task_prompt: str, response_text: str):
    """Returns (score 1-10, reason str, tokens int). Score defaults to 0 if
    parsing fails, with the raw text preserved in reason for debugging."""
    if not response_text.strip():
        return 0, "(empty response)", 0
    user = f"TASK PROMPT:\n{task_prompt}\n\nRESPONSE TO GRADE:\n{response_text}"
    try:
        out = call_claude(client, model, JUDGE_RUBRIC, user, DEFAULT_GRADER_MAX_OUTPUT)
    except Exception as e:
        return 0, f"(grader error: {e})", 0
    score = 0
    reason = out["text"]
    for line in out["text"].splitlines():
        line = line.strip()
        if line.upper().startswith("SCORE:"):
            digits = "".join(ch for ch in line.split(":", 1)[1] if ch.isdigit())
            if digits:
                score = max(1, min(10, int(digits)))
        elif line.upper().startswith("REASON:"):
            reason = line.split(":", 1)[1].strip()
    return score, reason, out["input_tokens"] + out["output_tokens"]


def grade_task(client, task_model: str, grader_model: str, task: dict,
               smart_ctx: str, search_ctx: str) -> dict:
    """Run the task through Claude under smart and search contexts, grade
    each output. Returns a dict with response text + tokens + scores."""
    prompt = task.get("prompt", "")
    out = {
        "smart_response": "", "smart_input_tokens": 0, "smart_output_tokens": 0,
        "smart_quality": 0, "smart_quality_reason": "",
        "search_response": "", "search_input_tokens": 0, "search_output_tokens": 0,
        "search_quality": 0, "search_quality_reason": "",
    }
    for mode, ctx in (("smart", smart_ctx), ("search", search_ctx)):
        if not ctx.strip():
            continue
        system = (
            "You are an AI assistant. The following knowledge has been retrieved "
            "for the user's task. Use it where relevant.\n\n" + ctx
        )
        try:
            resp = call_claude(client, task_model, system, prompt, DEFAULT_TASK_MAX_OUTPUT)
        except Exception as e:
            out[f"{mode}_response"] = f"(call failed: {e})"
            continue
        out[f"{mode}_response"] = resp["text"]
        out[f"{mode}_input_tokens"] = resp["input_tokens"]
        out[f"{mode}_output_tokens"] = resp["output_tokens"]
        score, reason, _ = grade_response(client, grader_model, prompt, resp["text"])
        out[f"{mode}_quality"] = score
        out[f"{mode}_quality_reason"] = reason
    return out


def benchmark_task(
    ce_url: str,
    task: dict,
    raw_all_tokens: int,
    contextmd_tokens: int,
    active_bodies: dict[str, str],
    max_tokens: int,
    search_limit: int,
    grade_client=None,
    task_model: str = DEFAULT_TASK_MODEL,
    grader_model: str = DEFAULT_GRADER_MODEL,
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
    search_chunks = []
    try:
        search = post_json(
            ce_url,
            "/api/search",
            {"query": res.prompt, "limit": search_limit},
        )
        search_chunks = search.get("results") or []
        res.search_chunk_count = len(search_chunks)
        res.search_tokens = sum(count_tokens(r.get("text", "")) for r in search_chunks)
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

    # Optional quality pass: actually run the task through Claude in both
    # smart and search modes, capture the output, and grade it 1-10 via a
    # judge model. Skipped when grade_client is None (the default).
    if grade_client is not None:
        smart_ctx = build_context_text(selected, active_bodies)
        search_ctx = build_search_context_text(search_chunks)
        graded = grade_task(grade_client, task_model, grader_model, task,
                            smart_ctx, search_ctx)
        res.smart_response = graded["smart_response"]
        res.smart_response_input_tokens = graded["smart_input_tokens"]
        res.smart_response_output_tokens = graded["smart_output_tokens"]
        res.smart_quality = graded["smart_quality"]
        res.smart_quality_reason = graded["smart_quality_reason"]
        res.search_response = graded["search_response"]
        res.search_response_input_tokens = graded["search_input_tokens"]
        res.search_response_output_tokens = graded["search_output_tokens"]
        res.search_quality = graded["search_quality"]
        res.search_quality_reason = graded["search_quality_reason"]

    return res


# --- Pretty printing -------------------------------------------------------


def _fmt_int(n: int) -> str:
    return f"{n:,}"


def _fmt_pct(p: float) -> str:
    if p == 0:
        return "—"
    return f"{p:.1f}%"


def print_table(results: list[TaskResult], graded: bool):
    if graded:
        cols = [
            ("Task", 22, lambda r: r.task_id, str),
            ("Category", 11, lambda r: r.category or "-", str),
            ("Smart tok", 10, lambda r: r.smart_tokens, _fmt_int),
            ("Smart Q", 8, lambda r: f"{r.smart_quality}/10", str),
            ("Search tok", 11, lambda r: r.search_tokens, _fmt_int),
            ("Search Q", 9, lambda r: f"{r.search_quality}/10", str),
            ("Smart saved", 12, lambda r: r.smart_saving_pct, _fmt_pct),
            ("Search saved", 13, lambda r: r.search_saving_pct, _fmt_pct),
        ]
    else:
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


def print_summary(results: list[TaskResult], graded: bool = False):
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

    if not graded:
        return

    # Quality (1-10) per mode + tokens-per-quality-point efficiency. The
    # interesting question isn't "did we save tokens" but "did we save
    # tokens AND keep answer quality". A high tokens-per-quality-point
    # number means we paid a lot for each quality unit; lower is better.
    smart_q = [r.smart_quality for r in valid if r.smart_quality > 0]
    search_q = [r.search_quality for r in valid if r.search_quality > 0]
    if smart_q or search_q:
        print()
        print("-" * 78)
        print("Quality (1-10, judged by separate LLM)".center(78))
        print("-" * 78)
        if smart_q:
            print(f"\nSmart-compile path:")
            print(f"  median  {statistics.median(smart_q):>6.1f} / 10")
            print(f"  mean    {statistics.mean(smart_q):>6.1f} / 10")
            print(f"  min     {min(smart_q):>6}   /10")
            print(f"  max     {max(smart_q):>6}   /10")
        if search_q:
            print(f"\nMCP search path:")
            print(f"  median  {statistics.median(search_q):>6.1f} / 10")
            print(f"  mean    {statistics.mean(search_q):>6.1f} / 10")
            print(f"  min     {min(search_q):>6}   /10")
            print(f"  max     {max(search_q):>6}   /10")

        # Efficiency: tokens consumed per quality point. Apples-to-apples
        # if the same task corpus was used; lower = better leverage.
        smart_total = sum(r.smart_tokens for r in valid if r.smart_quality > 0)
        smart_q_total = sum(r.smart_quality for r in valid if r.smart_quality > 0)
        search_total = sum(r.search_tokens for r in valid if r.search_quality > 0)
        search_q_total = sum(r.search_quality for r in valid if r.search_quality > 0)
        print(f"\nTokens per quality point (lower = better leverage):")
        if smart_q_total:
            print(f"  Smart:  {smart_total / smart_q_total:>10,.0f}  tokens / quality point")
        if search_q_total:
            print(f"  Search: {search_total / search_q_total:>10,.0f}  tokens / quality point")
        if smart_q_total and search_q_total:
            ratio = (smart_total / smart_q_total) / (search_total / search_q_total)
            print(f"  Search delivers {ratio:.0f}x more quality per token than smart-compile.")


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
    parser.add_argument("--grade", action="store_true",
                        help="Also run each task through Claude in smart + search "
                             "modes and grade outputs 1-10 via a judge model. "
                             "Requires ANTHROPIC_API_KEY.")
    parser.add_argument("--task-model", default=DEFAULT_TASK_MODEL,
                        help=f"Anthropic model for task runs (default {DEFAULT_TASK_MODEL}).")
    parser.add_argument("--grader-model", default=DEFAULT_GRADER_MODEL,
                        help=f"Anthropic model for grading (default {DEFAULT_GRADER_MODEL}).")
    args = parser.parse_args()

    # Build the Anthropic client up front if --grade is on, so we fail fast
    # rather than running all the token measurements first only to discover
    # auth isn't set. The SDK accepts an explicit API key, OAuth tokens via
    # ANTHROPIC_AUTH_TOKEN, or falls back to ANTHROPIC_API_KEY in env. We
    # try them in that order so this works under Claude Code (OAuth) and
    # under a plain API key install.
    grade_client = None
    if args.grade:
        try:
            import anthropic
        except ImportError:
            sys.stderr.write(
                "[!] --grade needs the `anthropic` package. Install it:\n"
                "    python -m pip install anthropic\n"
            )
            return 1
        api_key = os.environ.get("ANTHROPIC_API_KEY")
        auth_token = os.environ.get("ANTHROPIC_AUTH_TOKEN")
        try:
            if api_key:
                grade_client = anthropic.Anthropic(api_key=api_key)
            elif auth_token:
                grade_client = anthropic.Anthropic(auth_token=auth_token)
            else:
                # Last-resort: let the SDK try to auto-discover. Some hosts
                # (Claude Code, Bedrock proxies) inject auth in other ways.
                grade_client = anthropic.Anthropic()
        except Exception as e:
            sys.stderr.write(
                f"[!] --grade could not initialise the Anthropic client: {e}\n"
                "    Set ANTHROPIC_API_KEY or ANTHROPIC_AUTH_TOKEN.\n"
            )
            return 1

    print(f"Context Engine tokenomics benchmark")
    print(f"  CE URL:        {args.ce_url}")
    print(f"  Token counter: {'tiktoken cl100k_base' if _TIKTOKEN_AVAILABLE else 'char/4 heuristic (install tiktoken for better)'}")
    print(f"  Max tokens:    {args.max_tokens}")
    print(f"  Search depth:  {args.search_limit}")
    if args.grade:
        print(f"  Task model:    {args.task_model}")
        print(f"  Grader model:  {args.grader_model}")
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
    print(f"Running {len(tasks)} tasks{' (with quality grading)' if args.grade else ''}...")
    results: list[TaskResult] = []
    for i, task in enumerate(tasks, 1):
        tid = task.get("id", f"task-{i}")
        print(f"  [{i:>2}/{len(tasks)}] {tid:<28}", end=" ", flush=True)
        r = benchmark_task(args.ce_url, task, raw_all_tokens, contextmd_tokens,
                           active_bodies, args.max_tokens, args.search_limit,
                           grade_client=grade_client,
                           task_model=args.task_model,
                           grader_model=args.grader_model)
        results.append(r)
        if r.error and r.smart_tokens == 0:
            print(f"FAIL  {r.error}")
        else:
            tail = " (search n/a)" if r.error and r.search_tokens == 0 else ""
            grade_tail = ""
            if args.grade:
                grade_tail = f" / Q smart {r.smart_quality}/10 search {r.search_quality}/10"
            print(f"smart {r.smart_saving_pct:>5.1f}% / search {r.search_saving_pct:>5.1f}%{tail}{grade_tail}")

    print()
    print_table(results, graded=args.grade)
    print_summary(results, graded=args.grade)
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
