import unittest
import pymupdf as pdf
from final_safety import preserve_sensitive_regions


class FinalSafetyTests(unittest.TestCase):
    def test_missing_number_and_changed_author_restored_from_source(self):
        with pdf.open() as source, pdf.open() as target:
            source.new_page().insert_text((60, 100), 'References\n1. Smith A. Original title. 2020;1:2.\n2. Jones B. Title. 2021;2:3.')
            target.new_page().insert_text((60, 100), 'References\nWrong author and missing number\n2. Altered author.')
            report = preserve_sensitive_regions(source, target)
            self.assertEqual(report[0]['numbers'], ['1', '2'])
            text = target[0].get_text()
            self.assertIn('1. Smith A.', text)
            self.assertNotIn('Wrong author', text)

    def test_unrelated_numbered_body_unchanged(self):
        with pdf.open() as source, pdf.open() as target:
            source.new_page().insert_text((60, 100), '1. Body text')
            target.new_page().insert_text((60, 100), '1. Translated body')
            before = target[0].get_pixmap().samples
            self.assertEqual(preserve_sensitive_regions(source, target), [])
            self.assertEqual(target[0].get_pixmap().samples, before)
