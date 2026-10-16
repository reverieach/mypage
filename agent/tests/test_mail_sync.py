import imaplib
from dataclasses import replace
from pathlib import Path
import tempfile
import threading
import unittest
from unittest.mock import patch

from app.services import message_pipeline as mail
from test_mail_policy import message


class MailSyncTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.db_patch = patch.object(mail, "DB_PATH", Path(self.directory.name) / "mail.sqlite3")
        self.db_patch.start()
        self.addCleanup(self.db_patch.stop)
        self.account = mail.MailAccount(id="test", label="QQ", email_address="test@qq.com",
                                        host="imap.qq.com", username="test@qq.com", password="test")
        self.accounts_patch = patch.object(mail, "load_mail_accounts", return_value=[self.account])
        self.accounts_patch.start()
        self.addCleanup(self.accounts_patch.stop)
        mail.ensure_schema()

    def save(self, item, analysis=None):
        with mail._connect() as connection:
            mail._save_message(connection, item)
            mail._save_analysis(connection, item, analysis or mail._apply_analysis_policy(item, mail._fallback_analysis(item)))

    def test_unsubscribe_footer_does_not_hide_normal_mail(self):
        item = message("Your monthly project report", "The results are ready. Unsubscribe from updates.")
        self.save(item)
        self.assertEqual(mail.mail_summary()["counts"]["priority"], 1)

    def test_substring_does_not_turn_ideal_into_advertising(self):
        self.save(message("An ideal approach", "Discuss the design tomorrow."))
        self.assertEqual(mail.mail_summary()["counts"]["priority"], 1)

    def test_important_mail_is_visible_even_with_marketing_category(self):
        self.save(message("Special project update"), {"importance": "important", "needsAttention": False, "category": "newsletter"})
        self.assertEqual(mail.mail_summary()["counts"]["priority"], 1)

    def test_important_first_and_count_not_limited_to_page(self):
        for number in range(15):
            item = replace(message("Hello"), id=f"mail:test:1:{number}", received_at=f"2026-10-{number + 1:02}T00:00:00+08:00")
            self.save(item, {"importance": "important", "needsAttention": True, "category": "mail"})
        newer = replace(message("Ordinary update"), id="mail:test:1:99", received_at="2026-10-16T00:00:00+08:00")
        self.save(newer)
        result = mail.mail_summary(limit=3)
        self.assertEqual(result["importantCount"], 15)
        self.assertNotEqual(result["items"][0]["id"], newer.id)

    @patch.object(mail, "collect_imap_account", side_effect=imaplib.IMAP4.error("bad login"))
    def test_sync_failure_visible_in_subsequent_summary(self, _collect):
        mail.refresh_mail()
        result = mail.mail_summary()
        self.assertTrue(result["error"])
        self.assertTrue(result["accounts"][0]["lastError"])
        self.assertIsNone(result["accounts"][0]["lastSyncAt"])

    @patch.object(mail, "collect_imap_account", return_value=[])
    def test_empty_inbox_success_records_real_sync_time(self, _collect):
        mail.refresh_mail()
        result = mail.mail_summary()
        self.assertIsNotNone(result["accounts"][0]["lastSyncAt"])
        self.assertIsNone(result["error"])

    @patch.object(mail, "analyze_message")
    @patch.object(mail, "collect_imap_account")
    def test_new_mail_is_committed_before_slow_analysis(self, collect, analyze):
        item = message("Personal note")
        collect.return_value = [item]
        def classify(_item):
            self.assertEqual(mail.mail_summary()["counts"]["unread"], 1)
            return mail._apply_analysis_policy(item, mail._fallback_analysis(item))
        analyze.side_effect = classify
        mail.refresh_mail()

    @patch.object(mail.imaplib, "IMAP4_SSL")
    def test_cached_message_only_fetches_flags_and_reconciles_read(self, client_class):
        self.save(replace(message("Security alert"), source_item_id="1:1"))
        client = client_class.return_value
        client.select.return_value = ("OK", [b"1"])
        client.response.return_value = ("UIDVALIDITY", [b"1"])
        def uid(command, *args):
            if command == "search":
                return ("OK", [b"" if args[-1] == "UNSEEN" else b"1"])
            if command == "fetch" and args[-1] == "(UID FLAGS)":
                return ("OK", [b"1 (UID 1 FLAGS (\\Seen))"])
            self.fail(f"Unexpected body download: {command} {args}")
        client.uid.side_effect = uid
        self.assertEqual(mail.collect_imap_account(self.account), [])
        self.assertEqual(mail.mail_summary()["counts"]["unread"], 0)
        client.select.assert_called_once_with("INBOX", readonly=True)

    @patch.object(mail.imaplib, "IMAP4_SSL")
    def test_new_message_uses_non_marking_peek(self, client_class):
        client = client_class.return_value
        client.select.return_value = ("OK", [b"1"])
        client.response.return_value = ("UIDVALIDITY", [b"1"])
        raw = b"Subject: Hello\r\nFrom: sender@example.com\r\n\r\nPersonal message"
        def uid(command, *args):
            if command == "search":
                return ("OK", [b"1"])
            if args[-1] == "(UID FLAGS)":
                return ("OK", [b"1 (FLAGS () UID 1)"])
            if args[-1] == "(FLAGS BODY.PEEK[])":
                return ("OK", [(b"1 (UID 1 FLAGS () BODY[] {80}", raw), b")"])
            self.fail(f"Unexpected IMAP command {command} {args}")
        client.uid.side_effect = uid
        items = mail.collect_imap_account(self.account)
        self.assertEqual(len(items), 1)
        self.assertFalse(items[0].is_read)

    @patch.object(mail.imaplib, "IMAP4_SSL")
    def test_deleted_cached_message_does_not_remain_unread(self, client_class):
        self.save(replace(message("Security alert"), source_item_id="1:1"))
        client = client_class.return_value
        client.select.return_value = ("OK", [b"0"])
        client.response.return_value = ("UIDVALIDITY", [b"1"])
        client.uid.return_value = ("OK", [None])
        self.assertEqual(mail.collect_imap_account(self.account), [])
        self.assertEqual(mail.mail_summary()["counts"]["unread"], 0)
        self.assertEqual(mail.notification_center()["items"], [])

    @patch.object(mail.imaplib, "IMAP4_SSL")
    def test_cached_read_mail_without_analysis_does_not_download_body(self, client_class):
        with mail._connect() as connection:
            mail._save_message(connection, replace(message("Already read"), source_item_id="1:1", is_read=True))
        client = client_class.return_value
        client.select.return_value = ("OK", [b"1"])
        client.response.return_value = ("UIDVALIDITY", [b"1"])
        client.uid.side_effect = [("OK", [b"1"]), ("OK", [b""]), ("OK", [b"1 (UID 1 FLAGS (\\Seen))"])]
        self.assertEqual(mail.collect_imap_account(self.account), [])
        self.assertEqual(client.uid.call_count, 3)

    @patch.object(mail.imaplib, "IMAP4_SSL")
    def test_read_mail_changed_to_unread_restores_notification(self, client_class):
        item = replace(message("Security alert"), source_item_id="1:1", is_read=True)
        self.save(item)
        with mail._connect() as connection:
            connection.execute("DELETE FROM notification_items")
        client = client_class.return_value
        client.select.return_value = ("OK", [b"1"])
        client.response.return_value = ("UIDVALIDITY", [b"1"])
        client.uid.side_effect = [("OK", [b"1"]), ("OK", [b"1"]), ("OK", [b"1 (UID 1 FLAGS ())"])]
        self.assertEqual(mail.collect_imap_account(self.account), [])
        self.assertEqual(mail.mail_summary()["counts"]["unread"], 1)
        self.assertEqual(len(mail.notification_center()["items"]), 1)

    @patch.object(mail.imaplib, "IMAP4_SSL")
    def test_malformed_flags_do_not_remove_cached_unread(self, client_class):
        self.save(replace(message("Security alert"), source_item_id="1:1"))
        client = client_class.return_value
        client.select.return_value = ("OK", [b"1"])
        client.response.return_value = ("UIDVALIDITY", [b"1"])
        client.uid.side_effect = [("OK", [b"1"]), ("OK", [b"1"]), ("OK", [b"1 (unexpected)"])]
        with self.assertRaises(RuntimeError):
            mail.collect_imap_account(self.account)
        self.assertEqual(mail.mail_summary()["counts"]["unread"], 1)

    @patch.object(mail.imaplib, "IMAP4_SSL")
    def test_uidvalidity_reset_removes_stale_local_notifications(self, client_class):
        self.save(replace(message("Security alert"), source_item_id="1:1"))
        client = client_class.return_value
        client.select.return_value = ("OK", [b"0"])
        client.response.return_value = ("UIDVALIDITY", [b"2"])
        client.uid.return_value = ("OK", [b""])
        self.assertEqual(mail.collect_imap_account(self.account), [])
        self.assertEqual(mail.mail_summary()["counts"]["unread"], 0)
        self.assertEqual(mail.notification_center()["items"], [])

    @patch.object(mail, "collect_imap_account")
    def test_busy_sync_is_not_started_twice(self, collect):
        started = threading.Event()
        finish = threading.Event()
        def hold_lock():
            with mail.MAIL_SYNC_LOCK:
                started.set()
                finish.wait(2)
        worker = threading.Thread(target=hold_lock)
        worker.start()
        try:
            self.assertTrue(started.wait(1))
            self.assertTrue(mail.refresh_mail()["busy"])
            collect.assert_not_called()
        finally:
            finish.set()
            worker.join()

    @patch.object(mail, "collect_imap_account")
    def test_failure_keeps_cached_items_and_last_success(self, collect):
        collect.return_value = []
        mail.refresh_mail()
        self.save(message("Personal note"))
        last_success = mail.mail_summary()["accounts"][0]["lastSyncAt"]
        collect.side_effect = OSError("offline")
        mail.refresh_mail()
        result = mail.mail_summary()
        self.assertEqual(result["counts"]["unread"], 1)
        self.assertEqual(result["accounts"][0]["lastSyncAt"], last_success)
        self.assertTrue(result["error"])


if __name__ == "__main__":
    unittest.main()
