"""Local OCR evidence for embedded PDF figures. No translation service is called."""

import argparse
import hashlib
import json
import re
import time
from pathlib import Path

import numpy as np
import pymupdf as pdf
from rapidocr import RapidOCR


def extract_figures(source, output, pages):
    output.mkdir(parents=True, exist_ok=False)
    started = time.monotonic()
    engine = RapidOCR()
    figures = []
    with pdf.open(source) as doc:
        for page_number in pages:
            page = doc[page_number - 1]
            for index, info in enumerate(page.get_image_info()):
                box = pdf.Rect(info['bbox']) & page.rect
                if box.is_empty or box.width < 20 or box.height < 10:
                    continue
                # Render the displayed crop so PDF rotation, masks and placement are respected.
                pix = page.get_pixmap(clip=box, matrix=pdf.Matrix(3, 3), alpha=False)
                rgb = np.frombuffer(pix.samples, dtype=np.uint8).reshape(pix.height, pix.width, 3)
                result = engine(rgb[:, :, ::-1].copy())
                stem = f'page-{page_number}-image-{index + 1}'
                pix.save(output / f'{stem}.png')
                labels = []
                for label_index, (polygon, text, score) in enumerate(zip(
                    result.boxes if result.boxes is not None else [],
                    result.txts or [], result.scores or [],
                )):
                    numeric = bool(re.fullmatch(r'[\d\s.,%+−\-–/:()±=<>]+', text))
                    labels.append({
                        'id': label_index, 'source': text, 'confidence': float(score),
                        'polygon_pixels': np.asarray(polygon).tolist(),
                        'status': 'intentional' if numeric else 'review' if score < .9 else 'pending',
                        'reason': '保留数字和符号' if numeric else '识别置信度较低' if score < .9 else '已识别，等待翻译',
                    })
                figures.append({'id': stem, 'page': page_number, 'bbox': list(box),
                                'raster_bbox': [pix.x/3, pix.y/3, (pix.x+pix.width)/3, (pix.y+pix.height)/3],
                                'width': pix.width, 'height': pix.height, 'labels': labels})
    report = {'source': str(source.resolve()), 'source_sha256': hashlib.sha256(source.read_bytes()).hexdigest(),
              'ocr': 'rapidocr 3.10.0',
              'elapsed_seconds': round(time.monotonic() - started, 2), 'figures': figures,
              'review_note': '需逐图核对完全漏识别的字；置信度高不代表识别正确。'}
    (output / 'ocr.json').write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf8')
    return report


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('source', type=Path)
    parser.add_argument('output', type=Path)
    parser.add_argument('--pages', type=int, nargs='+', required=True)
    args = parser.parse_args()
    report = extract_figures(args.source, args.output, args.pages)
    print(json.dumps(report, ensure_ascii=False))
