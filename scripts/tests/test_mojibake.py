import importlib.util
from pathlib import Path
import unittest


spec = importlib.util.spec_from_file_location("check_mojibake", Path(__file__).resolve().parents[1] / "check_mojibake.py")
checker = importlib.util.module_from_spec(spec)
spec.loader.exec_module(checker)


class QuestionMarkIntegrityTests(unittest.TestCase):
    def test_javascript_conditions_and_query_literals_are_valid_source(self):
        for line in [
            "const label=(admin,member)=>state.identity.admin?admin:member;",
            "return response.status===204?null:response.json();",
            "const query='?date='+selectedDate+'&include_options=true';",
            "read('conversations/'+id+'/messages?after_id='+after+'&limit=100');",
            "const query='/api/v1/items?low_stock=true';",
            "read('messages/result?client_message_id='+id);",
            '"path": "/sections/hotel/?view=chat",',
        ]:
            with self.subTest(line=line):
                self.assertFalse(checker.has_broken_question_mark_text(line, source_code=True))

    def test_corrupted_display_strings_are_still_rejected_alongside_valid_code(self):
        for line in [
            "const title='P?ehled';",
            "const title=active?'P?ehled':'Pokoje';",
            "read('/api/v1/items'); const title='Zpr?vy';",
            '<button>P?ehled</button>',
            'const title="Soukrom? zpr?vy";',
            '"title": "Soukrom? zpr?vy",',
        ]:
            with self.subTest(line=line):
                self.assertTrue(checker.has_broken_question_mark_text(line, source_code=True))
        self.assertTrue(checker.has_broken_question_mark_text('P?ehled'))
        self.assertFalse(checker.has_broken_question_mark_text('Opravdu pokračovat?'))


if __name__ == '__main__':
    unittest.main()
