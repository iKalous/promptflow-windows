export function stepAnchor(anchors, offset, direction, graceChars = 0) {
  let chosen = null;
  for (let i = 0; i < anchors.length; i++) {
    const at = anchors[i].offsetChars;
    if (direction < 0 && at < offset && offset - at > graceChars && (chosen === null || at > chosen)) chosen = at;
    if (direction > 0 && at > offset && (chosen === null || at < chosen)) chosen = at;
  }
  return chosen;
}

export function jumpOutline(anchors, id) {
  for (let i = 0; i < anchors.length; i++) {
    if (anchors[i].id === id) return { ok: true, offset: anchors[i].offsetChars };
  }
  return { ok: false, code: 'unknownAnchor' };
}
