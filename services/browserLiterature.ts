import type { PdfBlock } from './literature';
import type { LiteraturePage } from './literaturePdf';
import { getCompletion, type LLMConfig } from './llm';
import { literatureErrorMessage, preserveSource } from './literature';
import { planLiteratureLayout, sampleBannerBackdrop, type TranslatedLayout } from './literatureLayout';
import { drawLiteratureContinuation, prepareLiteratureContinuations } from './literatureContinuation';

export function literatureModelConfig(config: LLMConfig): LLMConfig {
  const baseUrl = config.baseUrl?.replace(/\/+$/, '');
  const useSiteGlm = config.provider === 'glm' && (!config.baseUrl || baseUrl === 'https://open.bigmodel.cn/api/paas/v4');
  return {...config,browserDirect:!useSiteGlm};
}

export async function checkBrowserConnection(config: LLMConfig): Promise<void> {
  const response = await getCompletion(literatureModelConfig(config), 'Reply with OK only.');
  if (!response.trim()) throw new Error('API returned no content found');
}

export function browserConnectionError(error: unknown, config: LLMConfig): string {
  const message = error instanceof Error ? error.message : '';
  if (/Failed to fetch|NetworkError|Load failed/i.test(message)) {
    return !literatureModelConfig(config).browserDirect
      ? '网页未能连接网站的智谱转发接口，请检查网络后重试。'
      : '模型网页直连失败，可能是网络或接口跨域限制。请确认该服务允许浏览器直连；更换服务时必须使用对应平台的 Key。';
  }
  if (/TimeoutError|timed out|aborted due to timeout/i.test(message)) return '模型直连等待超过90秒。已有结果保留，可稍后重试。';
  return literatureErrorMessage(error);
}

export function resultCounts(values: Record<number,string>, blocks?: PdfBlock[]) {
  const all=blocks?.map(block=>values[block.id] || (preserveSource(block) ? '【有意保留原文】' : '【待核对】')) || Object.values(values);
  const retained=all.filter(value=>value.startsWith('【有意保留原文】')).length;
  const review=all.filter(value=>(value.startsWith('【待核对') || value.startsWith('【待重译'))).length;
  return {translated:all.length-retained-review,retained,review};
}

export interface BrowserPage extends LiteraturePage {
  ocrDone?: boolean;
  ocrLowConfidence?: number;
}

export function isBrowserPageProcessed(page: Pick<BrowserPage,'blocks'|'ocrDone'> | undefined,
  values: Record<number,string> | undefined, withOcr: boolean): boolean {
  return !!(page&&values&&(!withOcr||page.ocrDone)&&page.blocks.every(block=>!!values[block.id] && !values[block.id].startsWith('【待重译')));
}

export function overlapsNative(box: PdfBlock, native: PdfBlock[]): boolean {
  return native.some(other => {
    const width = Math.max(0, Math.min(box.x+box.width,other.x+other.width)-Math.max(box.x,other.x));
    const height = Math.max(0, Math.min(box.y+box.height,other.y+other.height)-Math.max(box.y,other.y));
    return width*height > box.width*box.height*.45;
  });
}

export { preserveSource };

export function reviewBrowserTranslation(source: string, translation: string): string {
  if (translation.startsWith('【有意保留原文】') || translation.startsWith('【待核对') || translation.startsWith('【待重译')) return translation;
  if (!numbersMatch(source,translation)) return `【待核对：译文数字或单位与原文不一致】${translation}`;
  return /\p{Script=Han}/u.test(translation) ? translation : `【待重译：模型未返回中文】`;
}

export function numbersMatch(source: string, translation: string): boolean {
  const numbers = (value: string) => (value.replace(/[−–]/g,'-').match(/[+-]?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/g) || []).sort().join('|');
  const units = (value:string) => (value.match(/°C|℃|°|%|\b(?:mmHg|mL\/kg|ml\/kg|cmH2O|mmol\/L|mg|kg)\b/g)||[]).map(v=>v.replace('℃','°C').toLowerCase()).sort().join('|');
  return numbers(source) === numbers(translation) && units(source) === units(translation);
}

export async function recognizePage(page: BrowserPage, onProgress: (message: string) => void): Promise<BrowserPage> {
  const { createWorker, PSM } = await import('tesseract.js');
  const worker = await createWorker('eng', 1, { logger: event => onProgress(`本机识别图中文字 ${Math.round(event.progress*100)}%`) });
  try {
    const image = new Image(); image.src = page.image; await image.decode();
    const canvas=document.createElement('canvas');
    const scale=Math.min(3,Math.sqrt(12_000_000/(page.width*page.height)));
    canvas.width=Math.ceil(page.width*scale);canvas.height=Math.ceil(page.height*scale);
    canvas.getContext('2d')!.drawImage(image,0,0,canvas.width,canvas.height);
    await worker.setParameters({tessedit_pageseg_mode:PSM.SPARSE_TEXT});
    const { data } = await worker.recognize(canvas, {}, { blocks: true });
    const sx = page.width/canvas.width, sy = page.height/canvas.height;
    const blocks = [...page.blocks]; let low = 0;
    for (const block of data.blocks || []) for (const paragraph of block.paragraphs) for (const line of paragraph.lines) {
      if (!line.text.trim()) continue;
      const box: PdfBlock = { id: blocks.length, text: line.text.trim(), x:line.bbox.x0*sx, y:line.bbox.y0*sy,
        width:(line.bbox.x1-line.bbox.x0)*sx, height:(line.bbox.y1-line.bbox.y0)*sy, fontSize:Math.max(6,(line.bbox.y1-line.bbox.y0)*sy*.8), imageText:true };
      if (overlapsNative(box,page.blocks)) continue;
      if (line.confidence < 70) { low++; continue; }
      blocks.push(box);
    }
    canvas.width=canvas.height=0;
    return { ...page, blocks, ocrDone:true, ocrLowConfidence:low };
  } finally { await worker.terminate(); }
}

export function drawTranslatedLayout(canvas: HTMLCanvasElement, page: BrowserPage, image: HTMLImageElement,
  translations: Record<number, string>): TranslatedLayout {
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;
  const ctx = canvas.getContext('2d', {willReadFrequently:true})!;
  ctx.drawImage(image, 0, 0);
  const sx = canvas.width/page.width, sy = canvas.height/page.height;
  let currentFont = '';
  const plan = planLiteratureLayout(page, translations, (text,font)=>{
    if (currentFont !== font) { ctx.font = font; currentFont = font; }
    return ctx.measureText(text).width;
  }, ({x,y,width,height})=>{
    if (width<1 || height<1) return true;
    const corners = [[x,y],[x+width-.6,y],[x,y+height-.6],[x+width-.6,y+height-.6]];
    // Paper must be white at the edges; one isolated ink pixel at a crop edge is harmless.
    return corners.filter(([px,py])=>{
      const [r,g,b] = ctx.getImageData(Math.floor(px*sx),Math.floor(py*sy),1,1).data;
      return Math.min(r,g,b)>=245;
    }).length >= 3;
  }, rect=>sampleBannerBackdrop(ctx,rect,sx,sy));
  ctx.scale(sx, sy);
  ctx.textBaseline = 'top';
  for (const r of plan.masks) {
    ctx.fillStyle = r.color || '#fff';
    ctx.fillRect(r.x,r.y,r.width,r.height);
  }
  for (const {rect,lines,font,leading,marker} of plan.labels) {
    ctx.font = font;
    ctx.fillStyle = marker ? '#275a83' : '#172033';
    lines.forEach((line,i)=>ctx.fillText(line,rect.x,rect.y+i*leading));
  }
  return { placed:plan.placed, continuations:plan.continuations };
}

export type PdfExportMode = 'translated' | 'bilingual';

export async function exportBrowserPdf(name: string, count: number,
  read: (number:number)=>Promise<BrowserPage>, translations: Record<number,Record<number,string>>,
  onProgress: (value:string)=>void, isCurrent:()=>boolean, mode:PdfExportMode='bilingual', partial=false) {
  const { PDFDocument } = await import('pdf-lib');
  const output = await PDFDocument.create();
  for (let number=1; number<=count; number++) {
    if (!isCurrent()) return;
    onProgress(`本机生成 PDF ${number}/${count}`);
    const data = await read(number); const image=new Image(); image.src=data.image; await image.decode();
    const right=document.createElement('canvas');
    const layout=drawTranslatedLayout(right,data,image,translations[number] || {});
    const sheets=prepareLiteratureContinuations(layout.continuations,data.width,data.height);
    const original=mode==='bilingual' ? await output.embedPng(data.image) : undefined;
    const margin=18, gap=18, width=data.width+margin*2+(original?data.width+gap:0), height=data.height+margin*2;
    const background=await output.embedPng(right.toDataURL('image/png'));
    for (let sheetIndex=-1;sheetIndex<sheets.length;sheetIndex++) {
      if (!isCurrent()) return;
      if (sheetIndex>=0) drawLiteratureContinuation(right,sheets[sheetIndex],data.width,data.height,number,sheetIndex);
      const translated=sheetIndex<0?background:await output.embedPng(right.toDataURL('image/png'));
      const sheet=output.addPage([width,height]);
      const fit={y:margin,width:data.width,height:data.height};
      if(original) sheet.drawImage(original,{...fit,x:margin});
      sheet.drawImage(translated,{...fit,x:original?margin+data.width+gap:margin});
    }
    right.width=right.height=0;
    await new Promise(resolve=>setTimeout(resolve,0));
  }
  if (!isCurrent()) return;
  const bytes=await output.save();
  if (!isCurrent()) return;
  const url=URL.createObjectURL(new Blob([bytes as BlobPart],{type:'application/pdf'}));
  const link=document.createElement('a');link.href=url;link.download=`${name.replace(/\.pdf$/i,'')}-${mode==='translated'?'中文译文':'双语对照'}${partial?'-部分译文':''}.pdf`;link.click();setTimeout(()=>URL.revokeObjectURL(url),10000);
}
