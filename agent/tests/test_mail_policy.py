import unittest
from datetime import datetime, timedelta, timezone
from unittest.mock import call, patch

from app.services.message_pipeline import (
    MailAccount,
    MessageItem,
    _apply_analysis_policy,
    _graph_message_item,
    _graph_scopes,
    _is_high_confidence_marketing,
    _mailbox_name_from_list_line,
    _move_graph_message_to_trash,
    _valid_cached_access_token,
)


def message(title: str, body: str = "", sender: str = "service@example.com") -> MessageItem:
    return MessageItem(
        id="mail:test:1:1",
        source="mail",
        source_item_id="1:1",
        account_id="test",
        account_label="Test",
        account_email="test@example.com",
        title=title,
        sender=sender,
        received_at="2026-06-30T00:00:00+08:00",
        snippet=body,
        body_text=body,
        web_link="",
        raw_ref="1:1",
        is_read=False,
    )


class MailPolicyTests(unittest.TestCase):
    def test_billing_change_overrides_low_model_result(self) -> None:
        item = message("DeepSeek V4正式版发布计划及计费调整说明")
        result = _apply_analysis_policy(
            item,
            {
                "importance": "low",
                "needsAttention": False,
                "category": "mail",
            },
        )

        self.assertEqual(result["importance"], "important")
        self.assertTrue(result["needsAttention"])
        self.assertEqual(result["category"], "billing")

    def test_marketing_cleanup_requires_model_and_local_agreement(self) -> None:
        item = message("Weekly deals", "Save 20% today. Unsubscribe here.")

        self.assertTrue(
            _is_high_confidence_marketing(
                item,
                {
                    "importance": "low",
                    "needsAttention": False,
                    "category": "promotion",
                },
            )
        )
        self.assertFalse(
            _is_high_confidence_marketing(
                item,
                {
                    "importance": "normal",
                    "needsAttention": False,
                    "category": "promotion",
                },
            )
        )

    def test_protected_mail_is_never_a_cleanup_candidate(self) -> None:
        item = message("API pricing change", "Special offer for current customers")
        analysis = _apply_analysis_policy(
            item,
            {
                "importance": "low",
                "needsAttention": False,
                "category": "promotion",
            },
        )

        self.assertFalse(_is_high_confidence_marketing(item, analysis))

    def test_mailbox_parser_handles_quoted_folder_names(self) -> None:
        line = b'(\\HasNoChildren \\Trash) "/" "Deleted Messages"'
        self.assertEqual(_mailbox_name_from_list_line(line), "Deleted Messages")

    def test_graph_scope_allows_mail_actions_but_not_sending(self) -> None:
        scopes = set(_graph_scopes().split())
        self.assertIn("Mail.ReadWrite", scopes)
        self.assertNotIn("Mail.Send", scopes)

    def test_cached_graph_token_respects_expiry(self) -> None:
        now = datetime.now(timezone.utc)
        valid = {
            "access_token": "valid-token",
            "savedAt": now.isoformat(),
            "expires_in": 3600,
        }
        expired = {
            "access_token": "expired-token",
            "savedAt": (now - timedelta(hours=2)).isoformat(),
            "expires_in": 3600,
        }

        self.assertEqual(_valid_cached_access_token(valid), "valid-token")
        self.assertIsNone(_valid_cached_access_token(expired))

    def test_graph_message_keeps_mailbox_identity(self) -> None:
        account = MailAccount(
            id="outlook-main",
            label="Outlook",
            email_address="user@outlook.com",
            host="graph.microsoft.com",
            provider="microsoft_graph",
        )
        item = _graph_message_item(
            account,
            {
                "id": "graph-id",
                "subject": "Hello",
                "from": {"emailAddress": {"name": "Sender", "address": "sender@example.com"}},
                "receivedDateTime": "2026-06-30T00:00:00Z",
                "bodyPreview": "Preview",
                "webLink": "https://outlook.live.com/mail/0/id/graph-id",
                "internetMessageId": "<message@example.com>",
                "isRead": False,
            },
        )

        self.assertIsNotNone(item)
        assert item is not None
        self.assertEqual(item.account_id, "outlook-main")
        self.assertEqual(item.raw_ref, "message@example.com")
        self.assertEqual(item.sender, "Sender <sender@example.com>")

    @patch("app.services.message_pipeline._graph_json_request")
    @patch("app.services.message_pipeline.refresh_microsoft_token", return_value="token")
    def test_graph_cleanup_marks_read_then_moves_to_deleted_items(
        self,
        _refresh_token,
        graph_request,
    ) -> None:
        account = MailAccount(
            id="outlook-main",
            label="Outlook",
            email_address="user@outlook.com",
            host="graph.microsoft.com",
            provider="microsoft_graph",
        )
        item = message("Promotion")
        item = MessageItem(**{**item.__dict__, "source_item_id": "graph/id"})

        _move_graph_message_to_trash(account, item)

        message_url = "https://graph.microsoft.com/v1.0/me/messages/graph%2Fid"
        self.assertEqual(
            graph_request.call_args_list,
            [
                call(message_url, "token", method="PATCH", body={"isRead": True}),
                call(
                    f"{message_url}/move",
                    "token",
                    method="POST",
                    body={"destinationId": "deleteditems"},
                ),
            ],
        )


if __name__ == "__main__":
    unittest.main()
