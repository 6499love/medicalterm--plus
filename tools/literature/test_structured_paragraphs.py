import tempfile
import unittest
from pathlib import Path

import pymupdf as pdf

from structured_paragraphs import source_regions


class SourceRegionTests(unittest.TestCase):
    def test_numbered_references_and_full_caption(self):
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder)/'source.pdf'
            with pdf.open() as document:
                page = document.new_page()
                page.insert_text((40,60),'References\n1. Adams A. First study.\n2. Brown B. Second study.',fontsize=10)
                page.insert_text((40,150),'Fig. 1 A complete caption on a separate line.',fontsize=10)
                document.save(path)
            regions = source_regions(path)[0]['regions']
            self.assertEqual([r['text'] for r in regions if r['kind']=='reference'],
                             ['References','1. Adams A. First study.','2. Brown B. Second study.'])
            self.assertEqual([r['text'] for r in regions if r['kind']=='caption'],
                             ['Fig. 1 A complete caption on a separate line.'])

    def test_numbered_body_without_reference_heading_is_untouched(self):
        with tempfile.TemporaryDirectory() as folder:
            path=Path(folder)/'source.pdf'
            with pdf.open() as document:
                page=document.new_page()
                page.insert_text((40,60),'1. Introduction\n2. Methods',fontsize=10)
                document.save(path)
            self.assertEqual(source_regions(path)[0]['regions'],[])


if __name__ == '__main__':
    unittest.main()
