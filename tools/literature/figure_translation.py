"""Conservative figure-label translation using local OCR evidence and a caller's key."""

import json
import html
import hashlib
import re
import urllib.request
from pathlib import Path

import numpy as np
import pymupdf as pdf
from PIL import Image
from reference_layout import preserve_overflowing_captions, restore_access_label_alignment
from final_safety import preserve_sensitive_regions


# Explicit terminology requested for this feature; applied to any document by source text.
FIGURE_TERMS = {'grey zone': '灰区'}


def bounds(label):
    points = np.asarray(label['polygon_pixels'])
    return pdf.Rect(*points.min(axis=0), *points.max(axis=0))


def group_labels(labels):
    """Join adjacent, aligned large uppercase lines, leaving small chart rows separate."""
    remaining = list(labels)
    groups = []
    while remaining:
        first = remaining.pop(0)
        group = dict(first, members=[first])
        box = bounds(first)
        if first['status'] == 'pending' and first['source'].isupper():
            for candidate in list(remaining):
                other = bounds(candidate)
                if (candidate['status'] == 'pending' and candidate['source'].isupper()
                        and box.height >= 48 and abs(other.x0 - box.x0) < 5
                        and .8 < other.height / box.height < 1.2
                        and 0 <= other.y0 - box.y1 <= box.height * .4):
                    group['source'] += ' ' + candidate['source']
                    group['members'].append(candidate)
                    remaining.remove(candidate)
                    break
        groups.append(group)
    return groups


def translate_labels(groups, key, glossary, record_path=None):
    pending = [{'id': item['id'], 'text': item['source']} for item in groups if item['status'] == 'pending']
    if not pending:
        return {}
    instruction = (
        'Translate these medical figure labels from English into concise Simplified Chinese. '
        'Use the full set of labels as context. Preserve numbers, units and abbreviations exactly. '
        'Do not add explanations. Return only a JSON array of objects with id and translation. '
        'Example output: [{"id": 0, "translation": "中文标签"}]. '
        'Return exactly one item for every supplied id. Glossary:\n' + glossary
    )
    payload = {'model': 'glm-4-flash', 'temperature': 0,
               'messages': [{'role': 'system', 'content': instruction},
                            {'role': 'user', 'content': json.dumps(pending)}]}
    request = urllib.request.Request('https://open.bigmodel.cn/api/paas/v4/chat/completions',
        data=json.dumps(payload).encode(), headers={'Content-Type': 'application/json', 'Authorization': 'Bearer ' + key})
    with urllib.request.urlopen(request, timeout=90) as response:
        result = json.load(response)['choices'][0]['message']['content'].strip()
    if record_path is not None:
        # Only public figure text is recorded. Never store HTTP headers, keys or request objects.
        safe_result = result.replace(key, '[redacted]') if key else result
        record_path.write_text(json.dumps({'items': pending, 'reply': safe_result},
                                         ensure_ascii=False, indent=2), encoding='utf8')
    return parse_translations(result, {item['id'] for item in pending})


def parse_translations(result, expected_ids):
    result = re.sub(r'^```(?:json)?\s*|\s*```$', '', result.strip())
    entries = json.loads(result)
    if not isinstance(entries, list) or len(entries) != len(expected_ids):
        raise ValueError('TranslationCountMismatch')
    translations = {}
    for item in entries:
        if not isinstance(item, dict) or type(item.get('id')) is not int or item['id'] in translations:
            raise ValueError('InvalidTranslationItem')
        # GLM can echo the input's `text` field even when asked for `translation`.
        text = item.get('translation', item.get('text'))
        if (not isinstance(text, str) or not text.strip()
                or ('translation' in item and 'text' in item and item['text'] != text)):
            raise ValueError('InvalidTranslationItem')
        translations[item['id']] = text.strip()
    if set(translations) != expected_ids:
        raise ValueError('TranslationIdMismatch')
    return translations


def label_layout(group, groups, image_width, image_height):
    """Use shared right edges for label columns and midpoint boundaries between rows."""
    area = bounds(group['members'][0])
    for member in group['members'][1:]:
        area |= bounds(member)
    peers = []
    for other in groups:
        if len(other['members']) != 1 or other['status'] != 'pending':
            continue
        box = bounds(other)
        if abs(box.x1-area.x1) <= 8 and .7 <= box.height/area.height <= 1.3:
            peers.append(box)
    right_aligned = len(peers) >= 3 and len(group['members']) == 1
    target = pdf.Rect(area)
    nominal_height = area.height
    if right_aligned:
        target.x0 = min(box.x0 for box in peers)
        target.x1 = float(np.median([box.x1 for box in peers]))
        nominal_height = min(box.height for box in peers)
    center = (area.y0+area.y1)/2
    for other in groups:
        if other['id'] == group['id']:
            continue
        box = bounds(other['members'][0])
        for member in other['members'][1:]:
            box |= bounds(member)
        if box.x0 >= target.x1 or box.x1 <= target.x0:
            continue
        other_center = (box.y0+box.y1)/2
        midpoint = (center+other_center)/2
        if other_center < center:
            target.y0 = max(target.y0, midpoint+1)
        else:
            target.y1 = min(target.y1, midpoint-1)
    target &= pdf.Rect(0, 0, image_width, image_height)
    return area, target, nominal_height, right_aligned


def edge_background(rgb, box):
    """Sample available edges, including labels touching the image boundary."""
    x0, y0 = max(0, int(box.x0)), max(0, int(box.y0))
    x1, y1 = min(rgb.shape[1], int(np.ceil(box.x1))), min(rgb.shape[0], int(np.ceil(box.y1)))
    region = rgb[y0:y1, x0:x1]
    if not region.size:
        return None
    border = np.concatenate((region[:1].reshape(-1,3), region[-1:].reshape(-1,3),
                             region[:,:1].reshape(-1,3), region[:,-1:].reshape(-1,3)))
    color = np.median(border, axis=0)
    # Reject boundaries crossed by substantial graphics; a few glyph edge pixels are tolerated.
    if np.mean(np.max(np.abs(border.astype(float)-color), axis=1) > 30) > .08:
        return None
    return tuple(color/255)


def render_figures(source, baseline, evidence, output, key, glossary, replay=None):
    """Write one translated PDF, bilingual PDF and auditable label decisions per run."""
    output.mkdir(parents=True, exist_ok=False)
    report = json.loads((evidence / 'ocr.json').read_text('utf8'))
    if report.get('source_sha256') != hashlib.sha256(source.read_bytes()).hexdigest():
        raise ValueError('OCREvidenceSourceMismatch')
    review = []
    translated = pdf.open(baseline)
    original = pdf.open(source)
    if len(translated) != len(original):
        raise ValueError('BaselinePageCountMismatch')
    if any(a.rect != b.rect for a, b in zip(original, translated)):
        raise ValueError('BaselinePageSizeMismatch')
    for figure in report['figures']:
        groups = group_labels(figure['labels'])
        if replay is None:
            mapping = translate_labels(groups, key, glossary, output / (figure['id'] + '-reply.json'))
        else:
            record = json.loads((replay / (figure['id'] + '-reply.json')).read_text('utf8'))
            expected = [{'id': g['id'], 'text': g['source']} for g in groups if g['status'] == 'pending']
            if record['items'] != expected:
                raise ValueError('ReplaySourceMismatch')
            mapping = parse_translations(record['reply'], {item['id'] for item in expected})
        page = translated[figure['page'] - 1]
        rgb = np.asarray(Image.open(evidence / (figure['id'] + '.png')).convert('RGB'))
        origin = pdf.Rect(figure.get('raster_bbox', figure['bbox']))
        sx, sy = origin.width / figure['width'], origin.height / figure['height']
        for group in groups:
            row = {'page': figure['page'], 'figure': figure['id'], 'source': group['source'],
                   'status': group['status'], 'reason': group['reason'], 'translation': mapping.get(group['id'], '')}
            review.append(row)
            if group['status'] != 'pending':
                continue
            preferred = FIGURE_TERMS.get(group['source'].strip().lower())
            if preferred:
                row['model_translation'] = row['translation']
                row['translation'] = preferred
                row['terminology_rule'] = '用户指定的通用术语规则'
            text = row['translation']
            if (re.findall(r'\d+(?:\.\d+)?', text) != re.findall(r'\d+(?:\.\d+)?', group['source'])
                    or not re.search('[\u4e00-\u9fff]', text)):
                row.update(status='review', reason='译文数字不一致或未得到中文')
                continue
            boxes = [bounds(item) for item in group['members']]
            area, slot, nominal_height, right_aligned = label_layout(group, groups, figure['width'], figure['height'])
            # Clip clearing to the row's midpoint boundaries, keeping neighboring labels intact.
            boxes = [(box + (-2,-2,2,2)) & pdf.Rect(0, slot.y0, figure['width'], slot.y1) for box in boxes]
            colors = [edge_background(rgb, box) for box in boxes]
            target = pdf.Rect(origin.x0 + slot.x0*sx, origin.y0 + slot.y0*sy,
                              origin.x0 + slot.x1*sx, origin.y0 + slot.y1*sy)
            text_width = pdf.get_text_length(text, fontname='china-s', fontsize=1)
            size = min(20, nominal_height*sy*.85, target.height*.85, target.width/max(text_width,1))
            if right_aligned:
                size = float(int(size))
            if any(color is None for color in colors) or size < 6:
                row.update(status='sidecar', reason='边缘存在图形、触及图片边界或中文空间不足；译文见图旁对照')
                continue
            for box, color in zip(boxes, colors):
                clear = pdf.Rect(origin.x0+box.x0*sx, origin.y0+box.y0*sy,
                                 origin.x0+box.x1*sx, origin.y0+box.y1*sy)
                page.draw_rect(clear, color=None, fill=color)
            x = target.x1-text_width*size if right_aligned else (target.x0+target.x1-text_width*size)/2
            y = (target.y0+target.y1)/2 + size*.35
            page.insert_text((x,y), text, fontname='china-s', fontsize=size)
            row['font_size'] = round(size, 2)
            row['alignment'] = 'right' if right_aligned else 'center'
            row.update(status='translated', reason='中文原位回填，需目视核对是否残留原字')
    access_review = restore_access_label_alignment(original, translated)
    (output / 'access-labels.json').write_text(json.dumps(access_review,ensure_ascii=False,indent=2),encoding='utf8')
    reference_review = preserve_sensitive_regions(original, translated)
    caption_review = preserve_overflowing_captions(original, translated)
    (output / 'references.json').write_text(json.dumps(reference_review, ensure_ascii=False, indent=2), encoding='utf8')
    (output / 'captions.json').write_text(json.dumps(caption_review, ensure_ascii=False, indent=2), encoding='utf8')
    translated.save(output / 'translated.pdf')
    dual = pdf.open()
    for index, page in enumerate(original):
        w, h = page.rect.width, page.rect.height
        combined = dual.new_page(width=w*2, height=h)
        combined.show_pdf_page(pdf.Rect(0, 0, w, h), original, index)
        combined.show_pdf_page(pdf.Rect(w, 0, w*2, h), translated, index)
    dual.save(output / 'bilingual.pdf')
    (output / 'review.json').write_text(json.dumps(review, ensure_ascii=False, indent=2), encoding='utf8')
    blocks = []
    for figure in report['figures']:
        name = figure['id']
        image = translated[figure['page']-1].get_pixmap(clip=pdf.Rect(figure['bbox']), matrix=pdf.Matrix(2, 2))
        image.save(output / (name + '.png'))
        rows = ''.join('<tr>' + ''.join('<td>'+html.escape(str(row[field]))+'</td>'
                       for field in ('source', 'translation', 'reason')) + '</tr>'
                       for row in review if row['figure'] == name)
        blocks.append(f'<h2>第 {figure["page"]} 页 · {html.escape(name)}</h2><section>'
                      f'<img src="{name}.png" alt="自动处理后的图片"><table><thead><tr>'
                      '<th>原文</th><th>译文</th><th>处理情况</th></tr></thead><tbody>'+rows+'</tbody></table></section>')
    (output / 'review.html').write_text('<!doctype html><meta charset="utf-8"><title>图片翻译核对</title>'
        '<style>body{font:16px/1.6 system-ui;margin:30px;color:#182b40}section{display:flex;gap:24px;align-items:start}'
        'img{width:48%;height:auto}table{border-collapse:collapse;flex:1}td,th{border:1px solid #ccc;padding:8px}'
        '@media(max-width:850px){section{display:block}img{width:100%}}</style>'
        '<h1>图片翻译核对</h1><p>本页来自自动处理。请对照原图检查遗漏文字、数字、刻度和曲线。'
        '仅边缘颜色检查通过的文字尝试原位回填；仍需人工检查。识别器完全漏掉的文字不会出现在表内。</p>'
        + ''.join(blocks) + '<h2>正文复核</h2><p>参考文献整条有意保留原文；检测到的复杂统计图有意保留原图，图内英文未翻译。未列出的图中文字仍可能漏识别，必须对照原图复核，不能视为已翻译。'
        '异常图注回退原文，待整段重新翻译。医学术语仍需复核。</p><pre>'
        + html.escape(json.dumps({'references':reference_review,'captions':caption_review},ensure_ascii=False,indent=2))
        + '</pre>', encoding='utf8')
    dual.close()
    original.close()
    translated.close()
    return review


if __name__ == '__main__':
    import argparse
    import getpass

    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('source', type=Path)
    parser.add_argument('baseline', type=Path)
    parser.add_argument('evidence', type=Path)
    parser.add_argument('output', type=Path)
    parser.add_argument('--glossary', type=Path, required=True)
    args = parser.parse_args()
    key = getpass.getpass('GLM API Key (memory only): ').strip()
    if not key:
        raise SystemExit('API Key is required')
    try:
        render_figures(args.source, args.baseline, args.evidence, args.output,
                       key, args.glossary.read_text('utf8'))
        print(args.output.resolve() / 'review.html')
    except Exception as exc:
        raise SystemExit(type(exc).__name__) from None
