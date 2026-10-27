# @dsh-community/dsh-share

DSH Web 外置插件「会话分享」:ChatGPT/Claude 式分享。在每条助手消息的操作栏加入「分享」菜单:

- 任意菜单项先弹出**按轮勾选**的消息选择框:一轮 = 一条用户消息 + 该轮 agent 的全部输出,整选整不选。
- 一轮里的多条 agent 输出合并进**一个 AI 气泡**:连续的思考/工具步骤折叠为「思考 ×k · 调用工具 ×N」标注行(图标取自 DSH 官方 IconThinkOutlineRegular / IconEditOutlineRegular,单色 currentColor),中间文本轮以小字过程呈现,最终回答完整渲染;图片块只显示缩略图。
- **复制分享链接** — 把选中消息渲染成**完整只读会话页** `GET /share/<token>`:对话按轮呈现,思考过程可点开(原生 details),工具调用带名称/状态、结果可展开,图片内联缩略图;免登录,token 即能力凭证;删除 `~/.dsh/shares/<token>.html` 即撤销(也可 `DELETE /api/session.share?token=`,仅登录态)。无侧边栏、不能继续对话,但轨迹完整保留。
- **复制 Markdown / 导出 Markdown** — 选中消息的有序记录(图片块在导出文件中内联为 data URI)。
- **导出长图** — 离屏渲染分享文档(480px 手机宽度),SVG foreignObject 光栅化为 PNG;iOS 画布 16,777,216px 上限自动降倍率,仍超限则提示;移动端回退 `navigator.share`。

分享页整体移植 DSH 暗色主题(token 值取自 ui-theme design-platform.css:bg-base #151517、用户气泡 #2c2c2e、layer-1 卡片、三级 label、deepseek 蓝),思考/工具行复刻 DisclosureRow/ReasoningRow 度量(24px 三级文字行、16px 图标位 + 6px 间距、展开体 22px 缩进),并在分享时把应用内 MarkdownText 的真实 CSS 规则与主题变量抽取内嵌——代码高亮、表格、链接与 GUI 完全一致;480px 宽适合手机。reasoning 不自动展开,点开才看。公开分享页自带「保存为图片」按钮(手机可用),与导出长图同一套光栅化逻辑。

## Host 路由

| 路由 | 鉴权 | 说明 |
| --- | --- | --- |
payload 中每条 assistant 消息另带 `thoughts`(思考全文,单条上限 20k 字,含在 2MB 总预算内,截断处补省略号)与 `tools`(`tool/call`+`tool/result` 按 callId 配对:名称、完成状态、400 字结果摘要,每条消息最多 24 个)。

| `GET /api/session.share.content?sessionId=` | 浏览器会话 | `sessionQuery.observeSession` 提取 `surfaceOp==='append'` 的有序消息 JSON(首条用户消息截断 60 字为 title;界限 200 条 / 2MB 文本,超出置 `truncated`;仅 text/image/file 块(reasoning 不落正文,仅汇总为思考标注);user/message 仅取 `source.kind === 'user'` 的真实人类输入,运行时上下文/时间/技能目录/审批策略/注入指令等上下文消息不进入分享) |
| `GET /api/session.share.media?attachmentId=…&mediaType=…&bytes=…&width=…&height=…` | 浏览器会话 | `attachments.readImage` 精确字节;attachmentId 严格校验 `^sha256:[a-f0-9]{64}$` |
| `POST /api/session.share.create` | 浏览器会话 | `{title, html}`(≤5MB)→ 写 `<root>/<token>.html`,返回 `{path:"/share/<token>"}` |
| `DELETE /api/session.share?token=` | 浏览器会话 | 撤销分享 |
| `GET/HEAD /share/<token>` | **公开** | 命名 webServer 路由,优先于 SPA fallback、不经会话鉴权;token 校验 `^[A-Za-z0-9_-]{24}$`,畸形一律 404;`no-store` + `noindex` + 沙箱 CSP |

所有错误应答均为纯文本,不回显内部错误。运行时零 npm 依赖(仅 `node:` 内置模块)。

## 公网托管与中继

任意插件用户(0.2.1+)生成分享链接时,浏览器会把快照 HTML 直接上传到 `publicOrigin` 指向的**公开中继**(`POST {publicOrigin}/share-upload`,CORS 放开),链接由中继直接提供——朋友无需公网入口、无需 frp,复制链接即可打开。中继不可达时自动回退本机快照(旧行为)。

参考实现(零依赖 node:http,systemd + nginx):`POST /share-upload` 生成 token 存盘(5MB 上限、每 IP 限流、必须是含 `<html>` 的文档);`GET /share/<token>` 沙箱 CSP 提供页面;未命中可回退属主隧道兼容旧链接。仓库默认 `publicOrigin: 'https://windgraham.art'`,部署自己的中继后改 patch 配置即可。

## 安装

推荐用 DSH 插件管理器安装(自动处理 profile 登记与依赖):

```bash
dsh --profile web plugin install github:WindGraham/dsh-share
```

或手动:把包放入 profile 的 `node_modules` 并在 `dsh.profile.bundles` 登记(与 `@dsh-community/dsh-deeplink` 相同形态):

```json
"dsh": { "profile": { "bundles": ["@dsh-community/dsh-share"] } }
```

快照目录由 patch 配置 `root`(默认 `~/.dsh/shares`),插件激活时自动创建。

## 版本兼容

- 适配 DSH 0.2.x(在 0.2.0-rc.2 与 0.2.1-rc.3 上验证)。0.2.1 起移动端为 `dsh-web-mobile` 增强 bundle,本插件的菜单经 `createPortal` 挂载到 `<body>`,不受聊天行层叠上下文影响,桌面与移动端均可用。
- 长图光栅化的高度测量在隔离 `srcdoc` iframe(只含分享样式)中完成,避免宿主页面样式(MarkdownText 模块类、主题排版、自定义滚动条)改变布局导致 SVG 视口截断尾部。

## 已知限制

- 长图/保存图片使用 SVG foreignObject 光栅化:字体使用系统字体栈(宿主页面字体不随 SVG 嵌入),CJK 文本显示正常。
- 分享内容只含 `user/message` 与 `assistant/message` 的文本/图片/文件块;工具过程、思考块不进入分享。
