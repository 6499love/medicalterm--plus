import { getDocument, GlobalWorkerOptions, OPS, Util } from 'pdfjs-dist';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { joinPdfTextPieces, type PdfBlock } from './literature';
import { borderedArtwork, structureLiteraturePage, type PdfBounds } from './literatureStructure';

GlobalWorkerOptions.workerSrc = workerUrl;
export { getDocument };
export type { PDFDocumentProxy };

export interface LiteraturePage {
  width: number;
  height: number;
  image: string;
  blocks: PdfBlock[];
  images: PdfBounds[];
}

async function imageRegions(page: Awaited<ReturnType<PDFDocumentProxy['getPage']>>, viewport: number[]) {
  const { fnArray, argsArray } = await page.getOperatorList();
  const stack: number[][] = [];
  const images: PdfBounds[] = [], paths: PdfBounds[] = [];
  let matrix = viewport;
  const mark = (transform: number[], box = [0,0,1,1], target = images) => {
    const bounds = [Infinity, Infinity, -Infinity, -Infinity];
    Util.axialAlignedBoundingBox(box, transform, bounds);
    const [x,y,right,bottom] = bounds;
    if (right>x && bottom>y) target.push({x,y,width:right-x,height:bottom-y});
  };
  for (let i=0;i<fnArray.length;i++) {
    const op = fnArray[i], args = argsArray[i];
    if (op===OPS.save || op===OPS.paintFormXObjectBegin || op===OPS.beginGroup) {
      stack.push(matrix);
      const form = op===OPS.paintFormXObjectBegin ? args[0] : op===OPS.beginGroup ? args[0]?.matrix : null;
      if (form) matrix=Util.transform(matrix,form);
    } else if (op===OPS.restore || op===OPS.paintFormXObjectEnd || op===OPS.endGroup) {
      matrix=stack.pop() || viewport;
    } else if (op===OPS.transform) {
      matrix=Util.transform(matrix,args);
    } else if (op===OPS.paintImageXObject || op===OPS.paintInlineImageXObject || op===OPS.paintImageMaskXObject) {
      mark(matrix);
    } else if (op===OPS.paintImageXObjectRepeat) {
      const [,scaleX,scaleY,positions]=args;
      for (let n=0;n<positions.length;n+=2) mark(Util.transform(matrix,[scaleX,0,0,scaleY,positions[n],positions[n+1]]));
    } else if (op===OPS.paintInlineImageXObjectGroup) {
      for (const entry of args[1]) mark(Util.transform(matrix,entry.transform));
    } else if (op===OPS.beginAnnotation && args[1]) {
      const [x,y,right,top]=args[1];
      // Annotation boxes can contain badges, not just single-line links.
      if (right-x>=16 && top-y>=16) mark(viewport,args[1]);
    } else if (op===OPS.constructPath && args[2] && args[0]!==OPS.endPath) {
      mark(matrix,args[2],paths);
    }
  }
  return {images,paths};
}

type PageStructure = Omit<LiteraturePage, 'image'>;
type PdfPage = Awaited<ReturnType<PDFDocumentProxy['getPage']>>;

async function extractPageStructure(page: PdfPage): Promise<PageStructure> {
  const viewport = page.getViewport({ scale: 1 });
  const content = await page.getTextContent();
  const pieces: Parameters<typeof joinPdfTextPieces>[0] = [];
  for (const item of content.items) {
    if (!('str' in item) || !item.str.trim()) continue;
    const transform = Util.transform(viewport.transform, item.transform);
    // Rotated text cannot safely be covered by horizontal translation boxes.
    if (Math.abs(transform[1]) > 0.1 || Math.abs(transform[2]) > 0.1) continue;
    const fontSize = Math.hypot(transform[2], transform[3]);
    pieces.push({ text: item.str, x: transform[4], y: transform[5] - fontSize,
      width: item.width, height: fontSize * 1.15, fontSize, hasEOL: item.hasEOL });
  }
  const {images,paths} = await imageRegions(page, viewport.transform);
  const lines = joinPdfTextPieces(pieces);
  images.push(...borderedArtwork(lines,paths,viewport.width));
  return { width: viewport.width, height: viewport.height, images,
    blocks: structureLiteraturePage(lines,viewport.width,viewport.height,images) };
}

export async function readLiteraturePageStructure(pdf: PDFDocumentProxy, number: number): Promise<PageStructure> {
  const page = await pdf.getPage(number);
  try { return await extractPageStructure(page); }
  finally { page.cleanup(); }
}

export async function readLiteraturePage(pdf: PDFDocumentProxy, number: number, structure?: PageStructure): Promise<LiteraturePage> {
  const page = await pdf.getPage(number);
  const viewport = page.getViewport({ scale: 1 });
  if (viewport.width * viewport.height > 8_000_000) {
    throw new Error('页面尺寸过大，请先缩小或拆分 PDF 页面');
  }
  const canvas = document.createElement('canvas');
  const renderViewport = page.getViewport({ scale: 1.5 });
  canvas.width = Math.ceil(renderViewport.width);
  canvas.height = Math.ceil(renderViewport.height);
  try {
    await page.render({ canvas, viewport: renderViewport }).promise;
    const image = canvas.toDataURL('image/png');
    canvas.width = canvas.height = 0;
    return { ...(structure ?? await extractPageStructure(page)), image };
  } finally {
    canvas.width = canvas.height = 0;
    page.cleanup();
  }
}
