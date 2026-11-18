import { wrapLayoutText, type LayoutNote } from './literatureLayout';

const font = '"Microsoft YaHei", sans-serif';
const labels: Record<LayoutNote['kind'], string> = {
  overflow: '译文接续', figure: '图片文字对照', review: '待核对', pending: '尚未翻译',
};

interface ContinuationLine { text: string; y: number; heading?: boolean }
export interface ContinuationSheet {
  lines: ContinuationLine[];
  notes: { id: number; label: string; text: string }[];
}

export function prepareLiteratureContinuations(notes: LayoutNote[], width: number, height: number): ContinuationSheet[] {
  if (!notes.length) return [];
  const ctx = document.createElement('canvas').getContext('2d')!;
  const sheets: ContinuationSheet[] = [];
  const scale = Math.min(width / 420, height / 560, 1);
  const margin = 36 * scale, face = 11.5 * scale, leading = 17 * scale, bottom = height - margin;
  let y = 0;
  let sheet: ContinuationSheet;
  let inFigure = false;
  function nextSheet() {
    sheet = { lines: [], notes: [] }; sheets.push(sheet); y = 75 * scale; inFigure = false;
  }
  nextSheet();
  ctx.font = `${face}px ${font}`;
  for (const note of notes) {
    const label = `${note.id >= 0 ? `第 ${note.id + 1} 段 · ` : ''}${labels[note.kind]}`;
    const figure = note.kind === 'figure';
    const lines = wrapLayoutText(figure ? `#${note.id + 1}  ${note.text}` : note.text,width - margin * 2,value=>ctx.measureText(value).width);
    let index = 0;
    while (index < lines.length) {
      if (y + 2 * leading > bottom) nextSheet();
      const noteLabel = index ? `${label}（续）` : label;
      if (!figure || !inFigure) {
        sheet!.lines.push({text:figure ? '图片文字对照 · 原图保留' : noteLabel, y, heading:true}); y += leading;
      }
      inFigure = figure;
      const from = index;
      while (index < lines.length && y + leading <= bottom) {
        sheet!.lines.push({text:lines[index++], y}); y += leading;
      }
      sheet!.notes.push({id:note.id, label:noteLabel, text:lines.slice(from,index).join(' ')});
      y += (figure ? 1 : 12) * scale;
    }
  }
  return sheets;
}

export function drawLiteratureContinuation(canvas: HTMLCanvasElement, sheet: ContinuationSheet,
  width: number, height: number, page: number, index: number, pixels = 1.5) {
  canvas.width = Math.ceil(width * pixels); canvas.height = Math.ceil(height * pixels);
  const ctx = canvas.getContext('2d', {willReadFrequently:true})!;
  ctx.scale(canvas.width / width, canvas.height / height);
  const scale = Math.min(width / 420, height / 560, 1);
  const margin = 36 * scale;
  ctx.fillStyle = '#fff'; ctx.fillRect(0,0,width,height);
  ctx.textBaseline = 'top';
  ctx.fillStyle = '#172033'; ctx.font = `bold ${17 * scale}px ${font}`;
  ctx.fillText(`原文第 ${page} 页 · 续页 ${index + 1}`,margin,29 * scale);
  ctx.fillStyle = '#cbd5e1'; ctx.fillRect(margin,57 * scale,width - margin * 2,1 * scale);
  for (const { text, y, heading } of sheet.lines) {
    ctx.font = `${heading ? 'bold ' : ''}${(heading ? 10.5 : 11.5) * scale}px ${font}`;
    ctx.fillStyle = heading ? '#24538a' : '#172033';
    ctx.fillText(text,margin,y);
  }
}
