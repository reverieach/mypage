# AGENTS.md

本文件是给 Codex、Claude、Cursor 等代码 agent 的仓库内工作指南。修改本项目之前先读这里，再按需阅读 `docs/architecture.md`、`docs/widget-contract.md`、`docs/message-pipeline.md`、`docs/homework-integration.md` 和 `docs/operations.md`。

## 项目定位

MyPage 是一个个人浏览器起始页 / 新标签页工具。它不是公开 SaaS，也不是多人后台系统，优先满足本机个人使用：

- 前端是 Apple 风格壁纸 + 毛玻璃组件网格。
- 组件可拖动、缩放、隐藏、从设置恢复。
- Links、搜索框、时间、作业、邮件、通知等组件服务于日常入口和本地信息汇总。
- Python Agent 只绑定 `127.0.0.1:3217`，负责读本地文件、跑本地脚本、接邮箱和统一通知管道。
- 可选 LAN Share 服务绑定 `0.0.0.0:3220`，只负责同局域网手机剪贴板文本和文件互传，不承载主 Agent 能力。

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
- `agent/app/services/course_schedule.py`: 固定课表读取和今日课程筛选。
- `agent/app/services/homework.py`: 读取和静默刷新 `E:\作业获取项目` 的作业数据。
- `agent/app/services/school_notices.py`: 北邮通知读取、筛选、手动隐藏和刷新。
- `agent/app/services/user_config.py`: 用户配置的本地可信备份、快照和恢复。
- `agent/app/services/weather.py`: Open-Meteo 天气读取、北京/北邮默认配置、本地缓存和出门建议。
- `agent/app/services/lan_share.py`: 局域网共享剪贴板和文件存储、PIN/token、LAN URL 发现。
- `agent/app/share_main.py`: 独立的手机端 Share FastAPI app，只暴露分享相关接口。
- `agent/app/sample_data.py`: Agent 不可用或无 cache 时的样例数据。

## 安全和隐私规则

- 不要提交真实密钥、邮箱授权码、DeepSeek key、Microsoft token、作业平台凭据或本地 cookie。
- `agent/app/data/*.json`、`agent/app/data/*.sqlite3` 被 Git 忽略，通常包含本机状态或敏感数据，不要强行加入版本控制。
- `agent/app/data/mail_accounts.json` 是本机运行配置，不提交；公开模板是 `agent/mail_accounts.example.json`。
- 前端不能直接访问本地敏感文件、邮箱、自动化脚本或第三方 API 密钥；必须通过本地 Agent。
- 不要把主 Agent 的 `3217` 改成 `0.0.0.0`。同局域网手机访问只允许走独立的 `3220` Share 服务。
- LAN Share 的 PIN、token、共享文本和上传文件属于本机运行数据，不要提交；默认目录是 `E:\MyPageShare`。
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
- Outlook 通过 Microsoft Graph/OAuth 直接采集，QQ 只采集自己的 IMAP 邮件；不要恢复“Outlook 转发到 QQ 后再猜测来源”的临时兼容层。
- Outlook 使用委托权限 `User.Read` 和 `Mail.ReadWrite`，不申请 `Mail.Send`。Graph 动作只允许标记已读和移动到 `deleteditems`，禁止永久删除。
- `DeepSeek` 用于新邮件重要性判断；没有 `DEEPSEEK_API_KEY` 时走本地关键词兜底。
- Mail 首页默认过滤低信号邮件、已读邮件、手动隐藏邮件。
- Mail 详情页可查看重点邮件和全部未读邮件；`filtered` 只表示被分类规则过滤的未读邮件，不包含历史已读或手动隐藏邮件。
- 通知中心只显示需要关注或重要的邮件通知。
- 邮件卡片和通知中的 mail 项可以 dismiss；dismiss 写入本地 SQLite。
- 手动 dismiss 只在 MyPage 内永久隐藏，不提供恢复，也不能改动远端邮箱。
- 可选营销清理必须由账户的 `marketingAction: "trash"` 显式启用，只允许在 AI 与本地确定性规则一致且未命中计费、安全、账号或服务变更保护规则时，通过 IMAP UID 移入垃圾箱；禁止 `EXPUNGE`。

## Homework 规则

- 读取窗口固定为 `0-3d` 未完成作业。
- 数据源是 `E:\作业获取项目\homework_db.json`，可通过 `HOMEWORK_PROJECT_DIR` 改路径。
- `POST /api/homework/refresh` 会立即运行一次静默同步：复用作业项目核心逻辑，保存 state，但跳过所有通知发送。
- 不要改 `E:\作业获取项目` 的代码，除非用户明确要求修改那个项目。

## Course Schedule 规则

- Today 组件读取固定学期课表，不接学校在线刷新。
- 本地课表文件是 `agent/app/data/course_schedule.json`，属于个人数据，不提交 Git。
- `term.startDate` 是第 1 周周一；Agent 按北京时间计算当前周次、当天星期和课程状态。
- `/api/school/today` 应返回今天课程、当前课程、下一节课和 `dayStatus`，不要返回样例课程误导用户。
- 下学期只需要替换本地 `course_schedule.json`，除非数据结构变化，否则不用改前端。

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
- `school_portal_cookies.json` 同时保存认证元数据：`capturedAt`、`lastValidatedAt`、`lastFailureType` 和本地会话健康窗口。BUPT 的 `JSESSIONID` 通常是 session cookie，没有可靠过期时间，所以 Agent 会按本地窗口主动刷新。
- 门户 Cookie 缺失、过旧或被 CAS/login 页面拒绝时，当前实现会复用 `E:\作业获取项目` 的登录表单逻辑，通过 Playwright 登录门户并刷新 Cookie，然后重试一次。
- `GET /api/school/notices/status` 用于诊断认证状态、上次刷新、上次失败类型和缓存数量，不应触发刷新。
- 学校通知刷新失败时保留 SQLite 中最近一次成功数据，返回 `stale=true` 和 `lastErrorType`，不要退回样例数据掩盖问题。
- 只显示近 2 天内和学生相关度较高的通知；低相关通知和手动 dismiss 通知应隐藏。
- 前端刷新只能拉取并更新本地 cache，不应触发任何外部通知。

## Weather 规则

- 天气组件默认服务北京/北邮场景，第一数据源是 Open-Meteo。
- 前端不要直接请求天气 API；必须通过本地 Agent 的 `/api/weather/summary` 和 `/api/weather/refresh`。
- `agent/app/data/weather_cache.json` 是天气缓存，默认 30 分钟 TTL；外部请求失败但缓存存在时返回缓存。
- `agent/app/data/weather_settings.json` 保存地点、阈值和 TTL；未来新增 provider key 时不能提交到 Git。
- 首页天气应优先显示出门决策信息：当前温度、体感、未来数小时降雨概率、风、湿度和一句建议，而不是堆完整天气表。

## LAN Share 规则

- `share.lan` widget 通过主 Agent 的 `/api/share/status` 读取 PIN、LAN URL 和最近共享项。
- 手机端只访问 `http://<LAN-IP>:3220/share`，先用 6 位 PIN 换 bearer token。
- `agent/app/share_main.py` 不应暴露邮箱、作业、配置备份、学校通知等主 Agent API。
- 手机上传文件默认保存到 `E:\MyPageShare\files`，共享记录存在 `E:\MyPageShare\lan_share.sqlite3`。
- 如果要修改安全策略，优先保持“主 Agent 本机私有，Share 服务最小暴露面”的架构。

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
Invoke-RestMethod http://127.0.0.1:3217/api/share/status
Invoke-RestMethod http://127.0.0.1:3220/api/share/status
```

## Git

- 修改前看 `git status --short`。
- 不要 revert 用户未要求回滚的改动。
- 一组完整改动完成后可以本地 commit，提交信息保持小而清晰。
- 不要 push、pull、加 remote 或连接 GitHub，除非用户明确要求。
