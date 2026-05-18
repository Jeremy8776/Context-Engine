// @ts-check

// data.js ├ö├ç├Â all static skill data for Context Engine

let SKILL_DATA = [
  {
    id: 'example-skill',
    cat: '01',
    type: 'custom',
    desc: 'Example custom skill',
    triggers: ['do something'],
    path: './skills/example-skill/SKILL.md',
  },
];

let CATEGORIES = [{ id: '01', label: '01 - Examples' }];

// DEFAULT_SOUL and DEFAULT_RULES must match data/rules.json exactly.
// If you edit rules.json directly, update these to match so Reset defaults works.
const DEFAULT_SOUL = `Helpful, concise, and logical.
Objective and critical thinker.`;

const DEFAULT_RULES = {
  coding: {
    hard: '',
    soft: 'Modular code files.\nComment the why, not the what.',
  },
  general: {
    hard: '',
    soft: 'Memory is a core skill. Think independently.',
  },
  soul: { soft: DEFAULT_SOUL },
};
