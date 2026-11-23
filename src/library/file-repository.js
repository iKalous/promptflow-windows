import { mkdirSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { scriptFromStoredJson, toStoredJson } from './script-json.js';

const SAFE_ID = /^[A-Za-z0-9_-]+$/;

export class FileScriptRepository {
  constructor(directory) {
    this.directory = directory;
    mkdirSync(directory, { recursive: true });
  }

  list() {
    return this.readAll()
      .map((script) => ({ id: script.id, title: script.title, updatedAt: script.updatedAt }))
      .sort((a, b) => b.updatedAt - a.updatedAt);
  }

  load(id) {
    return this.readAll().find((script) => script.id === id) ?? null;
  }

  save(script) {
    if (!SAFE_ID.test(script.id)) throw new Error('unsafe script id');
    this.replaceText(`${script.id}.json`, toStoredJson(script));
  }

  remove(id) {
    if (!SAFE_ID.test(id)) return { ok: false, code: 'notFound' };
    if (!this.load(id)) return { ok: false, code: 'notFound' };
    rmSync(path.join(this.directory, `${id}.json`), { force: true });
    return { ok: true };
  }

  readAll() {
    const names = readdirSync(this.directory).filter((name) => name.endsWith('.json') && name !== 'index.json');
    const scripts = [];
    for (const name of names) {
      const loaded = scriptFromStoredJson(readFileSync(path.join(this.directory, name), 'utf8'));
      if (loaded !== null) scripts.push(loaded);
    }
    return scripts;
  }

  replaceText(name, text) {
    const target = path.join(this.directory, name);
    const temporary = `${target}.${process.pid}.tmp`;
    writeFileSync(temporary, text);
    rmSync(target, { force: true });
    renameSync(temporary, target);
  }
}
