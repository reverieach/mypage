# MyPage Share：统一网页与主页组件

手机、Mac、Windows 都访问 `https://share.reverieach.com`。MyPage 的 Share 组件默认内嵌同一个页面；不需要额外打开浏览器标签页。原来的 LAN Share 保留在「原局域网共享」页签，旧数据不会自动上传。

## 当前上线状态（2026-10-16）

- 代码、主页内嵌入口和简单独立页面已实现；ECS 的独立服务已安装。原 rhine 服务保持运行，主 Agent 未对公网开放。
- **HTTPS 已配置**：通过手动 DNS-01 签发 Share 专属证书，Nginx 已安装；到期时间为 2027-01-13 22:12:01（北京时间）。内置浏览器已正常打开 HTTPS 配对页，无证书警告；服务器 TLS `/health` 为 200，未认证 API 为 401，Rhine HTTPS 仍为 200。
- **备案仍是独立验收条件**：此前 HTTP 实测为阿里云“备案阻断页”，HTTP-01 验证收到 403。现在 HTTPS 某一路径能打开不代表备案完成或所有运营商稳定可达。按用户要求，正式手机/Mac/Windows 联测留到备案通过后，不绕过证书警告。
- **续期待完成**：当前是手动 DNS 验证，不会自动续期。备案放行后按下方步骤切换 nginx HTTP-01 并验证自动续期；若届时仍不通，需要在到期前人工 DNS 续期。未创建阿里云 AccessKey 或扩大 DNS 权限。
- 生产 API 拒绝明文 HTTP 配对/收发；未启用 HTTPS 时网页禁用配对。
- 已通过：后端、客户端协议及 LAN STUN 回归测试，前端 lint/build；此前本机两个网页上下文的自动转云、上传、离线领取、下载 SHA-256 一致。用户已确认手机与 Mac 的云链路可用。
- **已定位并修复本机可复现的 VPN 候选地址问题**：默认 mDNS 地址对应 VPN 虚拟接口，探测有请求但无响应。仅增加 `.local` Fake-IP 排除仍不足；使用物理 LAN 地址上的本地 STUN 后，标准 WebRTC 能建立直连，无需改写 SDP、关闭 VPN/TUN 或重启内核。该结果为同机浏览器对照，不能代替真实手机/Windows 的跨设备 LAN 验收。
- 本机真实浏览器已通过 64 MiB 分块落盘、主动断线后从已确认位置续传（约 1.5 MiB），以及 2 GiB 传输落盘（约 140 秒），最终均逐字节校验，测试临时文件已删除。此测试仅走本机，未使用云服务器传输文件。手机/Windows 大文件落盘能力和实际 LAN 链路仍须各自验收。

阿里云关于备案/接入与访问的说明：[备案期间对网站访问的影响](https://help.aliyun.com/zh/icp-filing/the-influence-of-the-record-during-the-site-visit)。备案通过后继续做网络验收与续期验证，不需要重写客户端。

## 首版边界（重要）

- 图片卡片沿用旧 LAN 组件的缩略图布局，提供「保存图片」「复制图片」；旧 LAN 组件未改动。PNG/JPEG/WebP/GIF/AVIF/BMP 按文件扩展名识别并由浏览器解码，其他格式（如 HEIC）保留原文件下载。复制写入 PNG 图片而不是链接，动图复制为静态图片；浏览器不支持或拒绝剪贴板时明确提示保存原图，不降低安全设置。
- 预览在客户端生成，需要下载原图，也计入云流量；8 MiB 以内自动加载，更大的图片点击加载。本页图片缓存上限 64 MiB，定时刷新、复制及保存复用缓存，手动重载整个页面后会重新下载；超过缓存上限或 32M 像素复制限制时仍可保存原文件。
- 两端页面在线时，自动尝试 WebRTC DataChannel 直连；约 12 秒内无法建立则走 HTTPS 云暂存。
- 更新后的 MyPage 组件从本机 Agent 获取 LAN STUN 地址，再通过校验来源的 `postMessage` 交给内嵌网页。原 Share 服务在物理私网 IPv4 上提供 UDP 3220 地址探测，每个接口每秒最多 30 个响应，只返回请求者地址、不接收文件、不做 TURN。没有公网 STUN/TURN；不同网络通常走云端，不承诺跨 NAT 打洞。
- VPN 环境下电脑优先使用主页组件，且主 Agent 和原 LAN Share 都需运行。独立网址不自动访问本机 Agent，因此不自动获得 LAN 辅助；手机仍只打开固定 Share 网址。若手机自身 VPN 也阻断 LAN，需单独诊断，不能保证所有 VPN 策略都能绕过。
- 可选择「仅直连」「仅云端」。WebRTC 通道建立成功不等于确认同一个 Wi-Fi，界面统一标注「设备直连」。
- 云端暂存支持接收端离线，之后打开页面手动领取。不是常驻 Agent 自动接收版，也不自动同步所有文件。
- MyPage 组件切换到旧 LAN 页签仍保留 iframe；关闭主页、隐藏整个组件、休眠、手机锁屏或浏览器冻结页面可能失去直连能力。
- 直连单文件最大 2 GiB，云端仍为 200 MiB。直传按 256 KiB 分块、16 KiB 帧发送，每块 SHA-256 校验并等待接收确认，接收端优先写浏览器私有文件系统（OPFS），不把整个文件留在内存。空间不足直接拒绝；暂存空间预检需约文件大小的两倍。无可写 OPFS 时仅支持 32 MiB，内存总额 64 MiB。请在目标手机浏览器实测，不假定所有 iOS 版本支持大文件落盘。
- 直传中断自动尝试重连，最多三次；仍失败可点「继续直传」，从已确认分块继续。两端页面均须保留，接收端未完成状态闲置 10 分钟清理；不支持刷新、浏览器退出、跨页面重新选择文件后的持久续传。完整文件也须点击保存到文件夹；OPFS 不是用户下载目录，残留临时文件在下次访问时清理超过 24 小时的本服务文件。
- 超过 200 MiB 的文件直连失败时明确拒绝转云；已开始传输的文件也不自动重传云端，避免重复和流量消耗。云端联测只使用短文字/小文件，不做 GB 级流量测试。
- 手机浏览器和桌面浏览器可能限制后台运行、下载和第三方存储。组件与独立网页可能使用不同存储分区，需要分别配对，建议设备命名为「Mac·主页」「Windows·主页」等。无需关闭浏览器安全保护。

## 安全边界

云端只部署 `share/`，没有邮件、学校登录、配置备份或本地 Agent API；主 Agent 始终绑定 `127.0.0.1:3217`，LAN 服务 3220 不对公网开放。

- 第一次由服务器管理员生成 16 位随机、10 分钟有效、单次使用的配对码。已经配对的设备可生成新码，最多 20 台设备。
- 每台设备有独立随机凭证，90 天有效。云端只保存凭证哈希；浏览器保存自己的凭证。不要提交、截图公开或在 URL 中携带凭证。
- 所有配对设备属于同一私人信任组，可互相发送、邀请新设备；不是面向陌生人的多租户产品。
- 只有发送端和接收端能读取/删除某条云内容。服务器管理员仍能读取云端磁盘文件：HTTPS 并非端到端加密。
- 云端文件 24 小时自动删除，默认总空间 2 GiB，最多 1000 条。元数据和未完成上传也计入配额。
- 应用默认每月文件下载预算 15 GiB（北京时间月初重置）。重复/中断下载也保守预扣全文件大小。不是全账号账单计量：页面、信令、其他服务、网络开销仍消耗云流量，不能保证阿里云绝不扣费。
- 单 worker 运行：在线连接表在内存中；服务重启会断开信令，但不丢失数据库与完整云文件。
- nginx 限制配对尝试、API 频率和请求体，后端再次验证凭证、配额、大小。应保留正常的服务器安全维护，不适合匿名公开上传。

## 部署（Ubuntu / 已有 nginx）

先确认主域名备案/接入要求、DNS 指向、服务器磁盘和 80/443。不要改其他站点，不要新开主 Agent 端口。

```bash
# 在审阅过的仓库副本中执行；需要 python3-venv、nginx、certbot。
sudo bash share/deploy/install.sh
# 使用现有 ACME 账号；若要求新协议/账户确认，交给用户，不擅自接受。
sudo certbot --nginx -d share.reverieach.com --redirect --non-interactive
curl --fail https://share.reverieach.com/health
```

安装位置：`/opt/mypage-share`；私有数据：`/var/lib/mypage-share`；服务：`mypage-share.service`；后端只监听 `127.0.0.1:3230`。安装脚本再次运行不会覆盖已经签发证书的 nginx 配置。修改部署模板后需要管理员审阅差异，不会自动覆盖线上设置。

### 当前证书的续期交接

DNS-01 使用 `_acme-challenge.share` TXT 验证，证书已经安装；不要重新覆盖 Nginx 或读取/复制私钥。手动验证没有自动续期能力，现有 `certbot.timer` 也不能替代验证。

备案通过、HTTP 挑战路径正常可达后，使用 Certbot 2.3+ 的 `reconfigure` 测试新验证方式；只有测试成功才保存续期参数：

```bash
sudo certbot reconfigure --cert-name share.reverieach.com --authenticator nginx --preferred-challenges http --non-interactive
sudo certbot renew --cert-name share.reverieach.com --dry-run
sudo systemctl status certbot.timer --no-pager
```

若失败，保留当前有效证书，不连续强制签发。必要时在到期前重新执行手动 DNS 签发命令，按新挑战值更新 TXT 并核对公开 DNS，然后安装证书；不得复用旧挑战值。自动 DNS 续期需要额外的最小权限授权，不能擅自创建管理密钥。参考：[Certbot 续期配置说明](https://eff-certbot.readthedocs.io/en/stable/using.html#modifying-the-renewal-configuration-of-existing-certificates)。

### 直连排障与备案后验收

1. 两端刷新网页并选择「仅直连」，确保目标显示在线；复制失败诊断即可，不必提供凭证或 SDP 原文。
2. 「未应答/远端候选 0」先查 WebSocket、接收页状态和浏览器权限；「已应答、有候选但请求多/响应 0」重点查本机/路由器的 UDP、mDNS、VPN 路由及访客网络隔离。
3. 有需要时由用户检查 macOS/手机的本地网络授权及浏览器站点权限；任何权限变更、VPN 规则调整单独确认，不以关闭安全保护作为修复。
4. 用实际手机和 Mac 同一 Wi-Fi 测直连、校验文件，再测手机移动网络与 Windows 云暂存。单机两页测试或模拟协议测试不能代替真实 LAN 验收。
5. 电脑组件应显示「局域网辅助已连接」。检查 `http://127.0.0.1:3220/api/share/stun` 是否有 RFC1918 私网地址，主 Agent 的 `/api/share/status` 是否含 `stunUrls`。缺失时先检查 Share 服务、网卡与端口，不先改 VPN。
6. Windows 必要时仅允许该 Share 程序的 UDP 3220、Private 配置文件、LocalSubnet 入站（需用户确认）；不开放 Public、路由器端口转发或云安全组。主 Agent 永远为 127.0.0.1:3217。公共/访客 Wi-Fi 客户端隔离仍可能阻断直连。
7. Mac 已经确认本地网络权限开启；用户批准后仅在 Clash 现有全局脚本追加 `+.local` 到 Fake-IP 排除，并热加载订阅，未重启内核。但这不是充分修复。Windows 不照搬 Mac 路径或覆盖配置；只有证据显示 `.local` 被 Fake-IP 接管且获得授权时才合并规则，不关闭 VPN/TUN、换节点或重启内核。
8. 连接失败前且不超过 200 MiB 可自动转云；传输中断只重试直连。大文件只在确认本地直连后测试，不消耗云流量。

初次配对（输出为临时敏感信息，不要复制进 issue 或提交）：

```bash
sudo -u mypage-share env SHARE_DATA_DIR=/var/lib/mypage-share /opt/mypage-share/.venv/bin/python /opt/mypage-share/server.py invite
```

查看/撤销设备：

```bash
sudo -u mypage-share env SHARE_DATA_DIR=/var/lib/mypage-share /opt/mypage-share/.venv/bin/python /opt/mypage-share/server.py devices
sudo -u mypage-share env SHARE_DATA_DIR=/var/lib/mypage-share /opt/mypage-share/.venv/bin/python /opt/mypage-share/server.py revoke DEVICE_ID
```

撤销后 API 立即失效，信令在下一条消息/心跳失效。大文件直连不再使用 3 分钟总时限，改为 60 秒无数据/确认超时；已建立的点对点数据通道不能依赖云端即时撤回，需要立即停止时同时关闭相关客户端页面。

更新：先测试，再更新受控 checkout，重跑安装脚本。回滚到上一个已知正常的代码版本后重跑脚本；保留 `/var/lib/mypage-share`，不要删除用户文件。

## 开发验证

```bash
python -m pip install -r share/requirements-test.txt
python -m unittest share.test_server -v
node --check share/web/app.js
node --test share/test_client.mjs
cd frontend
npm run lint
npm run build
```

本地预览使用独立临时数据目录，不读写线上数据：

```bash
SHARE_DATA_DIR=/tmp/mypage-share-test SHARE_ORIGIN=http://127.0.0.1:3230 python -m uvicorn share.server:app --host 127.0.0.1 --port 3230
```

验收清单：未配对不能读取内容；配对码不能复用；第三台设备不能访问不是发给自己的文件；强制云端往返内容一致；直连收发 SHA-256 一致；局域网不可达时自动云端；云配额耗尽拒绝下载；主 Agent API 在云端返回 404；真实手机分别用 Wi-Fi / 移动网络测试；Windows 更新后在实际主页 iframe 中配对并测试，不用降低浏览器安全设置。
