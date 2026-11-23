import { parseAnchors } from '../domain/anchors.js';

export function toStoredJson(script) {
  const stored = { id: script.id, title: script.title, body: script.body, updatedAt: script.updatedAt };
  return JSON.stringify(stored);
}

export function scriptFromStoredJson(json) {
  try {
    const stored = JSON.parse(json);
    if (!stored || !stored.id || typeof stored.body !== 'string' || typeof stored.title !== 'string') return null;
    const updatedAt = typeof stored.updatedAt === 'number' ? stored.updatedAt : 0;
    return { id: String(stored.id), title: stored.title, body: stored.body, updatedAt, anchors: parseAnchors(stored.body) };
  } catch {
    return null;
  }
}
