import type { PdfBlock } from './literature';
import type { LiteraturePage } from './literaturePdf';
import { getCompletion, type LLMConfig } from './llm';
import { literatureErrorMessage } from './literature';

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

export function resultCounts(values: Record<number,string>) {
  const all=Object.values(values);
  const retained=all.filter(value=>value.startsWith('【有意保留原文】')).length;
  const review=all.filter(value=>value.startsWith('【待核对')).length;
  return {translated:all.length-retained-review,retained,review};
}

export interface BrowserPage extends LiteraturePage {
  ocrDone?: boolean;
  ocrLowConfidence?: number;
}

export function overlapsNative(box: PdfBlock, native: PdfBlock[]): boolean {
  return native.some(other => {
    const width = Math.max(0, Math.min(box.x+box.width,other.x+other.width)-Math.max(box.x,other.x));
    const height = Math.max(0, Math.min(box.y+box.height,other.y+other.height)-Math.max(box.y,other.y));
    return width*height > box.width*box.height*.45;
  });
}

export function preserveSource(text: string): boolean {
  return !/[A-Za-z]{2}/.test(text) || /^(references|bibliography)\b/i.test(text.trim()) ||
    /^\s*\d{1,3}[.)]\s+[A-Z][a-z]+\s+[A-Z][A-Za-z.,\s]*[,.:]/.test(text);
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
        width:(line.bbox.x1-line.bbox.x0)*sx, height:(line.bbox.y1-line.bbox.y0)*sy, fontSize:Math.max(6,(line.bbox.y1-line.bbox.y0)*sy*.8) };
      if (overlapsNative(box,page.blocks)) continue;
      if (line.confidence < 70) { low++; continue; }
      blocks.push(box);
    }
    canvas.width=canvas.height=0;
    return { ...page, blocks, ocrDone:true, ocrLowConfidence:low };
  } finally { await worker.terminate(); }
}

function wrap(ctx: CanvasRenderingContext2D, value: string, width: number): string[] {
  const lines: string[] = []; let line = '';
  for (const char of value) {
    if (char === '\n' || (line && ctx.measureText(line+char).width>width)) { lines.push(line); line=''; }
    if (char !== '\n') line+=char;
  }
  if (line) lines.push(line);
  return lines;
}

/** Source stays intact; paginated Chinese side notes never cover chart geometry. */
export async function exportBrowserPdf(name: string, count: number,
  read: (number:number)=>Promise<BrowserPage>, translations: Record<number,Record<number,string>>,
  onProgress: (value:string)=>void, isCurrent:()=>boolean) {
  const { PDFDocument } = await import('pdf-lib');
  const output = await PDFDocument.create();
  for (let number=1; number<=count; number++) {
    if (!isCurrent()) return;
    onProgress(`本机生成 PDF ${number}/${count}`);
    const data = await read(number); const image=new Image(); image.src=data.image; await image.decode();
    const canvas=document.createElement('canvas');canvas.width=1800;canvas.height=1280;
    const ctx=canvas.getContext('2d')!;ctx.font='20px sans-serif';
    const all=data.blocks.flatMap(block=>wrap(ctx,`#${block.id+1} 原文：${block.text}\n对照：${translations[number]?.[block.id] || (preserveSource(block.text)?'【有意保留原文】':'【尚未翻译】')}`,800).concat(['']));
    if (!all.length) all.push('本页未提取到文字。原图保留，需人工检查或运行图片文字识别。');
    for (let offset=0;offset<all.length;offset+=38) {
      ctx.fillStyle='white';ctx.fillRect(0,0,1800,1280);ctx.fillStyle='#15283d';ctx.font='20px sans-serif';
      ctx.fillText(`原文第 ${number} 页 · ${offset ? '对照续页' : '浏览器对照稿'}`,30,35);
      const scale=Math.min(850/image.width,1190/image.height);ctx.drawImage(image,25,60,image.width*scale,image.height*scale);
      ctx.fillText('中文对照 · 图中文字按编号查看 · 机器翻译请复核',920,35);
      all.slice(offset,offset+38).forEach((line,i)=>ctx.fillText(line,920,75+i*30));
      const png=await output.embedPng(canvas.toDataURL('image/png'));
      const sheet=output.addPage([900,640]);sheet.drawImage(png,{x:0,y:0,width:900,height:640});
    }
    canvas.width=canvas.height=0;
    await new Promise(resolve=>setTimeout(resolve,0));
  }
  if (!isCurrent()) return;
  const bytes=await output.save();
  const url=URL.createObjectURL(new Blob([bytes as BlobPart],{type:'application/pdf'}));
  const link=document.createElement('a');link.href=url;link.download=`${name}-浏览器双语对照.pdf`;link.click();setTimeout(()=>URL.revokeObjectURL(url),10000);
}
