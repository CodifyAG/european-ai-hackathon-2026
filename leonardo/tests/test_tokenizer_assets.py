"""Offline serving must reject missing or corrupted vocabulary assets before allocation."""
import hashlib
import json
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch

sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'serve'))
import tokenizer_assets as assets


class TokenizerAssets(unittest.TestCase):
    def test_ordinary_models_need_no_harmony_files(self):
        self.assertTrue(assets.ready('/missing-model',None))

    def test_missing_files_reject_readiness(self):
        self.assertFalse(assets.ready('/missing-model','harmony'))

    def test_corrupted_vocab_rejects_readiness(self):
        with tempfile.TemporaryDirectory() as temporary:
            p=Path(temporary)/'harmony-encodings';p.mkdir()
            hashes={'example.tiktoken':hashlib.sha256(b'valid vocabulary').hexdigest()}
            (p/'manifest.json').write_text(json.dumps({'sha256':hashes}))
            (p/'example.tiktoken').write_bytes(b'valid vocabulary')
            with patch.object(assets,'FILES',hashes):
                self.assertTrue(assets.ready(temporary,'harmony'))
                (p/'example.tiktoken').write_bytes(b'corrupt vocabulary')
                self.assertFalse(assets.ready(temporary,'harmony'))


if __name__=='__main__':unittest.main()
