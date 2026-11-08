import unittest
from unittest.mock import patch
import threading
import http.client
import tempfile
from pathlib import Path
from unittest.mock import MagicMock
import pymupdf as pdf
import local_server as app


class LocalServerTests(unittest.TestCase):
    def test_upload_hands_key_to_worker_without_saving_it(self):
        with tempfile.TemporaryDirectory() as folder, pdf.open() as document:
            document.new_page()
            data = document.tobytes()
            worker = MagicMock()
            worker.poll.return_value = None
            server = app.ThreadingHTTPServer(('127.0.0.1',0),app.Handler)
            thread = threading.Thread(target=server.serve_forever,daemon=True)
            thread.start()
            try:
                with patch.object(app,'JOBS',Path(folder)), patch.object(app,'CURRENT',None), patch.object(app,'PROCESS',None), patch.object(app.subprocess,'Popen',return_value=worker) as launch:
                    connection=http.client.HTTPConnection('127.0.0.1',server.server_port)
                    connection.request('POST','/start',body=data,headers={'Host':f'127.0.0.1:{app.PORT}','Origin':app.ORIGIN,'X-Local-Test':'1','X-GLM-Key':'fake-test-only-secret'})
                    response=connection.getresponse()
                    self.assertEqual(response.status,202)
                    response.read();connection.close()
                    self.assertNotIn('fake-test-only-secret',str(launch.call_args))
                    self.assertIn(b'fake-test-only-secret',worker.stdin.write.call_args.args[0])
                    for path in Path(folder).rglob('*'):
                        if path.is_file():
                            self.assertNotIn(b'fake-test-only-secret',path.read_bytes())
            finally:
                server.shutdown();server.server_close();thread.join()

    def test_pdf_limits(self):
        with self.assertRaises(ValueError):
            app.validate_pdf(b'not pdf')
        with pdf.open() as document:
            document.new_page()
            app.validate_pdf(document.tobytes())
            for _ in range(100):
                document.new_page()
            with self.assertRaises(ValueError):
                app.validate_pdf(document.tobytes())

    def test_cross_origin_and_traversal_blocked_without_worker(self):
        server = app.ThreadingHTTPServer(('127.0.0.1', 0),app.Handler)
        thread = threading.Thread(target=server.serve_forever,daemon=True)
        thread.start()
        try:
            with patch.object(app,'PROCESS',None), patch.object(app,'CURRENT',None):
                for method,path,headers,expected in [
                    ('GET','/',{'Host':'evil.example'},403),
                    ('POST','/start',{'Host':f'127.0.0.1:{app.PORT}','Origin':'https://evil.example'},403),
                    ('GET','/result/../../local_server.py',{'Host':f'127.0.0.1:{app.PORT}'},404),
                    ('GET','/status',{'Host':f'127.0.0.1:{app.PORT}'},200),
                ]:
                    connection=http.client.HTTPConnection('127.0.0.1',server.server_port)
                    connection.request(method,path,headers=headers)
                    response=connection.getresponse()
                    self.assertEqual(response.status,expected)
                    response.read();connection.close()
        finally:
            server.shutdown();server.server_close();thread.join()
