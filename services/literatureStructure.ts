import { groupPdfLines, type PdfBlock } from './literature';

type Line = Omit<PdfBlock, 'id'>;
export type PdfBounds = Pick<PdfBlock, 'x' | 'y' | 'width' | 'height'>;
const bottom = (b: PdfBounds) => b.y + b.height;
const right = (b: PdfBounds) => b.x + b.width;
const caption = /^(?:fig(?:ure)?\.?|table)\s*\d+\b/i;
const bibliography = /^(?:references|bibliography|literature cited)\s*$/i;
const publicationLabel = /^(?:open access|matters arising|e\s*d\s*i\s*t\s*o\s*r\s*i\s*a\s*l|research article|review article)$/i;
const publicationNote = /^(?:©|\*?\s*correspondence\b|(?:received|accepted|published online)\s*:|publisher.s note\b|this comment refers to the article\b)/i;
const pageNumber = /^page\s+\d+(?:\s*(?:of|\/)\s*\d+)?\.?$/i;
const publicationIdentifier = /(?:\bdoi\b(?:\s|:)|https?:\/\/|\(\d{4}\)\s*\d+\s*:)/i;

function isNameLine(text: string): boolean {
  const words = text.replace(/[\d,*†‡]/g,' ').trim().split(/\s+/);
  return words.length<=18 && words.every(word => /^\p{Lu}[\p{L}.'’‑-]*$/u.test(word) ||
    /^(?:and|et|al\.|de|del|da|van|von)$/i.test(word));
}

function bounds(boxes: PdfBounds[]): PdfBounds {
  const x = Math.min(...boxes.map(b => b.x)), y = Math.min(...boxes.map(b => b.y));
  return {x, y, width: Math.max(...boxes.map(right)) - x, height: Math.max(...boxes.map(bottom)) - y};
}

// Raster images come from PDF.js. A native vector chart can instead be many
// painted paths; require dense artwork immediately before a numbered caption.
export function borderedArtwork(lines: Line[], paths: PdfBounds[], width: number): PdfBounds[] {
  return lines.flatMap(line => {
    if (!caption.test(line.text)) return [];
    const groups: {top: number; bottom: number; paths: PdfBounds[]}[] = [];
    const near = paths.filter(p => p.y >= line.y - width * .6 && bottom(p) <= line.y &&
      p.x < right(line) + 20 && right(p) > line.x - 20).sort((a,b) => a.y - b.y);
    for (const path of near) {
      const group = groups.at(-1);
      if (group && path.y - group.bottom <= 18) {
        group.bottom = Math.max(group.bottom, bottom(path)); group.paths.push(path);
      } else groups.push({top:path.y, bottom:bottom(path), paths:[path]});
    }
    const group = groups.findLast(g => g.paths.length >= 32 && line.y - g.bottom <= 26);
    if (!group) return [];
    const box = bounds(group.paths);
    if (box.width < width * .22 || box.height < 40) return [];
    return [{x:Math.max(0,Math.min(box.x,line.x)-8), y:Math.max(0,group.top-2),
      width:Math.min(width,Math.max(right(box),right(line))+8) - Math.max(0,Math.min(box.x,line.x)-8),
      height:line.y-Math.max(0,group.top-2)-1}];
  });
}

function columnGutter(lines: Line[], width: number): number | undefined {
  // Long lines at aligned starts are stronger evidence than isolated words,
  // reference numbers, page labels, or the short labels inside a chart.
  const candidates = lines.filter(l => l.width >= width * .23 && l.width <= width * .46);
  const left = candidates.filter(l => l.x < width * .24);
  const starts = candidates.filter(l => l.x >= width*.45 && l.x < width*.69).map(l => l.x).sort((a,b) => a-b);
  const anchor = starts.find((x,i) => starts[i+1]-x <= width*.015);
  if (anchor===undefined || left.filter(l => right(l)<=anchor-2).length < 2) return;
  return Math.min(width/2,anchor-2);
}

function collectReferences(lines: Line[], zone: (line: Line) => NonNullable<Line['readingZone']>, taken: Set<Line>): Line[] {
  const references: Line[] = [];
  for (const heading of lines.filter(b => bibliography.test(b.text.trim()))) {
    const column = zone(heading);
    const below = lines.filter(l => l.y > heading.y && zone(l) === column &&
      l.x >= heading.x-4).sort((a,b) => a.y-b.y || a.x-b.x);
    const entries: Line[][] = [];
    const label = (l: Line) => l.text.trim().match(/^\[?(\d{1,3})[.)\]](?:\s|$)/)?.[1];
    const first = below.find(l => l.y-heading.y < heading.fontSize*2.8 &&
      Math.abs(l.x-heading.x) <= 6 && label(l));
    if (!first) continue;
    let number = Number(label(first)), last = first;
    for (const line of below.slice(below.indexOf(first))) {
      if (line.y-last.y > heading.fontSize*2.4 || Math.abs(line.fontSize-heading.fontSize) > 2) break;
      if (Math.abs(line.x-first.x) <= 6) {
        if (Number(label(line)) !== number) break;
        entries.push([]); number++;
      }
      entries.at(-1)?.push(line); last=line;
    }
    if (entries.length < 2) continue;
    taken.add(heading);
    references.push({...heading,kind:'reference'});
    for (const entry of entries) {
      entry.forEach(line => taken.add(line));
      references.push({...entry[0],...bounds(entry),kind:'reference',retainSource:true,
        text:entry.map(line => line.text).join(' ')});
    }
  }
  return references;
}

function collectAbbreviations(lines: Line[], taken: Set<Line>): Line[] {
  const lists: Line[] = [];
  for (const heading of lines.filter(b => /^abbreviations$/i.test(b.text.trim()))) {
    const list = [heading]; const text = [heading.text];
    let y = heading.y;
    for (const key of lines.filter(l => l.y>heading.y && Math.abs(l.x-heading.x)<=4)) {
      if (key.y-y > heading.fontSize*1.65 || !/^[A-Z][A-Z0-9-]{1,15}$/.test(key.text.trim())) break;
      const definition = lines.find(l => Math.abs(l.y-key.y)<1 && l.x>=right(key) && l.x-right(key)<55 &&
        /[A-Za-z]{2}/.test(l.text));
      if (!definition) break;
      list.push(key,definition);text.push(`${key.text.trim()}: ${definition.text.trim()}`);y=key.y;
    }
    if (list.length < 3) continue;
    list.forEach(line => taken.add(line));
    lists.push({...heading,...bounds(list),text:text.join('\n')});
  }
  return lists;
}

export function structureLiteraturePage(lines: Line[], width: number, height: number, images: PdfBounds[]): PdfBlock[] {
  const labelsByImage = new Map<PdfBounds,Line[]>();
  const text: Line[] = [];
  for (const line of lines) {
    const image = images.find(a => a.height>=25 &&
      Math.min(right(a),right(line))-Math.max(a.x,line.x) >= line.width*.6 &&
      Math.min(bottom(a),bottom(line))-Math.max(a.y,line.y) >= line.height*.6);
    if (!image) text.push(line);
    else if (labelsByImage.has(image)) labelsByImage.get(image)!.push(line);
    else labelsByImage.set(image,[line]);
  }
  const gutter = columnGutter(text,width);
  const zone = (l: Line): NonNullable<Line['readingZone']> => gutter === undefined || caption.test(l.text) ||
      (l.x < gutter && right(l) > gutter)
    ? 'wide' : l.x < gutter ? 'left' : 'right';
  const taken = new Set<Line>();
  const specific = [...collectReferences(text,zone,taken),...collectAbbreviations(text,taken)];
  const blocks = groupPdfLines(text.filter(l => !taken.has(l)));
  const title = blocks.find(b => b.fontSize>=17 && b.y<height*.37 && b.width>=width*.28);
  const correspondence = blocks.find(b => /^\*?\s*correspondence\b/i.test(b.text));
  const runningCitations = blocks.filter(b => b.y<height*.062 && publicationIdentifier.test(b.text));
  const inAuthorRow = (block: Line) => !!title && block.y>=bottom(title)-2 &&
      block.y<=bottom(title)+18 && block.fontSize<=13;
  const inAffiliationRow = (block: Line) => !!correspondence && block.y>correspondence.y &&
      block.y<=bottom(correspondence)+18 && block.fontSize<=correspondence.fontSize+.2 &&
      Math.abs(block.x-correspondence.x)<5;
  const role = (block: Line): NonNullable<Line['kind']> => {
    if (block.kind) return block.kind;
    if (block.y<height*.062) return 'header';
    if (caption.test(block.text)) return 'caption';
    if (bibliography.test(block.text.trim())) return 'reference';
    if ((block.y<height*.19 && publicationLabel.test(block.text.trim())) ||
      publicationNote.test(block.text) || inAuthorRow(block) || inAffiliationRow(block)) return 'metadata';
    return 'body';
  };
  const structured = [...blocks,...specific].map(block => {
    const kind = role(block);
    const text = block.text.trim();
    const isPublicationText = publicationLabel.test(text) || publicationNote.test(text) ||
      pageNumber.test(text) || bibliography.test(text);
    const runningIdentity = kind==='header' && (publicationIdentifier.test(text) ||
      isNameLine(text) && runningCitations.some(b => Math.abs(b.y-block.y)<5));
    const author = inAuthorRow(block) && (isNameLine(text) || /^[\d,*†‡\s]+$/.test(text));
    const affiliation = inAffiliationRow(block) &&
      (/^\d{1,2}(?:$|\s+\p{Lu})/u.test(text) || isNameLine(text));
    const retainSource = block.retainSource || !isPublicationText &&
      (runningIdentity || author || affiliation);
    return {...block,kind,retainSource,readingZone:kind==='header' || block===title ? 'wide' as const : zone(block)};
  });
  // The original figure remains the source of truth for native chart labels.
  const artwork: Line[] = [...labelsByImage].map(([image,labels]) => ({
    ...image,text:labels.map(l => l.text).join('\n'),fontSize:labels[0].fontSize,kind:'figure',
    readingZone:'wide',retainSource:true,
  }));
  const ordered = [...structured,...artwork];
  const breaks = ordered.filter(b => b.readingZone==='wide').map(b => b.y);
  const footnote = (b: Line) => b.kind==='metadata' && b.readingZone!=='wide' && b.y>height*.55;
  const lastBody = Math.max(0,...structured.filter(b => b.kind==='body').map(b => b.y));
  const band = (b: Line) => {
    const y = footnote(b) ? Math.max(b.y,lastBody+.15) : b.y;
    return breaks.filter(at => at <= y+.1).length*2-(b.readingZone==='wide'?1:0);
  };
  const side = (b: Line) => footnote(b) ? 2 : b.readingZone==='right' ? 1 : 0;
  return ordered.map(block=>({block,band:band(block),side:side(block)}))
    .sort((a,b) => a.band-b.band || a.side-b.side || a.block.y-b.block.y || a.block.x-b.block.x)
    .map(({block},id) => ({...block,id}));
}
