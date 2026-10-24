import unittest

from core.security import safe_name


class Filename(unittest.TestCase):
    def test_upload_normalization(self):
        self.assertEqual(safe_name('../a/b\\c?.pdf'), '_a_b_c_.pdf')
        self.assertEqual(safe_name(None), '')
        self.assertEqual(safe_name(' . invoice 1.pdf. '), 'invoice 1.pdf')
