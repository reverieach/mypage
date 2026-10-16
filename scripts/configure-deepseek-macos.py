"""Hidden-input setup for DeepSeek in the existing local MyPage mail service."""
import getpass
import json
import os
from pathlib import Path
import plistlib
import subprocess
import sys
import urllib.error
import urllib.request

from dotenv import set_key


def main():
    if sys.platform != "darwin" or not sys.stdin.isatty():
        raise SystemExit("请在 Mac 终端运行；Key 将隐藏输入。")
    os.umask(0o077)
    runtime = Path.home() / "Library/Application Support/MyPage/agent"
    plist_path = Path.home() / "Library/LaunchAgents/com.reverieach.mypage.agent.plist"
    with plist_path.open("rb") as file:
        service = plistlib.load(file)
    args = service["ProgramArguments"]
    if Path(service["WorkingDirectory"]) != runtime or "--env-file" not in args:
        raise SystemExit("请先完成本机 QQ 配置，再接入 DeepSeek。")
    env_path = Path(args[args.index("--env-file") + 1])
    if not env_path.is_absolute():
        env_path = runtime / env_path
    names = ("DEEPSEEK_API_KEY", "DEEPSEEK_BASE_URL", "DEEPSEEK_MODEL")
    if any(service.get("EnvironmentVariables", {}).get(name) for name in names):
        raise SystemExit("启动项已有 DeepSeek 环境变量，请先核对，未覆盖。")
    key = getpass.getpass("DeepSeek API Key（隐藏输入）：").strip()
    if not key or any(char.isspace() for char in key):
        raise SystemExit("Key 为空或含空白，未保存。")
    request = urllib.request.Request("https://api.deepseek.com/models", headers={"Authorization": f"Bearer {key}"})
    with urllib.request.urlopen(request, timeout=20) as response:
        models = {item["id"] for item in json.load(response)["data"]}
    model = next((name for name in ("deepseek-flash", "deepseek-v4-flash", "deepseek-chat") if name in models), None)
    if not model:
        raise SystemExit("未找到预期的轻量模型，未保存 Key。")
    env_path.chmod(0o600)
    set_key(str(env_path), "DEEPSEEK_API_KEY", key)
    set_key(str(env_path), "DEEPSEEK_BASE_URL", "https://api.deepseek.com")
    set_key(str(env_path), "DEEPSEEK_MODEL", model)
    subprocess.run(["launchctl", "kickstart", "-k", f"gui/{os.getuid()}/com.reverieach.mypage.agent"], check=True)
    print(f"Key 验证通过，已保存到本机私有环境文件并重启 Agent。模型：{model}")
    print("Key 未输出、未写入仓库。请继续核对真实邮件是否完成 AI 总结。")


if __name__ == "__main__":
    try:
        main()
    except urllib.error.HTTPError as exc:
        print(f"DeepSeek 验证失败（HTTP {exc.code}），未输出凭据。")
        sys.exit(1)
    except Exception as exc:
        print(f"配置未完成（{type(exc).__name__}），未输出凭据。")
        sys.exit(1)
