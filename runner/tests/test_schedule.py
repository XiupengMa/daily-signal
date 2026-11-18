import os
import tempfile
import unittest
from unittest.mock import patch
import httpx
from daily_signal.__main__ import main


def response(status, payload):
    return httpx.Response(status, json=payload, request=httpx.Request('GET', 'https://example.com/api/jobs'))


class ScheduledCatchUpTests(unittest.TestCase):
    def run_scheduled(self, responses):
        with tempfile.TemporaryDirectory() as work, \
             patch('sys.argv', ['daily_signal', '--scheduled', '--work', work]), \
             patch.dict(os.environ, {'OPENAI_API_KEY': 'unused', 'BRIEFING_PUBLISH_TOKEN': 'unused', 'RESUME_RUN_ID': 'old-failed-run'}), \
             patch('daily_signal.__main__.scheduled_due', return_value=True), \
             patch('daily_signal.__main__.Publisher') as publisher, \
             patch('daily_signal.__main__.Editor') as editor:
            publisher.return_value.get.side_effect = responses
            main()
            publisher.return_value.claim.assert_not_called()
            editor.assert_not_called()

    def test_every_existing_claim_blocks_automatic_paid_retry_even_with_resume_env(self):
        for state in ('generating', 'rendering', 'failed', 'published', 'unknown'):
            with self.subTest(state=state):
                self.run_scheduled([response(404, {}), response(200, {'state': state})])

    def test_existing_approved_edition_skips_before_job_lookup(self):
        self.run_scheduled([response(200, {'quality': {'policy': 'source-first-v1'}})])

    def test_failed_job_lookup_does_not_start_paid_work(self):
        with self.assertRaises(httpx.HTTPStatusError):
            self.run_scheduled([response(404, {}), response(503, {})])

    def test_before_eight_needs_no_credentials_or_publisher(self):
        with patch('sys.argv', ['daily_signal', '--scheduled']), \
             patch('daily_signal.__main__.scheduled_due', return_value=False), \
             patch('daily_signal.__main__.Publisher') as publisher:
            main()
            publisher.assert_not_called()
