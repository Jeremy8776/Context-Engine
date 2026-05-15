# Tokenomics benchmark

One Python script. Run it; it prints a table. That's the whole tool.

## What it measures

For each task in `tasks.json`, three numbers:

- **Baseline** — tokens in `CONTEXT.md` when every active skill is compiled into the prompt. This is what a user without smart-compile or MCP would have in their system prompt.
- **Smart** — tokens after CE's `/api/compile/smart` picks the relevant skills for this specific task.
- **Search** — tokens an MCP host (Claude Desktop, Codex) would actually pull when it calls `context_engine_search` for this task.

Both savings paths are reported as a `% reduction vs Baseline`. Lower is better.

## Prerequisites

- Python 3.9+
- Context Engine running locally (default `http://127.0.0.1:3847`)
- `pip install requests tiktoken` (tiktoken is optional — the script falls back to a `len(text) / 4` heuristic when it's absent, which is consistent across runs but ~10% off real BPE)

The vector index needs to be built for the **Search** column to populate. Smart-compile works regardless.

## Run

```bash
python bench/tokenomics.py
```

Output goes to stdout: per-task table + summary + per-category median, plus a JSON sidecar at `bench/results-latest.json` for tracking deltas over time.

### CLI

```
--ce-url URL          CE base URL (default http://127.0.0.1:3847; env CE_URL also works)
--tasks FILE          Custom task corpus
--out FILE            JSON output path (default bench/results-latest.json)
--no-out              Don't write the JSON sidecar
--max-tokens N        Smart-compile token budget per task (default 16000)
--search-limit N      How many chunks MCP search returns per task (default 8)
```

## Methodology notes

- **Tokenizer**: tiktoken `cl100k_base` (the BPE GPT-3.5/4 uses). It's within ~5% of Anthropic's own tokenizer on prose. Same encoding is used for baseline + smart + search counts, so the percentages are internally consistent.
- **Baseline definition**: only **active** skills (per `data/skill-states.json`) — that's the realistic ceiling. Including inactive skills would inflate the saving artificially.
- **Search realism**: simulates a host calling `context_engine_search` *once* per task and pulling N chunks. Real host apps may call it multiple times or fall back to `context_engine_get_skill` for full bodies, so this is a lower-bound on what they actually consume.
- **Smart-compile token budget**: defaults to 16k. Run with `--max-tokens 4000` to see how aggressive selection becomes for small-context models, or `--max-tokens 64000` to see what large-context users get.
- **Cross-check**: the summary prints CE's own estimator's ratio vs tiktoken's count. If those diverge a lot, CE's internal budget UI is over- or under-stating.

## Iterating

Add or replace tasks in `tasks.json`. The corpus shipped is a representative mix (system-ops, image-gen, claude-api, design, comms, health, product brainstorm). Re-run the benchmark whenever:

- Skills change (added, removed, edited)
- Smart-compile ranking algorithm changes
- Vector index re-built with a different model

Diff `bench/results-latest.json` between runs to see whether a change made things better or worse.

## What this isn't

- **Not** a quality benchmark — it measures token cost, not whether the agent solves the task. Output quality requires LLM-as-judge or manual grading, which is out of scope here.
- **Not** a competitive benchmark — only measures CE vs the no-CE baseline. Comparing against Context7, claude-mem, etc. is a separate exercise.
- **Not** API-cost accurate — token counts ≠ pricing. Multiply by your provider's per-token rate if you want $.
