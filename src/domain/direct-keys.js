import { bareDigit, ctrlNumber } from './anchor-index.js';

export function emptyChord() {
  return { ctrl: false, digits: '' };
}

export function applyStroke(mode, chord, stroke, anchorCount) {
  if (mode === 'edit') return { chord, action: { kind: 'none' } };
  if (stroke.key === 'space') return { chord: emptyChord(), action: { kind: 'togglePause' } };
  if (stroke.key === 'previous') return { chord, action: { kind: 'step', direction: -1 } };
  if (stroke.key === 'next') return { chord, action: { kind: 'step', direction: 1 } };
  if (stroke.key === 'wheel') return { chord, action: { kind: 'nudge', notches: stroke.notches } };
  if (stroke.key === 'ctrl') {
    if (stroke.down) return { chord: { ctrl: true, digits: '' }, action: { kind: 'none' } };
    const index = chord.digits.length === 0 ? null : ctrlNumber(Number(chord.digits), anchorCount);
    return { chord: emptyChord(), action: index === null ? { kind: 'none' } : { kind: 'jump', index } };
  }
  if (chord.ctrl) return { chord: { ctrl: true, digits: chord.digits + String(stroke.digit) }, action: { kind: 'none' } };
  const index = bareDigit(stroke.digit, anchorCount);
  return { chord, action: index === null ? { kind: 'none' } : { kind: 'jump', index } };
}
