const HOLD_MS = 1000;
const OPEN_MS = 5000;

export function defaultLock() {
  return { locked: true, unlockUntil: null };
}

export function tick(lock, now) {
  if (lock.unlockUntil === null || now < lock.unlockUntil) return lock;
  return defaultLock();
}

export function tap(lock, now) {
  const current = tick(lock, now);
  return { lock: current, togglePause: !current.locked };
}

export function longPress(lock, heldMs, now) {
  if (heldMs < HOLD_MS) return lock;
  return { locked: false, unlockUntil: now + OPEN_MS };
}
