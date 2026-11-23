function clamp(value, low, high) {
  return Math.min(high, Math.max(low, value));
}

export function align(oldAnchors, oldOffset, newAnchors, newLength) {
  if (newLength <= 0) return 0;
  if (oldOffset <= 0) return 0;
  let sectionIndex = -1;
  for (let i = 0; i < oldAnchors.length; i += 1) {
    if (oldAnchors[i].offsetChars <= oldOffset) sectionIndex = i;
  }
  const section = sectionIndex >= 0 ? oldAnchors[sectionIndex] : null;
  const delta = oldOffset - (section ? section.offsetChars : 0);
  if (!section) {
    const cap = newAnchors.length > 0 ? newAnchors[0].offsetChars : newLength;
    return clamp(delta, 0, Math.min(cap, newLength));
  }
  const match = newAnchors.find((item) => item.title === section.title && item.occurrence === section.occurrence);
  if (match) {
    const next = newAnchors.find((item) => item.offsetChars > match.offsetChars);
    const end = next ? next.offsetChars : newLength;
    return match.offsetChars + Math.min(delta, Math.max(0, end - match.offsetChars));
  }
  if (sectionIndex > 0 && newAnchors.length > 0) {
    return newAnchors[Math.min(sectionIndex - 1, newAnchors.length - 1)].offsetChars;
  }
  return Math.min(oldOffset, newLength);
}
