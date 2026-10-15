# MyPage Share：统一网页与主页组件

手机、Mac、Windows 都访问 `https://share.reverieach.com`。MyPage 的 Share 组件默认内嵌同一个页面；不需要额外打开浏览器标签页。原来的 LAN Share 保留在「原局域网共享」页签，旧数据不会自动上传。

## 首版边界（重要）

- 两端页面在线时，自动尝试 WebRTC DataChannel 直连；约 12 秒内无法建立则走 HTTPS 云暂存。
- 当前只收集 host ICE candidates，没有配置 STUN / TURN；重点覆盖同一可互通局域网。不同网络通常走云端，不承诺跨 NAT 打洞。
- 可选择「仅直连」「仅云端」。WebRTC 通道建立成功不等于确认同一个 Wi-Fi，界面统一标注「设备直连」。
- 云端暂存支持接收端离线，之后打开页面手动领取。不是常驻 Agent 自动接收版，也不自动同步所有文件。
- MyPage 组件切换到旧 LAN 页签仍保留 iframe；关闭主页、隐藏整个组件、休眠、手机锁屏或浏览器冻结页面可能失去直连能力。
- 直连最大 32 MiB，云端最大 200 MiB。浏览器直连接收内容暂存在内存，刷新后不保留，必须点击保存。大于 32 MiB 自动选择云端（仅直连模式会提示）。
- 传输途中断线不会静默重新上传云端；用户重新选择文件重试。首版不实现断点续传。
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

初次配对（输出为临时敏感信息，不要复制进 issue 或提交）：

```bash
sudo -u mypage-share env SHARE_DATA_DIR=/var/lib/mypage-share /opt/mypage-share/.venv/bin/python /opt/mypage-share/server.py invite
```

查看/撤销设备：

```bash
sudo -u mypage-share env SHARE_DATA_DIR=/var/lib/mypage-share /opt/mypage-share/.venv/bin/python /opt/mypage-share/server.py devices
sudo -u mypage-share env SHARE_DATA_DIR=/var/lib/mypage-share /opt/mypage-share/.venv/bin/python /opt/mypage-share/server.py revoke DEVICE_ID
```

撤销后 API 立即失效，信令在下一条消息/心跳失效；已有直连会话最长 3 分钟自动关闭。需要即时结束已建立直连时请同时关闭相关客户端页面。

更新：先测试，再更新受控 checkout，重跑安装脚本。回滚到上一个已知正常的代码版本后重跑脚本；保留 `/var/lib/mypage-share`，不要删除用户文件。

## 开发验证

```bash
python -m pip install -r share/requirements-test.txt
python -m unittest share.test_server -v
node --check share/web/app.js
cd frontend
npm run lint
npm run build
```

本地预览使用独立临时数据目录，不读写线上数据：

```bash
SHARE_DATA_DIR=/tmp/mypage-share-test SHARE_ORIGIN=http://127.0.0.1:3230 python -m uvicorn share.server:app --host 127.0.0.1 --port 3230
```

验收清单：未配对不能读取内容；配对码不能复用；第三台设备不能访问不是发给自己的文件；强制云端往返内容一致；直连收发 SHA-256 一致；局域网不可达时自动云端；云配额耗尽拒绝下载；主 Agent API 在云端返回 404；真实手机分别用 Wi-Fi / 移动网络测试；Windows 更新后在实际主页 iframe 中配对并测试，不用降低浏览器安全设置。
