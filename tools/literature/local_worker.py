import asyncio
import json
import logging
import os
import sys
import time
from pathlib import Path

ROOT = Path(sys.argv[1]).resolve()
RUN = ROOT
RUN.mkdir(parents=True, exist_ok=True)
STATUS = ROOT / 'status.json'
logging.disable(logging.CRITICAL)

def status(**value):
    value['elapsed_seconds'] = round(time.monotonic() - started, 1)
    temp = STATUS.with_suffix('.tmp')
    temp.write_text(json.dumps(value, ensure_ascii=False), encoding='utf-8')
    for attempt in range(30):
        try:
            temp.replace(STATUS)
            return
        except PermissionError:
            if attempt == 29: raise
            time.sleep(.05)

from structured_paragraphs import install
install(ROOT / 'source-paper.pdf', RUN / 'regions')

async def run(key):
    from pdf2zh_next.config.model import SettingsModel
    from pdf2zh_next.high_level import do_translate_async_stream
    settings = SettingsModel.model_validate({
        'translation': {'lang_in': 'en', 'lang_out': 'zh', 'output': str(RUN / 'engine'),
                        'qps': 2, 'pool_max_workers': 2, 'no_auto_extract_glossary': True,
                        'glossaries': str(ROOT / 'glossary.csv'), 'ignore_cache': True, 'custom_system_prompt': 'Translate into Simplified Chinese. Preserve reference numbers, author names, journal names, years, units and abbreviations. Treat each input paragraph as an independent fixed unit.'},
        'pdf': {'pages': None, 'only_include_translated_page': True},
        'translate_engine_settings': {'translate_engine_type': 'OpenAI',
            'openai_model': 'glm-4-flash',
            'openai_base_url': 'https://open.bigmodel.cn/api/paas/v4',
            'openai_api_key': key, 'openai_timeout': '90'},
    })
    status(state='running', stage='准备引擎')
    async for event in do_translate_async_stream(settings, ROOT / 'source-paper.pdf'):
        kind = event.get('type')
        if kind in ('progress_start', 'progress_update', 'progress_end'):
            status(state='running', stage=event.get('stage'), progress=event.get('overall_progress'))
        elif kind == 'finish':
            result = event['translate_result']
            status(state='running', stage='检查图片和排版', progress=95)
            from figure_translation import render_figures
            from figure_ocr import extract_figures
            evidence = RUN / 'ocr'
            extract_figures(ROOT / 'source-paper.pdf', evidence, list(range(1, __import__('pymupdf').open(ROOT / 'source-paper.pdf').page_count+1)))
            final = RUN / 'final'
            render_figures(ROOT / 'source-paper.pdf', Path(result.mono_pdf_path),
                evidence, final, key, (ROOT / 'glossary.csv').read_text('utf8'))
            status(state='complete', stage='完成', files={'mono_pdf_path':str(final/'translated.pdf'),
                'dual_pdf_path':str(final/'bilingual.pdf')}, review_path=str(final/'review.html'),
                engine_seconds=getattr(result,'total_seconds',None))
            return
        elif kind == 'error':
            status(state='error', error_type=event.get('error_type', 'TranslationError'))
            return

if __name__ == '__main__':
    started = time.monotonic()
    try:
        data = json.loads(sys.stdin.readline())
        key = data.pop('key')
        asyncio.run(run(key))
    except Exception as exc:
        # Never persist exception messages, configuration or credentials.
        status(state='error', error_type=type(exc).__name__)
