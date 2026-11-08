"""Restore source paragraph boundaries before BabelDOC sends text to a translator."""

import copy
import json
import re
from pathlib import Path

import pymupdf as pdf

from reference_layout import clean


def source_regions(path):
    pages = {}
    references = False
    with pdf.open(path) as document:
        for index,page in enumerate(document):
            regions = []
            for block in page.get_text('dict')['blocks']:
                lines = block.get('lines',[])
                texts = [clean(''.join(span['text'] for span in line['spans'])) for line in lines]
                text = ' '.join(texts)
                if re.match(r'^References\b',text,re.I):
                    references = True
                anchors = [i for i,value in enumerate(texts) if re.match(r'^\d{1,3}\.\s*',value)]
                starts = []
                kind = ''
                if references and anchors:
                    starts = ([0] if anchors[0] else []) + anchors
                    kind = 'reference'
                elif re.match(r'^Fig(?:ure)?\.?\s*\d+',text,re.I):
                    starts = [0]
                    kind = 'caption'
                elif re.match(r'^Abbreviations\b',text,re.I):
                    starts = [0] + [i for i,value in enumerate(texts) if i and re.fullmatch(r'[A-Z][A-Z0-9/–-]{1,9}',value)]
                    kind = 'abbreviation'
                if not starts:
                    continue
                for i,start in enumerate(starts):
                    end = starts[i+1] if i+1<len(starts) else len(lines)
                    box = pdf.Rect(lines[start]['bbox'])
                    for line in lines[start+1:end]:
                        box |= pdf.Rect(line['bbox'])
                    row_centers = sorted({round((line['bbox'][1]+line['bbox'][3])/2,1) for line in lines[start:end]})
                    regions.append({'kind':kind,'text':' '.join(texts[start:end]),'bbox':list(box),'row_centers':row_centers})
            pages[index] = {'height':page.rect.height,'regions':regions}
    return pages


def install(source, evidence_dir):
    """Install only in this worker process; installed library files stay untouched."""
    from babeldoc.format.pdf.document_il import PdfLine, PdfParagraphComposition
    from babeldoc.format.pdf.document_il.midend.paragraph_finder import ParagraphFinder, generate_base58_id

    if getattr(ParagraphFinder,'_mediterm_structured',False):
        return
    original = ParagraphFinder.process_page
    regions_by_page = source_regions(source)
    evidence_dir = Path(evidence_dir)
    evidence_dir.mkdir(parents=True,exist_ok=True)

    def process_page(self,page):
        original(self,page)
        metadata = regions_by_page.get(page.page_number)
        if not metadata:
            return
        log = []
        for region in metadata['regions']:
            rect = pdf.Rect(region['bbox']) + (-.6,-.6,.6,.6)
            selected = []
            owners = []
            for paragraph in page.pdf_paragraph:
                # Keep unsupported formula compositions intact rather than discarding glyphs.
                if any(not comp.pdf_line for comp in paragraph.pdf_paragraph_composition):
                    continue
                for comp in paragraph.pdf_paragraph_composition:
                    for char in comp.pdf_line.pdf_character:
                        box = char.visual_bbox.box
                        point = pdf.Point((box.x+box.x2)/2, metadata['height']-(box.y+box.y2)/2)
                        if point in rect:
                            selected.append(char)
                            owners.append(paragraph)
            if not selected or len({p.xobj_id for p in owners}) != 1:
                log.append(dict(region,status='skipped',reason='没有可安全重组的同一坐标空间字符'))
                continue
            ids = {id(char) for char in selected}
            replacement = copy.copy(owners[0])
            replacement.pdf_paragraph_composition = []
            replacement.debug_id = generate_base58_id()
            replacement.layout_label = 'text'
            replacement.first_line_indent = False
            rows = {center:[] for center in region['row_centers']}
            for char in selected:
                box = char.visual_bbox.box
                center = metadata['height']-(box.y+box.y2)/2
                row = min(rows,key=lambda value:abs(value-center))
                rows[row].append(char)
            for chars in rows.values():
                if not chars:
                    continue
                line = PdfLine(pdf_character=sorted(chars,key=lambda c:c.visual_bbox.box.x))
                self.update_line_data(line)
                replacement.pdf_paragraph_composition.append(PdfParagraphComposition(pdf_line=line))
            self.update_paragraph_data(replacement,update_unicode=True)
            # Guard against partial extraction before changing the document.
            normalize = lambda value: re.sub(r'[^\w]','',value or '').lower()
            if normalize(replacement.unicode) != normalize(region['text']):
                log.append(dict(region,status='skipped',reason='字符重组与原文不一致',extracted=replacement.unicode))
                continue
            kept = []
            for paragraph in page.pdf_paragraph:
                if all(paragraph is not owner for owner in owners):
                    kept.append(paragraph)
                    continue
                parts = []
                for comp in paragraph.pdf_paragraph_composition:
                    chars = [char for char in comp.pdf_line.pdf_character if id(char) not in ids]
                    if chars:
                        line = PdfLine(pdf_character=chars)
                        self.update_line_data(line)
                        parts.append(PdfParagraphComposition(pdf_line=line))
                if parts:
                    paragraph.pdf_paragraph_composition = parts
                    self.update_paragraph_data(paragraph,update_unicode=True)
                    kept.append(paragraph)
            kept.append(replacement)
            page.pdf_paragraph = kept
            log.append(dict(region,status='regrouped',input=replacement.unicode))
        self._set_paragraph_render_order(page)
        (evidence_dir/f'page-{page.page_number+1}.json').write_text(json.dumps(log,ensure_ascii=False,indent=2),encoding='utf8')

    ParagraphFinder.process_page = process_page
    ParagraphFinder._mediterm_structured = True
