import { align } from './align.js';

export function offsetAfterEnvelope(input) {
  if (input.command === 'jumpAnchor') {
    if (input.jumpOffset != null) return input.jumpOffset;
    return align(input.oldAnchors, input.localOffset, input.newAnchors, input.newLength);
  }
  if (!input.wasDegraded) return input.envelopeOffset;
  const aligned = align(input.oldAnchors, input.localOffset, input.newAnchors, input.newLength);
  return Math.max(aligned, input.envelopeOffset);
}
