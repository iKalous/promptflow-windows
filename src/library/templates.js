import { createScript } from './script-library.js';

export const TEMPLATES = [
  { id: 'intro-3m', title: '3 分钟自我介绍', headings: ['我是谁', '为什么在这里', '我想做什么'] },
  { id: 'defense-8m', title: '8 分钟答辩', headings: ['选题', '方法', '结果', '创新点'] },
  { id: 'lecture-20m', title: '20 分钟网课节导', headings: ['本节目标', '知识讲解', '例题', '小结'] },
  { id: 'recruit-60s', title: '60 秒招新', headings: ['我们是谁', '你能获得什么', '如何加入'] }
];

export function templateBody(spec) {
  const lines = [];
  for (let i = 0; i < spec.headings.length; i++) {
    lines.push('## ' + spec.headings[i]);
  }
  return lines.join('\n\n') + '\n';
}

export function createFromTemplate(templateId, now, ids, repo) {
  for (let i = 0; i < TEMPLATES.length; i++) {
    const spec = TEMPLATES[i];
    if (spec.id === templateId) {
      return { ok: true, script: createScript(spec.title, templateBody(spec), now, ids, repo) };
    }
  }
  return { ok: false, code: 'notFound' };
}

export function ensureTemplates(repo, now, ids) {
  const titles = new Set(repo.list().map((script) => script.title));
  const created = [];
  for (let i = 0; i < TEMPLATES.length; i++) {
    const spec = TEMPLATES[i];
    if (titles.has(spec.title)) continue;
    const result = createFromTemplate(spec.id, now + (TEMPLATES.length - i), ids, repo);
    if (result.ok) created.push(result.script);
  }
  return created;
}
