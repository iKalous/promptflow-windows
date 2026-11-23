export class LocalLoopbackPort {
  constructor() {
    this.listeners = [];
    this.lastDeliveredRevision = null;
  }

  subscribe(listener) {
    this.listeners.push(listener);
    return () => {
      const index = this.listeners.indexOf(listener);
      if (index >= 0) this.listeners.splice(index, 1);
    };
  }

  publish(role, envelope) {
    if (role === 'prompter') return { ok: false, code: 'readOnlyRole' };
    if (this.lastDeliveredRevision !== null && envelope.revision <= this.lastDeliveredRevision) {
      return { ok: true, delivered: false };
    }
    this.lastDeliveredRevision = envelope.revision;
    const current = this.listeners.slice();
    for (const listener of current) listener(envelope);
    return { ok: true, delivered: true };
  }
}
