import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
from daily_signal.core import Budget
from daily_signal.media import cached_speech, normalize
from daily_signal.recovery import restore_media


class MediaRecoveryTests(unittest.TestCase):
    def test_product_number_pronunciation_equivalence(self):
        self.assertEqual(normalize('拒绝接收 H200，政策方向'),
                         normalize('拒绝接收 H two hundred，政策方向'))
        self.assertNotEqual(normalize('H200'), normalize('H three hundred'))
        self.assertNotEqual(normalize('H200'), normalize('H two hundred thousand'))
        self.assertNotEqual(normalize('拒绝接收 H200'), normalize('同意接收 H two hundred'))

    def test_verified_chunk_survives_restart_without_another_model_call(self):
        with tempfile.TemporaryDirectory() as root:
            dest=Path(root)/'en';pcm=bytes(4800);text='A saved sentence.'
            with patch('daily_signal.media.verified_speech',return_value=(pcm,text,1.0)) as call:
                first=cached_speech(text,'en',None,dest,0)
                call.assert_called_once()
            recovered=Path(root)/'recovered'
            restore_media(Path(root),recovered)
            with patch('daily_signal.media.verified_speech',side_effect=AssertionError('Paid duplicate')):
                self.assertEqual(cached_speech(text,'en',None,recovered/'en',0),first)

    def test_changed_script_or_voice_cannot_reuse_stale_speech(self):
        with tempfile.TemporaryDirectory() as root:
            dest=Path(root)
            with patch('daily_signal.media.verified_speech',side_effect=lambda text,*a:(bytes(4800),text,1.0)) as call:
                cached_speech('Original.','en',None,dest,0)
                cached_speech('Revised.','en',None,dest,0)
                cached_speech('Original.','en',None,dest,0,{'voice':'cedar'})
                self.assertEqual(call.call_count,3)
                self.assertEqual(len(list((dest/'chunks').glob('*.wav'))),3)

    def test_corrupt_checkpoint_fails_before_another_paid_call(self):
        with tempfile.TemporaryDirectory() as root:
            dest=Path(root);text='Verified.'
            with patch('daily_signal.media.verified_speech',return_value=(bytes(4800),text,1.0)):
                cached_speech(text,'en',None,dest,0)
            audio=next((dest/'chunks').glob('*.wav'));data=bytearray(audio.read_bytes());data[-1]=1;audio.write_bytes(data)
            with patch('daily_signal.media.verified_speech',side_effect=AssertionError('Paid duplicate')):
                with self.assertRaisesRegex(RuntimeError,'checkpoint failed'):
                    cached_speech(text,'en',None,dest,0)

    def test_media_recovery_does_not_restore_cost_ledger_or_unrelated_files(self):
        with tempfile.TemporaryDirectory() as root:
            source=Path(root)/'source';source.mkdir();dest=Path(root)/'dest'
            (source/'en.mp3').write_bytes(b'test')
            (source/'cost-ledger.json').write_text('[]')
            (source/'secret.txt').write_text('test-only')
            restore_media(source,dest)
            self.assertTrue((dest/'en.mp3').exists())
            self.assertFalse((dest/'cost-ledger.json').exists())
            self.assertFalse((dest/'secret.txt').exists())

    def test_five_dollar_api_budget_still_counts_prior_runs(self):
        with tempfile.TemporaryDirectory() as root:
            path=Path(root)/'ledger.json';budget=Budget(path,limit=100)
            self.assertEqual(budget.limit,5.00)
            budget.reserve('prior-runs',2.2769493)
            budget=Budget(path)
            budget.reserve('new-request',2.7)
            with self.assertRaises(RuntimeError):budget.reserve('over-cap',.03)
            self.assertAlmostEqual(budget.spent,4.9769493)
