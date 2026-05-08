// @ts-check

const crypto = require('crypto');
const fs = require('fs');

const MAX_CHARS = 2200;

/**
 * @typedef {'rule' | 'knowledge' | 'example'} ChunkType
 *
 * @typedef {Object} SkillChunk
 * @property {string} id
 * @property {string} skillId
 * @property {string} section
 * @property {string} text
 * @property {ChunkType} type
 * @property {string} sourcePath
 */

/**
 * @param {{ id: string, path: string }} skill
 * @returns {SkillChunk[]}
 */
function chunkSkill(skill) {
  const content = fs.readFileSync(skill.path, 'utf8');
  return chunkSkillContent({ skillId: skill.id, sourcePath: skill.path, content });
}

/**
 * @param {{ skillId: string, sourcePath: string, content: string }} input
 * @returns {SkillChunk[]}
 */
function chunkSkillContent(input) {
  const content = stripFrontmatter(input.content).replace(/\r\n/g, '\n');
  const sections = splitSections(content);
  const chunks = [];

  for (const section of sections) {
    const body = section.lines.join('\n').trim();
    if (!body) continue;
    for (const part of splitOversize(body)) {
      chunks.push(createChunk(input, section.title, part, classifyChunk(part)));
    }
    for (const list of extractLists(section.lines)) {
      chunks.push(createChunk(input, section.title, list, classifyChunk(list)));
    }
    for (const code of extractCodeBlocks(section.lines)) {
      chunks.push(createChunk(input, section.title, code, 'example'));
    }
  }

  return dedupeChunks(chunks);
}

/**
 * @param {string} content
 */
function stripFrontmatter(content) {
  return content.replace(/^---\n[\s\S]*?\n---\n?/, '');
}

/**
 * @param {string} content
 */
function splitSections(content) {
  /** @type {Array<{ title: string, lines: string[] }>} */
  const sections = [];
  /** @type {{ title: string, lines: string[] }} */
  let current = { title: 'Overview', lines: [] };

  for (const line of content.split('\n')) {
    const heading = line.match(/^(#{1,6})\s+(.+?)\s*$/);
    if (heading) {
      if (current.lines.some((item) => item.trim())) sections.push(current);
      current = { title: heading[2]?.trim() || 'Untitled', lines: [] };
      continue;
    }
    current.lines.push(line);
  }
  if (current.lines.some((item) => item.trim())) sections.push(current);
  return sections;
}

/**
 * @param {string[]} lines
 */
function extractLists(lines) {
  const lists = [];
  let current = [];
  for (const line of lines) {
    if (/^\s*(-|\*|\d+\.)\s+/.test(line)) {
      current.push(line.trim());
      continue;
    }
    if (current.length) {
      lists.push(current.join('\n'));
      current = [];
    }
  }
  if (current.length) lists.push(current.join('\n'));
  return lists;
}

/**
 * @param {string[]} lines
 */
function extractCodeBlocks(lines) {
  const blocks = [];
  let inBlock = false;
  let current = [];
  for (const line of lines) {
    if (line.startsWith('```')) {
      current.push(line);
      if (inBlock) {
        blocks.push(current.join('\n'));
        current = [];
      }
      inBlock = !inBlock;
      continue;
    }
    if (inBlock) current.push(line);
  }
  return blocks;
}

/**
 * @param {string} text
 */
function splitOversize(text) {
  if (text.length <= MAX_CHARS) return [text];
  const parts = [];
  let current = '';
  for (const paragraph of text.split(/\n{2,}/)) {
    if ((current + '\n\n' + paragraph).length > MAX_CHARS && current) {
      parts.push(current.trim());
      current = paragraph;
    } else {
      current = current ? `${current}\n\n${paragraph}` : paragraph;
    }
  }
  if (current.trim()) parts.push(current.trim());
  return parts;
}

/**
 * @param {string} text
 * @returns {ChunkType}
 */
function classifyChunk(text) {
  if (/```/.test(text)) return 'example';
  if (/\b(always|never|must|required|before|after|do not|use when|trigger)\b/i.test(text)) return 'rule';
  return 'knowledge';
}

/**
 * @param {{ skillId: string, sourcePath: string }} input
 * @param {string} section
 * @param {string} text
 * @param {ChunkType} type
 * @returns {SkillChunk}
 */
function createChunk(input, section, text, type) {
  const cleaned = text.trim();
  const hash = crypto
    .createHash('sha1')
    .update(`${input.skillId}:${section}:${cleaned}`)
    .digest('hex')
    .slice(0, 10);
  return {
    id: `${input.skillId}:${slug(section)}:${hash}`,
    skillId: input.skillId,
    section,
    text: cleaned,
    type,
    sourcePath: input.sourcePath,
  };
}

/**
 * @param {SkillChunk[]} chunks
 */
function dedupeChunks(chunks) {
  const seen = new Set();
  return chunks.filter((chunk) => {
    const key = `${chunk.section}:${chunk.text}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * @param {string} value
 */
function slug(value) {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'section'
  );
}

module.exports = { chunkSkill, chunkSkillContent, classifyChunk };
