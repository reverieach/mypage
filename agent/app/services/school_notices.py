from __future__ import annotations

import hashlib
import html
import json
import os
import re
import sqlite3
import sys
import urllib.error
import urllib.parse
import urllib.request
from contextlib import contextmanager
from datetime import datetime, timedelta, timezone
from html.parser import HTMLParser
from pathlib import Path
from typing import Any

from app.services.cache import DATA_DIR, now_iso

LOCAL_TZ = timezone(timedelta(hours=8))
HOMEWORK_PROJECT_DIR = Path(os.getenv("HOMEWORK_PROJECT_DIR", "E:/作业获取项目"))
SCHOOL_NOTICE_URL = os.getenv(
    "SCHOOL_NOTICE_URL",
    "http://my.bupt.edu.cn/list.jsp?urltype=tree.TreeTempUrl&wbtreeid=1154",
)
SCHOOL_NOTICE_LOGIN_URL = os.getenv(
    "SCHOOL_NOTICE_LOGIN_URL",
    "https://auth.bupt.edu.cn/authserver/login",
)
SCHOOL_NOTICE_DB_PATH = Path(
    os.getenv("SCHOOL_NOTICE_DB_PATH", str(DATA_DIR / "school_notices.sqlite3"))
)
SCHOOL_NOTICE_COOKIE_PATH = Path(
    os.getenv("SCHOOL_NOTICE_COOKIE_PATH", str(DATA_DIR / "school_portal_cookies.json"))
)

DATE_PATTERN = re.compile(
    r"(?P<year>20\d{2})[年./-]\s*(?P<month>\d{1,2})[月./-]\s*(?P<day>\d{1,2})日?"
)

HIGH_RELEVANCE_KEYWORDS = (
    "考试",
    "补考",
    "四六级",
    "四级",
    "六级",
    "选课",
    "补退选",
    "培养方案",
    "学籍",
    "放假",
    "调课",
    "毕业",
    "奖学金",
    "助学金",
    "评优",
    "留学",
    "交换",
    "竞赛",
    "讲座",
    "报名",
    "实习",
    "就业",
    "招聘",
    "校园服务",
    "住宿",
    "缴费",
    "医保",
    "本科生",
    "升学",
    "保研",
    "考研",
    "活动",
)

LOW_RELEVANCE_KEYWORDS = (
    "人事任免",
    "任职",
    "免职",
    "挂职",
    "干部公示",
    "教师招聘",
    "教师",
    "教职工",
    "科研项目",
    "科研成果",
    "教职工培训",
    "行政会议",
    "研究生",
    "校友新闻",
    "宣传稿",
)


class LinkExtractor(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.links: list[dict[str, str]] = []
        self._active: dict[str, str] | None = None
        self._text: list[str] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if tag.lower() != "a":
            return

        values = {key.lower(): value or "" for key, value in attrs}
        href = values.get("href", "").strip()

        if not href or href.startswith(("javascript:", "#")):
            return

        self._active = {
            "href": href,
            "title": values.get("title", "").strip(),
        }
        self._text = []

    def handle_data(self, data: str) -> None:
        if self._active is not None:
            self._text.append(data)

    def handle_endtag(self, tag: str) -> None:
        if tag.lower() != "a" or self._active is None:
            return

        text = _normalize_space("".join(self._text))
        title = _normalize_space(self._active.get("title") or text)

        if title:
            self.links.append(
                {
                    "href": self._active["href"],
                    "title": title,
                    "text": text,
                }
            )

        self._active = None
        self._text = []


class TextExtractor(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.parts: list[str] = []
        self._skip_depth = 0

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if tag.lower() in {"script", "style", "noscript"}:
            self._skip_depth += 1
        elif tag.lower() in {"p", "div", "li", "tr", "br", "h1", "h2", "h3"}:
            self.parts.append("\n")

    def handle_endtag(self, tag: str) -> None:
        if tag.lower() in {"script", "style", "noscript"} and self._skip_depth:
            self._skip_depth -= 1
        elif tag.lower() in {"p", "div", "li", "tr", "h1", "h2", "h3"}:
            self.parts.append("\n")

    def handle_data(self, data: str) -> None:
        if not self._skip_depth:
            self.parts.append(data)

    def text(self) -> str:
        return _normalize_space("\n".join(self.parts))


def _normalize_space(value: str) -> str:
    value = html.unescape(value)
    value = re.sub(r"[\t\r\f\v]+", " ", value)
    value = re.sub(r" *\n+ *", "\n", value)
    return re.sub(r"[ \u3000]+", " ", value).strip()


NOTICE_BODY_END_MARKERS = (
    "公告附件如下",
    "打印",
    "关 闭",
    "关闭",
    "相关通知",
    "最新通知",
    "院系机构",
    "版权所有",
    "Loading",
)

NOTICE_NOISE_LINES = {
    "|",
    "欢迎访问信息服务门户",
    "修改密码",
    "个人资料",
    "帮助",
    "退出",
    "门户首页",
    "规章制度",
    "办事指南",
    "校内通知",
    "校内新闻",
    "资源中心",
    "党团行政",
    "教学科研",
    "正文",
    "浏览",
    "次",
}


def _clean_notice_text(text: str) -> str:
    lines = [
        _normalize_space(line)
        for line in _normalize_space(text).splitlines()
        if _normalize_space(line)
    ]

    if not lines:
        return ""

    start_index = 0

    for index, line in enumerate(lines):
        if line == "正文":
            start_index = index + 1
            break

    body_lines: list[str] = []

    for line in lines[start_index:]:
        if any(marker in line for marker in NOTICE_BODY_END_MARKERS):
            break

        if line in NOTICE_NOISE_LINES:
            continue

        if "欢迎访问信息服务门户" in line:
            continue

        body_lines.append(line)

    return _normalize_space("\n".join(body_lines))


def _summary_from_detail(title: str, detail_text: str) -> str:
    lines: list[str] = []

    for line in detail_text.splitlines():
        line = _normalize_space(line)

        if not line:
            continue

        if line == title:
            continue

        if line.startswith(("发布部门：", "发布时间：")):
            continue

        if line in {"浏览", "次"}:
            continue

        lines.append(line)

    summary = _normalize_space(" ".join(lines))
    return summary[:120] or title


@contextmanager
def _pushd(path: Path):
    previous = Path.cwd()
    os.chdir(path)
    try:
        yield
    finally:
        os.chdir(previous)


def _base_portal_headers(cookie_header: str | None = None) -> dict[str, str]:
    headers = {
        "User-Agent": (
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
            "(KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36"
        ),
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    }

    if cookie_header:
        headers["Cookie"] = cookie_header

    return headers


def _load_portal_cookie_header() -> str:
    if not SCHOOL_NOTICE_COOKIE_PATH.exists():
        return ""

    raw = json.loads(SCHOOL_NOTICE_COOKIE_PATH.read_text(encoding="utf-8"))

    if not isinstance(raw, dict):
        return ""

    cookies = raw.get("cookies")

    if not isinstance(cookies, list):
        return ""

    pairs: list[str] = []

    for cookie in cookies:
        if not isinstance(cookie, dict):
            continue

        name = str(cookie.get("name") or "").strip()
        value = str(cookie.get("value") or "").strip()

        if name and value:
            pairs.append(f"{name}={value}")

    return "; ".join(pairs)


def _save_portal_cookies(cookies: list[dict[str, Any]]) -> None:
    SCHOOL_NOTICE_COOKIE_PATH.parent.mkdir(parents=True, exist_ok=True)
    SCHOOL_NOTICE_COOKIE_PATH.write_text(
        json.dumps(
            {
                "capturedAt": now_iso(),
                "source": "my.bupt.edu.cn",
                "cookies": cookies,
            },
            ensure_ascii=False,
            indent=2,
        ),
        encoding="utf-8",
    )


def _capture_portal_cookies() -> str:
    if not HOMEWORK_PROJECT_DIR.exists():
        raise FileNotFoundError(f"homework project not found: {HOMEWORK_PROJECT_DIR}")

    if str(HOMEWORK_PROJECT_DIR) not in sys.path:
        sys.path.insert(0, str(HOMEWORK_PROJECT_DIR))

    try:
        from capture_headers import _fill_login_form
        from config import load_settings
        from playwright.sync_api import sync_playwright
    except ImportError as exc:
        raise RuntimeError(
            "Playwright login dependencies are unavailable; install the homework project requirements"
        ) from exc

    with _pushd(HOMEWORK_PROJECT_DIR):
        settings = load_settings()

    if not settings.school_id or not settings.school_pwd:
        raise ValueError("SCHOOL_ID / SCHOOL_PWD is required in E:/作业获取项目/.env")

    login_url = (
        f"{SCHOOL_NOTICE_LOGIN_URL}?service="
        f"{urllib.parse.quote(SCHOOL_NOTICE_URL, safe='')}"
    )
    cookies: list[dict[str, Any]] = []

    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=settings.playwright_headless)
        context = browser.new_context()
        page = context.new_page()

        try:
            page.goto(login_url, wait_until="domcontentloaded", timeout=30000)
            page.wait_for_timeout(1200)

            if page.locator("#loginIframe").count() > 0:
                page.wait_for_selector("#loginIframe", timeout=20000)
                scope = page.frame_locator("#loginIframe")
            else:
                scope = page

            _fill_login_form(scope, settings.school_id, settings.school_pwd)

            try:
                page.wait_for_load_state("networkidle", timeout=20000)
            except Exception:
                page.wait_for_timeout(3000)

            if "my.bupt.edu.cn" not in page.url:
                page.goto(SCHOOL_NOTICE_URL, wait_until="domcontentloaded", timeout=30000)

            try:
                page.wait_for_load_state("networkidle", timeout=10000)
            except Exception:
                page.wait_for_timeout(1500)

            body_text = page.locator("body").inner_text(timeout=5000)

            if "系统发生错误" in body_text or "栏目不存在" in body_text:
                raise PermissionError("school portal login did not reach the notice list")

            cookies = context.cookies("http://my.bupt.edu.cn")
        finally:
            browser.close()

    if not any(cookie.get("name") == "JSESSIONID" for cookie in cookies):
        raise PermissionError("school portal login did not return a JSESSIONID cookie")

    _save_portal_cookies(cookies)
    return "; ".join(
        f"{cookie['name']}={cookie['value']}"
        for cookie in cookies
        if cookie.get("name") and cookie.get("value")
    )


def _decode_response(raw: bytes, content_type: str) -> str:
    match = re.search(r"charset=([\w-]+)", content_type, flags=re.IGNORECASE)
    encodings = [match.group(1)] if match else []
    encodings.extend(["utf-8", "gb18030"])

    for encoding in encodings:
        try:
            return raw.decode(encoding)
        except (LookupError, UnicodeDecodeError):
            continue

    return raw.decode("utf-8", errors="replace")


def _fetch_text(url: str, headers: dict[str, str], timeout: float) -> str:
    request = urllib.request.Request(url, headers=headers)

    with urllib.request.urlopen(request, timeout=timeout) as response:
        raw = response.read()
        final_url = response.geturl()
        text = _decode_response(raw, response.headers.get("Content-Type", ""))

    if "system/resource/code/auth/clogin.jsp" in final_url or "系统发生错误" in text:
        raise PermissionError("school portal cookie expired")

    return text


def _fetch_portal_text(url: str, timeout: float) -> str:
    cookie_header = _load_portal_cookie_header()

    if not cookie_header:
        cookie_header = _capture_portal_cookies()

    try:
        return _fetch_text(url, _base_portal_headers(cookie_header), timeout)
    except PermissionError:
        cookie_header = _capture_portal_cookies()
        return _fetch_text(url, _base_portal_headers(cookie_header), timeout)


def _parse_date(value: str) -> datetime | None:
    match = DATE_PATTERN.search(value)

    if not match:
        return None

    try:
        return datetime(
            int(match.group("year")),
            int(match.group("month")),
            int(match.group("day")),
            tzinfo=LOCAL_TZ,
        )
    except ValueError:
        return None


def _format_date(value: datetime | None) -> str | None:
    return value.date().isoformat() if value else None


def _notice_id(url: str, title: str, published_at: str | None) -> str:
    parsed = urllib.parse.urlparse(url)
    query = urllib.parse.parse_qs(parsed.query)
    wbnewsid = str(query.get("wbnewsid", [""])[0]).strip()

    if wbnewsid:
        return f"wbnewsid:{wbnewsid}"

    key = f"{url}\n{title}\n{published_at or ''}"
    return hashlib.sha1(key.encode("utf-8")).hexdigest()[:16]


def _extract_links(list_html: str) -> list[dict[str, Any]]:
    parser = LinkExtractor()
    parser.feed(list_html)
    candidates: list[dict[str, Any]] = []
    seen: set[str] = set()

    for link in parser.links:
        title = link["title"]
        href = urllib.parse.urljoin(SCHOOL_NOTICE_URL, link["href"])

        if not title or href in seen:
            continue

        escaped_href = re.escape(link["href"])
        match = re.search(rf".{{0,260}}{escaped_href}.{{0,360}}", list_html, flags=re.DOTALL)
        context = match.group(0) if match else title
        text_context = _extract_text(context)
        published = _parse_date(context) or _parse_date(title)

        if not published:
            continue

        department = ""
        context_match = re.search(
            rf"{re.escape(title)}\s*(?P<department>.*?)\s*{DATE_PATTERN.pattern}",
            text_context,
        )

        if context_match:
            department = _normalize_space(context_match.group("department"))[:40]

        seen.add(href)
        candidates.append(
            {
                "title": title,
                "url": href,
                "publishedAt": _format_date(published),
                "publishedDate": published,
                "department": department,
            }
        )

    candidates.sort(key=lambda item: item["publishedDate"], reverse=True)
    return candidates


def _extract_text(page_html: str) -> str:
    parser = TextExtractor()
    parser.feed(page_html)
    text = _clean_notice_text(parser.text())
    return text[:8000]


def _extract_deadline(text: str) -> str | None:
    keyword_pattern = re.compile(
        r"(截止|报名|提交|申请|缴费|确认|办理|报送|之前|前).{0,60}?"
        r"(20\d{2}[年./-]\s*\d{1,2}[月./-]\s*\d{1,2}日?)",
        flags=re.DOTALL,
    )
    match = keyword_pattern.search(text)

    if match:
        return _format_date(_parse_date(match.group(2)))

    return None


def _is_expired(deadline: str | None) -> bool:
    if not deadline:
        return False

    try:
        parsed = datetime.fromisoformat(deadline).replace(tzinfo=LOCAL_TZ)
    except ValueError:
        return False

    return parsed.date() < datetime.now(LOCAL_TZ).date()


def _fallback_analysis(candidate: dict[str, Any], detail_text: str) -> dict[str, Any]:
    title = str(candidate["title"])
    department = str(candidate.get("department") or "")
    primary_text = f"{title}\n{department}"
    high_hits = [keyword for keyword in HIGH_RELEVANCE_KEYWORDS if keyword in primary_text]
    low_hits = [keyword for keyword in LOW_RELEVANCE_KEYWORDS if keyword in primary_text]
    deadline = _extract_deadline(f"{title}\n{detail_text}")
    relevant = bool(high_hits) and not low_hits
    score = min(95, 45 + len(high_hits) * 8)

    if "毕业" in high_hits or "就业" in high_hits or "考试" in high_hits:
        score = max(score, 78)

    if deadline and relevant:
        score = max(score, 74)

    if low_hits:
        score = 15

    return {
        "relevant": relevant and not _is_expired(deadline),
        "importance": "important" if score >= 75 else "normal",
        "priorityScore": score if relevant else 0,
        "category": high_hits[0] if high_hits else "school",
        "summary": _summary_from_detail(title, detail_text),
        "deadline": deadline,
        "displayReason": "Local keyword fallback analysis.",
    }


def _extract_json_object(value: str) -> dict[str, Any]:
    try:
        parsed = json.loads(value)
        return parsed if isinstance(parsed, dict) else {}
    except json.JSONDecodeError:
        match = re.search(r"\{.*\}", value, flags=re.DOTALL)

        if not match:
            return {}

        parsed = json.loads(match.group(0))
        return parsed if isinstance(parsed, dict) else {}


def _deepseek_analysis(candidate: dict[str, Any], detail_text: str) -> dict[str, Any]:
    fallback = _fallback_analysis(candidate, detail_text)
    api_key = os.getenv("DEEPSEEK_API_KEY")

    if not api_key:
        return fallback

    base_url = os.getenv("DEEPSEEK_BASE_URL", "https://api.deepseek.com").rstrip("/")
    model = os.getenv("DEEPSEEK_MODEL", "deepseek-chat")
    timeout = float(os.getenv("DEEPSEEK_TIMEOUT_SECONDS", "20"))
    payload = {
        "model": model,
        "response_format": {"type": "json_object"},
        "messages": [
            {
                "role": "system",
                "content": (
                    "你是一个本地个人主页的学校通知筛选器。只返回 JSON，字段为 "
                    "relevant, importance, priorityScore, category, summary, deadline, displayReason。"
                    "importance 只能是 critical、important、normal、low；priorityScore 为 0-100。"
                    "优先保留与本科生本人高度相关的通知：考试、补考、四六级、选课/补退选、"
                    "培养方案/学籍、放假调课、毕业相关、奖助学金/评优、留学/交换、竞赛、"
                    "讲座报名、实习/就业、校园服务、住宿/缴费/医保、学院或学校面向本科生的重要事项。"
                    "特别关注毕业资格、学籍、未来规划、就业、升学、毕业流程经验、毕业系列重要安排，"
                    "也关注活动相关信息。排除人事任免、干部公示、教师招聘、教师科研项目/成果、"
                    "教职工培训、行政会议、纯研究生通知、校友新闻、普通宣传稿、已过期或低相关内部通知。"
                    "必须综合通知发布时间和截止日期；如果截止日期已过，relevant 应为 false。"
                    "deadline 用 YYYY-MM-DD 或 null。summary 用简洁中文概括与用户有关的事项。"
                ),
            },
            {
                "role": "user",
                "content": json.dumps(
                    {
                        "title": candidate["title"],
                        "url": candidate["url"],
                        "publishedAt": candidate["publishedAt"],
                        "now": now_iso(),
                        "bodyText": detail_text,
                    },
                    ensure_ascii=False,
                ),
            },
        ],
    }
    request = urllib.request.Request(
        f"{base_url}/chat/completions",
        data=json.dumps(payload, ensure_ascii=False).encode("utf-8"),
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        },
        method="POST",
    )

    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            data = json.loads(response.read().decode("utf-8"))
    except (urllib.error.URLError, TimeoutError, json.JSONDecodeError):
        return fallback

    content = data.get("choices", [{}])[0].get("message", {}).get("content", "")
    analysis = {**fallback, **_extract_json_object(str(content))}
    analysis["model"] = model
    analysis["deadline"] = analysis.get("deadline") or fallback.get("deadline")
    analysis["relevant"] = bool(analysis.get("relevant")) and not _is_expired(
        str(analysis.get("deadline") or "") or None
    )
    return analysis


def _connect() -> sqlite3.Connection:
    SCHOOL_NOTICE_DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    connection = sqlite3.connect(SCHOOL_NOTICE_DB_PATH)
    connection.row_factory = sqlite3.Row
    return connection


def ensure_schema() -> None:
    with _connect() as connection:
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS school_notices (
              id TEXT PRIMARY KEY,
              title TEXT NOT NULL,
              department TEXT,
              published_at TEXT,
              deadline TEXT,
              web_link TEXT NOT NULL,
              body_text TEXT,
              body_hash TEXT,
              relevant INTEGER NOT NULL DEFAULT 0,
              importance TEXT NOT NULL DEFAULT 'normal',
              priority_score INTEGER NOT NULL DEFAULT 0,
              category TEXT NOT NULL DEFAULT 'school',
              summary TEXT,
              display_reason TEXT,
              analyzed_model TEXT,
              fetched_at TEXT NOT NULL,
              analyzed_at TEXT,
              hidden_at TEXT,
              expired_at TEXT,
              raw_json TEXT
            )
            """
        )
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS school_notice_sync_state (
              key TEXT PRIMARY KEY,
              value TEXT,
              updated_at TEXT NOT NULL
            )
            """
        )
        connection.execute(
            """
            CREATE INDEX IF NOT EXISTS idx_school_notices_display
            ON school_notices (relevant, hidden_at, published_at, deadline, priority_score)
            """
        )
        connection.commit()


def _set_sync_state(connection: sqlite3.Connection, key: str, value: str) -> None:
    connection.execute(
        """
        INSERT INTO school_notice_sync_state (key, value, updated_at)
        VALUES (?, ?, ?)
        ON CONFLICT(key)
        DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
        """,
        (key, value, now_iso()),
    )


def _get_sync_state(connection: sqlite3.Connection, key: str) -> str:
    row = connection.execute(
        "SELECT value FROM school_notice_sync_state WHERE key = ?",
        (key,),
    ).fetchone()
    return str(row["value"]) if row and row["value"] is not None else ""


def _body_hash(text: str) -> str:
    return hashlib.sha1(text.encode("utf-8")).hexdigest()


def _candidate_json(candidate: dict[str, Any]) -> str:
    return json.dumps(
        {
            key: (_format_date(value) if isinstance(value, datetime) else value)
            for key, value in candidate.items()
        },
        ensure_ascii=False,
    )


def _row_to_item(row: sqlite3.Row) -> dict[str, Any]:
    return {
        "id": str(row["id"]),
        "title": str(row["title"] or ""),
        "summary": str(row["summary"] or row["title"] or ""),
        "department": str(row["department"] or ""),
        "publishedAt": str(row["published_at"] or ""),
        "deadline": row["deadline"],
        "importance": str(row["importance"] or "normal"),
        "priorityScore": int(row["priority_score"] or 0),
        "category": str(row["category"] or "school"),
        "displayReason": str(row["display_reason"] or ""),
        "webLink": str(row["web_link"] or ""),
    }


def _display_window(days: int) -> tuple[str, str]:
    now = datetime.now(LOCAL_TZ)
    start_date = (now - timedelta(days=days)).date().isoformat()
    today = now.date().isoformat()
    return start_date, today


def _read_db_view(days: int = 2) -> dict[str, Any]:
    ensure_schema()
    start_date, today = _display_window(days)

    with _connect() as connection:
        rows = connection.execute(
            """
            SELECT *
            FROM school_notices
            WHERE hidden_at IS NULL
              AND relevant = 1
              AND (deadline IS NULL OR deadline = '' OR deadline >= ?)
              AND (published_at >= ? OR deadline >= ?)
            ORDER BY priority_score DESC,
                     CASE WHEN deadline IS NULL OR deadline = '' THEN '9999-12-31' ELSE deadline END ASC,
                     published_at DESC
            """,
            (today, start_date, today),
        ).fetchall()
        hidden_count = connection.execute(
            "SELECT COUNT(*) AS count FROM school_notices WHERE hidden_at IS NOT NULL"
        ).fetchone()["count"]
        candidate_count = connection.execute(
            "SELECT COUNT(*) AS count FROM school_notices WHERE published_at >= ?",
            (start_date,),
        ).fetchone()["count"]
        total_count = connection.execute(
            "SELECT COUNT(*) AS count FROM school_notices"
        ).fetchone()["count"]
        last_sync_at = _get_sync_state(connection, "last_sync_at")
        last_error = _get_sync_state(connection, "last_error")

    return {
        "windowLabel": f"近{days}天",
        "sourceUrl": SCHOOL_NOTICE_URL,
        "items": [_row_to_item(row) for row in rows],
        "hiddenCount": int(hidden_count or 0),
        "candidateCount": int(candidate_count or 0),
        "totalCount": int(total_count or 0),
        "lastSyncAt": last_sync_at or None,
        "lastError": last_error or None,
    }


def _save_candidate(
    connection: sqlite3.Connection,
    candidate: dict[str, Any],
    detail_text: str,
    analysis: dict[str, Any] | None,
) -> None:
    notice_id = _notice_id(
        str(candidate["url"]),
        str(candidate["title"]),
        str(candidate.get("publishedAt") or ""),
    )
    fetched_at = now_iso()
    body_hash = _body_hash(detail_text)
    existing = connection.execute(
        "SELECT body_hash, analyzed_at FROM school_notices WHERE id = ?",
        (notice_id,),
    ).fetchone()

    if analysis is None and existing:
        connection.execute(
            """
            UPDATE school_notices
            SET title = ?,
                department = ?,
                published_at = ?,
                web_link = ?,
                body_text = ?,
                body_hash = ?,
                fetched_at = ?,
                raw_json = ?
            WHERE id = ?
            """,
            (
                str(candidate["title"]),
                str(candidate.get("department") or ""),
                str(candidate.get("publishedAt") or ""),
                str(candidate["url"]),
                detail_text,
                body_hash,
                fetched_at,
                _candidate_json(candidate),
                notice_id,
            ),
        )
        return

    analysis = analysis or {}
    deadline = str(analysis.get("deadline") or "") or None
    expired_at = now_iso() if _is_expired(deadline) else None

    connection.execute(
        """
        INSERT INTO school_notices (
          id, title, department, published_at, deadline, web_link, body_text,
          body_hash, relevant, importance, priority_score, category, summary,
          display_reason, analyzed_model, fetched_at, analyzed_at, expired_at, raw_json
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id)
        DO UPDATE SET
          title = excluded.title,
          department = excluded.department,
          published_at = excluded.published_at,
          deadline = excluded.deadline,
          web_link = excluded.web_link,
          body_text = excluded.body_text,
          body_hash = excluded.body_hash,
          relevant = excluded.relevant,
          importance = excluded.importance,
          priority_score = excluded.priority_score,
          category = excluded.category,
          summary = excluded.summary,
          display_reason = excluded.display_reason,
          analyzed_model = excluded.analyzed_model,
          fetched_at = excluded.fetched_at,
          analyzed_at = excluded.analyzed_at,
          expired_at = excluded.expired_at,
          raw_json = excluded.raw_json
        """,
        (
            notice_id,
            str(candidate["title"]),
            str(candidate.get("department") or ""),
            str(candidate.get("publishedAt") or ""),
            deadline,
            str(candidate["url"]),
            detail_text,
            body_hash,
            1 if bool(analysis.get("relevant")) and not expired_at else 0,
            str(analysis.get("importance") or "normal"),
            int(analysis.get("priorityScore") or 0),
            str(analysis.get("category") or "school"),
            str(analysis.get("summary") or candidate["title"])[:180],
            str(analysis.get("displayReason") or ""),
            str(analysis.get("model") or ""),
            fetched_at,
            now_iso(),
            expired_at,
            _candidate_json(candidate),
        ),
    )


def read_school_notices(days: int = 2) -> dict[str, Any]:
    data = _read_db_view(days=days)

    if not data["totalCount"]:
        return refresh_school_notices(days=days)

    return data


def refresh_school_notices(days: int = 2) -> dict[str, Any]:
    now = datetime.now(LOCAL_TZ)
    start_date = (now - timedelta(days=days)).date()
    timeout = float(os.getenv("SCHOOL_NOTICE_TIMEOUT_SECONDS", "20"))
    ensure_schema()

    try:
        list_html = _fetch_portal_text(SCHOOL_NOTICE_URL, timeout)
        candidates = [
            item for item in _extract_links(list_html) if item["publishedDate"].date() >= start_date
        ][:30]

        with _connect() as connection:
            for candidate in candidates:
                detail_text = ""
                notice_id = _notice_id(
                    str(candidate["url"]),
                    str(candidate["title"]),
                    str(candidate.get("publishedAt") or ""),
                )

                try:
                    detail_text = _extract_text(_fetch_portal_text(candidate["url"], timeout))
                except (OSError, PermissionError, urllib.error.URLError):
                    detail_text = str(candidate["title"])

                body_hash = _body_hash(detail_text)
                existing = connection.execute(
                    "SELECT body_hash, analyzed_at FROM school_notices WHERE id = ?",
                    (notice_id,),
                ).fetchone()
                should_analyze = not (
                    existing
                    and str(existing["body_hash"] or "") == body_hash
                    and str(existing["analyzed_at"] or "")
                )
                analysis = _deepseek_analysis(candidate, detail_text) if should_analyze else None
                _save_candidate(connection, candidate, detail_text, analysis)

            _set_sync_state(connection, "last_sync_at", now_iso())
            _set_sync_state(connection, "last_error", "")
            _set_sync_state(connection, "last_candidate_count", str(len(candidates)))
            connection.commit()
    except Exception as exc:
        with _connect() as connection:
            _set_sync_state(connection, "last_error", str(exc))
            connection.commit()
        raise

    data = _read_db_view(days=days)
    data["refreshed"] = True
    return data


def dismiss_school_notice(notice_id: str) -> dict[str, Any]:
    normalized = notice_id.strip()

    if not normalized:
        raise ValueError("notice id is required")

    ensure_schema()

    with _connect() as connection:
        connection.execute(
            "UPDATE school_notices SET hidden_at = ? WHERE id = ?",
            (now_iso(), normalized),
        )
        connection.commit()

    return {"id": normalized, "dismissed": True}
