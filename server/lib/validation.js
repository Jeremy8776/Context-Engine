// validation.js — Request body validators for data endpoints

function validateMemory(data) {
  if (!data || typeof data !== 'object') return { valid: false, error: 'Must be a JSON object' };
  if (data._parseError) return { valid: false, error: 'Invalid JSON in request body' };
  if (!Array.isArray(data.entries)) return { valid: false, error: 'Missing or invalid "entries" array' };
  for (let i = 0; i < data.entries.length; i++) {
    const e = data.entries[i];
    if (!e || typeof e !== 'object') return { valid: false, error: `Entry ${i}: must be an object` };
    if (typeof e.content !== 'string' || !e.content.trim()) return { valid: false, error: `Entry ${i}: missing "content" string` };
  }
  return { valid: true, error: null };
}

function validateRules(data) {
  if (!data || typeof data !== 'object') return { valid: false, error: 'Must be a JSON object' };
  if (data._parseError) return { valid: false, error: 'Invalid JSON in request body' };
  for (const key of ['coding', 'general', 'soul']) {
    if (typeof data[key] !== 'string') return { valid: false, error: `Missing or invalid "${key}" string` };
  }
  return { valid: true, error: null };
}

function validateStates(data) {
  if (!data || typeof data !== 'object') return { valid: false, error: 'Must be a JSON object' };
  if (data._parseError) return { valid: false, error: 'Invalid JSON in request body' };
  const states = data.states || data;
  if (typeof states !== 'object' || Array.isArray(states)) return { valid: false, error: '"states" must be an object' };
  for (const [k, v] of Object.entries(states)) {
    if (typeof v !== 'boolean') return { valid: false, error: `State "${k}" must be boolean, got ${typeof v}` };
  }
  return { valid: true, error: null };
}

module.exports = { validateMemory, validateRules, validateStates };
