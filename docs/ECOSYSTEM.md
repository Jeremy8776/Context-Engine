# DataCert AI Ecosystem

DataCert's local AI stack is split across three focused systems:

| System | Role | Owns |
| --- | --- | --- |
| AI Model DB | Registry and directory | Models, providers, capabilities, pricing, benchmarks, MCP servers, skills, install metadata |
| Context Engine | Context control plane | Memory, rules, skills, modes, generated context, cross-tool deployment |
| DRAM | Runtime orchestration layer | API daemons, local models, hosted model calls, process health, routing, logs, queues |

The short version:

> AI Model DB knows what exists. Context Engine decides what context is active. DRAM runs and routes the systems that execute it.

## Boundaries

Context Engine should stay focused on what agents know:

- active skills
- persistent memory
- behaviour rules
- mode/profile selection
- generated manifests such as `CONTEXT.md`
- deployment into Claude, Codex, Cursor, Windsurf, and other AI tools

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

Context Engine should consume registry data from AI Model DB and runtime status from DRAM, but it should not duplicate either system.

The product flow is:

```text
AI Model DB -> Context Engine -> DRAM
     |              |              |
 registry      active context   execution
```

This keeps the ecosystem modular: each repo can stand alone, but together they form a local AI operating layer.
