import { parseAnchors } from '../domain/anchors.js';

function normalize(body) {
  return body.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
}

function titled(title) {
  return title.trim().length === 0 ? '未命名讲稿' : title.trim();
}

export function createScript(title, body, now, ids, repo) {
  const text = normalize(body);
  const script = { id: ids(), title: titled(title), body: text, updatedAt: now, anchors: parseAnchors(text) };
  repo.save(script);
  return script;
}

function firstHeadingTitle(body) {
  const anchors = parseAnchors(body);
  for (let i = 0; i < anchors.length; i++) {
    if (anchors[i].level === 1) return anchors[i].title;
  }
  return '';
}

export function titleForSave(typedTitle, body) {
  const typed = typedTitle.trim();
  const heading = firstHeadingTitle(body);
  if (typed.length === 0 || (typed === '未命名讲稿' && heading.length > 0)) {
    return heading.length > 0 ? heading : '未命名讲稿';
  }
  return typed;
}

export function saveNamed(id, typedTitle, body, now, ids, repo) {
  const title = titleForSave(typedTitle, body);
  const text = normalize(body);
  if (id.length === 0) {
    return { ok: true, script: createScript(title, text, now, ids, repo) };
  }
  const existing = repo.load(id);
  if (!existing) return { ok: false, code: 'notFound' };
  const script = { ...existing, title, body: text, updatedAt: now, anchors: parseAnchors(text) };
  repo.save(script);
  return { ok: true, script };
}

export function updateBody(id, body, now, repo) {
  const existing = repo.load(id);
  if (!existing) return { ok: false, code: 'notFound' };
  const text = normalize(body);
  const script = { ...existing, body: text, updatedAt: now, anchors: parseAnchors(text) };
  repo.save(script);
  return { ok: true, script };
}
