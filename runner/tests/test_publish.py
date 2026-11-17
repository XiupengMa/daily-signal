import socket
import unittest
from unittest.mock import patch
from daily_signal.publish import publication_origin, Publisher

PUBLIC=[(socket.AF_INET,socket.SOCK_STREAM,6,'',('93.184.216.34',443))]
class PublisherTests(unittest.TestCase):
    @patch('daily_signal.sources.socket.getaddrinfo',return_value=PUBLIC)
    def test_explicit_origin_only(self,resolve):
        self.assertEqual(publication_origin('https://example.com/'),'https://example.com')
        for value in ['', ' https://example.com','http://example.com','https://a:b@example.com',
                      'https://example.com/path','https://example.com/?token=hidden',
                      'https://example.com/#fragment','https://example.com:8080']:
            with self.subTest(value=value),self.assertRaises(ValueError):publication_origin(value)
    @patch('daily_signal.sources.socket.getaddrinfo',return_value=[(socket.AF_INET,socket.SOCK_STREAM,6,'',('127.0.0.1',443))])
    def test_private_destination_rejected(self,resolve):
        with self.assertRaises(ValueError):publication_origin('https://internal.example.com')
    @patch('daily_signal.sources.socket.getaddrinfo',return_value=PUBLIC)
    @patch.dict('os.environ',{'BRIEFING_SITE_URL':'https://example.com','BRIEFING_PUBLISH_TOKEN':'test-only'})
    def test_no_redirects_or_environment_proxy(self,resolve):
        with patch('daily_signal.publish.httpx.Client') as client:
            Publisher()
            self.assertFalse(client.call_args.kwargs['follow_redirects'])
            self.assertFalse(client.call_args.kwargs['trust_env'])
