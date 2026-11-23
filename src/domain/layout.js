const PHONE_WIDTH_VP = 600;
const WIDE_WIDTH_VP = 840;
const TALL_HEIGHT_VP = 900;
const DIRECTOR_COLUMN_VP = 320;

export function chooseLayout(role, widthVp, heightVp, remotePrompter) {
  if (role === 'prompter' || widthVp < PHONE_WIDTH_VP) return 'fullPrompt';
  if (remotePrompter) return 'directorOnly';
  if (widthVp >= WIDE_WIDTH_VP && role === 'solo') return 'splitHorizontal';
  if (widthVp >= PHONE_WIDTH_VP && widthVp < WIDE_WIDTH_VP && heightVp >= TALL_HEIGHT_VP && role === 'solo') {
    return 'splitVertical';
  }
  return 'directorOnly';
}

export function splitColumns(widthVp) {
  return {
    director: DIRECTOR_COLUMN_VP,
    prompt: Math.max(0, widthVp - DIRECTOR_COLUMN_VP)
  };
}
