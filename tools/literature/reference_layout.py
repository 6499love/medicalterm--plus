"""Restore separately numbered references using source anchors and existing real translations."""

import html
import re

import pymupdf as pdf


def restore_access_label_alignment(original, translated):
    """Anchor the standalone access badge to its original right edge, wherever it occurs."""
    report = []
    for page_number, source_page in enumerate(original):
        source_spans = [span for block in source_page.get_text('dict')['blocks']
                        for line in block.get('lines', []) for span in line['spans']
                        if span['text'].strip() == 'Open Access'
                        and span['bbox'][0] > source_page.rect.width/2
                        and span['bbox'][1] < source_page.rect.height/4]
        page = translated[page_number]
        targets = [span for block in page.get_text('dict')['blocks']
                   for line in block.get('lines', []) for span in line['spans']
                   if span['text'].strip() == '开放获取']
        if len(source_spans) != 1:
            continue
        source = source_spans[0]
        targets = [target for target in targets if abs(target['bbox'][1]-source['bbox'][1]) <= source['size']]
        if len(targets) != 1:
            continue
        target = targets[0]
        source_box, old_box = pdf.Rect(source['bbox']), pdf.Rect(target['bbox'])
        if abs(source_box.y0-old_box.y0) > source['size'] or source_box.x0 < source_page.rect.width/2:
            continue
        size = source['size']
        width = pdf.get_text_length('开放获取',fontname='china-s',fontsize=size)
        new_box = pdf.Rect(source_box.x1-width,source_box.y0,source_box.x1,source_box.y1)
        # Only remove the translated text. Keep the colored bar and adjacent heading.
        page.add_redact_annot(old_box + (.1,.1,-.1,-.1),fill=False)
        page.apply_redactions(images=0,graphics=0)
        page.insert_text((new_box.x0,source['origin'][1]),'开放获取',fontname='china-s',fontsize=size)
        report.append({'page':page_number+1,'label':'开放获取','alignment':'right',
                       'source_right_edge':source_box.x1,'old_bbox':list(old_box),'new_bbox':list(new_box)})
    return report


def clean(text):
    return re.sub(r'\s+', ' ', re.sub(r'[\x00-\x1f\u200b]', ' ', text)).strip()


def split_entries(text, expected):
    matches = list(re.finditer(r'(?<!\d)(\d{1,3})(?:[.．]|\s)\s*(?=[A-Za-z\u4e00-\u9fff])', clean(text)))
    if [int(match[1]) for match in matches] != expected:
        raise ValueError('ReferenceNumberMismatch')
    value = clean(text)
    return [value[match.end():matches[i+1].start() if i+1<len(matches) else len(value)].strip()
            for i, match in enumerate(matches)]


def restore_references(original, translated):
    report = []
    active = False
    previous = 0
    for page_number, source_page in enumerate(original):
        for block in source_page.get_text('blocks'):
            text = block[4]
            if re.match(r'^\s*References\b', text, re.I):
                active = True
            if not active:
                continue
            anchors = list(re.finditer(r'^\s*(\d{1,3})\.\s*', text, re.M))
            if not anchors:
                continue
            numbers = [int(match[1]) for match in anchors]
            if numbers != list(range(previous+1, previous+1+len(numbers))):
                report.append({'page':page_number+1,'status':'review','reason':'原文参考文献编号不连续'})
                continue
            previous = numbers[-1]
            originals = [clean(text[m.end():anchors[i+1].start() if i+1<len(anchors) else len(text)])
                         for i,m in enumerate(anchors)]
            page = translated[page_number]
            area = pdf.Rect(block[:4])
            hits = [b for b in page.get_text('blocks') if pdf.Rect(b[:4]).intersects(area)]
            try:
                entries = split_entries(' '.join(b[4] for b in hits), numbers)
            except ValueError as exc:
                report.append({'page':page_number+1,'status':'review','reason':str(exc)})
                continue
            retained = []
            for index,(value,source) in enumerate(zip(entries,originals)):
                if not value.startswith(source.split()[0]):
                    entries[index] = source
                    retained.append(numbers[index])
            clear = pdf.Rect(area)
            for hit in hits:
                clear |= pdf.Rect(hit[:4])
            heading = '<h3>参考文献</h3>' if 'References' in text else ''
            body = heading + ''.join(f'<p><b>{number}.</b> {html.escape(value)}</p>'
                                     for number,value in zip(numbers,entries))
            css = 'body{font-family:sans-serif}h3{font-size:8pt;margin:0 0 4pt}p{font-size:7.5pt;line-height:1.15;margin:0 0 3pt}'
            target = pdf.Rect(clear.x0, clear.y0, clear.x1, clear.y1)
            with pdf.open() as trial:
                trial_page = trial.new_page(width=page.rect.width,height=page.rect.height)
                _,scale = trial_page.insert_htmlbox(target,body,css=css)
            if scale < .9:
                report.append({'page':page_number+1,'status':'review','reason':'分条排版空间不足'})
                continue
            page.add_redact_annot(clear,fill=(1,1,1))
            page.apply_redactions(images=0,graphics=0)
            page.insert_htmlbox(target,body,css=css)
            report.append({'page':page_number+1,'status':'restored','numbers':numbers,
                           'source':'existing automatic translation','scale':scale,
                           'retained_original_author_mismatch':retained})
    return report


def preserve_overflowing_captions(original, translated):
    """Keep source captions when a narrow translated fragment overflows its source line."""
    report = []
    for page_number, source_page in enumerate(original):
        page = translated[page_number]
        for block in source_page.get_text('blocks'):
            if not re.match(r'^Fig(?:ure)?\.?\s*\d+', clean(block[4]), re.I):
                continue
            source_box = pdf.Rect(block[:4])
            hits = [b for b in page.get_text('blocks') if pdf.Rect(b[:4]).intersects(source_box)]
            if not any(pdf.Rect(b[:4]).width < source_box.width*.3
                       and pdf.Rect(b[:4]).height > source_box.height*1.5 for b in hits):
                continue
            clear = pdf.Rect(source_box)
            for hit in hits:
                clear |= pdf.Rect(hit[:4])
            text = clean(block[4])
            with pdf.open() as trial:
                test_page = trial.new_page(width=page.rect.width,height=page.rect.height)
                fits = test_page.insert_textbox(clear,text,fontname='helv',fontsize=7)
            if fits < 0:
                report.append({'page':page_number+1,'status':'review','reason':'异常图注恢复原文时空间不足'})
                continue
            page.add_redact_annot(clear,fill=(1,1,1))
            page.apply_redactions(images=0,graphics=0)
            page.insert_textbox(clear,text,fontname='helv',fontsize=7)
            report.append({'page':page_number+1,'status':'original_retained',
                           'reason':'译文窄片段溢出，已回退为完整原文图注；待整段重新翻译','source':text})
    return report
