from datetime import date, timedelta


def contribution_days() -> list[dict[str, int | str]]:
    start = date(2026, 3, 24)

    return [
        {
            "date": (start + timedelta(days=index)).isoformat(),
            "count": ((index + 1) * 7 + (index + 1) * (index + 1)) % 5,
            "level": ((index + 1) * 7 + (index + 1) * (index + 1)) % 5,
        }
        for index in range(91)
    ]


GITHUB_CONTRIBUTIONS = {
    "total": 180,
    "rangeLabel": "last quarter",
    "days": contribution_days(),
}

SCHOOL_TODAY = {
    "courses": [
        {
            "name": "高等数学",
            "time": "08:00",
            "location": "教学楼 A301",
        }
    ],
    "notices": [
        {
            "title": "校园网维护通知",
            "time": "22:00",
        }
    ],
}

CODEX_USAGE_TODAY = {
    "totalTokens": 156000,
    "inputTokens": 120000,
    "outputTokens": 36000,
    "sessions": 8,
    "trend": [
        {"day": "Mon", "tokens": 48000},
        {"day": "Tue", "tokens": 72000},
        {"day": "Wed", "tokens": 56000},
        {"day": "Thu", "tokens": 91000},
        {"day": "Fri", "tokens": 64000},
        {"day": "Sat", "tokens": 38000},
        {"day": "Sun", "tokens": 84000},
    ],
    "topProjects": [
        {"name": "mypage", "tokens": 72000},
        {"name": "video-download", "tokens": 31000},
    ],
}

AUTOMATION_DIGEST = {
    "summary": "今日 5 个自动化任务完成，1 个需要关注。",
    "items": [
        {
            "title": "学校通知同步",
            "status": "success",
            "time": "07:30",
            "detail": "抓取 3 条新通知",
        },
        {
            "title": "项目备份",
            "status": "success",
            "time": "12:00",
            "detail": "已完成",
        },
        {
            "title": "课程表更新",
            "status": "warning",
            "time": "08:00",
            "detail": "登录即将过期",
        },
    ],
}

SCRIPTS_STATUS = {
    "agent": "ready",
    "healthy": 5,
    "total": 6,
    "tasks": [
        {
            "name": "学校通知同步",
            "status": "success",
            "lastRun": "07:30",
        },
        {
            "name": "课程表更新",
            "status": "warning",
            "lastRun": "08:00",
        },
    ],
}

NOTIFICATIONS_CENTER = {
    "enabledSources": ["github", "mail", "bilibili", "school"],
    "items": [
        {
            "id": "github-issue-placeholder",
            "source": "github",
            "title": "GitHub issues",
            "summary": "Connect a repository token or cached issue export.",
            "time": "now",
            "unread": True,
        },
        {
            "id": "mail-placeholder",
            "source": "mail",
            "title": "Mail digest",
            "summary": "Daily summaries can be written into Agent cache.",
            "time": "now",
            "unread": False,
        },
        {
            "id": "bilibili-placeholder",
            "source": "bilibili",
            "title": "Bilibili messages",
            "summary": "Private messages need a later connector or script.",
            "time": "now",
            "unread": False,
        },
    ],
}

HOMEWORK_DUE = {
    "windowLabel": "0-3d",
    "assignments": [],
}

SCHOOL_NOTICES = {
    "windowLabel": "近2天",
    "sourceUrl": "http://my.bupt.edu.cn/list.jsp?urltype=tree.TreeTempUrl&wbtreeid=1154",
    "items": [],
    "hiddenCount": 0,
    "candidateCount": 0,
}
