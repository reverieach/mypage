import unittest

from app.services.message_pipeline import (
    MessageItem,
    _apply_analysis_policy,
    _is_high_confidence_marketing,
    _mailbox_name_from_list_line,
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


if __name__ == "__main__":
    unittest.main()
