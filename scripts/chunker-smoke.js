const assert = require('assert');
const { chunkSkillContent } = require('../server/lib/chunker');

const chunks = chunkSkillContent({
  skillId: 'fixture-skill',
  sourcePath: 'fixtures/fixture-skill/SKILL.md',
  content: `---
name: Fixture Skill
description: Used for chunker smoke tests.
---

# Fixture Skill

Use when the user asks for fixture behavior.

## Rules

- Always preserve source metadata.
- Never merge unrelated sections.

## Example

\`\`\`js
console.log('fixture');
\`\`\`
`,
});

assert(chunks.length >= 3, 'expected overview, rules, and example chunks');
assert(
  chunks.some((chunk) => chunk.type === 'rule'),
  'expected a rule chunk',
);
assert(
  chunks.some((chunk) => chunk.type === 'example'),
  'expected an example chunk',
);
assert(
  chunks.every((chunk) => chunk.skillId === 'fixture-skill'),
  'expected skill id on every chunk',
);
assert(
  chunks.every((chunk) => chunk.sourcePath.endsWith('SKILL.md')),
  'expected source path on every chunk',
);

const complexChunks = chunkSkillContent({
  skillId: 'complex-skill',
  sourcePath: 'fixtures/complex-skill/SKILL.md',
  content: `# Complex Skill

Long context paragraph.

## Workflow

### Discovery

- Read the local files first.
- Use structured parsers when available.

### Execution

Always preserve user changes.

1. Build the smallest patch.
2. Verify behavior.

## Reference

\`\`\`json
{ "ok": true }
\`\`\`
`,
});

assert(
  complexChunks.some((chunk) => chunk.section === 'Discovery'),
  'expected nested discovery section',
);
assert(
  complexChunks.some((chunk) => chunk.section === 'Execution'),
  'expected nested execution section',
);
assert(
  complexChunks.some((chunk) => chunk.type === 'example'),
  'expected complex example chunk',
);

console.log(`chunker smoke ok: ${chunks.length + complexChunks.length} chunks`);
