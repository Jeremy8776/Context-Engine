# DataCert AI Ecosystem

DataCert's local AI stack is split across three focused systems:

| System         | Role                        | Owns                                                                                        |
| -------------- | --------------------------- | ------------------------------------------------------------------------------------------- |
| AI Model DB    | Registry and directory      | Models, providers, capabilities, pricing, benchmarks, MCP servers, skills, install metadata |
| Context Engine | Local context broker        | Memory, rules, skills, modes, MCP tools, generated context, compiled file fallbacks         |
| DRAM           | Runtime orchestration layer | API daemons, local models, hosted model calls, process health, routing, logs, queues        |

The short version:

> AI Model DB knows what exists. Context Engine brokers what context is active. DRAM runs and routes the systems that execute it.

## Boundaries

Context Engine should stay focused on what host apps and agents can know:

- active skills
- persistent memory
- behaviour rules
- mode/profile selection
- runtime MCP tools for search, skill lookup, and status
- generated manifests such as `CONTEXT.md`
- compiled file fallbacks for Claude Code, Codex, Cursor, Windsurf, and other AI tools

AI Model DB should be the source of registry truth:

- model metadata
- provider metadata
- local or hosted availability
- pricing and capability fields
- MCP server directory data
- skill and workflow pack metadata

DRAM should own execution:

- model/API daemon lifecycle
- local runtime health
- routing and fallback
- job queues
- logs and process status
- GPU/API budget awareness

## Integration Direction

Context Engine should consume registry data from AI Model DB and runtime status from DRAM, but it should not duplicate either system. It should broker context to host apps; it should not become the host app where the work happens.

The product flow is:

```text
AI Model DB -> Context Engine -> Host apps / DRAM
     |              |                |
 registry      context broker   work + execution
```

This keeps the ecosystem modular: each repo can stand alone, but together they form a local AI operating layer.
