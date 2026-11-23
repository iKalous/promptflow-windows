export const BASE_CHARS_PER_SECOND = 4;
export const MIN_SPEED = 0.5;
export const MAX_SPEED = 3;
export const SPEED_STEP = 0.1;
export const WHEEL_DIRECTION = 1;

export function project(clock, now, length) {
  const at = now < clock.updatedAt ? clock.updatedAt : now;
  if (!clock.playing) return { ...clock, updatedAt: clock.updatedAt };
  if (length <= 0) return { ...clock, playing: false, offsetChars: 0, updatedAt: at };
  const delta = Math.floor(((at - clock.updatedAt) / 1000) * BASE_CHARS_PER_SECOND * clock.speed);
  const next = clock.offsetChars + delta;
  if (!clock.loop && next >= length) return { ...clock, playing: false, offsetChars: length, updatedAt: at };
  const updatedAt = delta === 0 ? clock.updatedAt : at;
  if (clock.loop) return { ...clock, offsetChars: next % length, updatedAt };
  return { ...clock, offsetChars: next, updatedAt };
}

function clampSpeed(speed) {
  const stepped = Math.round(speed * 10) / 10;
  return Math.min(MAX_SPEED, Math.max(MIN_SPEED, stepped));
}

export function pause(clock, now, length) {
  return { ...project(clock, now, length), playing: false };
}

export function resume(clock, now, length) {
  const current = project(clock, now, length);
  if (!current.loop && current.offsetChars >= length) return { ...current, playing: false };
  return { ...current, playing: true, updatedAt: now };
}

export function setSpeed(clock, speed, now, length) {
  const current = project(clock, now, length);
  return { ...current, speed: clampSpeed(speed), updatedAt: now };
}

export function nudgeSpeed(clock, notches, now, length) {
  return setSpeed(clock, clock.speed + WHEEL_DIRECTION * notches * SPEED_STEP, now, length);
}

export function setLoop(clock, loop, now, length) {
  const current = project(clock, now, length);
  return { ...current, loop: loop === true, updatedAt: now };
}
