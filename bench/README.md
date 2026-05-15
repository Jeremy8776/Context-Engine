# Tokenomics benchmark

One Python script. Run it; it prints a table. That's the whole tool.

## What it measures

For each task in `tasks.json`, three numbers (apples-to-apples on full skill bodies, same tokenizer):

- **Raw all** — tokens a naive MCP host pulls if it loads every active skill in full. This is the **baseline**; all savings percentages are against this.
- **Smart** — tokens after CE's `/api/compile/smart` picks the relevant skills for this specific task. Same content type as Raw all, just a subset.
- **Search** — tokens an MCP host (Claude Desktop, Codex) actually pulls when it calls `context_engine_search` — chunks, not full skills.

Reference column: `CONTEXT.md` size — CE's pre-compressed system-prompt summary, a *different* path entirely. Reported alongside so both CE delivery paths are visible without inflating the savings number by mixing content types.

Optional quality column (`--grade`): for each task, actually run it through Claude in both smart and search modes, capture the response, and have a judge model score it 1-10. The summary adds tokens-per-quality-point efficiency — the real "are we saving tokens AND maintaining answer quality?" question.

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
--grade               Run each task through Claude and grade outputs 1-10
--task-model NAME     Anthropic model for task runs (default claude-haiku-4-5)
--grader-model NAME   Anthropic model for judging (default claude-haiku-4-5)
```

### Quality grading (`--grade`)

Set `ANTHROPIC_API_KEY` in the env, then:

```bash
python bench/tokenomics.py --grade
```

For each task this runs two real Claude calls (smart-context, search-context) plus one judge call. Output gains:

- A `Smart Q` / `Search Q` column in the table (1-10).
- Per-mode quality distribution (median / mean / range) in the summary.
- A **tokens-per-quality-point** efficiency line — the load-bearing number for the "lean MCP" claim. If search delivers similar quality at a fraction of the tokens, the ratio shows it.

Cost expectation at defaults (Haiku for both task + grader, 15 tasks): ~$0.10 per full benchmark. Stronger models cost proportionally more — Sonnet for the task model is ~10x, Opus more. Use `--task-model claude-sonnet-4-5` for a publishable-grade run.

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
