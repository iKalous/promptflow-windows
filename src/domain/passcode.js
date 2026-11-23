export const PASS_MS = 600000;
export const JOIN_REJECTED_TEXT = '口令不正确或已过期';
export const PROMPTER_OCCUPIED_TEXT = '这场已有提词屏';
export const LINK_REQUIRED_TEXT = '需要近场或同一局域网';
export const READ_ONLY_ROLE_TEXT = '提词屏不能改稿';
export const NO_DEVICES_TEXT = '没有发现附近设备';

export function formatPasscode(code) {
  return code.slice(0, 3) + ' ' + code.slice(3);
}

export function normalizePasscode(typed) {
  return typed.replace(/ /g, '');
}

export function randomPasscode(random) {
  const raw = Math.floor(random() * 1000000);
  const clamped = Math.min(999999, Math.max(0, raw));
  return String(clamped).padStart(6, '0');
}

export function requireLink(hasNetwork) {
  if (!hasNetwork) return { ok: false, code: 'linkRequired' };
  return { ok: true };
}

export function isSixDigits(code) {
  return /^[0-9]{6}$/.test(code);
}
