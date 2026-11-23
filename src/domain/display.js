const FONT_MIN = 0.75;
const FONT_MAX = 2.5;
const FONT_STEP = 0.25;
const LINE_MIN = 1;
const LINE_MAX = 2;
const LINE_STEP = 0.2;
const MARGIN_MIN = 0;
const MARGIN_MAX = 64;
const MARGIN_STEP = 8;

export function defaultDisplay() {
  return {
    fontScale: 1,
    lineSpacing: 1.4,
    marginVp: 24,
    theme: 'dark',
    mirrorH: false,
    mirrorV: false
  };
}

function stepDecimals(step) {
  const text = String(step);
  const dot = text.indexOf('.');
  return dot < 0 ? 0 : text.length - dot - 1;
}

function nudge(value, steps, step, min, max) {
  if (steps === 0) return value;
  const places = stepDecimals(step);
  const scale = 10 ** places;
  const snapped = Math.round((value + steps * step) / step) * step;
  const cleaned = Math.round(snapped * scale) / scale;
  if (cleaned < min) return min;
  if (cleaned > max) return max;
  return cleaned;
}

export function nudgeFont(display, steps) {
  return { ...display, fontScale: nudge(display.fontScale, steps, FONT_STEP, FONT_MIN, FONT_MAX) };
}

export function nudgeLine(display, steps) {
  return { ...display, lineSpacing: nudge(display.lineSpacing, steps, LINE_STEP, LINE_MIN, LINE_MAX) };
}

export function nudgeMargin(display, steps) {
  return { ...display, marginVp: nudge(display.marginVp, steps, MARGIN_STEP, MARGIN_MIN, MARGIN_MAX) };
}

export function toggleMirrorH(display) {
  return { ...display, mirrorH: !display.mirrorH };
}

export function toggleMirrorV(display) {
  return { ...display, mirrorV: !display.mirrorV };
}

export function cycleTheme(display) {
  let theme = 'dark';
  if (display.theme === 'dark') theme = 'light';
  else if (display.theme === 'light') theme = 'amber';
  return { ...display, theme };
}

export function themeColors(theme) {
  if (theme === 'light') return { background: '#FFFFFF', text: '#000000' };
  if (theme === 'amber') return { background: '#F6C445', text: '#1A1A1A' };
  return { background: '#000000', text: '#FFFFFF' };
}
