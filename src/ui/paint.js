import { themeColors } from '../domain/display.js';

export function paintPrompter(canvas, body, offsetChars, display) {
  const context = canvas.getContext('2d');
  if (!context) return { painted: 0, width: 0, height: 0 };
  const width = canvas.width;
  const height = canvas.height;
  const colors = themeColors(display.theme);
  context.setTransform(1, 0, 0, 1, 0, 0);
  context.fillStyle = colors.background;
  context.fillRect(0, 0, width, height);
  context.save();
  const scaleX = display.mirrorH ? -1 : 1;
  const scaleY = display.mirrorV ? -1 : 1;
  context.translate(display.mirrorH ? width : 0, display.mirrorV ? height : 0);
  context.scale(scaleX, scaleY);
  const margin = Math.max(12, display.marginVp);
  const fontPx = Math.max(18, Math.round(42 * display.fontScale));
  context.fillStyle = colors.text;
  context.font = `${fontPx}px "Iowan Old Style", Palatino, "Palatino Linotype", "Songti SC", serif`;
  context.textBaseline = 'top';
  const source = body.slice(Math.max(0, offsetChars));
  const maxWidth = Math.max(40, width - margin * 2);
  const lineHeight = fontPx * display.lineSpacing;
  let y = margin;
  const paragraphs = source.split('\n');
  for (const paragraph of paragraphs) {
    const line = paragraph.length === 0 ? ' ' : paragraph;
    let rest = line;
    while (rest.length > 0 && y < height) {
      let take = rest.length;
      while (take > 1 && context.measureText(rest.slice(0, take)).width > maxWidth) take -= 1;
      context.fillText(rest.slice(0, take), margin, y);
      rest = rest.slice(take);
      y += lineHeight;
    }
    if (y >= height) break;
  }
  context.restore();
  return { painted: width * height, width, height };
}
