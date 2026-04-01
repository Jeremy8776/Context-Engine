// utils.js — Shared UI utilities

/**
 * Escape HTML entities to prevent XSS in innerHTML assignments.
 * Use this for ALL user/dynamic data rendered via innerHTML.
 */
function esc(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
