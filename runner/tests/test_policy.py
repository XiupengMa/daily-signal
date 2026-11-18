import datetime as dt
import json
import base64
import tempfile
import unittest
from unittest.mock import patch
from pathlib import Path
from daily_signal.core import window,dates,score,Budget,scheduled_due,TZ
from daily_signal.media import chunks,normalize,verified_speech,NarrationMismatch,synthesize
from daily_signal.sources import canonical,comment_text
from daily_signal.recovery import restore_editorial

class PolicyTests(unittest.TestCase):
    def test_full_voice_usage_uses_full_model_prices(self):
        events=[{'type':'session.updated'},
            {'type':'response.output_audio.delta','delta':base64.b64encode(bytes(4800)).decode()},
            {'type':'response.output_audio_transcript.done','transcript':'测试'},
            {'type':'response.done','response':{'status':'completed','usage':{
                'input_tokens':10,'input_token_details':{'text_tokens':10,'audio_tokens':0},
                'output_tokens':120,'output_token_details':{'text_tokens':20,'audio_tokens':100}}}}]
        with tempfile.TemporaryDirectory() as d,patch.dict('os.environ',{'OPENAI_API_KEY':'unused'}),patch('daily_signal.media.websocket.create_connection') as connect:
            connect.return_value.recv.side_effect=[json.dumps(e) for e in events]
            budget=Budget(Path(d)/'ledger.json')
            synthesize('测试','zh',budget)
            self.assertAlmostEqual(budget.spent,.00692)
            self.assertIn('model=gpt-realtime-2.1',connect.call_args.args[0])
            session=json.loads(connect.return_value.send.call_args_list[0].args[0])['session']
            self.assertEqual(session['audio']['output']['voice'],'cedar')

    def test_recovery_carries_editorial_data_but_never_copies_cost_ledger(self):
        with tempfile.TemporaryDirectory() as d:
            source=Path(d)/'audit';source.mkdir();destination=Path(d)/'run'
            (source/'sources.json').write_text(json.dumps({'newsDate':'2026-11-16'}))
            (source/'en-approved.json').write_text('{}')
            (source/'cost-ledger.json').write_text('[{"usd":999}]')
            self.assertTrue(restore_editorial(source,destination,'2026-11-16'))
            self.assertTrue((destination/'en-approved.json').exists())
            self.assertFalse((destination/'cost-ledger.json').exists())
            with self.assertRaises(RuntimeError):restore_editorial(source,destination,'2026-11-17')

    def test_known_mismatch_retried_but_transport_failure_is_not(self):
        with tempfile.TemporaryDirectory() as d:
            dest=Path(d)
            with patch('daily_signal.media.synthesize',side_effect=[NarrationMismatch('abc','ax',.5),(b'pcm','abc',1)]) as call:
                self.assertEqual(verified_speech('abc','en',None,dest,0)[1],'abc')
                self.assertEqual(call.call_count,2)
                self.assertTrue((dest/'rejected-0000-1.json').exists())
            with patch('daily_signal.media.synthesize',side_effect=TimeoutError) as call:
                with self.assertRaises(TimeoutError):verified_speech('abc','en',None,dest,1)
                self.assertEqual(call.call_count,1)
            with patch('daily_signal.media.synthesize',side_effect=NarrationMismatch('abc','ax',.5)) as call:
                with self.assertRaises(NarrationMismatch):verified_speech('abc','en',None,dest,2)
                self.assertEqual(call.call_count,3)

    def test_comment_fragments_preserve_plain_and_html_text(self):
        self.assertEqual(comment_text('This is useful.'),'This is useful.')
        self.assertEqual(comment_text('<p>Use <a href="https://example.com">the patch</a> &amp; update.</p>'),'Use the patch & update.')

    def test_scheduled_start_uses_pacific_time_across_dst(self):
        for day,utc_hour in [(dt.date(2026,1,15),16),(dt.date(2026,7,15),15),
                             (dt.date(2026,3,8),15),(dt.date(2026,11,1),16)]:
            start=dt.datetime.combine(day,dt.time(utc_hour),dt.timezone.utc)
            self.assertFalse(scheduled_due(start-dt.timedelta(minutes=1)))
            self.assertTrue(scheduled_due(start))
            self.assertTrue(scheduled_due(start+dt.timedelta(hours=3,minutes=59)))
            self.assertFalse(scheduled_due(start+dt.timedelta(hours=4)))

    def test_utc_cron_has_same_pacific_slots_in_winter_summer_and_dst_transition_days(self):
        expected=[f'{hour:02d}:{minute:02d}' for hour in range(8,12) for minute in (7,37)]
        for day in (dt.date(2026,1,15),dt.date(2026,7,15),dt.date(2026,3,8),dt.date(2026,11,1)):
            slots=[dt.datetime.combine(day,dt.time(hour,minute),dt.timezone.utc)
                   for hour in range(15,20) for minute in (7,37)]
            admitted=[now.astimezone(TZ).strftime('%H:%M') for now in slots if scheduled_due(now)]
            self.assertEqual(admitted,expected,str(day))

    def test_previous_day_pacific_not_utc(self):
        self.assertEqual(dates(dt.datetime(2026,11,17,7,30,tzinfo=dt.timezone.utc)),('2026-11-16','2026-11-15'))
    def test_dst_window_real_elapsed_seconds(self):
        a,b=window('2026-03-08');self.assertEqual(b.timestamp()-a.timestamp(),23*3600)
        a,b=window('2026-11-01');self.assertEqual(b.timestamp()-a.timestamp(),25*3600)
    def test_newsworthiness_dominates_raw_popularity(self):
        self.assertGreater(score(95,10,2),score(30,10000,10000))
    def test_uncertain_request_stays_charged_on_restart(self):
        with tempfile.TemporaryDirectory() as d:
            path=Path(d)/'ledger.json';b=Budget(path,1);b.reserve('unknown',.8)
            b=Budget(path,1)
            with self.assertRaises(RuntimeError):b.reserve('retry',.3)
            b.settle(0,.1);b.reserve('next',.3)
            self.assertAlmostEqual(b.spent,.4)
    def test_chunks_preserve_all_approved_text(self):
        for text in ['Hello, world. This is a test! '*100,'这是原文。保留 API 与产品名称，不遗漏文字。'*100]:
            result=chunks(text)
            self.assertTrue(all(len(c)<=260 for c in result))
            self.assertEqual(normalize(''.join(result)),normalize(text))
    def test_canonical_dedup_keeps_meaningful_query(self):
        self.assertEqual(canonical('https://example.com/a/?id=3&utm_source=hn#top'),'https://example.com/a?id=3')

if __name__=='__main__':unittest.main()
