from __future__ import annotations

import asyncio
import contextlib
from pathlib import Path
from typing import Any

from fastapi import Body, Depends, FastAPI, File, Header, HTTPException, Query, UploadFile
from fastapi.responses import FileResponse, HTMLResponse
from app.services import lan_stun

from app.services.lan_share import (
    add_text,
    authenticate_pin,
    clear_items,
    delete_item,
    get_file_record,
    list_items,
    reset_pin,
    save_file,
    share_status,
    validate_token,
)

@contextlib.asynccontextmanager
async def lifespan(_app):
    await lan_stun.refresh_bindings()
    task = asyncio.create_task(lan_stun.maintain_bindings())
    try:
        yield
    finally:
        task.cancel()
        with contextlib.suppress(asyncio.CancelledError):
            await task


app = FastAPI(title="MyPage LAN Share", lifespan=lifespan)


@app.get("/api/share/stun")
def api_stun():
    return {"urls": lan_stun.urls()}


def _token_from_header(value: str | None) -> str | None:
    if not value:
        return None

    if value.lower().startswith("bearer "):
        return value[7:].strip()

    return value.strip()


def require_auth(
    authorization: str | None = Header(default=None),
    token: str | None = Query(default=None),
) -> None:
    candidate = token or _token_from_header(authorization)

    if not validate_token(candidate):
        raise HTTPException(status_code=401, detail="Authentication required")


@app.get("/share", response_class=HTMLResponse)
def share_page() -> str:
    return SHARE_PAGE_HTML


@app.get("/")
def root_redirect() -> HTMLResponse:
    return HTMLResponse(
        '<!doctype html><meta http-equiv="refresh" content="0; url=/share">',
    )


@app.get("/api/share/status")
def api_status() -> dict[str, Any]:
    status = share_status(include_pin=False)
    return {**status, "pin": None}


@app.post("/api/share/auth")
def api_auth(payload: dict[str, Any] = Body(...)) -> dict[str, Any]:
    try:
        return authenticate_pin(str(payload.get("pin") or ""))
    except PermissionError as exc:
        raise HTTPException(status_code=401, detail=str(exc)) from exc


@app.get("/api/share/items")
def api_items(_: None = Depends(require_auth)) -> dict[str, Any]:
    return list_items()


@app.post("/api/share/text")
def api_text(payload: dict[str, Any] = Body(...), _: None = Depends(require_auth)) -> dict[str, Any]:
    try:
        return add_text(str(payload.get("text") or ""), source="mobile")
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.post("/api/share/files")
def api_files(file: UploadFile = File(...), _: None = Depends(require_auth)) -> dict[str, Any]:
    try:
        return save_file(
            file.file,
            file.filename or "file",
            file.content_type,
            source="mobile",
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.get("/api/share/files/{item_id}")
def api_download(item_id: str, _: None = Depends(require_auth)) -> FileResponse:
    try:
        path, item = get_file_record(item_id)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail="File not found") from exc

    return FileResponse(
        path,
        media_type=str(item.get("mediaType") or "application/octet-stream"),
        filename=str(item.get("originalName") or Path(path).name),
    )


@app.delete("/api/share/items/{item_id}")
def api_delete(item_id: str, _: None = Depends(require_auth)) -> dict[str, Any]:
    return {"deleted": delete_item(item_id)}


@app.post("/api/share/clear")
def api_clear(_: None = Depends(require_auth)) -> dict[str, Any]:
    return clear_items()


@app.post("/api/share/reset-pin")
def api_reset_pin(_: None = Depends(require_auth)) -> dict[str, Any]:
    return {"pin": reset_pin()}


SHARE_PAGE_HTML = r"""
<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
    <title>MyPage Share</title>
    <style>
      :root {
        color-scheme: dark;
        font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", sans-serif;
        background: #10131d;
        color: rgba(255, 255, 255, 0.9);
      }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        min-height: 100svh;
        background:
          radial-gradient(circle at 15% 0%, rgba(102, 126, 234, 0.24), transparent 32rem),
          radial-gradient(circle at 92% 18%, rgba(14, 165, 233, 0.18), transparent 28rem),
          linear-gradient(145deg, #111827 0%, #171421 48%, #0f172a 100%);
      }
      button, input, textarea { font: inherit; }
      .page {
        width: min(100%, 760px);
        margin: 0 auto;
        padding: max(18px, env(safe-area-inset-top)) 16px max(24px, env(safe-area-inset-bottom));
      }
      .topbar {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        margin-bottom: 14px;
      }
      .brand { min-width: 0; }
      h1 { margin: 0; font-size: 24px; letter-spacing: 0; }
      .sub { margin-top: 4px; font-size: 12px; color: rgba(255,255,255,.48); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .pill {
        border: 1px solid rgba(255,255,255,.16);
        background: rgba(255,255,255,.1);
        color: rgba(255,255,255,.74);
        border-radius: 999px;
        padding: 8px 11px;
        font-size: 12px;
        white-space: nowrap;
      }
      .card {
        border: 1px solid rgba(255,255,255,.14);
        background: rgba(255,255,255,.1);
        box-shadow: 0 20px 60px rgba(0,0,0,.24);
        backdrop-filter: blur(22px);
        border-radius: 22px;
        padding: 14px;
        margin: 12px 0;
      }
      .login {
        min-height: calc(100svh - 42px);
        display: grid;
        place-items: center;
      }
      .login-card {
        width: min(100%, 420px);
        text-align: center;
      }
      .pin-input {
        width: 100%;
        height: 54px;
        border-radius: 18px;
        border: 1px solid rgba(255,255,255,.18);
        background: rgba(255,255,255,.12);
        color: white;
        font-size: 28px;
        letter-spacing: .28em;
        text-align: center;
        outline: none;
      }
      .primary, .ghost {
        width: 100%;
        min-height: 46px;
        border: 0;
        border-radius: 16px;
        margin-top: 10px;
        cursor: pointer;
      }
      .primary {
        background: rgba(255,255,255,.92);
        color: #111827;
        font-weight: 700;
      }
      .ghost {
        background: rgba(255,255,255,.1);
        color: rgba(255,255,255,.82);
      }
      textarea {
        width: 100%;
        min-height: 104px;
        resize: vertical;
        border: 1px solid rgba(255,255,255,.14);
        border-radius: 18px;
        background: rgba(255,255,255,.1);
        color: white;
        padding: 12px;
        outline: none;
      }
      .section-title {
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 10px;
        margin-bottom: 10px;
        font-size: 14px;
        font-weight: 700;
      }
      .drop {
        display: block;
        border: 1px dashed rgba(255,255,255,.25);
        background: rgba(255,255,255,.07);
        border-radius: 20px;
        padding: 18px 12px;
        text-align: center;
        color: rgba(255,255,255,.68);
      }
      input[type=file] { display: none; }
      .list { display: grid; gap: 10px; }
      .item {
        border: 1px solid rgba(255,255,255,.1);
        background: rgba(255,255,255,.08);
        border-radius: 18px;
        padding: 12px;
      }
      .item-head {
        display: flex;
        justify-content: space-between;
        gap: 10px;
        align-items: start;
      }
      .title {
        min-width: 0;
        font-size: 14px;
        font-weight: 650;
        overflow-wrap: anywhere;
      }
      .meta { margin-top: 4px; font-size: 11px; color: rgba(255,255,255,.42); }
      .text-preview {
        margin-top: 8px;
        white-space: pre-wrap;
        color: rgba(255,255,255,.72);
        font-size: 13px;
        line-height: 1.55;
        max-height: 9em;
        overflow: hidden;
      }
      .thumb {
        display: block;
        width: 100%;
        max-height: 220px;
        object-fit: cover;
        border-radius: 14px;
        margin-top: 10px;
        background: rgba(255,255,255,.08);
      }
      .actions {
        display: flex;
        gap: 8px;
        margin-top: 10px;
      }
      .actions button, .actions a {
        flex: 1;
        min-height: 38px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        border: 0;
        border-radius: 13px;
        background: rgba(255,255,255,.11);
        color: rgba(255,255,255,.82);
        text-decoration: none;
      }
      .danger { color: #fecdd3 !important; }
      .empty { color: rgba(255,255,255,.42); text-align: center; padding: 20px; font-size: 13px; }
      .toast {
        position: fixed;
        left: 50%;
        bottom: calc(20px + env(safe-area-inset-bottom));
        transform: translateX(-50%) translateY(120%);
        background: rgba(17,24,39,.92);
        border: 1px solid rgba(255,255,255,.16);
        border-radius: 999px;
        padding: 10px 14px;
        color: white;
        transition: transform .2s ease;
        z-index: 30;
      }
      .toast.show { transform: translateX(-50%) translateY(0); }
      .hidden { display: none !important; }
    </style>
  </head>
  <body>
    <main id="login" class="page login">
      <section class="card login-card">
        <h1>MyPage Share</h1>
        <p class="sub" style="white-space:normal">输入电脑 MyPage 组件里显示的 6 位 PIN。</p>
        <input id="pin" class="pin-input" inputmode="numeric" maxlength="6" autocomplete="one-time-code" />
        <button id="loginButton" class="primary">连接</button>
        <p id="loginError" class="sub" style="color:#fecdd3"></p>
      </section>
    </main>

    <main id="app" class="page hidden">
      <header class="topbar">
        <div class="brand">
          <h1>MyPage Share</h1>
          <div id="statusText" class="sub">LAN connected</div>
        </div>
        <button id="refreshButton" class="pill">刷新</button>
      </header>

      <section class="card">
        <div class="section-title"><span>Quick Text</span><span class="sub">点文本卡片复制</span></div>
        <textarea id="textInput" placeholder="粘贴或输入要发送到电脑的文本、链接、验证码..."></textarea>
        <button id="sendTextButton" class="primary">发送到共享区</button>
      </section>

      <section class="card">
        <div class="section-title"><span>Files</span><span id="uploadState" class="sub"></span></div>
        <label class="drop">
          <input id="fileInput" type="file" multiple />
          <strong>选择文件 / 图片</strong>
          <div class="sub" style="white-space:normal;margin-top:4px">手机传电脑会直接保存到电脑共享目录。</div>
        </label>
      </section>

      <section class="card">
        <div class="section-title">
          <span>Recent</span>
          <button id="clearButton" class="pill danger" style="padding:6px 10px">清空</button>
        </div>
        <div id="items" class="list"></div>
      </section>
    </main>
    <div id="toast" class="toast"></div>

    <script>
      const tokenKey = 'mypage-share-token';
      let token = localStorage.getItem(tokenKey) || '';
      const $ = (id) => document.getElementById(id);

      function toast(message) {
        const el = $('toast');
        el.textContent = message;
        el.classList.add('show');
        setTimeout(() => el.classList.remove('show'), 1600);
      }

      function authHeaders() {
        return token ? { Authorization: `Bearer ${token}` } : {};
      }

      async function api(path, options = {}) {
        const response = await fetch(path, {
          ...options,
          headers: {
            ...(options.headers || {}),
            ...authHeaders(),
          },
        });
        if (response.status === 401) {
          localStorage.removeItem(tokenKey);
          token = '';
          showLogin();
          throw new Error('需要重新输入 PIN');
        }
        if (!response.ok) {
          const detail = await response.json().catch(() => ({}));
          throw new Error(detail.detail || `请求失败 ${response.status}`);
        }
        return response.json();
      }

      function showLogin() {
        $('login').classList.remove('hidden');
        $('app').classList.add('hidden');
      }

      function showApp() {
        $('login').classList.add('hidden');
        $('app').classList.remove('hidden');
        $('statusText').textContent = location.host;
      }

      function formatSize(size) {
        if (!size) return '';
        if (size > 1024 * 1024) return `${(size / 1024 / 1024).toFixed(1)} MB`;
        if (size > 1024) return `${Math.round(size / 1024)} KB`;
        return `${size} B`;
      }

      function formatTime(value) {
        const date = new Date(value);
        if (Number.isNaN(date.getTime())) return value || '';
        return new Intl.DateTimeFormat('zh-CN', { hour: '2-digit', minute: '2-digit', month: 'numeric', day: 'numeric' }).format(date);
      }

      function fileUrl(item) {
        return `/api/share/files/${encodeURIComponent(item.id)}?token=${encodeURIComponent(token)}`;
      }

      async function copyText(text) {
        const value = String(text ?? '');
        try {
          if (!navigator.clipboard || !window.isSecureContext) {
            throw new Error('Clipboard API unavailable');
          }
          await navigator.clipboard.writeText(value);
          toast('已复制');
        } catch {
          if (copyTextFallback(value)) {
            toast('已复制');
          } else {
            toast('复制失败，请长按选择');
          }
        }
      }

      function copyTextFallback(text) {
        const input = document.createElement('textarea');
        input.value = text;
        input.setAttribute('readonly', '');
        input.style.position = 'fixed';
        input.style.top = '12px';
        input.style.left = '12px';
        input.style.width = '1px';
        input.style.height = '1px';
        input.style.opacity = '0.01';
        input.style.fontSize = '16px';
        document.body.appendChild(input);

        try {
          input.focus({ preventScroll: true });
          input.select();
          input.setSelectionRange(0, input.value.length);
          return document.execCommand('copy');
        } catch {
          return false;
        } finally {
          input.remove();
        }
      }

      function renderItems(items) {
        const container = $('items');
        container.innerHTML = '';
        if (!items.length) {
          container.innerHTML = '<div class="empty">还没有共享内容</div>';
          return;
        }
        for (const item of items) {
          const node = document.createElement('article');
          node.className = 'item';
          const meta = `${formatTime(item.createdAt)} · ${item.source || ''}${item.size ? ' · ' + formatSize(item.size) : ''}`;
          const title = item.kind === 'text' ? item.title : (item.originalName || item.title);
          node.innerHTML = `
            <div class="item-head">
              <div class="title">${escapeHtml(title)}</div>
              <div class="meta">${escapeHtml(item.kind)}</div>
            </div>
            <div class="meta">${escapeHtml(meta)}</div>
            ${item.kind === 'text' ? `<div class="text-preview">${escapeHtml(item.text || '')}</div>` : ''}
            ${item.kind === 'file' && item.isImage ? `<img class="thumb" src="${fileUrl(item)}" alt="${escapeHtml(title)}" />` : ''}
            <div class="actions">
              ${item.kind === 'text' ? '<button data-action="copy">复制</button>' : `<a href="${fileUrl(item)}" download="${escapeHtml(item.originalName || item.title)}">下载</a>`}
              ${item.kind === 'file' ? `<a href="${fileUrl(item)}" target="_blank" rel="noreferrer">打开</a>` : ''}
              <button class="danger" data-action="delete">删除</button>
            </div>
          `;
          node.querySelector('[data-action="copy"]')?.addEventListener('click', () => copyText(item.text || ''));
          node.querySelector('[data-action="delete"]')?.addEventListener('click', async () => {
            await api(`/api/share/items/${encodeURIComponent(item.id)}`, { method: 'DELETE' });
            toast('已删除');
            await loadItems();
          });
          container.appendChild(node);
        }
      }

      function escapeHtml(value) {
        return String(value ?? '').replace(/[&<>"']/g, (ch) => ({
          '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
        }[ch]));
      }

      async function loadItems() {
        const data = await api('/api/share/items');
        renderItems(data.items || []);
      }

      $('loginButton').addEventListener('click', async () => {
        $('loginError').textContent = '';
        try {
          const data = await fetch('/api/share/auth', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ pin: $('pin').value }),
          }).then(async (response) => {
            if (!response.ok) throw new Error('PIN 不正确');
            return response.json();
          });
          token = data.token;
          localStorage.setItem(tokenKey, token);
          showApp();
          await loadItems();
        } catch (error) {
          $('loginError').textContent = error.message || '连接失败';
        }
      });

      $('sendTextButton').addEventListener('click', async () => {
        const text = $('textInput').value;
        await api('/api/share/text', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text }),
        });
        $('textInput').value = '';
        toast('已发送');
        await loadItems();
      });

      $('fileInput').addEventListener('change', async (event) => {
        const files = Array.from(event.target.files || []);
        for (const file of files) {
          $('uploadState').textContent = `上传 ${file.name}`;
          const form = new FormData();
          form.append('file', file);
          await api('/api/share/files', { method: 'POST', body: form });
        }
        $('uploadState').textContent = '';
        $('fileInput').value = '';
        toast('上传完成');
        await loadItems();
      });

      $('refreshButton').addEventListener('click', () => loadItems().then(() => toast('已刷新')));
      $('clearButton').addEventListener('click', async () => {
        if (!confirm('清空所有共享文本和文件？')) return;
        await api('/api/share/clear', { method: 'POST' });
        toast('已清空');
        await loadItems();
      });

      if (token) {
        showApp();
        loadItems().catch(showLogin);
      } else {
        showLogin();
      }
    </script>
  </body>
</html>
"""
