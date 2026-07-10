import unittest
from datetime import datetime, timedelta, timezone
from unittest.mock import patch

from app.services import school_notices


LOCAL_TZ = timezone(timedelta(hours=8))


def notice_view(*, total_count: int = 1, last_sync_at: str | None = None) -> dict:
    return {
        "items": [],
        "totalCount": total_count,
        "lastSyncAt": last_sync_at,
    }


class SchoolNoticeStartupRefreshTests(unittest.TestCase):
    def test_empty_cache_needs_startup_refresh(self) -> None:
        with patch.object(
            school_notices,
            "_read_db_view",
            return_value=notice_view(total_count=0, last_sync_at=None),
        ):
            self.assertTrue(school_notices.school_notices_need_startup_refresh(ttl_seconds=43200))

    def test_fresh_cache_skips_startup_refresh(self) -> None:
        last_sync = (datetime.now(LOCAL_TZ) - timedelta(hours=2)).isoformat()

        with patch.object(
            school_notices,
            "_read_db_view",
            return_value=notice_view(last_sync_at=last_sync),
        ):
            self.assertFalse(school_notices.school_notices_need_startup_refresh(ttl_seconds=43200))

    def test_stale_cache_needs_startup_refresh(self) -> None:
        last_sync = (datetime.now(LOCAL_TZ) - timedelta(hours=13)).isoformat()

        with patch.object(
            school_notices,
            "_read_db_view",
            return_value=notice_view(last_sync_at=last_sync),
        ):
            self.assertTrue(school_notices.school_notices_need_startup_refresh(ttl_seconds=43200))

    def test_disabled_ttl_skips_startup_refresh(self) -> None:
        with patch.object(
            school_notices,
            "_read_db_view",
            return_value=notice_view(total_count=0, last_sync_at=None),
        ) as read_view:
            self.assertFalse(school_notices.school_notices_need_startup_refresh(ttl_seconds=0))
            read_view.assert_not_called()

    def test_if_stale_returns_cached_data_without_refresh(self) -> None:
        last_sync = (datetime.now(LOCAL_TZ) - timedelta(hours=2)).isoformat()
        cached = notice_view(last_sync_at=last_sync)

        with patch.object(school_notices, "_read_db_view", return_value=cached), patch.object(
            school_notices,
            "refresh_school_notices",
        ) as refresh:
            result = school_notices.refresh_school_notices_if_stale(ttl_seconds=43200)

        refresh.assert_not_called()
        self.assertFalse(result["refreshed"])
        self.assertEqual(result["skippedReason"], "fresh")

    def test_if_stale_refreshes_old_cache(self) -> None:
        last_sync = (datetime.now(LOCAL_TZ) - timedelta(hours=13)).isoformat()

        with patch.object(
            school_notices,
            "_read_db_view",
            return_value=notice_view(last_sync_at=last_sync),
        ), patch.object(
            school_notices,
            "refresh_school_notices",
            return_value={"items": [], "totalCount": 1, "lastSyncAt": "now", "refreshed": True},
        ) as refresh:
            result = school_notices.refresh_school_notices_if_stale(ttl_seconds=43200)

        refresh.assert_called_once_with(days=2)
        self.assertTrue(result["refreshed"])
        self.assertEqual(result["startupTtlSeconds"], 43200)


if __name__ == "__main__":
    unittest.main()

