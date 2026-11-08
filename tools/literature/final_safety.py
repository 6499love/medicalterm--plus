"""Conservative final pass: preserve source references and framed statistical figures."""
import re
import pymupdf as pdf


def restore_region(target, original, page_number, area, clear=None):
    target.add_redact_annot(clear or area, fill=(1, 1, 1))
    target.apply_redactions(images=0, graphics=0)
    target.draw_rect(clear or area, color=None, fill=(1, 1, 1))
    target.show_pdf_page(area, original, page_number, clip=area)


def preserve_sensitive_regions(original, translated):
    report = []
    references = False
    for index, source in enumerate(original):
        target = translated[index]
        for block in source.get_text('blocks'):
            text = block[4]
            if re.match(r'^\s*References\b', text, re.I):
                references = True
            numbers = re.findall(r'^\s*(\d{1,3})\.\s*', text, re.M)
            if not references or not numbers:
                continue
            area = pdf.Rect(block[:4]) + (-1, -1, 1, 1)
            clear = pdf.Rect(area)
            for hit in target.get_text('blocks'):
                box = pdf.Rect(hit[:4])
                if box.intersects(area) and abs(box.x0-area.x0) < 20 and box.width < area.width*1.3:
                    clear |= box
            restore_region(target, original, index, area, clear)
            report.append({'page': index+1, 'kind': 'references', 'numbers': numbers,
                           'status': 'intentional', 'reason': '参考文献整条保留原文，保护作者、编号、年份；未翻译'})
        # Framed native-text plots are not raster OCR labels. Preserve them as a unit.
        captions = [pdf.Rect(b[:4]) for b in source.get_text('blocks')
                    if re.match(r'^\s*Fig(?:ure)?\.?\s*\d+', b[4], re.I)]
        candidates = []
        for drawing in source.get_drawings():
            box = drawing['rect']
            if (box.width > source.rect.width*.5 and box.height > 80 and box.y0 > 40
                    and any(0 <= caption.y0-box.y1 < 24 for caption in captions)
                    and len(source.get_text(clip=box).strip()) > 100):
                if not any(abs(box.x0-other.x0)<3 and abs(box.y0-other.y0)<3 for other in candidates):
                    candidates.append(box)
        for box in candidates:
            area = box + (-1, -1, 1, 1)
            labels = source.get_text(clip=box).splitlines()
            restore_region(target, original, index, area)
            report.append({'page': index+1, 'kind': 'native_figure', 'bbox': list(area),
                           'status': 'intentional', 'reason': '复杂统计图整图保留原文，保护作者、数值和图线；中文图注另保留，图内英文尚未翻译',
                           'source_labels': labels})
    return report
