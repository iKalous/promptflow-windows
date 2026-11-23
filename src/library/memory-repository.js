export class MemoryScriptRepository {
  constructor() {
    this.scripts = new Map();
  }

  list() {
    return [...this.scripts.values()]
      .map((script) => ({ id: script.id, title: script.title, updatedAt: script.updatedAt }))
      .sort((a, b) => b.updatedAt - a.updatedAt);
  }

  load(id) {
    return this.scripts.get(id) ?? null;
  }

  save(script) {
    this.scripts.set(script.id, script);
  }

  remove(id) {
    if (!this.scripts.delete(id)) return { ok: false, code: 'notFound' };
    return { ok: true };
  }
}
