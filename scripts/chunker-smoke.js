// @ts-check

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
const manifestChunk = chunks.find((chunk) => chunk.section === 'Skill Manifest');
assert(manifestChunk, 'expected skill frontmatter to be indexed as a manifest chunk');
assert(
  manifestChunk?.text.includes('Used for chunker smoke tests.'),
  'expected manifest chunk to preserve searchable frontmatter description',
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

// ---- Edge cases ----

// GIVEN empty content
// WHEN chunked
const emptyChunks = chunkSkillContent({ skillId: 'empty', sourcePath: 'empty/SKILL.md', content: '' });
assert.deepStrictEqual(emptyChunks, [], 'empty content produces zero chunks');

// GIVEN content with no frontmatter
const noFrontmatterChunks = chunkSkillContent({
  skillId: 'no-fm',
  sourcePath: 'no-fm/SKILL.md',
  content: '# No Frontmatter\n\nJust a plain skill with no YAML block.\n',
});
assert(
  !noFrontmatterChunks.some((c) => c.section === 'Skill Manifest'),
  'no manifest chunk when frontmatter absent',
);
assert(
  noFrontmatterChunks.some((c) => c.section === 'No Frontmatter'),
  'heading section is still produced',
);

// GIVEN empty frontmatter (---\n---)
const emptyFmChunks = chunkSkillContent({
  skillId: 'empty-fm',
  sourcePath: 'empty-fm/SKILL.md',
  content: '---\n---\n\n# Hello\n\nBody text.\n',
});
assert(
  !emptyFmChunks.some((c) => c.section === 'Skill Manifest'),
  'empty frontmatter produces no manifest chunk',
);

// GIVEN CRLF line endings
const crlfChunks = chunkSkillContent({
  skillId: 'crlf',
  sourcePath: 'crlf/SKILL.md',
  content:
    '---\r\nname: CRLF Skill\r\ndescription: Windows line endings.\r\n---\r\n\r\n# CRLF Section\r\n\r\nAlways use CRLF.\r\n',
});
assert(
  crlfChunks.some((c) => c.section === 'CRLF Section'),
  'CRLF content is parsed correctly',
);
assert(
  crlfChunks.some((c) => c.type === 'rule'),
  'CRLF content with "Always" is classified as rule',
);

// GIVEN oversized content (> 2200 chars)
const longParagraph = 'A'.repeat(3000);
const oversizedChunks = chunkSkillContent({
  skillId: 'oversize',
  sourcePath: 'oversize/SKILL.md',
  content: `# Big Section\n\n${longParagraph}\n\n## Next\n\nSmall content.\n`,
});
assert(
  oversizedChunks.some((c) => c.section === 'Big Section'),
  'oversized section is still chunked',
);
assert(
  oversizedChunks.some((c) => c.section === 'Next'),
  'section after oversized is preserved',
);

// GIVEN content with multiple code blocks in one section
const multiCodeChunks = chunkSkillContent({
  skillId: 'multi-code',
  sourcePath: 'multi-code/SKILL.md',
  content: `# Examples\n\n\`\`\`js\nconsole.log('first');\n\`\`\`\n\n\`\`\`python\nprint('second')\n\`\`\`\n`,
});
const exampleChunks = multiCodeChunks.filter((c) => c.type === 'example');
assert.ok(exampleChunks.length >= 2, 'multiple code blocks produce multiple example chunks');

console.log('chunker smoke ok');
