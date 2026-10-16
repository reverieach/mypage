# 给 Windows 助手的更新提示词

把以下内容交给家里 Windows 上的代码助手：

---

请更新我本机的 MyPage：仓库 https://github.com/reverieach/mypage ，默认分支 master。我授权你获取该仓库更新、安装项目依赖、构建并重启本机 MyPage，但不要改动其他项目、不要重新部署云服务器，也不要推送本机个人配置。

先阅读仓库 AGENTS.md 和 docs/share-cloud.md。使用现有 MyPage 目录，不要另建一份导致扩展路径变化。先检查 git status、当前分支及启动脚本，保留所有本地修改、agent/app/data、.env、壁纸、邮箱凭证和 E:\MyPageShare；不要 reset --hard / clean / 覆盖个人数据。工作区干净且 master 可快进时 git pull --ff-only；有冲突或分叉先说明情况。

先核对 docs/share-cloud.md 的“当前上线状态”：HTTPS 已安装，证书有效至 2027-01-13，手机和 Mac 的云链路用户已确认可用；备案完成情况仍需另行核对，不因一次能访问就认为备案完成。证书当前手动续期，由服务器维护任务处理，不在 Windows 改云配置。不要绕过证书警告、关闭安全设置或重新部署云服务器。

这次新增的是私人三端传输：手机、Mac、Windows 都可以互相发送文件/文字。云端入口为 https://share.reverieach.com。主页 Share 组件的「跨设备」页签内嵌网页；「原局域网共享」保留旧功能。直连要求两端页面保持打开，连接失败走云暂存；关闭页面后不做 Agent 自动后台接收。无需安装 share/requirements.txt 到 Windows Agent，也无需在 Windows 上启动云服务。

在 frontend 中安装依赖，运行 npm run lint 和 npm run build。若 npm ci 因现有 lockfile 与 package.json 不一致失败，不要乱改依赖版本，可使用 npm install --no-package-lock，并记录该问题。运行 node --test share/test_client.mjs，以及在 agent 中用现有虚拟环境运行 python -m unittest test_lan_stun -v、python -m compileall app。使用原 scripts/restart-agent.ps1 和 scripts/restart-share.ps1 重启两个 MyPage 服务，确认实际运行路径是更新后的代码。主 Agent 仍只监听 127.0.0.1:3217；Share 原 TCP 3220 保留，新增 UDP 3220 仅绑定物理私网 IPv4。不要改变邮箱、学校通知等其他配置，不要开放公网 3217/3220。

本次 VPN 修复采用原 Share 服务做局域网地址辅助，不中转文件：GET http://127.0.0.1:3220/api/share/stun 应返回本机私网 stun:地址:3220，主 Agent /api/share/status 应含 stunUrls。主页组件显示「局域网辅助已连接」。仅打开独立 Share 网页不会自动取得此辅助，所以有 VPN 的电脑优先使用 MyPage 组件；手机仍访问同一个 HTTPS 网址。

VPN 必须保持开启，不得直接关闭 VPN/TUN、换节点或重启内核。Mac 已证实浏览器默认候选落到 VPN 虚拟网卡，本地 STUN 能提供可达的物理 LAN 候选；仅排除 .local Fake-IP 不足以解决。Windows 先测辅助服务和网卡选择，不照搬 Mac IP、路径或整份配置。若确有 .local 被 Fake-IP 接管的证据，可向用户申请只合并 +.local 排除，保留其他规则；需要内核重启必须停下来。Windows 防火墙若拦截辅助 UDP，向用户申请仅给实际 Share Python 程序放行 UDP 3220、Private 配置文件、LocalSubnet 来源；不要关闭防火墙或对 Public/所有来源放行。路由器 AP 隔离和手机 VPN 需单独排查。

找到 Edge 中当前使用的 MyPage 已解压扩展，确认路径仍为此仓库 frontend/dist，然后重新加载扩展并打开新标签页。保留原链接、壁纸、布局和便签。默认跨设备页应显示配对界面。让用户在已配对的手机/Mac 点击「添加设备」生成临时配对码，由用户输入到 Windows 主页组件，设备名建议「家里 Windows·主页」。不要使用旧 LAN 六位 PIN；不要把配对码或凭证写入仓库/日志。独立网页与扩展 iframe 可能分区存储，需要分别配对，优先使用主页组件完成配对。

外观与迁移：跨设备 iframe 必须保留 `?embed=1`，并使用透明背景；页面的 html/body 都透明，内部不再重复叠加毛玻璃，外层统一由 MyPage WidgetShell 控制。不要复制独立网页的深色背景到组件，也不要按本机壁纸硬编码颜色/透明度。`share/web/style.css` 的 embed 规则随仓库迁移，独立手机网页保留自己的背景。若仍出现黑色内框，先刷新主页/云端页面、确认部署了同一版本的 style.css 与 index.html，不清空 localStorage、不重新配对、不覆盖用户壁纸/布局来解决样式问题。迁移验收应同时检查深浅壁纸、窄宽组件、无横向溢出与隐藏滚动条；配对凭证不随配置备份复制到另一台电脑，新设备走首次配对。

验收：
1. https://share.reverieach.com/health 显示 service=mypage-share，网页无证书警告。
2. MyPage 主页中可选择 Mac/手机为接收设备。
3. 先选择「仅云端」，发送一段无敏感信息的测试文字和小文件给 Mac；由接收方确认内容。反向再测一次。
4. 同一局域网且两端页面打开时，先用「仅直连」发送短文字、小图片，核对收到内容与图片缩略图、保存/复制按钮。不是同一网络就只验证云端，不宣称已验证 LAN。失败时记录不含 IP/凭证的 ICE 诊断，区分未应答、无候选与探测无响应。任何权限/网络策略变更先确认。
5. 关闭接收端页面后云端发送仍成功，再打开接收端能领取。
6. 原 LAN 页签以及原网站、壁纸、布局不受影响。

注意：直连上限现为 2 GiB、云端仍为 200 MiB。接收浏览器需可写 OPFS 和足够空间（预检约两倍文件大小）；不支持落盘时安全退回 32 MiB 上限，不把 GB 文件全读进内存。每块校验，断线自动重连最多三次，之后可点「继续直传」；两端须保持原页面，接收端未完成状态闲置 10 分钟清理。不支持刷新/退出浏览器后的持久续传。直连大于 200 MiB 或已经开始传输时失败，不自动上传云端。云文件 24 小时过期，直连接收完成后需点保存。

不要用服务器流量做大文件测试：云端只传短文字和小文件，链路检查通过即可。用户想测大文件时只在「仅直连」且明确建立本地通道后进行。手机后台/锁屏及电脑休眠可能中断；Mac 同机实测不代替 Windows 或手机真实联测，任何未实测平台/通道必须明确标注。

配对仅首次需要；此浏览器记住设备90天，不要求每次输入。不要使用无痕窗口或清除站点数据，否则需要重新配对。

完成后告诉我更新到的提交、扩展路径、测试结果和仍需用户配合的步骤。
