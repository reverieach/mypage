"""Configure this Mac's MyPage QQ inbox without exposing its authorization code."""
import getpass
import imaplib
import json
import os
from pathlib import Path
import plistlib
import ssl
import subprocess
import sys
from datetime import datetime

from dotenv import set_key


def main():
    if sys.platform != "darwin" or not sys.stdin.isatty():
        raise SystemExit("请在这台 Mac 的终端中运行，授权码将隐藏输入。")
    os.umask(0o077)
    runtime = Path.home() / "Library/Application Support/MyPage/agent"
    plist_path = Path.home() / "Library/LaunchAgents/com.reverieach.mypage.agent.plist"
    with plist_path.open("rb") as file:
        service = plistlib.load(file)
    if Path(service["WorkingDirectory"]) != runtime:
        raise SystemExit("服务目录与预期不同，请先核对配置。")
    accounts_path = runtime / "app/data/mail_accounts.json"
    accounts = json.loads(accounts_path.read_text()) if accounts_path.exists() else []
    if not isinstance(accounts, list):
        raise SystemExit("邮箱配置格式异常，未修改。")
    address = input("QQ 邮箱地址：").strip()
    if not address.endswith("@qq.com") or not address.removesuffix("@qq.com").isdigit():
        raise SystemExit("请输入数字 QQ 号的 @qq.com 地址。")
    code = getpass.getpass("QQ IMAP 授权码（输入不会显示，非 QQ 密码）：").strip()
    if not code or any(char.isspace() for char in code):
        raise SystemExit("授权码为空或包含空白，未保存。")
    print("正在验证 QQ 登录；不标为已读、不删除、不发送邮件……")
    client = imaplib.IMAP4_SSL("imap.qq.com", 993, ssl_context=ssl.create_default_context(), timeout=15)
    try:
        client.login(address, code)
        status, _ = client.select("INBOX", readonly=True)
        if status != "OK":
            raise RuntimeError("无法打开收件箱")
    finally:
        client.logout()
    existing = next((item for item in accounts if item.get("email") == address), None)
    if existing is None and any(item.get("id") == "qq-main" for item in accounts):
        raise SystemExit("qq-main 已属于另一个邮箱，未覆盖，请先核对。")
    account = existing if existing is not None else {}
    account.update({
        "id": account.get("id", "qq-main"), "label": "QQ", "email": address,
        "provider": "imap", "host": "imap.qq.com", "port": 993,
        "username": address, "passwordEnv": "QQ_MAIL_AUTH_CODE", "folder": "INBOX",
        "useSsl": True, "maxFetch": 20, "maxUnreadFetch": 100,
        "marketingAction": "keep", "webSearchUrl": "https://mail.qq.com/", "enabled": True,
    })
    account.pop("password", None)
    if existing is None:
        accounts.append(account)
    args = service["ProgramArguments"]
    if "--env-file" in args:
        env_path = Path(args[args.index("--env-file") + 1])
        if not env_path.is_absolute():
            env_path = runtime / env_path
    else:
        env_path = runtime / ".mail.env"
        args.extend(["--env-file", str(env_path)])
    stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    for path in (plist_path, accounts_path, env_path):
        if path.exists():
            backup = path.with_name(path.name + ".before-qq-" + stamp)
            backup.write_bytes(path.read_bytes())
            backup.chmod(0o600)
    env_path.touch(mode=0o600, exist_ok=True)
    env_path.chmod(0o600)
    set_key(str(env_path), "QQ_MAIL_AUTH_CODE", code)
    service.setdefault("EnvironmentVariables", {}).pop("QQ_MAIL_AUTH_CODE", None)
    accounts_path.write_text(json.dumps(accounts, ensure_ascii=False, indent=2) + "\n")
    accounts_path.chmod(0o600)
    with plist_path.open("wb") as file:
        plistlib.dump(service, file)
    plist_path.chmod(0o600)
    target = f"gui/{os.getuid()}"
    subprocess.run(["launchctl", "bootout", target, str(plist_path)], check=False, capture_output=True)
    subprocess.run(["launchctl", "bootstrap", target, str(plist_path)], check=True)
    print("QQ 登录验证通过，已配置并重启本机 MyPage Agent。授权码仅保存在本机权限 600 的环境文件中。")
    print("未启用自动删信，未改动其他邮箱；请回到 MyPage 查看同步状态。")


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        print(f"配置未完成（{type(exc).__name__}），请保留终端并告诉助手；不要粘贴授权码。")
        sys.exit(1)
