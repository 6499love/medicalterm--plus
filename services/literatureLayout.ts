import { preserveSource, type PdfBlock } from './literature';
import type { LiteraturePage } from './literaturePdf';

export type LayoutRect = Pick<PdfBlock, 'x' | 'y' | 'width' | 'height'>;
type LayoutMask = LayoutRect & { color?: string };
type SolidBackdrop = LayoutRect & { color: string };
export type LayoutNote = { id: number; text: string; kind: 'overflow' | 'figure' | 'review' | 'pending'; anchor?: LayoutRect };
export type TranslatedLayout = { placed: Map<number, LayoutRect>; continuations: LayoutNote[] };
type Label = { rect: LayoutRect; lines: string[]; font: string; leading: number; marker?: boolean };
type Measure = (text: string, font: string) => number;

const right = (r: LayoutRect) => r.x+r.width;
const bottom = (r: LayoutRect) => r.y+r.height;
const intersects = (a: LayoutRect,b: LayoutRect) =>
  Math.min(right(a),right(b))-Math.max(a.x,b.x) > .1 && Math.min(bottom(a),bottom(b))-Math.max(a.y,b.y) > .1;

export function wrapLayoutText(value: string, width: number, measure: (text: string) => number): string[] {
  const lines: string[] = [];
  for (const paragraph of value.split('\n')) {
    let line = '';
    const tokens = paragraph.match(/[（《「【]?(?:\[[\d ,–-]+\]|[A-Za-z\d][A-Za-z\d./%+−–-]*|[^])[，。！？；：、）》」】]*/gu) || [];
    for (const token of tokens) {
      for (const part of measure(token) <= width ? [token] : [...token]) {
        if (line.trim() && measure(line+part) > width) {
          lines.push(line.trimEnd());
          line = '';
        }
        if (line || part.trim()) line += part;
      }
    }
    lines.push(line.trimEnd());
  }
  return lines;
}

// Source glyphs can touch a neighboring protected graphic (e.g. a title next to a badge).
// Erase the source box in pieces so no pixel of that graphic is covered.
function subtract(rect: LayoutRect, obstacle: LayoutRect): LayoutRect[] {
  if (!intersects(rect, obstacle)) return [rect];
  const x = Math.max(rect.x,obstacle.x), y = Math.max(rect.y,obstacle.y);
  const r = Math.min(right(rect),right(obstacle)), b = Math.min(bottom(rect),bottom(obstacle));
  return [
    { x:rect.x,y:rect.y,width:rect.width,height:y-rect.y },
    { x:rect.x,y:b,width:rect.width,height:bottom(rect)-b },
    { x:rect.x,y,width:x-rect.x,height:b-y },
    { x:r,y,width:right(rect)-r,height:b-y },
  ].filter(piece=>piece.width > .15 && piece.height > .15);
}

function blockType(block: PdfBlock, value?: string): LayoutNote['kind'] | 'flow' | 'retained' {
  if (value?.startsWith('【待核对') || value?.startsWith('【待重译')) return 'review';
  if (value?.startsWith('【有意保留原文】') || preserveSource(block)) return 'retained';
  if (!value) return 'pending';
  return block.imageText || block.kind === 'figure' ? 'figure' : 'flow';
}

function typography(block: PdfBlock, titleSize?: number) {
  const title = block.fontSize >= 16;
  if (publicationText(block)) {
    const size = titleSize ?? Math.max(8,Math.min(block.fontSize,13));
    return {font:`${size}px "Microsoft YaHei", sans-serif`,leading:size*1.13};
  }
  const size = title ? titleSize ?? Math.min(24,block.fontSize) : Math.max(block.kind === 'caption' ? 9.5 : 10.5,Math.min(13,block.fontSize));
  const font = `${title ? '600 ' : ''}${size}px "Microsoft YaHei", sans-serif`;
  return { font, leading:size*(title ? 1.23 : block.kind!=='caption' && block.fontSize<9.5 ? 1.31 : 1.42) };
}

function publicationText(block: PdfBlock) {
  return block.kind === 'header' || block.kind === 'metadata' || block.kind === 'reference';
}

// Check both edges of the ink box and trim off the rounded or antialiased band edges.
export function sampleBannerBackdrop(ctx: CanvasRenderingContext2D, rect: LayoutRect, sx: number, sy: number): SolidBackdrop | undefined {
  const x = Math.floor(rect.x*sx), y = Math.floor(rect.y*sy);
  const width = Math.ceil(right(rect)*sx)-x, height = Math.ceil(bottom(rect)*sy)-y;
  if (width<6 || height<6) return;
  const {data} = ctx.getImageData(x,y,width,height);
  const rgb = (index:number) => [data[index],data[index+1],data[index+2]];
  let color:number[] | undefined;
  let first=-1, last=-1;
  for (let row=0;row<height;row++) {
    const offset=row*width*4;
    const left=rgb(offset), edge=rgb(offset+(width-1)*4);
    if (Math.min(...left)<75 || Math.max(...left)-Math.min(...left)<25 || !left.every((v,c)=>v===edge[c])) continue;
    // The PDF renderer can dither a flat color by one level between rows.
    if (color && (!color.every((v,i)=>Math.abs(v-left[i])<=1) || row!==last+1)) return;
    color=left;
    if (first<0) first=row;
    last=row;
  }
  if (!color || last-first+1<height*.55) return;
  // Decline to replace anything when ink extends outside the solid band.
  for (let row=0;row<height;row++) {
    if (row>=first && row<=last) continue;
    for (let col=0;col<width;col++) {
      const pixel=rgb((row*width+col)*4);
      if (pixel.some((value,i)=>value<color![i]-12)) return;
    }
  }
  return {x:x/sx,y:(y+first)/sy,width:width/sx,height:(last-first+1)/sy,color:`rgb(${color.join(',')})`};
}

function bannerLabel(block: PdfBlock, value: string, backdrop: SolidBackdrop, measure: Measure) {
  const size=Math.min(block.fontSize,backdrop.height/1.12);
  if (size<8) return;
  const font=`600 ${size}px "Microsoft YaHei", sans-serif`, leading=size*1.12;
  const text=value.replace(/\s+/g,' ').trim();
  const available=block.width-.5;
  const overflow=measure(text,font)>available;
  const line=overflow?'见续页':text;
  const width=measure(line,font);
  if (width>available) return;
  const x=block.readingZone==='right' ? right(block)-width-.5 : block.x+.5;
  const rect={x,y:backdrop.y+(backdrop.height-leading)/2,width,height:leading};
  return {rect,lines:[line],font,leading,overflow};
}

export function planLiteratureLayout(page: Pick<LiteraturePage, 'width' | 'height' | 'blocks' | 'images'>,
  translations: Record<number, string>, measure: Measure, paper: (rect: LayoutRect) => boolean = ()=>true,
  bannerBackground?: (rect: LayoutRect) => SolidBackdrop | undefined) {
  const placed = new Map<number, LayoutRect>();
  if (!page.blocks.length) {
    const continuations: LayoutNote[] = [{id:-1,kind:'review',text:'本页没有提取到文字。请检查原页，或尝试识别图片文字。'}];
    return {placed,continuations,masks:[],labels:[]};
  }
  const notes = new Map<number, LayoutNote>();
  const masks: LayoutMask[] = [], labels: Label[] = [];
  const flows: PdfBlock[][] = [];
  const bounds = page.blocks.filter(b=>b.kind === 'body' || b.kind === 'caption' || !b.kind && !b.imageText);
  const contentRight = Math.max(...bounds.map(right),page.width*.82);
  const rightStart = Math.min(...bounds.filter(b=>b.readingZone === 'right').map(b=>b.x), page.width*.52);
  const sourceMode = (b: PdfBlock) => blockType(b,translations[b.id]);
  let previous: PdfBlock | undefined;
  for (const block of page.blocks) {
    const type = sourceMode(block), text = translations[block.id];
    if (type === 'flow') {
      const canJoin = previous && previous.readingZone === block.readingZone && block.readingZone !== 'wide' &&
        !publicationText(previous) && !publicationText(block) &&
        previous.kind !== 'caption' && block.kind !== 'caption' && previous.fontSize < 16 && block.fontSize < 16 &&
        block.y >= previous.y && block.y-bottom(previous) < Math.max(24,previous.fontSize*2.5);
      if (canJoin) flows.at(-1)!.push(block);
      else flows.push([block]);
      previous = block;
    } else {
      if (type !== 'retained') notes.set(block.id,{ id:block.id,kind:type,
        text:type==='figure' ? `${block.text} · ${text}` : text || `【${block.imageText ? '图片文字' : ''}尚未翻译】${block.text}`,
        anchor:rectangle(block) });
      // An OCR word in a chart does not interrupt the native reading flow.
      if (!block.imageText) previous = undefined;
    }
  }

  let continued = false;
  for (const group of flows) {
    const first = group[0], zone = first.readingZone;
    const rightHeader = first.kind==='header' && first.x>page.width*.72;
    const x = Math.max(0,Math.min(...group.map(b=>b.x))-(rightHeader ? first.fontSize*2.5 : 0));
    const groupBottom = Math.max(...group.map(bottom));
    const naturalRight = Math.max(...group.map(right));
    const maxRight = Math.min(page.width-2,rightHeader ? naturalRight : zone === 'left' ? Math.max(naturalRight,rightStart-8) : Math.max(naturalRight,contentRight));
    const obstacles = [...page.images.map(r=>({x:r.x-.8,y:r.y-.8,width:r.width+1.6,height:r.height+1.6})),
      ...page.blocks.filter(b=>!group.includes(b))];
    const relevant = obstacles.filter(r=>right(r)>x+.5 && r.x<maxRight-.5);
    const boundary = Math.min(page.height-Math.max(4,page.height*.035),
      ...relevant.filter(r=>r.y >= groupBottom-.4).map(r=>r.y-(publicationText(first) ? .15 : 2)));
    const tightPublicationLine = publicationText(first) && first.height<=first.fontSize*1.2 &&
      relevant.some(r=>r.y>=bottom(first)-1 && r.y<bottom(first)+1 && intersects({ ...first,height:first.height+1 },r));
    let y = Math.max(0,first.y-(tightPublicationLine ? 1 : 0));
    const bodyFlow = !publicationText(first) && first.kind !== 'caption' && first.fontSize < 16;
    for (const [i,block] of group.entries()) {
      if (i && !continued) y += Math.max(4,Math.min(10,block.y-bottom(group[i-1])));
      const text = translations[block.id];
      const title = block.fontSize >= 16;
      const margin = title ? 1.1 : .5;
      const source = {
        x:Math.max(0,block.x-margin), y:Math.max(0,block.y-.3),
        width:Math.min(page.width, right(block)+margin)-Math.max(0,block.x-margin),
        height:Math.min(page.height, bottom(block)+(title ? 1.6 : .55))-Math.max(0,block.y-.3),
      };
      const clear = obstacles.reduce((pieces,r)=>pieces.flatMap(piece=>subtract(piece,r)),[source]);
      const erasable = clear.length > 0 && clear.every(paper);
      if (!erasable && block.kind==='metadata' && block.y<page.height*.2 && block.height<=block.fontSize*1.25 && bannerBackground) {
        const backdrop = bannerBackground({...source,x:Math.max(0,source.x-.65),width:source.width+1.3});
        const label = backdrop && bannerLabel(block,text,backdrop,measure);
        if (backdrop && label && !obstacles.some(r=>intersects(backdrop,r))) {
          masks.push(backdrop);
          labels.push(label);
          if (label.overflow) notes.set(block.id,{id:block.id,text,kind:'overflow',anchor:label.rect});
          else placed.set(block.id,label.rect);
          continue;
        }
      }
      const area = (lines: number, end: number): LayoutRect => ({ x:x+.6,y,width:end-x-1.2,height:lines*leading });
      const endAt = (height: number) => Math.min(maxRight,...relevant.filter(r=>r.y < y+height && bottom(r)>y && r.x>=x+10).map(r=>r.x-1));
      let {font,leading} = typography(block);
      const sizes = publicationText(block) ? [undefined,Math.min(9,block.fontSize)] :
        title ? [Math.min(block.fontSize,24),22,20,18].filter((v,i)=>!i || v<block.fontSize) : [undefined];
      if ((!continued || !bodyFlow) && erasable) for (const size of sizes) {
        ({font,leading} = typography(block,size));
        let end = endAt(leading);
        let lines = wrapLayoutText(text,end-x-2,value=>measure(value,font));
        // Re-wrap if additional lines meet an obstacle (such as the title badge).
        while (endAt(lines.length*leading) < end) {
          end = endAt(lines.length*leading);
          lines = wrapLayoutText(text,end-x-2,value=>measure(value,font));
        }
        const rect = area(lines.length,end);
        if (rect.width<14 || bottom(rect)>boundary || lines.some(line=>measure(line,font)>rect.width) || relevant.some(r=>intersects(rect,r))) continue;
        if (rightHeader && lines.length===1) {
          rect.width=measure(lines[0],font);
          rect.x=end-rect.width-.6;
        }
        if (title && size!==sizes.at(-1) && !text.includes('\n') && lines.length>2 && measure(lines.at(-1)!,font)<rect.width*.22) continue;
        masks.push(...clear);
        labels.push({rect,lines,font,leading});
        placed.set(block.id,rect);
        y = bottom(rect);
        break;
      }
      if (placed.has(block.id)) continue;

      let anchor: LayoutRect | undefined;
      if ((!continued || !bodyFlow) && erasable) {
        const marker = '见续页';
        const width = measure(marker,font)+2;
        for (const position of [y,block.y]) {
          const at = { x:x+.6,y:position,width,height:leading };
          if (bottom(at)<=boundary && right(at)<=maxRight && !relevant.some(r=>intersects(r,at))) {
            anchor = at;
            labels.push({rect:at,lines:[marker],font,leading,marker:true});
            break;
          }
        }
      }
      if (erasable && (anchor || continued && bodyFlow)) masks.push(...clear);
      notes.set(block.id,{id:block.id,text,kind:'overflow',anchor});
      if (bodyFlow) continued = true;
    }
  }
  // The graph stays untouched. A translated gray-zone label may fit beside a caption line.
  const captionBlocks = page.blocks.filter(b=>b.kind==='caption' && placed.has(b.id));
  for (const block of page.blocks.filter(b=>b.imageText && /^gr[ae]y\s+zone$/i.test(b.text.trim()))) {
    const note = notes.get(block.id);
    if (note?.kind !== 'figure') continue;
    const caption = captionBlocks.find(candidate=>candidate.y>=bottom(block) && candidate.y-bottom(block)<page.height*.25);
    const label = labels.find(candidate=>candidate.rect===placed.get(caption?.id ?? -1));
    if (!label) continue;
    const text = note.text;
    const font = '9.5px "Microsoft YaHei", sans-serif', leading = 13.5;
    const last = label.lines.length-1;
    const width = measure(text,font)+2;
    const options = [
      {x:label.rect.x,y:bottom(label.rect)+1,width,height:leading},
      {x:label.rect.x+measure(label.lines[last],label.font)+12,y:label.rect.y+last*label.leading,width,height:leading},
    ];
    const at = options.find(r=>right(r)<=contentRight && bottom(r)<=page.height && paper(r) &&
      ![...page.images,...page.blocks].some(obstacle=>intersects(r,obstacle)) &&
      !labels.some(other=>other!==label && intersects(r,other.rect)));
    if (at) {
      labels.push({rect:at,lines:[text],font,leading,marker:true});
      note.anchor = at;
    }
  }
  const continuations = page.blocks.flatMap(block=>notes.has(block.id) ? [notes.get(block.id)!] : []);
  return { placed, continuations, masks, labels };
}

function rectangle({ x,y,width,height }: LayoutRect): LayoutRect { return {x,y,width,height}; }
