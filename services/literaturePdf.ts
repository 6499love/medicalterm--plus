import { getDocument, GlobalWorkerOptions, Util } from 'pdfjs-dist';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { groupPdfLines, type PdfBlock } from './literature';

GlobalWorkerOptions.workerSrc = workerUrl;
export { getDocument };
export type { PDFDocumentProxy };

export interface LiteraturePage {
  width: number;
  height: number;
  image: string;
  blocks: PdfBlock[];
}

export async function readLiteraturePage(pdf: PDFDocumentProxy, number: number): Promise<LiteraturePage> {
  const page = await pdf.getPage(number);
  const viewport = page.getViewport({ scale: 1 });
  if (viewport.width * viewport.height > 8_000_000) {
    throw new Error('页面尺寸过大，请先缩小或拆分 PDF 页面');
  }
  const canvas = document.createElement('canvas');
  const renderViewport = page.getViewport({ scale: 1.5 });
  canvas.width = Math.ceil(renderViewport.width);
  canvas.height = Math.ceil(renderViewport.height);
  await page.render({ canvas, viewport: renderViewport }).promise;
  const content = await page.getTextContent();
  const pieces: Omit<PdfBlock, 'id'>[] = [];
  for (const item of content.items) {
    if (!('str' in item) || !item.str.trim()) continue;
    const transform = Util.transform(viewport.transform, item.transform);
    // Rotated text cannot safely be covered by horizontal translation boxes.
    if (Math.abs(transform[1]) > 0.1 || Math.abs(transform[2]) > 0.1) continue;
    const fontSize = Math.hypot(transform[2], transform[3]);
    pieces.push({ text: item.str, x: transform[4], y: transform[5] - fontSize,
      width: item.width, height: fontSize * 1.15, fontSize });
  }
  const lines: Omit<PdfBlock, 'id'>[] = [];
  for (const piece of pieces.sort((a, b) => a.y - b.y || a.x - b.x)) {
    const line = lines.findLast(candidate => Math.abs(candidate.y - piece.y) < 2 &&
      piece.x >= candidate.x && piece.x - (candidate.x + candidate.width) < piece.fontSize * 1.5);
    if (line) {
      line.text += ` ${piece.text}`;
      line.width = Math.max(line.width, piece.x + piece.width - line.x);
      line.height = Math.max(line.height, piece.height);
    } else lines.push({ ...piece });
  }
  const image = canvas.toDataURL('image/png');
  canvas.width = canvas.height = 0;
  page.cleanup();
  return { width: viewport.width, height: viewport.height, image, blocks: groupPdfLines(lines) };
}
