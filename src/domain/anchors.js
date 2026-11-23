export function parseAnchors(body) {
  const text = body.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const lines = text.split('\n');
  const anchors = [];
  const seen = new Map();
  let offset = 0;
  for (const line of lines) {
    const match = /^(#{1,2}) (.+)$/.exec(line);
    const title = match?.[2]?.trim() ?? '';
    if (match && title.length > 0) {
      const occurrence = seen.get(title) ?? 0;
      seen.set(title, occurrence + 1);
      const level = match[1].length === 1 ? 1 : 2;
      anchors.push({ id: `a${anchors.length + 1}`, level, title, offsetChars: offset, occurrence });
    }
    offset += line.length + 1;
  }
  return anchors;
}
