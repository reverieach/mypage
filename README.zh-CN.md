# MyPage

[English](README.md)

MyPage 是一个个人用的 Chrome / Edge 起始页和新标签页工具。它不是在线 SaaS，也不是多人后台系统，而是围绕本机个人工作流设计的本地 dashboard。

它把壁纸式首页、搜索、可拖动组件、快捷链接、邮件摘要、通知、北邮作业、学校通知和本地配置备份放在同一个页面里。

## 功能

- 壁纸优先的起始页界面，支持图片、视频壁纸、本地视频封面和按时间随机壁纸。
- 搜索框支持切换搜索引擎。
- 小组件网格支持拖动、缩放、隐藏和恢复。
- Links 快捷入口支持本地缓存网站图标、文件夹式详情、排序、添加和删除。
- 邮件摘要和统一通知中心，配置 DeepSeek 后可辅助判断邮件重要性。
- 北邮作业组件显示未来 `0-3d` 内未完成作业。
- 北邮学校通知组件支持相关性筛选和手动隐藏。
- 配置由浏览器 `localStorage` 快速缓存，同时由本地 Agent SQLite 做可信备份和快照。
- 可构建成 Chrome / Edge 新标签页扩展。
- 本地 Agent 可直接托管生产页面，用作浏览器启动页。

## 架构

```txt
frontend/  Vite + React + TypeScript 前端
agent/     FastAPI 本地 Agent，只绑定 127.0.0.1:3217
docs/      架构、组件契约、消息管道、发布和运维文档
scripts/   Windows 构建、启动、停止、smoke test 等辅助脚本
```

前端不直接读取邮箱密码、本地 cookie、第三方 API key 或本地自动化文件。涉及隐私和本机文件的数据都通过本地 Agent 访问。

## 快速开始

安装并运行前端开发服务：

```powershell
cd frontend
npm install
npm run dev
```

打开：

```txt
http://127.0.0.1:5173/
```

安装并运行本地 Agent：

```powershell
cd agent
python -m venv .venv
.\.venv\Scripts\pip install -r requirements.txt
.\.venv\Scripts\uvicorn app.main:app --host 127.0.0.1 --port 3217
```

健康检查：

```powershell
Invoke-RestMethod http://127.0.0.1:3217/health
```

## 日常本地使用

构建前端，并让 Agent 托管生产页面：

```powershell
.\scripts\build-extension.ps1
.\scripts\start-agent.ps1
```

打开：

```txt
http://127.0.0.1:3217/
```

这个地址适合设置为浏览器启动页。新标签页需要使用扩展构建。

## Chrome / Edge 新标签页

构建：

```powershell
.\scripts\build-extension.ps1
```

然后把 `frontend/dist` 作为未打包扩展加载：

- Chrome: `chrome://extensions`
- Edge: `edge://extensions`

打开开发者模式，选择“加载已解压的扩展程序”，然后选择 `frontend/dist`。

## 和作业获取项目的关系

MyPage 不替代单独的作业获取项目。它只读取那个项目的本地状态文件，并且可以触发一次静默刷新。

默认情况下，Agent 会读取：

```txt
E:/作业获取项目/homework_db.json
```

可以用环境变量改路径：

```powershell
$env:HOMEWORK_PROJECT_DIR="D:\path\to\homework-project"
```

`POST /api/homework/refresh` 会调用作业项目的核心获取逻辑，但保持静默：只更新本地作业状态文件，不发送邮件、桌面通知、markdown、webhook、微信、PushPlus 或其他外部通知。

集成边界见 [docs/homework-integration.md](docs/homework-integration.md)。

## 隐私

这个仓库只应该包含源码和文档。本机运行数据已经被 Git 忽略。

不要提交：

- 真实 API key
- 邮箱应用密码或 OAuth token
- 门户 cookie
- 本地邮箱账号配置
- `agent/app/data/*.json`
- `agent/app/data/*.sqlite3`
- `agent/app/data/link-icons/`
- `agent/app/data/wallpapers/`
- `frontend/dist/`
- `release/`

公开模板文件：

- `agent/.env.example`
- `agent/mail_accounts.example.json`

## 验证

前端：

```powershell
cd frontend
npm run lint
npm run build
```

Agent：

```powershell
cd agent
python -m compileall app
```

Smoke test：

```powershell
.\scripts\smoke-test.ps1
```

## 文档

修改项目前建议先读：

- [AGENTS.md](AGENTS.md)
- [docs/architecture.md](docs/architecture.md)
- [docs/widget-contract.md](docs/widget-contract.md)
- [docs/message-pipeline.md](docs/message-pipeline.md)
- [docs/operations.md](docs/operations.md)
- [docs/extension.md](docs/extension.md)
- [docs/release-checklist.md](docs/release-checklist.md)
