# Context Engine API Reference

Base URL: `http://127.0.0.1:3847/api`

All endpoints accept and return `application/json`. The server binds to localhost only.

---

## Skills

### GET /api/skills
List all discovered skills from the `skills/` directory.

**Response:** `Skill[]`
```json
[
  {
    "id": "example-skill",
    "cat": "Uncategorized",
    "type": "custom",
    "path": "/absolute/path/to/skills/example-skill/SKILL.md",
    "desc": "An example skill",
    "triggers": ["do something"]
  }
]
```

---

## Memory

### GET /api/memory
Get the full memory store.

**Response:** `MemoryData`
```json
{
  "version": "1.1",
  "last_updated": "2026-03-28",
  "entries": [
    { "id": "entry_1", "category": "general", "label": "", "content": "..." }
  ]
}
```

### POST /api/memory
Update the memory store. Validates that `entries` is an array of objects with `content` strings.

**Request body:** `MemoryData`

**Response:** `{ "ok": true }` or `{ "ok": false, "error": "..." }` (400)

---

## Rules

### GET /api/rules
Get the rules configuration.

**Response:** `RulesData`
```json
{
  "version": "1.0",
  "coding": "...",
  "general": "...",
  "soul": "..."
}
```

### POST /api/rules
Update rules. Validates that `coding`, `general`, and `soul` are all strings.

**Request body:** `RulesData`

**Response:** `{ "ok": true }` or `{ "ok": false, "error": "..." }` (400)

---

## Skill States

### GET /api/states
Get current skill toggle states.

**Response:** `StatesData`
```json
{
  "version": "1.0",
  "last_updated": "2026-03-28",
  "states": { "example-skill": true, "another-skill": false }
}
```

### POST /api/states
Update skill states and regenerate CONTEXT.md. Transactional — rolls back on failure. Validates all state values are booleans.

**Request body:** `StatesData`

**Response:**
```json
{ "ok": true, "activeCount": 5, "total": 10 }
```

---

## Context Manifest

### GET /api/context-md
Get the current CONTEXT.md content and budget estimation.

**Response:**
```json
{
  "content": "# System Context\n...",
  "contextMdChars": 1200,
  "memoryChars": 500,
  "rulesChars": 300,
  "totalChars": 2000,
  "estimatedTokens": 650,
  "budgetPercent": 0,
  "contextMdLines": 45,
  "breakdown": {
    "context": { "chars": 1200, "tokens": 390 },
    "memory": { "chars": 500, "tokens": 160 },
    "rules": { "chars": 300, "tokens": 100 }
  }
}
```

### POST /api/context-md
Force-regenerate CONTEXT.md from current skill states.

**Response:** `{ "ok": true, "activeCount": 5, "total": 10 }`

---

## Cross-Tool Compiler

### GET /api/compile/targets
List available compilation targets.

**Response:**
```json
{
  "targets": [
    { "id": "claude", "filename": "CLAUDE.md" },
    { "id": "cursor", "filename": ".cursorrules" },
    { "id": "agents", "filename": "AGENTS.md" },
    { "id": "copilot", "filename": ".github/copilot-instructions.md" },
    { "id": "windsurf", "filename": ".windsurfrules" }
  ]
}
```

### POST /api/compile/preview
Generate compiled output without writing files. Returns content and token estimates.

**Request body:**
```json
{ "targets": ["claude", "cursor"] }
```
Omit `targets` to compile all.

**Response:**
```json
{
  "results": {
    "claude": { "content": "# System Context\n...", "filename": "CLAUDE.md", "tokens": 650 },
    "cursor": { "content": "# Rules\n...", "filename": ".cursorrules", "tokens": 520 }
  },
  "errors": [],
  "context": { "activeSkills": 5, "totalSkills": 10 }
}
```

### POST /api/compile
Compile and write files to disk.

**Request body:**
```json
{
  "targets": ["claude", "cursor", "agents"],
  "outputDir": "/optional/custom/path"
}
```
Omit `outputDir` to write to the Context Engine root. Omit `targets` to compile all.

**Response:** Same as preview, plus `"ok": true`.

---

## Health

### GET /api/health
Check skill file integrity and context budget.

**Response:**
```json
{
  "skills": [
    {
      "id": "example-skill",
      "path": "...",
      "exists": true,
      "issue": null,
      "stale": false,
      "daysSinceModified": 5,
      "lastModified": 1711612800000
    }
  ],
  "budget": { "estimatedTokens": 650, "budgetPercent": 0 }
}
```

Skills with `stale: true` have not been modified in 30+ days.

---

## Backups

### GET /api/backups
List available backup snapshots (max 20, newest first).

**Response:**
```json
{ "backups": [{ "timestamp": "2026-03-28T14-30-00" }] }
```

### POST /api/backups
Create a new backup snapshot of memory, rules, states, and CONTEXT.md.

**Response:** `{ "ok": true, "timestamp": "2026-03-28T14-30-00" }`

---

## Restore

### POST /api/restore
Restore from a backup snapshot. Regenerates CONTEXT.md after restore.

**Request body:** `{ "timestamp": "2026-03-28T14-30-00" }`

**Response:** `{ "ok": true }`

---

## Session Log

### GET /api/session-log
Get the activity log (max 50 entries, newest first).

**Response:**
```json
{
  "sessions": [
    { "type": "toggle", "activeSkills": 5, "ts": "2026-03-28T14:30:00.000Z" },
    { "type": "compile", "targets": ["claude", "cursor"], "ts": "..." },
    { "type": "mode_applied", "mode": "all", "skills": ["..."], "ts": "..." },
    { "type": "backup", "timestamp": "...", "ts": "..." }
  ]
}
```

### POST /api/session-log
Append a custom log entry.

**Request body:** Any JSON object (will be timestamped automatically).

---

## Modes

### GET /api/modes
List available mode presets.

**Response:**
```json
{
  "modes": [
    { "id": "all", "label": "All On", "icon": "unlock", "desc": "...", "skills": [] },
    { "id": "coding", "label": "Heavy Coding", "icon": "code", "desc": "...", "skills": ["example-skill"] }
  ]
}
```

### POST /api/modes/apply
Apply a mode preset. Transactional — resets all skills, then activates the mode's skill list.

**Request body:** `{ "modeId": "coding" }`

**Response:** `{ "ok": true, "states": { "version": "1.0", "states": {...} } }`

---

## Error Responses

All endpoints return errors as:
```json
{ "ok": false, "error": "Human-readable error message" }
```

| Status | Meaning |
|--------|---------|
| 400 | Validation failed (malformed JSON, missing fields, wrong types) |
| 404 | Resource not found (mode, backup) |
| 500 | Server error (file write failure, regeneration error) |
