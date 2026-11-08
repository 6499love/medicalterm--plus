import json
import unittest

from figure_translation import parse_translations, label_layout
from reference_layout import split_entries


class TranslationReplyTests(unittest.TestCase):
    def test_glm_echoed_text_field(self):
        # Shape observed in the actual failed GLM reply.
        response = '[{"id": 0, "text": "在线发布日期：2023年12月7日"}]'
        self.assertEqual(parse_translations(response, {0}), {0: '在线发布日期：2023年12月7日'})

    def test_requested_field_and_fenced_json(self):
        response = '```json\n[{"id": 4, "translation": "灰区"}]\n```'
        self.assertEqual(parse_translations(response, {4}), {4: '灰区'})

    def test_ambiguous_or_mismatched_replies_are_rejected(self):
        cases = [
            ([{'id': 0, 'translation': '中文', 'text': 'English'}], {0}),
            ([{'id': 0, 'text': ''}], {0}),
            ([{'id': 0, 'text': 42}], {0}),
            ([{'id': 1, 'text': '中文'}], {0}),
            ([{'id': '0', 'text': '中文'}], {0}),
            ([{'id': 0, 'text': '中文'}, {'id': 0, 'text': '中文'}], {0, 1}),
            ([], {0}),
        ]
        for reply, ids in cases:
            with self.subTest(reply=reply), self.assertRaises(ValueError):
                parse_translations(json.dumps(reply), ids)

    def test_reference_numbers_and_authors_stay_separate(self):
        self.assertEqual(split_entries('6. Adams A. 文献。7. Brown B. 文献。8. Clark C. 文献。', [6,7,8]),
                         ['Adams A. 文献。', 'Brown B. 文献。', 'Clark C. 文献。'])
        with self.assertRaises(ValueError):
            split_entries('6. Adams A. 文献。8. Clark C. 文献。', [6,7,8])

    def test_overlapping_row_boxes_get_separate_slots(self):
        groups=[]
        for index,y in enumerate((0,30,60)):
            label={'id':index,'status':'pending','polygon_pixels':[[10,y],[100,y],[100,y+36],[10,y+36]]}
            groups.append(dict(label,members=[label]))
        layouts=[label_layout(group,groups,120,100) for group in groups]
        self.assertTrue(all(layout[3] for layout in layouts))
        self.assertLess(layouts[0][1].y1,layouts[1][1].y0)
        self.assertLess(layouts[1][1].y1,layouts[2][1].y0)


if __name__ == '__main__':
    unittest.main()
