"""Loopback-only upload UI for the existing local PDF pipeline."""
import json
import shutil
import subprocess
import sys
import threading
import uuid
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

import pymupdf as pdf

ROOT = Path(__file__).resolve().parent
JOBS = ROOT.parents[1] / 'node_modules/.qa/local-literature/jobs'
PORT = 7868
ORIGIN = f'http://127.0.0.1:{PORT}'
LOCK = threading.Lock()
PROCESS = None
CURRENT = None


def validate_pdf(data):
    if not data.startswith(b'%PDF-'):
        raise ValueError('请选择有效的 PDF 文件')
    with pdf.open(stream=data, filetype='pdf') as document:
        if document.needs_pass or not 1 <= len(document) <= 100:
            raise ValueError('仅支持未加密、1–100 页的 PDF')


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *args):
        pass

    def reply(self, code, body, mime='application/json; charset=utf-8'):
        self.send_response(code)
        self.send_header('Content-Type', mime)
        self.send_header('Cache-Control', 'no-store')
        self.send_header('X-Content-Type-Options', 'nosniff')
        self.send_header('X-Frame-Options', 'DENY')
        self.end_headers()
        self.wfile.write(body if isinstance(body, bytes) else body.encode('utf8'))

    def allowed(self):
        return self.headers.get('Host') == f'127.0.0.1:{PORT}'

    def do_GET(self):
        if not self.allowed():
            return self.reply(403, '{}')
        if self.path == '/':
            return self.reply(200, (ROOT/'local.html').read_bytes(), 'text/html; charset=utf-8')
        if self.path == '/status':
            state = {'state': 'waiting'}
            if CURRENT:
                try:
                    state = json.loads((CURRENT/'status.json').read_text('utf8'))
                except (OSError, ValueError):
                    state = {'state': 'running'}
                if state.get('state') == 'running' and PROCESS and PROCESS.poll() is not None:
                    state = {'state': 'error', 'error_type': 'WorkerStopped'}
            # Never expose local paths or model responses in status.
            state = {k: v for k, v in state.items() if k in ('state','stage','progress','elapsed_seconds','error_type')}
            return self.reply(200, json.dumps(state))
        if CURRENT:
            name = self.path.removeprefix('/result/')
            if self.path.startswith('/result/') and (name in ('translated.pdf','bilingual.pdf','review.html')
                    or (name.startswith('page-') and name.endswith('.png') and '/' not in name and '\\' not in name)):
                path = CURRENT/'final'/name
                if path.is_file():
                    mime = 'application/pdf' if name.endswith('.pdf') else 'image/png' if name.endswith('.png') else 'text/html; charset=utf-8'
                    return self.reply(200, path.read_bytes(), mime)
        self.reply(404, '{}')

    def do_POST(self):
        global PROCESS, CURRENT
        if (not self.allowed() or self.path != '/start' or self.headers.get('Origin') != ORIGIN
                or self.headers.get('X-Local-Test') != '1'):
            return self.reply(403, '{}')
        try:
            size = int(self.headers.get('Content-Length','0'))
            key = self.headers.get('X-GLM-Key','').strip()
            if not 0 < size <= 20*1024*1024 or not key or len(key)>2048:
                return self.reply(400, '{}')
            with LOCK:
                if PROCESS and PROCESS.poll() is None:
                    return self.reply(409, '{}')
                data = self.rfile.read(size)
                validate_pdf(data)
                folder = JOBS/uuid.uuid4().hex
                folder.mkdir(parents=True)
                (folder/'source-paper.pdf').write_bytes(data)
                shutil.copyfile(ROOT/'glossary.csv', folder/'glossary.csv')
                (folder/'status.json').write_text('{"state":"running"}',encoding='utf8')
                CURRENT = folder
                PROCESS = subprocess.Popen([sys.executable,str(ROOT/'local_worker.py'),str(folder)],
                    stdin=subprocess.PIPE,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL,
                    creationflags=getattr(subprocess,'CREATE_NO_WINDOW',0))
                PROCESS.stdin.write((json.dumps({'key':key})+'\n').encode())
                PROCESS.stdin.close()
                del key
            self.reply(202,'{}')
        except Exception:
            self.reply(400,'{}')


if __name__ == '__main__':
    ThreadingHTTPServer(('127.0.0.1',PORT),Handler).serve_forever()
