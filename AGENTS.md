# AGENTS.md

本文件是给 Codex、Claude、Cursor 等代码 agent 的仓库内工作指南。修改本项目之前先读这里，再按需阅读 `docs/architecture.md`、`docs/widget-contract.md`、`docs/message-pipeline.md` 和 `docs/operations.md`。

## 项目定位

MyPage 是一个个人浏览器起始页 / 新标签页工具。它不是公开 SaaS，也不是多人后台系统，优先满足本机个人使用：

- 前端是 Apple 风格壁纸 + 毛玻璃组件网格。
- 组件可拖动、缩放、隐藏、从设置恢复。
- Links、搜索框、时间、作业、邮件、通知等组件服务于日常入口和本地信息汇总。
- Python Agent 只绑定 `127.0.0.1:3217`，负责读本地文件、跑本地脚本、接邮箱和统一通知管道。

## 仓库结构

- `frontend/`: Vite + React + TypeScript 前端。
- `agent/`: FastAPI 本地 Agent。
- `docs/`: 架构、组件契约、消息管道、运行维护文档。
- `assets/`: 静态或设计资源。
- `README.md`: 面向使用者的快速说明。

关键前端文件：

- `frontend/src/config/appConfig.ts`: 搜索引擎和所有组件的默认配置。
- `frontend/src/config/types.ts`: widget/config 类型。
- `frontend/src/store/useConfigStore.ts`: 壁纸、links、隐藏组件等用户配置，存在 `localStorage`。
- `frontend/src/store/useLayoutStore.ts`: 组件布局，存在 `localStorage`。
- `frontend/src/layout/defaultLayouts.ts`: 默认布局、布局归一化、从设置恢复组件时的追加布局。
- `frontend/src/layout/WidgetGrid.tsx`: draggable/resizable grid。
- `frontend/src/widgets/registry.tsx`: widget type 到组件实现的注册表。

关键 Agent 文件：

- `agent/app/main.py`: FastAPI app、CORS、后台 mail sync。
- `agent/app/api/widgets.py`: 所有 `/api/*` widget endpoint。
- `agent/app/services/cache.py`: Agent envelope 和 cache file 读取。
- `agent/app/services/message_pipeline.py`: 邮件采集、DeepSeek 分析、通知统一管道。
- `agent/app/services/homework.py`: 读取和静默刷新 `E:\作业获取项目` 的作业数据。
- `agent/app/services/school_notices.py`: 北邮通知读取、筛选、手动隐藏和刷新。
- `agent/app/services/user_config.py`: 用户配置的本地可信备份、快照和恢复。
- `agent/app/sample_data.py`: Agent 不可用或无 cache 时的样例数据。

## 安全和隐私规则

- 不要提交真实密钥、邮箱授权码、DeepSeek key、Microsoft token、作业平台凭据或本地 cookie。
- `agent/app/data/*.json`、`agent/app/data/*.sqlite3` 被 Git 忽略，通常包含本机状态或敏感数据，不要强行加入版本控制。
- `agent/app/data/mail_accounts.json` 是本机运行配置，不提交；公开模板是 `agent/mail_accounts.example.json`。
- 前端不能直接访问本地敏感文件、邮箱、自动化脚本或第三方 API 密钥；必须通过本地 Agent。
- 不要把用户粘贴过的 secret 写进文档、日志、提交信息或示例。
- 手动 homework refresh 必须是静默的：只能更新本地 `homework_db.json`，不能触发 email、desktop、markdown、wechat、pushplus、webhook 等通知渠道。

## 开发原则

- 优先保持“配置驱动 + 小组件”的结构。新增 widget 时先走 `appConfig`、`types`、`registry`、组件文件、Agent endpoint 这一条路径。
- 不要把工程化配置界面暴露给日常用户。设置页应偏使用体验：壁纸、links、组件显隐，而不是 raw JSON。
- 从设置恢复组件时必须追加到当前可见组件后面，并使用该组件默认的合理尺寸，不要让组件以最小块出现在主页。
- Widget 内部滚动条默认隐藏；如果内容可滚动，用 `scrollbar-none`。
- 组件打开详情、隐藏、关闭等交互要保持动画连贯。
- 主题系统暂时只保留接口，不做复杂主题切换实现。
- 对外部数据源保持降级：Agent 失败时返回 stale/error envelope，前端显示可用的错误或空状态，不要让整页崩溃。

## 邮件和通知规则

- QQ IMAP 是当前可用采集入口。
- Outlook 当前通过转发到 QQ 的方式识别来源，QQ 收到的转发邮件可显示为 Outlook。
- Outlook IMAP 基础认证不可依赖；Microsoft Graph/OAuth 代码存在，但当前不是默认路径。
- `DeepSeek` 用于新邮件重要性判断；没有 `DEEPSEEK_API_KEY` 时走本地关键词兜底。
- Mail 首页默认过滤低信号邮件、已读邮件、手动隐藏邮件。
- 通知中心只显示需要关注或重要的邮件通知。
- 邮件卡片和通知中的 mail 项可以 dismiss；dismiss 写入本地 SQLite。

## Homework 规则

- 读取窗口固定为 `0-3d` 未完成作业。
- 数据源是 `E:\作业获取项目\homework_db.json`，可通过 `HOMEWORK_PROJECT_DIR` 改路径。
- `POST /api/homework/refresh` 会立即运行一次静默同步：复用作业项目核心逻辑，保存 state，但跳过所有通知发送。
- 不要改 `E:\作业获取项目` 的代码，除非用户明确要求修改那个项目。

## Config Backup 规则

- 前端 `localStorage` 是快速缓存和离线兜底，不再是唯一真实数据。
- Agent 的 `agent/app/data/user_config.sqlite3` 是本机可信备份。
- 备份内容包括 links、壁纸、组件显隐、layout、便签和搜索引擎选择。
- 前端启动时由 `ConfigBackupSync` 比较本地和 Agent 更新时间，并做恢复或上传。
- 每次保存前 Agent 会保留快照，设置页 Backup tab 提供导出、导入和恢复最近快照。

## School Notices 规则

- 学校通知读取默认使用 `SCHOOL_NOTICE_URL` 指向的北邮通知列表。
- 不要把作业平台的 `E:\作业获取项目\valid_headers.json` 当成学校通知鉴权来源；那份文件是 ucloud/apiucloud 的 `blade-auth`/`authorization`，不能直接用于 `my.bupt.edu.cn`。
- 学校通知使用 `agent/app/data/school_portal_cookies.json` 保存 `my.bupt.edu.cn` 门户 Cookie。
- 门户 Cookie 缺失或过期时，当前实现会复用 `E:\作业获取项目` 的登录表单逻辑，通过 Playwright 登录门户并刷新 Cookie。
- 只显示近 2 天内和学生相关度较高的通知；低相关通知和手动 dismiss 通知应隐藏。
- 前端刷新只能拉取并更新本地 cache，不应触发任何外部通知。

## 验证

常规前端改动：

```powershell
cd frontend
npm run lint
npm run build
```

常规 Agent 改动：

```powershell
cd agent
python -m compileall app
```

本地启动：

```powershell
cd agent
.\.venv\Scripts\uvicorn app.main:app --host 127.0.0.1 --port 3217

cd frontend
npm run dev
```

常用接口 smoke test：

```powershell
Invoke-RestMethod http://127.0.0.1:3217/health
Invoke-RestMethod http://127.0.0.1:3217/api/config/load
Invoke-RestMethod http://127.0.0.1:3217/api/homework/due
Invoke-RestMethod -Method Post http://127.0.0.1:3217/api/homework/refresh
Invoke-RestMethod http://127.0.0.1:3217/api/school/notices
Invoke-RestMethod http://127.0.0.1:3217/api/mail/summary
Invoke-RestMethod http://127.0.0.1:3217/api/notifications
```

## Git

- 修改前看 `git status --short`。
- 不要 revert 用户未要求回滚的改动。
- 一组完整改动完成后可以本地 commit，提交信息保持小而清晰。
- 不要 push、pull、加 remote 或连接 GitHub，除非用户明确要求。
