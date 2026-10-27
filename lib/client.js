// dsh-share browser half — hand-written client bundle (no build step).
// Registers through the DSH module-loader protocol; the loader materializes
// this factory once and calls apply() when the injected services exist.
//
// Adds a "分享" entry to every finalized assistant message's action row:
//   复制分享链接 — snapshot the selected messages into a self-contained public
//                page /share/<token> and copy its URL to the clipboard.
//   复制 Markdown / 导出 Markdown — the selected transcript as Markdown.
//   导出长图 — the rendered share document rasterized to one PNG
//              (SVG foreignObject; falls back to navigator.share on iOS).
//
// Every operation first opens a picker so the human chooses which messages
// to include. The share document renders off-screen with MarkdownText
// (variant="compact"), images inlined as data URIs through the authenticated
// media route; reasoning/thinking blocks never enter the payload (the host
// extractor keeps only text/image/file blocks).

window.__ModuleLoader__.load({
  id: '@dsh-community/dsh-share',
  factory: (require) => {
    const React = require('react')
    const { createPortal } = require('react-dom')
    const { createRoot } = require('react-dom/client')
    const {
      MarkdownText, writeClipboard, Tooltip,
      IconShareOutlineRegular, IconLinkOutlineRegular, IconCheckOutlineRegular,
    } = require('@deepseek-ai/dsh-client-ui-primitives')
    const h = React.createElement

    // Official DSH mark: apps/web/public/favicon.svg (single path, 50x50
    // viewBox). Rendered with fill=currentColor so avatar/logo CSS colors it.
    const DSH_LOGO_PATH = 'M48.8354 10.0479C48.3232 9.79199 48.1025 10.2798 47.8032 10.5278C47.7007 10.6079 47.6143 10.7119 47.5273 10.8076C46.7793 11.624 45.9048 12.1597 44.7622 12.0957C43.0923 12 41.666 12.5356 40.4058 13.8398C40.1377 12.2319 39.2476 11.272 37.8926 10.6558C37.1836 10.3359 36.4668 10.0156 35.9702 9.31982C35.6235 8.82373 35.5293 8.27197 35.356 7.72754C35.2456 7.3999 35.1353 7.06396 34.7651 7.00781C34.3633 6.94385 34.2056 7.2876 34.0479 7.57568C33.418 8.75195 33.1733 10.0479 33.1973 11.3599C33.2524 14.312 34.4736 16.6641 36.8999 18.3359C37.1758 18.5278 37.2466 18.7197 37.1597 19C36.9946 19.5757 36.7974 20.1357 36.624 20.7119C36.5137 21.0801 36.3486 21.1597 35.9624 21C34.6309 20.4321 33.481 19.5918 32.4644 18.5757C30.7393 16.8721 29.1792 14.9917 27.2334 13.52C26.7764 13.1758 26.3193 12.856 25.8467 12.5518C23.8618 10.584 26.1069 8.96777 26.627 8.77588C27.1704 8.57568 26.8159 7.8877 25.0591 7.896C23.3022 7.90381 21.6953 8.50391 19.647 9.30371C19.3477 9.42383 19.0322 9.51172 18.7095 9.58398C16.8501 9.22363 14.9199 9.14355 12.9033 9.37598C9.10596 9.80762 6.07275 11.6396 3.84326 14.7681C1.16455 18.5278 0.53418 22.7998 1.30664 27.2559C2.11768 31.9521 4.46582 35.8398 8.07373 38.8799C11.8159 42.0322 16.1255 43.5762 21.041 43.2803C24.0269 43.104 27.3516 42.6963 31.1016 39.4561C32.0469 39.936 33.0396 40.1279 34.686 40.272C35.9546 40.3921 37.1758 40.208 38.1211 40.0078C39.6021 39.688 39.4995 38.2881 38.9639 38.0322C34.623 35.9678 35.5762 36.8081 34.71 36.1279C36.9155 33.4639 40.2402 30.6958 41.54 21.728C41.6426 21.0161 41.5557 20.5679 41.54 19.9917C41.5322 19.6396 41.6108 19.5039 42.0049 19.4639C43.0923 19.3359 44.1479 19.0317 45.1167 18.4878C47.9292 16.9199 49.064 14.3438 49.3315 11.2559C49.3711 10.7837 49.3237 10.2959 48.8354 10.0479ZM24.3262 37.8398C20.1196 34.4639 18.0791 33.3521 17.2358 33.3999C16.4482 33.4482 16.5898 34.3682 16.7632 34.9678C16.9443 35.5601 17.1812 35.9683 17.5117 36.4878C17.7402 36.832 17.8979 37.3442 17.2832 37.728C15.9282 38.584 13.5728 37.4399 13.4624 37.3838C10.7207 35.7358 8.42822 33.5601 6.81348 30.584C5.25342 27.7197 4.34766 24.6479 4.19775 21.3677C4.1582 20.5757 4.38672 20.2959 5.15869 20.1519C6.17529 19.96 7.22314 19.9199 8.23926 20.0718C12.5327 20.7119 16.1885 22.6719 19.2529 25.7759C21.002 27.5439 22.3252 29.6558 23.6885 31.7202C25.1377 33.9121 26.6978 36 28.6831 37.7119C29.3843 38.312 29.9434 38.7681 30.479 39.104C28.8643 39.2881 26.1699 39.3281 24.3262 37.8398ZM26.3433 24.6001C26.3433 24.248 26.6191 23.9678 26.9658 23.9678C27.0444 23.9678 27.1152 23.9839 27.1782 24.0078C27.2651 24.04 27.3438 24.0879 27.4067 24.1602C27.5171 24.272 27.5801 24.4321 27.5801 24.6001C27.5801 24.9521 27.3042 25.2319 26.9575 25.2319C26.6108 25.2319 26.3433 24.9521 26.3433 24.6001ZM32.6064 27.8799C32.2046 28.0479 31.8027 28.1919 31.4165 28.208C30.8179 28.2397 30.1641 27.9922 29.8096 27.688C29.2583 27.2158 28.8643 26.9521 28.6987 26.1279C28.6279 25.7759 28.6675 25.2319 28.7305 24.9199C28.8721 24.248 28.7144 23.8159 28.2495 23.4238C27.8716 23.104 27.3911 23.0161 26.8633 23.0161C26.666 23.0161 26.4849 22.9277 26.3511 22.856C26.1304 22.7441 25.9492 22.4639 26.1226 22.1201C26.1777 22.0078 26.4458 21.7358 26.5088 21.688C27.2256 21.272 28.0527 21.4077 28.8169 21.7197C29.5259 22.0161 30.0615 22.5601 30.834 23.3281C31.6216 24.2559 31.7632 24.5117 32.2124 25.208C32.5669 25.752 32.8901 26.312 33.1104 26.9521C33.2446 27.3521 33.0713 27.6802 32.6064 27.8799Z'
    const dshLogo = size => h('svg', {
      width: size, height: size, viewBox: '0 0 50 50', fill: 'none',
      'aria-hidden': 'true', style: { display: 'block' },
    }, h('path', { d: DSH_LOGO_PATH, fill: 'currentColor' }))

    // ui-primitives outline icons (viewBox 16x16, 1px stroke) used for the
    // thinking / tool disclosure rows — monochrome currentColor, no emoji.
    const dshOutlineIcon = (size, paths) => h('svg', {
      width: size, height: size, viewBox: '0 0 16 16', fill: 'none',
      strokeWidth: 1, 'aria-hidden': 'true', style: { display: 'block' },
    }, ...paths)
    // IconThinkOutlineRegular (ReasoningRow lead icon).
    const dshIconThink = size => dshOutlineIcon(size, [
      h('path', { d: 'M10.2854 5.71481C12.9673 8.39663 14.1182 11.5938 12.8562 12.8559C11.5942 14.1179 8.39706 12.9669 5.71518 10.2851C3.03333 7.60323 1.88236 4.40608 3.14441 3.14403C4.40644 1.882 7.6036 3.03297 10.2854 5.71481Z', stroke: 'currentColor' }),
      h('path', { d: 'M10.2854 10.2851C7.6036 12.9669 4.40644 14.1179 3.14441 12.8559C1.88236 11.5938 3.03333 8.39663 5.71518 5.71481C8.39706 3.03297 11.5942 1.882 12.8562 3.14403C14.1182 4.40608 12.9673 7.60323 10.2854 10.2851Z', stroke: 'currentColor' }),
      h('path', { d: 'M8.86291 8.0002C8.86291 8.47549 8.47762 8.86087 8.00224 8.86087C7.52694 8.86087 7.1416 8.47549 7.1416 8.0002C7.1416 7.52485 7.52694 7.13953 8.00224 7.13953C8.47762 7.13953 8.86291 7.52485 8.86291 8.0002Z', fill: 'currentColor' }),
    ])
    // IconEditOutlineRegular (edit/write tool-call icon in ChatGroupSeat).
    const dshIconEdit = size => dshOutlineIcon(size, [
      h('path', { d: 'M8.85596 2.69971H4.19971C3.37141 2.69971 2.69992 3.37146 2.69971 4.19971V11.8003C2.69992 12.6285 3.37141 13.3003 4.19971 13.3003H11.8003C12.6283 13.2999 13.3001 12.6283 13.3003 11.8003V7.89893H14.3003V11.8003C14.3001 13.1806 13.1806 14.2999 11.8003 14.3003H4.19971C2.81913 14.3003 1.69992 13.1808 1.69971 11.8003V4.19971C1.69992 2.81918 2.81913 1.69971 4.19971 1.69971H8.85596V2.69971Z', fill: 'currentColor' }),
      h('path', { d: 'M7.7849 8.23878L13.888 2.13574', stroke: 'currentColor' }),
    ])
    const inject = ['slots', 'locale']

    /** Chinese dictionary (the key-set source of truth). */
    const zh = {
      'menu.share': '分享',
      'menu.copyLink': '复制分享链接',
      'menu.copyMarkdown': '复制 Markdown',
      'menu.exportMarkdown': '导出 Markdown',
      'menu.exportPng': '导出长图',
      'notice.linkOk': '分享链接已复制',
      'notice.linkFail': '生成分享链接失败',
      'notice.mdCopyOk': 'Markdown 已复制',
      'notice.mdFail': '生成 Markdown 失败',
      'notice.mdExportOk': '已开始下载 Markdown',
      'notice.pngOk': '已开始下载长图',
      'notice.pngShared': '已调起系统分享',
      'notice.pngFail': '生成长图失败',
      'notice.tooLong': '图片过长，超出设备画布上限',
      'notice.loadFail': '加载会话内容失败',
      'picker.title': '选择要分享的消息',
      'picker.confirm': '确定',
      'picker.cancel': '取消',
      'picker.all': '全选',
      'picker.none': '全不选',
      'doc.brand': 'DeepSeek Harness 会话分享',
      'doc.user': '用户',
      'doc.assistant': '助手',
      'doc.imageOmitted': '[图片已省略]',
      'doc.thinking': '思考',
      'doc.tools': '调用工具',
      'doc.process': '过程',
      'doc.charsUnit': '字',
      'md.copyCode': '复制代码',
      'md.codeCopied': '已复制',
      'md.footnotes': '脚注',
      'savePng': '保存为图片',
      'savePngFailed': '图片过长，超出设备画布上限，无法保存',
    }

    /** English dictionary, complete against the zh key set. */
    const en = {
      'menu.share': 'Share',
      'menu.copyLink': 'Copy share link',
      'menu.copyMarkdown': 'Copy Markdown',
      'menu.exportMarkdown': 'Export Markdown',
      'menu.exportPng': 'Export long image',
      'notice.linkOk': 'Share link copied',
      'notice.linkFail': 'Failed to create share link',
      'notice.mdCopyOk': 'Markdown copied',
      'notice.mdFail': 'Failed to build Markdown',
      'notice.mdExportOk': 'Downloading Markdown',
      'notice.pngOk': 'Downloading long image',
      'notice.pngShared': 'Opening share sheet',
      'notice.pngFail': 'Failed to render long image',
      'notice.tooLong': 'Image exceeds the canvas limit',
      'notice.loadFail': 'Failed to load the conversation',
      'picker.title': 'Choose messages to share',
      'picker.confirm': 'OK',
      'picker.cancel': 'Cancel',
      'picker.all': 'All',
      'picker.none': 'None',
      'doc.brand': 'DeepSeek Harness conversation share',
      'doc.user': 'User',
      'doc.assistant': 'Assistant',
      'doc.imageOmitted': '[image omitted]',
      'doc.thinking': 'Thinking',
      'doc.tools': 'Tools',
      'doc.process': 'Progress',
      'doc.charsUnit': ' chars',
      'md.copyCode': 'Copy code',
      'md.codeCopied': 'Copied',
      'md.footnotes': 'Footnotes',
      'savePng': 'Save as image',
      'savePngFailed': 'The image exceeds the device canvas limit and cannot be saved',
    }

    // ------------------------------------------------------------------
    // Styles
    // ------------------------------------------------------------------

    /**
     * Share document styles. Literal colors on purpose: the same sheet is
     * injected into the host page (off-screen render), embedded into exported
     * snapshot pages, and embedded into the SVG <style> used for rasterization,
     * where host stylesheets and theme tokens do not apply. The look follows
     * the DSH palette: the user speaks from a filled DeepSeek-blue bubble on
     * the right, the assistant answers in a white card on the left, and every
     * message carries an avatar plus a 角色 · 时间 name row so the two sides
     * stay unmistakable even in grayscale. 480px wide, 15px text, tuned for
     * phone screens.
     */
    /**
     * Share document styles: a hand port of the DSH dark theme (token values
     * from ui-theme design-platform.css) — bg-base #151517, label tiers,
     * 20px bubble radius, and the DisclosureRow/ReasoningRow metrics (24px
     * tertiary rows, 16px leading + 6px gap, 13px secondary text). Literal
     * colors on purpose: the same sheet is injected into the host page,
     * embedded into exported snapshot pages, and embedded into the SVG <style>
     * used for rasterization, where host stylesheets and theme tokens do not
     * apply. At share time the app's own markdown styles are extracted and
     * embedded too, so MarkdownText output (code, tables, links) is pixel-
     * faithful to DSH.
     */
    const DOC_CSS = [
      // DSH dark palette (from ui-theme/src/styles/design-platform.css)
      ':root{--ds-base:#151517;--ds-layer1:#232324;--ds-layer2:#2c2c2e;--ds-layer3:#353638;--ds-label1:#f9fafb;--ds-label2:#61666b;--ds-label3:#81858c;--ds-caption:#81858c;--ds-border1:rgba(255,255,255,.06);--ds-border2:rgba(255,255,255,.12);--ds-bubble:#2c2c2e;--ds-bubblehl:#43454a;--ds-brand:#4176e6;--ds-brandhi:#7aaaff;--ds-link:#4176e6;--ds-ok:#22c25e;--ds-err:#f25a5a}',
      '.dsh-share-doc{width:480px;box-sizing:border-box;background:var(--ds-base);color:var(--ds-label1);font-family:-apple-system,BlinkMacSystemFont,\'Segoe UI\',\'PingFang SC\',\'Hiragino Sans GB\',\'Microsoft YaHei\',\'Noto Sans CJK SC\',sans-serif;font-size:14px;line-height:22px;padding:16px 14px 28px}',
      '.dsh-share-doc *{box-sizing:border-box}',
      '.dsh-share-doc .dsh-share-head{background:var(--ds-layer1);border:1px solid var(--ds-border1);border-radius:16px;padding:16px 16px 12px}',
      '.dsh-share-doc .dsh-share-brandrow{display:flex;align-items:center;gap:8px}',
      '.dsh-share-doc .dsh-share-logo{flex:none;width:26px;height:26px;border-radius:8px;background:var(--ds-brand);color:#fff;font-size:14px;display:flex;align-items:center;justify-content:center}',
      '.dsh-share-doc .dsh-share-brandtext{font-size:12px;font-weight:600;color:var(--ds-brandhi);letter-spacing:.03em}',
      '.dsh-share-doc .dsh-share-title{font-size:18px;font-weight:600;line-height:1.45;margin-top:10px;color:var(--ds-label1);word-break:break-word;overflow-wrap:anywhere}',
      '.dsh-share-doc .dsh-share-meta{font-size:12px;color:var(--ds-label3);margin-top:6px}',
      '.dsh-share-doc .dsh-share-body{margin-top:14px}',
      '.dsh-share-doc .dsh-share-msg{display:flex;gap:9px;margin:15px 0;align-items:flex-start}',
      '.dsh-share-doc .dsh-share-msg.dsh-share-user{justify-content:flex-end}',
      '.dsh-share-doc .dsh-share-col{display:flex;flex-direction:column;min-width:0;max-width:calc(100% - 42px)}',
      '.dsh-share-doc .dsh-share-user .dsh-share-col{max-width:86%;align-items:flex-end}',
      '.dsh-share-doc .dsh-share-assistant .dsh-share-col{align-items:flex-start}',
      '.dsh-share-doc .dsh-share-namerow{font-size:11px;line-height:16px;color:var(--ds-label3);margin:0 8px 4px;white-space:nowrap}',
      '.dsh-share-doc .dsh-share-avatar{flex:none;width:30px;height:30px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;margin-top:14px;background:var(--ds-layer3);color:var(--ds-label2)}',
      '.dsh-share-doc .dsh-share-assistant .dsh-share-avatar{background:var(--ds-brand);color:#fff;border-radius:9px;font-size:14px}',
      '.dsh-share-doc .dsh-share-bubble{white-space:pre-wrap;word-break:break-word;overflow-wrap:anywhere}',
      '.dsh-share-doc .dsh-share-user .dsh-share-bubble{max-width:100%;background:var(--ds-bubble);color:var(--ds-label1);padding:10px 16px;border-radius:20px 20px 4px 20px;font-size:14px;line-height:22px}',
      '.dsh-share-doc .dsh-share-assistant .dsh-share-bubble{max-width:100%;background:var(--ds-layer1);border:1px solid var(--ds-border1);color:var(--ds-label1);padding:10px 14px;border-radius:4px 16px 16px 16px;font-size:14px;line-height:22px}',
      '.dsh-share-doc .dsh-share-turnsep{display:flex;justify-content:center;margin:18px 0}',
      '.dsh-share-doc .dsh-share-turnsep span{background:var(--ds-layer2);color:var(--ds-label3);font-size:11px;line-height:20px;padding:2px 12px;border-radius:999px}',
      '.dsh-share-doc .dsh-share-md>:first-child{margin-top:0}',
      '.dsh-share-doc .dsh-share-md>:last-child{margin-bottom:0}',
      '.dsh-share-doc .dsh-share-md p{margin:0 0 6px}',
      '.dsh-share-doc .dsh-share-md h1,.dsh-share-doc .dsh-share-md h2,.dsh-share-doc .dsh-share-md h3,.dsh-share-doc .dsh-share-md h4,.dsh-share-doc .dsh-share-md h5,.dsh-share-doc .dsh-share-md h6{margin:10px 0 6px;line-height:1.4;color:var(--ds-label1)}',
      '.dsh-share-doc .dsh-share-md ul,.dsh-share-doc .dsh-share-md ol{padding-left:22px;margin:0 0 6px}',
      '.dsh-share-doc .dsh-share-md li{margin:2px 0}',
      '.dsh-share-doc .dsh-share-md pre{background:var(--ds-layer2);color:var(--ds-label1);padding:12px 14px;border-radius:10px;overflow-x:auto;font-size:12.5px;line-height:1.65;margin:6px 0}',
      '.dsh-share-doc .dsh-share-md code{font-family:ui-monospace,SFMono-Regular,\'SF Mono\',Menlo,Consolas,monospace;font-size:.92em}',
      '.dsh-share-doc .dsh-share-md :not(pre)>code{background:rgba(255,255,255,.08);padding:2px 5px;border-radius:5px}',
      '.dsh-share-doc .dsh-share-md blockquote{margin:6px 0;padding:2px 12px;border-left:3px solid var(--ds-border2);color:var(--ds-label3)}',
      '.dsh-share-doc .dsh-share-md a{color:var(--ds-link);text-decoration:none}',
      '.dsh-share-doc .dsh-share-md table{border-collapse:collapse;margin:6px 0;max-width:100%;font-size:13px}',
      '.dsh-share-doc .dsh-share-md th,.dsh-share-doc .dsh-share-md td{border:1px solid var(--ds-border1);padding:6px 10px}',
      '.dsh-share-doc .dsh-share-md th{background:var(--ds-layer2)}',
      '.dsh-share-doc .dsh-share-md img{max-width:100%;border-radius:12px;display:block;margin:4px 0}',
      '.dsh-share-doc .dsh-share-md hr{border:0;border-top:1px solid var(--ds-border1);margin:10px 0}',
      // ReasoningRow port: 24px tertiary disclosure row, expanded shows the thought
      '.dsh-share-doc .dsh-think{margin:4px 0}',
      '.dsh-share-doc .dsh-think>summary{display:flex;align-items:center;height:24px;min-width:0;cursor:pointer;list-style:none;color:var(--ds-label3);overflow:hidden}',
      '.dsh-share-doc .dsh-think>summary::-webkit-details-marker{display:none}',
      '.dsh-share-doc .dsh-think>summary:hover{color:var(--ds-label2)}',
      '.dsh-share-doc .dsh-think>summary .dsh-lead{flex:none;width:16px;height:16px;display:inline-flex;align-items:center;justify-content:center;margin-right:6px;font-size:13px}',
      '.dsh-share-doc .dsh-think>summary .dsh-title{flex:none;font-size:13px;line-height:24px;color:inherit}',
      '.dsh-share-doc .dsh-think>summary .dsh-dot{flex:none;width:2px;height:2px;margin:0 8px;border-radius:1px;background:var(--ds-caption)}',
      '.dsh-share-doc .dsh-think>summary .dsh-sum{min-width:0;flex:1 1 auto;font-size:13px;line-height:20px;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;color:inherit}',
      '.dsh-share-doc .dsh-think>summary .dsh-chev{flex:none;margin-left:auto;padding-left:8px;font-size:11px;color:var(--ds-caption)}',
      '.dsh-share-doc .dsh-think[open]>summary .dsh-chev{transform:rotate(180deg)}',
      '.dsh-share-doc .dsh-thinkbody{padding:4px 0 4px 22px;min-width:0;font-size:13px;line-height:20px;color:var(--ds-label2);white-space:pre-wrap;word-break:break-word}',
      // Tool row port: same disclosure metrics, name + status, result inside
      '.dsh-share-doc .dsh-tool{margin:4px 0}',
      '.dsh-share-doc .dsh-tool>summary{display:flex;align-items:center;height:24px;min-width:0;cursor:pointer;list-style:none;color:var(--ds-label3);overflow:hidden}',
      '.dsh-share-doc .dsh-tool>summary::-webkit-details-marker{display:none}',
      '.dsh-share-doc .dsh-tool>summary:hover{color:var(--ds-label2)}',
      '.dsh-share-doc .dsh-tool>summary .dsh-lead{flex:none;width:16px;height:16px;display:inline-flex;align-items:center;justify-content:center;margin-right:6px;font-size:13px}',
      '.dsh-share-doc .dsh-tool>summary .dsh-title{flex:none;font-size:13px;line-height:24px;color:inherit}',
      '.dsh-share-doc .dsh-tool>summary .dsh-status{margin-left:auto;flex:none;font-size:11px;line-height:24px;color:var(--ds-ok)}',
      '.dsh-share-doc .dsh-tool>summary .dsh-status.dsh-toolfail{color:var(--ds-err)}',
      '.dsh-share-doc .dsh-toolbody{margin:2px 0 6px 22px;padding:8px 10px;background:var(--ds-layer2);border:1px solid var(--ds-border1);border-radius:8px;font-size:12.5px;line-height:1.6;color:var(--ds-label2);white-space:pre-wrap;word-break:break-word;max-height:280px;overflow-y:auto}',
      '.dsh-share-doc .dsh-share-omitted{border:1px dashed var(--ds-border2);color:var(--ds-label3);font-size:12px;border-radius:10px;padding:8px;text-align:center;margin:4px 0}',
      '.dsh-share-doc .dsh-share-filechip{display:inline-flex;align-items:center;gap:6px;border:1px solid var(--ds-border1);background:var(--ds-layer2);border-radius:8px;padding:5px 10px;font-size:13px;color:var(--ds-label2)}',
      '.dsh-share-doc .dsh-share-truncated{margin-top:20px;text-align:center;color:var(--ds-label3);font-size:12px}',
      '.dsh-share-doc .dsh-share-foot{margin-top:26px;display:flex;align-items:center;justify-content:center;gap:6px;font-size:12px;color:var(--ds-label3)}',
      '.dsh-share-doc .dsh-share-step{border-left:2px solid var(--ds-border2);padding:2px 0 2px 10px;margin:0 0 10px}',
      '.dsh-share-doc .dsh-share-stepmeta{display:flex;gap:10px;font-size:11px;color:var(--ds-label3);margin-bottom:2px}',
      '.dsh-share-doc .dsh-share-badgeicon{display:inline-flex;margin-right:3px;vertical-align:-1px;color:var(--ds-label3)}',
      '.dsh-share-doc .dsh-share-steptext{font-size:13px;color:var(--ds-label2);line-height:1.6;white-space:pre-wrap;word-break:break-word;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden}',
      '.dsh-share-doc .dsh-share-thumb{max-width:200px;max-height:150px;object-fit:cover;border-radius:10px;display:block;margin:6px 0}',
    ].join('\n')

    /** Host-page chrome for the action button, menu, notice, and picker. */
    const APP_CSS = [
      '.dshs-wrap{position:relative;display:inline-flex;align-items:center}',
      '.dshs-btn{display:inline-flex;align-items:center;justify-content:center;width:26px;height:26px;border:0;border-radius:6px;background:transparent;color:var(--dsw-alias-label-secondary);cursor:pointer;padding:0}',
      '.dshs-btn:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}',
      '.dshs-btn:disabled{opacity:.5;cursor:default}',
      '.dshs-menu{position:absolute;bottom:calc(100% + 6px);left:0;min-width:172px;background:var(--dsw-alias-bg-layer-1);border:1px solid var(--dsw-alias-border-l1);border-radius:10px;box-shadow:0 8px 24px rgba(0,0,0,.16);padding:4px;z-index:70}',
      '.dshs-item{display:flex;align-items:center;gap:8px;width:100%;border:0;background:transparent;color:var(--dsw-alias-label-primary);font-size:13px;line-height:20px;padding:7px 10px;border-radius:6px;cursor:pointer;text-align:left;white-space:nowrap}',
      '.dshs-item:hover{background:var(--dsw-alias-interactive-bg-hover)}',
      '.dshs-item:disabled{opacity:.5;cursor:default}',
      '.dshs-notice{position:absolute;left:calc(100% + 8px);top:50%;transform:translateY(-50%);white-space:nowrap;font-size:12px;line-height:18px;padding:3px 10px;border-radius:8px;pointer-events:none}',
      '.dshs-notice.dshs-ok{color:var(--dsw-alias-state-business-primary);background:var(--dsw-alias-bg-layer-1);border:1px solid var(--dsw-alias-border-l1)}',
      '.dshs-notice.dshs-err{color:var(--dsw-alias-state-danger-primary,#d5483c);background:var(--dsw-alias-bg-layer-1);border:1px solid var(--dsw-alias-border-l1)}',
      // Message picker dialog
      '.dshs-mask{position:fixed;inset:0;background:rgba(15,20,30,.45);z-index:1000;display:flex;align-items:center;justify-content:center}',
      '.dshs-modal{width:440px;max-width:calc(100vw - 48px);max-height:72vh;display:flex;flex-direction:column;background:var(--dsw-alias-bg-layer-1);border:1px solid var(--dsw-alias-border-l1);border-radius:14px;box-shadow:0 16px 48px rgba(0,0,0,.28);overflow:hidden;color:var(--dsw-alias-label-primary)}',
      '.dshs-modal-head{display:flex;align-items:center;justify-content:space-between;padding:12px 16px;border-bottom:1px solid var(--dsw-alias-border-l1);font-size:14px;font-weight:600}',
      '.dshs-modal-close{border:0;background:transparent;color:var(--dsw-alias-label-secondary);cursor:pointer;font-size:16px;line-height:1;padding:4px 6px;border-radius:6px}',
      '.dshs-modal-close:hover{background:var(--dsw-alias-interactive-bg-hover)}',
      '.dshs-modal-list{flex:1;overflow-y:auto;padding:8px;display:flex;flex-direction:column;gap:2px}',
      '.dshs-pickrow{display:flex;gap:10px;align-items:flex-start;padding:8px 10px;border-radius:10px;cursor:pointer;border:1px solid transparent}',
      '.dshs-pickrow:hover{background:var(--dsw-alias-interactive-bg-hover)}',
      '.dshs-pickrow.dshs-off{opacity:.45}',
      '.dshs-check{flex:none;width:15px;height:15px;margin-top:3px;accent-color:#4176e6}',
      '.dshs-pickmain{flex:1;min-width:0}',
      '.dshs-pickhead{display:flex;gap:8px;align-items:center;margin-bottom:2px}',
      '.dshs-rolechip{padding:0 8px;border-radius:999px;font-size:11px;line-height:18px;flex:none}',
      '.dshs-rolechip.dshs-chip-user{background:var(--dsw-specific-bubble,#edf3fe);color:#4176e6}',
      '.dshs-rolechip.dshs-chip-assistant{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-secondary)}',
      '.dshs-picktime{color:var(--dsw-alias-label-tertiary);font-size:11px}',
      '.dshs-picktext{font-size:13px;line-height:19px;white-space:pre-wrap;word-break:break-word;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}',
      '.dshs-pickreply{margin-top:6px}',
      '.dshs-modal-foot{display:flex;align-items:center;gap:8px;padding:12px 16px;border-top:1px solid var(--dsw-alias-border-l1)}',
      '.dshs-linkbtn{border:0;background:transparent;color:var(--dsw-alias-state-business-primary);cursor:pointer;font-size:13px;padding:6px 8px;border-radius:6px}',
      '.dshs-linkbtn:hover{background:var(--dsw-alias-interactive-bg-hover)}',
      '.dshs-primarybtn{margin-left:auto;border:0;border-radius:8px;padding:7px 16px;font-size:13px;font-weight:600;color:#fff;background:var(--dsw-alias-state-business-primary,#4176e6);cursor:pointer}',
      '.dshs-primarybtn:disabled{opacity:.5;cursor:default}',
      '.dshs-ghostbtn{border:1px solid var(--dsw-alias-border-l1);border-radius:8px;padding:6px 14px;font-size:13px;background:transparent;color:var(--dsw-alias-label-primary);cursor:pointer}',
    ].join('\n')

    /** Saved snapshot page chrome (literal colors, standalone page). */
    const PAGE_CSS = [
      'html,body{margin:0;padding:0;background:#151517}',
      '.share-page{max-width:480px;margin:0 auto;position:relative}',
      '.dsh-share-doc{margin:0 auto}',
      '.share-actions{position:sticky;bottom:16px;display:flex;justify-content:center;padding:12px 12px max(16px, env(safe-area-inset-bottom))}',
      '.share-actions button{border:0;border-radius:999px;padding:10px 24px;font-size:14px;font-weight:600;color:#fff;background:#4176e6;box-shadow:0 4px 14px rgba(65,118,230,.35);cursor:pointer}',
      '.share-actions button:disabled{opacity:.6}',
    ].join('\n')

    /**
     * The saved page's inline script. Plain ES5 string concatenation (no
     * template literals) so it can live inside a <script> element; __CSS__ and
     * __FAIL__ are substituted while building the document.
     */
    const SAVE_LOGIC = 'var LIMIT=16777216;'
      + 'function b64(bytes){var s=\'\';for(var i=0;i<bytes.length;i+=32768){s+=String.fromCharCode.apply(null,bytes.subarray(i,i+32768))}return btoa(s)}'
      + 'function raster(el,done){'
      + 'var clone=el.cloneNode(true);'
      + 'var ds=clone.querySelectorAll("details");for(var i=0;i<ds.length;i++){ds[i].setAttribute("open","")}'
      + 'var acts=clone.querySelectorAll(\'[data-share-actions]\');'
      + 'for(var i=0;i<acts.length;i++){acts[i].parentNode.removeChild(acts[i])}'
      // Mount the opened clone off-screen and measure IT: opened <details>
      // make the clone taller than the source, which clipped the raster.
      + 'var box=document.createElement(\'div\');box.style.cssText=\'position:fixed;left:-10000px;top:0;pointer-events:none\';'
      + 'box.appendChild(clone);document.body.appendChild(box);'
      + 'function proceed(){'
      + 'var rect=clone.getBoundingClientRect();var width=Math.ceil(rect.width);var height=Math.ceil(rect.height);'
      + 'box.parentNode.removeChild(box);'
      + 'if(!width||!height){done(new Error(\'empty\'));return}'
      + 'var xhtml=new XMLSerializer().serializeToString(clone);'
      + 'var cap=Math.sqrt(LIMIT/(width*height));'
      + 'var scale=Math.min(window.devicePixelRatio||1,2,cap);'
      + 'if(scale<0.2){done(new Error(\'too tall\'));return}'
      + 'var svg=\'<svg xmlns="http://www.w3.org/2000/svg" width="\'+width+\'" height="\'+height+\'">\''
      + '+\'<foreignObject width="100%" height="100%">\''
      + '+\'<div xmlns="http://www.w3.org/1999/xhtml">\''
      + '+\'<style>\'+__CSS__+\'</style>\'+xhtml'
      + '+\'</div></foreignObject></svg>\';'
      + 'var img=new Image();'
      + 'img.onload=function(){'
      + 'var c=document.createElement(\'canvas\');'
      + 'c.width=Math.max(1,Math.round(width*scale));c.height=Math.max(1,Math.round(height*scale));'
      + 'var ctx=c.getContext(\'2d\');ctx.fillStyle=\'#151517\';ctx.fillRect(0,0,c.width,c.height);'
      + 'ctx.drawImage(img,0,0,c.width,c.height);'
      + 'c.toBlob(function(blob){done(null,blob)},\'image/png\')};'
      + 'img.onerror=function(){done(new Error(\'render\'))};'
      + 'img.src=\'data:image/svg+xml;charset=utf-8;base64,\'+b64(new TextEncoder().encode(svg))}'
      // Wait for freshly injected <img> to decode before measuring, else
      // their height is 0 and everything below them is clipped.
      + 'var ims=clone.getElementsByTagName(\'img\');var waits=[];'
      + 'for(var i=0;i<ims.length;i++){var im=ims[i];'
      + 'if(!(im.complete&&im.naturalWidth>0)&&typeof im.decode===\'function\'){waits.push(im.decode()[\'catch\'](function(){}))}}'
      + 'if(waits.length>0){Promise.all(waits).then(proceed,function(){proceed()})}else{proceed()}}'
      + 'var btn=document.getElementById(\'dsh-share-save\');'
      + 'if(btn){btn.addEventListener(\'click\',function(){'
      + 'var page=document.querySelector(\'.share-page\');if(!page){return}'
      + 'btn.disabled=true;'
      + 'raster(page,function(err,blob){'
      + 'btn.disabled=false;'
      + 'if(err||!blob){alert(__FAIL__);return}'
      + 'var name=\'share-\'+Date.now()+\'.png\';'
      + 'if(/iP(hone|ad|od)/.test(navigator.userAgent)&&navigator.canShare){'
      + 'var file=new File([blob],name,{type:\'image/png\'});'
      + 'if(navigator.canShare({files:[file]})){navigator.share({files:[file]}).catch(function(){});return}}'
      + 'var url=URL.createObjectURL(blob);var a=document.createElement(\'a\');'
      + 'a.href=url;a.download=name;document.body.appendChild(a);a.click();'
      + 'a.parentNode.removeChild(a);setTimeout(function(){URL.revokeObjectURL(url)},10000)})})}'

    // Inject the styles once (the loader removes plugin-owned tags on unload).
    if (typeof document !== 'undefined'
      && document.querySelector('style[data-plugin-css="@dsh-community/dsh-share"]') === null) {
      const style = document.createElement('style')
      style.dataset.plugin = '@dsh-community/dsh-share'
      style.dataset.pluginCss = '@dsh-community/dsh-share'
      style.textContent = `${APP_CSS}\n${DOC_CSS}`
      document.head.appendChild(style)
    }

    // ------------------------------------------------------------------
    // Small helpers
    // ------------------------------------------------------------------

    const nextFrame = () => new Promise(resolve => requestAnimationFrame(() => resolve()))

    const formatTime = (time) => {
      try {
        return new Date(time).toLocaleString(undefined, { hour12: false })
      } catch {
        return ''
      }
    }

    const formatClock = (time) => {
      try {
        return new Date(time).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', hour12: false })
      } catch {
        return ''
      }
    }

    const escapeHtml = text => String(text).replace(/[&<>"']/g, ch => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[ch]))

    /** Base64-encode a possibly multibyte string for SVG data URLs. */
    function utf8ToBase64(text) {
      const bytes = new TextEncoder().encode(text)
      let binary = ''
      for (let i = 0; i < bytes.length; i += 0x8000) {
        binary += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000))
      }
      return btoa(binary)
    }

    /** One blob download; on iOS falls back to the system share sheet. */
    async function downloadBlob(blob, filename) {
      if (/iP(hone|ad|od)/.test(navigator.userAgent)
        && typeof navigator.canShare === 'function' && typeof navigator.share === 'function') {
        const file = new File([blob], filename, { type: blob.type })
        if (navigator.canShare({ files: [file] })) {
          await navigator.share({ files: [file] })
          return 'shared'
        }
      }
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = filename
      document.body.appendChild(anchor)
      anchor.click()
      anchor.remove()
      setTimeout(() => URL.revokeObjectURL(url), 10_000)
      return 'downloaded'
    }

    const safeFilename = (title, extension) => {
      const base = String(title || 'share').replace(/[\\/:*?"<>|\s]+/g, '-').replace(/^-+|-+$/g, '')
      return `${base.slice(0, 48) || 'share'}-${Date.now()}.${extension}`
    }

    /** Two-line plain preview of one message for the picker rows. */
    function previewOf(message, labels) {
      const parts = []
      for (const block of message.blocks ?? []) {
        if (block.type === 'text') parts.push(block.text)
        else if (block.type === 'image') parts.push(labels.omitted)
        else if (block.type === 'file') parts.push(`📎${block.name}`)
      }
      return Array.from(parts.join(' ').replace(/\s+/g, ' ').trim()).slice(0, 72).join('')
    }

    // ------------------------------------------------------------------
    // Host API access
    // ------------------------------------------------------------------

    /** Ordered share content JSON for one session, with images inlined. */
    async function fetchContent(sessionId) {
      const response = await fetch(
        `/api/session.share.content?sessionId=${encodeURIComponent(sessionId)}`,
        { headers: { accept: 'application/json' } },
      )
      if (!response.ok) throw new Error(`content ${response.status}`)
      const data = await response.json()
      for (const message of data.messages ?? []) {
        for (const block of message.blocks ?? []) {
          if (block.type === 'image') {
            block.dataUri = await fetchMedia(block).catch(() => null)
          }
        }
      }
      return data
    }

    /** One stored image as a data URI, or null when oversized/unavailable. */
    async function fetchMedia(block) {
      const params = new URLSearchParams({
        attachmentId: block.attachmentId,
        mediaType: block.mediaType,
        bytes: String(block.bytes),
        width: String(block.width),
        height: String(block.height),
      })
      const response = await fetch(`/api/session.share.media?${params.toString()}`)
      if (!response.ok) return null
      const blob = await response.blob()
      if (blob.size > 2 * 1024 * 1024) return null
      return await new Promise((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(reader.result)
        reader.onerror = () => reject(reader.error ?? new Error('read failed'))
        reader.readAsDataURL(blob)
      })
    }

    // ------------------------------------------------------------------
    // Share document rendering
    // ------------------------------------------------------------------

    const SHARE_WIDTH = 480

    function renderShareBlock(block, key, mdLabels, labels) {
      if (block.type === 'text') {
        if (String(block.text).trim() === '') return null
        return h('div', { className: 'dsh-share-md', key },
          h(MarkdownText, { text: block.text, labels: mdLabels, variant: 'compact' }))
      }
      if (block.type === 'image') {
        if (typeof block.dataUri === 'string') {
          return h('img', { key, src: block.dataUri, alt: '', className: 'dsh-share-thumb' })
        }
        return h('div', { className: 'dsh-share-omitted', key }, labels.omitted)
      }
      if (block.type === 'file') {
        return h('span', { className: 'dsh-share-filechip', key }, `📎 ${block.name}`)
      }
      return null
    }

    /**
     * Group the flat message list into conversation rounds: one user message
     * opens a round and every assistant reply after it (one human turn can
     * produce several agent outputs) joins that round until the next user
     * message. Selection and rendering both work per round.
     */
    function groupRounds(messages) {
      const rounds = []
      for (const message of messages) {
        if (message.role === 'user') {
          rounds.push({ user: message, replies: [] })
          continue
        }
        const last = rounds[rounds.length - 1]
        if (last === undefined) rounds.push({ user: null, replies: [message] })
        else last.replies.push(message)
      }
      return rounds
    }

    /**
     * Badge items for one intermediate assistant round (思考 / 工具 calls).
     * kind: 'think' | 'tool' | 'text'; the DOM renders the official outline
     * icons, the Markdown export falls back to plain-text markers.
     */
    function stepItems(message, labels) {
      const items = []
      const thinking = message.activity?.thinking
      const tools = message.activity?.tools ?? 0
      if (thinking !== null && thinking !== undefined && thinking !== '') {
        items.push({ kind: 'think', text: labels.thinking })
      }
      if (tools > 0) items.push({ kind: 'tool', text: `${labels.tools} ×${tools}` })
      if (items.length === 0) items.push({ kind: 'text', text: labels.process })
      return items
    }

    const ITEM_EMOJI = { think: '💭', tool: '🔧', text: '📝' }

    /** Badge line for one intermediate assistant round (plain text form). */
    function stepBadges(message, labels) {
      return stepItems(message, labels).map(item => `${ITEM_EMOJI[item.kind]} ${item.text}`).join(' · ')
    }

    /** Badge nodes for the DOM: official monochrome icons + separators. */
    function badgeNodes(items) {
      const nodes = []
      items.forEach((item, index) => {
        if (index > 0) nodes.push(' · ')
        if (item.kind === 'think') {
          nodes.push(h('span', { className: 'dsh-share-badgeicon', key: `i${index}` }, dshIconThink(11)))
        } else if (item.kind === 'tool') {
          nodes.push(h('span', { className: 'dsh-share-badgeicon', key: `i${index}` }, dshIconEdit(11)))
        }
        nodes.push(item.text)
      })
      return nodes
    }

    /**
     * One human turn can hold dozens of agent steps. Collapse consecutive
     * text-less (thinking/tool-only) assistant messages into a single work
     * annotation so the bubble reads "💭 思考 ×k · 🔧 调用工具 ×N" instead of
     * one row per internal step.
     */
    function collapseSteps(replies) {
      const segments = []
      let pendingTools = 0
      let pendingThinking = 0
      for (const reply of replies) {
        const hasText = (reply.blocks ?? [])
          .some(block => block.type === 'text' && String(block.text).trim() !== '')
        if (!hasText) {
          pendingTools += reply.activity?.tools ?? 0
          if (reply.activity?.thinking) pendingThinking += 1
          continue
        }
        if (pendingTools > 0 || pendingThinking > 0) {
          segments.push({ kind: 'work', tools: pendingTools, thinking: pendingThinking })
          pendingTools = 0
          pendingThinking = 0
        }
        segments.push({ kind: 'reply', message: reply })
      }
      if (pendingTools > 0 || pendingThinking > 0) {
        segments.push({ kind: 'work', tools: pendingTools, thinking: pendingThinking })
      }
      return segments
    }

    /** Badge items for one collapsed work annotation. */
    function workItems(work, labels) {
      const items = []
      if (work.thinking > 0) items.push({ kind: 'think', text: `${labels.thinking} ×${work.thinking}` })
      if (work.tools > 0) items.push({ kind: 'tool', text: `${labels.tools} ×${work.tools}` })
      if (items.length === 0) items.push({ kind: 'text', text: labels.process })
      return items
    }

    /** Badge line for one collapsed work annotation (plain text form). */
    function workBadges(work, labels) {
      return workItems(work, labels).map(item => `${ITEM_EMOJI[item.kind]} ${item.text}`).join(' · ')
    }

    /** Plain text preview of one assistant message for the compact step row. */
    function stepTextOf(message, labels) {
      const parts = []
      for (const block of message.blocks ?? []) {
        if (block.type === 'text') parts.push(block.text)
        else if (block.type === 'image') parts.push(labels.omitted)
      }
      return parts.join(' ').replace(/\s+/g, ' ').trim()
    }

    /** Pure component: the selected conversation as one printable document. */
    function ShareDocument({ data, labels, onReady }) {
      React.useEffect(() => { onReady() }, [onReady])
      const messages = Array.isArray(data.messages) ? data.messages : []
      const mdLabels = {
        code: { copyLabel: labels.copyCode, copiedLabel: labels.codeCopied },
        footnotes: labels.footnotes,
      }
      const GAP_MS = 30 * 60 * 1000
      const nameRow = (who, time) => h('div', { className: 'dsh-share-namerow' }, `${who} · ${formatClock(time)}`)
      const rounds = groupRounds(messages)
      const roundTurn = round => round.user?.turn ?? round.replies[0]?.turn ?? null
      const roundTime = round => round.user?.time ?? round.replies[0]?.time ?? 0
      return h('div', { className: 'dsh-share-doc' },
        h('div', { className: 'dsh-share-head' },
          h('div', { className: 'dsh-share-brandrow' },
            h('div', { className: 'dsh-share-logo' }, dshLogo(14)),
            h('div', { className: 'dsh-share-brandtext' }, labels.brand)),
          h('div', { className: 'dsh-share-title' }, String(data.title || labels.brand)),
          h('div', { className: 'dsh-share-meta' },
            `${labels.user} × ${labels.assistant} · ${formatTime(Date.now())}`)),
        h('div', { className: 'dsh-share-body' },
          rounds.map((round, index) => {
            const previous = index > 0 ? rounds[index - 1] : null
            const separated = previous !== null
              && (roundTurn(round) !== roundTurn(previous)
                || roundTime(round) - roundTime(previous) > GAP_MS)
            const turnSep = separated
              ? h('div', { className: 'dsh-share-turnsep' }, h('span', null, formatTime(roundTime(round))))
              : null
            const rows = []
            if (round.user !== null) {
              // No avatar for the user: an anonymous right-aligned bubble
              // reads naturally in a chat, the small name row still marks it.
              rows.push(h('div', { className: 'dsh-share-msg dsh-share-user', key: 'user' },
                h('div', { className: 'dsh-share-col' },
                  nameRow(labels.user, round.user.time),
                  h('div', { className: 'dsh-share-bubble' },
                    (round.user.blocks ?? []).map((block, blockIndex) =>
                      renderShareBlock(block, blockIndex, mdLabels, labels))))))
            }
            if (round.replies.length > 0) {
              // Every agent output of this human turn lives in ONE bubble:
              // collapsed thinking/tool work as annotation rows, intermediate
              // text rounds as compact steps, the final text round complete.
              const segments = collapseSteps(round.replies)
              let lastReplySegment = -1
              segments.forEach((segment, segmentIndex) => {
                if (segment.kind === 'reply') lastReplySegment = segmentIndex
              })
              const bubbleChildren = []
              segments.forEach((segment, segmentIndex) => {
                if (segment.kind === 'work') {
                  bubbleChildren.push(h('div', { className: 'dsh-share-step', key: `w${segmentIndex}` },
                    h('div', { className: 'dsh-share-stepmeta' }, h('span', null, badgeNodes(workItems(segment, labels))))))
                  return
                }
                const reply = segment.message
                if (segmentIndex === lastReplySegment) {
                  for (const [blockIndex, block] of (reply.blocks ?? []).entries()) {
                    bubbleChildren.push(renderShareBlock(block, `f${segmentIndex}-${blockIndex}`, mdLabels, labels))
                  }
                  return
                }
                bubbleChildren.push(h('div', { className: 'dsh-share-step', key: `r${segmentIndex}` },
                  h('div', { className: 'dsh-share-stepmeta' }, h('span', null, badgeNodes(stepItems(reply, labels)))),
                  h('div', { className: 'dsh-share-steptext' }, stepTextOf(reply, labels))))
              })
              rows.push(h('div', { className: 'dsh-share-msg dsh-share-assistant', key: 'ai' },
                h('div', { className: 'dsh-share-avatar' }, dshLogo(16)),
                h('div', { className: 'dsh-share-col' },
                  nameRow(labels.assistant,
                    (lastReplySegment >= 0 ? segments[lastReplySegment].message : round.replies[round.replies.length - 1]).time),
                  h('div', { className: 'dsh-share-bubble' }, bubbleChildren))))
            }
            return h(React.Fragment, { key: index }, turnSep, ...rows)
          }),
          data.truncated ? h('div', { className: 'dsh-share-truncated' }, labels.omitted) : null),
        h('div', { className: 'dsh-share-foot' }, dshLogo(13), labels.brand))
    }

    /**
     * The shared conversation page: the full transcript with real trajectory.
     * Every assistant reply renders its thinking (collapsible), its tool
     * calls (name + status, result expandable) and its text, in order — a
     * read-only DSH conversation, no composer, no sidebars. Uses native
     * <details> so it stays interactive under the sandbox CSP.
     */
    function ShareConversation({ data, labels, onReady }) {
      React.useEffect(() => { onReady() }, [onReady])
      const messages = Array.isArray(data.messages) ? data.messages : []
      const mdLabels = {
        code: { copyLabel: labels.copyCode, copiedLabel: labels.codeCopied },
        footnotes: labels.footnotes,
      }
      const GAP_MS = 30 * 60 * 1000
      const nameRow = (who, time) => h('div', { className: 'dsh-share-namerow' }, `${who} · ${formatClock(time)}`)
      const rounds = groupRounds(messages)
      const roundTurn = round => round.user?.turn ?? round.replies[0]?.turn ?? null
      const roundTime = round => round.user?.time ?? round.replies[0]?.time ?? 0
      const renderThoughts = (reply, key) => {
        if (typeof reply.thoughts !== 'string' || reply.thoughts === '') return null
        const chars = Array.from(reply.thoughts).length
        const firstLine = reply.thoughts.split('\n')[0].trim().slice(0, 64)
        return h('details', { className: 'dsh-think', key },
          h('summary', null,
            h('span', { className: 'dsh-lead' }, dshIconThink(13)),
            h('span', { className: 'dsh-title' }, labels.thinking),
            h('span', { className: 'dsh-dot' }),
            h('span', { className: 'dsh-sum' }, `${firstLine} · ${chars}${labels.charsUnit}`),
            h('span', { className: 'dsh-chev' }, '▾')),
          h('div', { className: 'dsh-thinkbody' }, reply.thoughts))
      }
      const renderTool = (tool, key) => h('details', { className: 'dsh-tool', key },
        h('summary', null,
          h('span', { className: 'dsh-lead' }, dshIconEdit(13)),
          h('span', { className: 'dsh-title' }, tool.name),
          h('span', { className: `dsh-status${tool.ok ? '' : ' dsh-toolfail'}` },
            tool.ok ? '✓' : '…')),
        tool.summary !== '' ? h('div', { className: 'dsh-toolbody' }, tool.summary) : null)
      return h('div', { className: 'dsh-share-doc' },
        h('div', { className: 'dsh-share-head' },
          h('div', { className: 'dsh-share-brandrow' },
            h('div', { className: 'dsh-share-logo' }, dshLogo(14)),
            h('div', { className: 'dsh-share-brandtext' }, labels.brand)),
          h('div', { className: 'dsh-share-title' }, String(data.title || labels.brand)),
          h('div', { className: 'dsh-share-meta' },
            `${labels.user} × ${labels.assistant} · ${formatTime(Date.now())}`)),
        h('div', { className: 'dsh-share-body' },
          rounds.map((round, index) => {
            const previous = index > 0 ? rounds[index - 1] : null
            const separated = previous !== null
              && (roundTurn(round) !== roundTurn(previous)
                || roundTime(round) - roundTime(previous) > GAP_MS)
            const turnSep = separated
              ? h('div', { className: 'dsh-share-turnsep' }, h('span', null, formatTime(roundTime(round))))
              : null
            const rows = []
            if (round.user !== null) {
              rows.push(h('div', { className: 'dsh-share-msg dsh-share-user', key: 'user' },
                h('div', { className: 'dsh-share-col' },
                  nameRow(labels.user, round.user.time),
                  h('div', { className: 'dsh-share-bubble' },
                    (round.user.blocks ?? []).map((block, blockIndex) =>
                      renderShareBlock(block, blockIndex, mdLabels, labels))))))
            }
            if (round.replies.length > 0) {
              // Full trajectory: thinking, tools, and text of every reply, in order.
              const bubbleChildren = []
              round.replies.forEach((reply, replyIndex) => {
                bubbleChildren.push(renderThoughts(reply, `t${replyIndex}`))
                for (const [toolIndex, tool] of (reply.tools ?? []).entries()) {
                  bubbleChildren.push(renderTool(tool, `t${replyIndex}-${toolIndex}`))
                }
                for (const [blockIndex, block] of (reply.blocks ?? []).entries()) {
                  bubbleChildren.push(renderShareBlock(block, `b${replyIndex}-${blockIndex}`, mdLabels, labels))
                }
              })
              const lastReply = round.replies[round.replies.length - 1]
              rows.push(h('div', { className: 'dsh-share-msg dsh-share-assistant', key: 'ai' },
                h('div', { className: 'dsh-share-avatar' }, dshLogo(16)),
                h('div', { className: 'dsh-share-col' },
                  nameRow(labels.assistant, lastReply.time),
                  h('div', { className: 'dsh-share-bubble' }, bubbleChildren))))
            }
            return h(React.Fragment, { key: index }, turnSep, ...rows)
          }),
          data.truncated ? h('div', { className: 'dsh-share-truncated' }, labels.omitted) : null),
        h('div', { className: 'dsh-share-foot' }, dshLogo(13), labels.brand))
    }

    /** Minimal error boundary so a render failure rejects the pipeline. */
    class ShareBoundary extends React.Component {
      constructor(props) {
        super(props)
        this.state = { error: null }
      }

      static getDerivedStateFromError(error) {
        return { error }
      }

      componentDidCatch(error) {
        this.props.onFailed(error)
      }

      render() {
        return this.state.error === null ? this.props.children : null
      }
    }

    /**
     * Render the share document into an off-screen 480px container, wait two
     * frames plus font readiness, then hand back the serialized markup.
     */
    function mountShareDocument(data, labels) {
      return mountShare(ShareDocument, data, labels)
    }

    /** Render the shared conversation page off-screen and capture its markup. */
    function mountShareConversation(data, labels) {
      return mountShare(ShareConversation, data, labels)
    }

    function mountShare(Component, data, labels) {
      return new Promise((resolve, reject) => {
        const container = document.createElement('div')
        container.setAttribute('style', `position:fixed;left:-10000px;top:0;width:${SHARE_WIDTH}px;pointer-events:none;z-index:-1;`)
        document.body.appendChild(container)
        const root = createRoot(container)
        let settled = false
        const cleanup = () => {
          try {
            root.unmount()
          } catch { /* already unmounted */ }
          container.remove()
        }
        const finish = (error) => {
          if (settled) return
          settled = true
          if (error !== null && error !== undefined) {
            cleanup()
            reject(error instanceof Error ? error : new Error(String(error)))
            return
          }
          nextFrame()
            .then(nextFrame)
            .then(() => document.fonts.ready)
            .then(() => {
              const docEl = container.querySelector('.dsh-share-doc')
              const html = docEl === null ? container.innerHTML : docEl.outerHTML
              const css = docEl === null ? '' : extractUsedCss(docEl)
              cleanup()
              resolve({ html, css })
            })
            .catch((pipelineError) => {
              cleanup()
              reject(pipelineError)
            })
        }
        root.render(h(ShareBoundary, { onFailed: finish },
          h(Component, { data, labels, onReady: () => finish(null) })))
      })
    }

    // ------------------------------------------------------------------
    // Rasterization (SVG foreignObject; shared logic with the saved page)
    // ------------------------------------------------------------------

    /** iOS Safari canvas pixel budget (16,777,216). */
    const MAX_CANVAS_PIXELS = 16_777_216
    const RASTER_BACKGROUND = '#151517'

    /**
     * Rasterize one in-document element to a PNG blob.
     *
     * Layout fidelity: the height is measured in an isolated srcdoc iframe
     * that carries ONLY DOC_CSS — the exact stylesheet set the SVG
     * foreignObject render will see. Measuring in the host page instead
     * leaks host rules (MarkdownText module classes, theme typography,
     * custom scrollbars) into the document and can layout it SHORTER than
     * the self-contained SVG render; the SVG viewport then silently cuts
     * the tail. Action strips are removed from the clone.
     */
    async function rasterizeElement(element, width) {
      const clone = element.cloneNode(true)
      clone.querySelectorAll('details').forEach(node => node.setAttribute('open', ''))
      clone.querySelectorAll('[data-share-actions]').forEach(node => node.remove())
      const xhtml = new XMLSerializer().serializeToString(clone)
      const iframe = document.createElement('iframe')
      iframe.setAttribute('style', 'position:fixed;left:-10000px;top:0;width:0;height:0;border:0;')
      document.body.appendChild(iframe)
      let height = 0
      try {
        const doc = iframe.contentDocument
        doc.open()
        doc.write('<!DOCTYPE html><html><head><meta charset="utf-8"><style>'
          + DOC_CSS + '</style></head><body style="margin:0">' + xhtml + '</body></html>')
        doc.close()
        await new Promise((resolve) => {
          if (doc.readyState === 'complete') resolve()
          else iframe.addEventListener('load', resolve, { once: true })
        })
        // Freshly injected <img> (data/blob URI) reports 0 height until
        // decoded — measuring before that clips everything below the image.
        await Promise.all(Array.from(doc.querySelectorAll('img')).map((img) => {
          if (img.complete && img.naturalWidth > 0) return null
          return img.decode().catch(() => {})
        }))
        const docEl = doc.querySelector('.dsh-share-doc')
        height = docEl === null ? 0 : Math.ceil(docEl.getBoundingClientRect().height)
      } finally {
        iframe.remove()
      }
      if (!width || !height) throw new Error('nothing to render')
      const cap = Math.sqrt(MAX_CANVAS_PIXELS / (width * height))
      const scale = Math.min(window.devicePixelRatio || 1, 2, cap)
      if (scale < 0.2) throw new Error('too tall')
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">`
        + '<foreignObject width="100%" height="100%">'
        + '<div xmlns="http://www.w3.org/1999/xhtml">'
        + `<style>${DOC_CSS}</style>${xhtml}`
        + '</div></foreignObject></svg>'
      const image = new Image()
      await new Promise((resolve, rejectPromise) => {
        image.onload = resolve
        image.onerror = () => rejectPromise(new Error('svg render failed'))
        image.src = `data:image/svg+xml;charset=utf-8;base64,${utf8ToBase64(svg)}`
      })
      const canvas = document.createElement('canvas')
      canvas.width = Math.max(1, Math.round(width * scale))
      canvas.height = Math.max(1, Math.round(height * scale))
      const context = canvas.getContext('2d')
      context.fillStyle = RASTER_BACKGROUND
      context.fillRect(0, 0, canvas.width, canvas.height)
      context.drawImage(image, 0, 0, canvas.width, canvas.height)
      return await new Promise((resolvePromise, rejectPromise) => {
        canvas.toBlob((blob) => {
          if (blob === null) rejectPromise(new Error('png encode failed'))
          else resolvePromise(blob)
        }, 'image/png')
      })
    }

    // ------------------------------------------------------------------
    // Snapshot page assembly
    // ------------------------------------------------------------------

    /**
     * Copy the host app's own CSS rules that style the classes found under
     * one rendered share root (MarkdownText/CodeBlock hashed modules, shiki
     * token colors, katex) plus theme-variable and font-face rules, so the
     * exported page reproduces DSH typography exactly. Bounded against
     * pathological sheets.
     */
    function extractUsedCss(rootEl) {
      const tokens = new Set()
      const collect = (el) => {
        for (const name of String(el.className ?? '').split(/\s+/)) {
          if (name.length > 3) tokens.add(name)
        }
      }
      collect(rootEl)
      rootEl.querySelectorAll('[class]').forEach(collect)
      const keep = []
      const budget = { bytes: 0 }
      const THEME_PREFIX = /^(html|body|:root|\[data-|@font-face)/
      const push = (text) => {
        if (budget.bytes + text.length > 800_000) return
        budget.bytes += text.length
        keep.push(text)
      }
      const walk = (rules) => {
        for (const rule of rules) {
          if (rule.cssRules !== undefined && rule.cssRules !== null && rule.cssRules.length >= 0
            && (rule.cssText.startsWith('@media') || rule.cssText.startsWith('@supports') || rule.cssText.startsWith('@layer'))) {
            const inner = []
            const sub = { bytes: 0 }
            for (const r of rule.cssRules) {
              const sel = r.selectorText ?? ''
              if (r.cssText && (THEME_PREFIX.test(sel) || [...tokens].some(t => sel.includes(t)))) {
                inner.push(r.cssText)
                sub.bytes += r.cssText.length
              }
            }
            if (inner.length > 0 && budget.bytes + sub.bytes < 800_000) {
              budget.bytes += sub.bytes
              keep.push(rule.cssText.slice(0, rule.cssText.indexOf('{') + 1) + inner.join('') + '}')
            }
            continue
          }
          const sel = rule.selectorText ?? ''
          if (rule.cssText && (THEME_PREFIX.test(sel) || [...tokens].some(t => sel.includes(t)))) {
            push(rule.cssText)
          }
        }
      }
      for (const sheet of document.styleSheets) {
        let rules
        try {
          rules = sheet.cssRules
        } catch {
          continue
        }
        walk(rules)
      }
      return keep.join('\n')
    }

    /**
     * Wrap the serialized share document into one self-contained public page:
     * inlined CSS, a save-as-image button, and the inline rasterizer script.
     */
    function buildShareHtml(title, docHtml, labels, extractedCss) {
      const script = `(() => {${SAVE_LOGIC}})()`
        .split('__CSS__').join(JSON.stringify(DOC_CSS))
        .split('__FAIL__').join(JSON.stringify(labels.saveFailed))
      const appCss = typeof extractedCss === 'string' && extractedCss !== '' ? extractedCss : ''
      return '<!doctype html>\n<html lang="zh-CN">\n<head>\n<meta charset="utf-8">\n'
        + '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n'
        + '<meta name="robots" content="noindex">\n'
        + `<title>${escapeHtml(title)}</title>\n`
        + '<style>' + appCss + '\n' + PAGE_CSS + '\n' + DOC_CSS + '</style>\n</head>\n<body data-ds-dark-theme>\n'
        + '<div class="share-page">\n'
        + docHtml
        + `\n<div class="share-actions" data-share-actions><button type="button" id="dsh-share-save">${escapeHtml(labels.savePng)}</button></div>`
        + '\n</div>\n'
        + `<script>${script}</script>\n`
        + '</body>\n</html>\n'
    }

    /** Ordered transcript as Markdown (clipboard or file flavor), per round. */
    function buildMarkdown(data, labels, mode) {
      const lines = [`# ${data.title || labels.brand}`, '']
      const pushBlock = (block) => {
        if (block.type === 'text') {
          if (String(block.text).trim() !== '') lines.push(block.text, '')
        } else if (block.type === 'image') {
          if (mode === 'file' && typeof block.dataUri === 'string') {
            lines.push(`![${labels.omitted}](${block.dataUri})`, '')
          } else {
            lines.push(`> ${labels.omitted}`, '')
          }
        } else if (block.type === 'file') {
          lines.push(`- 📎 ${block.name}`, '')
        }
      }
      for (const round of groupRounds(data.messages ?? [])) {
        if (round.user !== null) {
          lines.push(`## ${labels.user} · ${formatTime(round.user.time)}`, '')
          for (const block of round.user.blocks ?? []) pushBlock(block)
        }
        const segments = collapseSteps(round.replies)
        let lastReplySegment = -1
        segments.forEach((segment, segmentIndex) => {
          if (segment.kind === 'reply') lastReplySegment = segmentIndex
        })
        segments.forEach((segment, segmentIndex) => {
          if (segment.kind === 'work') {
            lines.push(`> ${workBadges(segment, labels)}`, '')
            return
          }
          const reply = segment.message
          if (segmentIndex === lastReplySegment) {
            lines.push(`## ${labels.assistant} · ${formatTime(reply.time)}`, '')
            for (const block of reply.blocks ?? []) pushBlock(block)
            return
          }
          // Intermediate agent rounds stay visible but subordinate.
          lines.push(`> 📝 ${stepBadges(reply, labels)}`, '')
          for (const block of reply.blocks ?? []) {
            if (block.type !== 'text') {
              pushBlock(block)
              continue
            }
            for (const textLine of String(block.text).split('\n')) {
              lines.push(`> ${textLine}`)
            }
            lines.push('')
          }
        })
      }
      return lines.join('\n')
    }

    // ------------------------------------------------------------------
    // Message picker dialog
    // ------------------------------------------------------------------

    /**
     * Modal checklist over the session's messages. Everything starts checked;
     * the human unchecks what should not be shared, then confirms.
     */
    function SharePicker({ data, labels, texts, onConfirm, onCancel }) {
      // One row per conversation round (user message plus its agent replies).
      const rounds = groupRounds(Array.isArray(data.messages) ? data.messages : [])
      const [selected, setSelected] = React.useState(() => new Set(rounds.map((_, index) => index)))
      React.useEffect(() => {
        const onKeyDown = (event) => {
          if (event.key === 'Escape') onCancel()
        }
        document.addEventListener('keydown', onKeyDown)
        return () => { document.removeEventListener('keydown', onKeyDown) }
      }, [onCancel])
      const toggle = (index) => {
        setSelected((previous) => {
          const next = new Set(previous)
          if (next.has(index)) next.delete(index)
          else next.add(index)
          return next
        })
      }
      const setAll = (value) => {
        setSelected(value ? new Set(rounds.map((_, index) => index)) : new Set())
      }
      const pickLine = (role, message) => h(React.Fragment, null,
        h('div', { className: 'dshs-pickhead' },
          h('span', { className: `dshs-rolechip ${role === 'user' ? 'dshs-chip-user' : 'dshs-chip-assistant'}` },
            role === 'user' ? labels.user : labels.assistant),
          h('span', { className: 'dshs-picktime' }, formatClock(message.time))),
        h('div', { className: 'dshs-picktext' }, previewOf(message, labels)))
      return createPortal(
        h('div', { className: 'dshs-mask', onClick: onCancel },
          h('div', { className: 'dshs-modal', onClick: (event) => { event.stopPropagation() } },
            h('div', { className: 'dshs-modal-head' },
              texts.title,
              h('button', { type: 'button', className: 'dshs-modal-close', 'aria-label': texts.cancel, onClick: onCancel }, '✕')),
            h('div', { className: 'dshs-modal-list' },
              rounds.map((round, index) => {
                const finalReply = round.replies[round.replies.length - 1]
                return h('div', {
                  key: index,
                  className: `dshs-pickrow${selected.has(index) ? '' : ' dshs-off'}`,
                  role: 'checkbox',
                  'aria-checked': selected.has(index),
                  onClick: () => { toggle(index) },
                },
                  h('input', {
                    type: 'checkbox',
                    className: 'dshs-check',
                    checked: selected.has(index),
                    readOnly: true,
                    tabIndex: -1,
                  }),
                  h('div', { className: 'dshs-pickmain' },
                    round.user !== null ? pickLine('user', round.user) : null,
                    finalReply !== undefined
                      ? h('div', { className: 'dshs-pickreply' }, pickLine('assistant', finalReply))
                      : null))
              })),
            h('div', { className: 'dshs-modal-foot' },
              h('button', { type: 'button', className: 'dshs-linkbtn', onClick: () => { setAll(true) } }, texts.all),
              h('button', { type: 'button', className: 'dshs-linkbtn', onClick: () => { setAll(false) } }, texts.none),
              h('button', { type: 'button', className: 'dshs-ghostbtn', onClick: onCancel }, texts.cancel),
              h('button', {
                type: 'button',
                className: 'dshs-primarybtn',
                disabled: selected.size === 0,
                onClick: () => { onConfirm(Array.from(selected).sort((a, b) => a - b)) },
              }, `${texts.confirm} (${selected.size})`)))),
        document.body)
    }

    // ------------------------------------------------------------------
    // Per-session controller
    // ------------------------------------------------------------------

    /**
     * One share controller per session: a tiny observable store (busy kind and
     * transient notice) plus content loading and the four operations, each
     * run over a caller-chosen message subset. Notices display for 2.4s.
     */
    function createShareController(sessionId) {
      let snapshot = { busy: null, notice: null }
      const listeners = new Set()
      const store = {
        getSnapshot: () => snapshot,
        subscribe: (listener) => {
          listeners.add(listener)
          return () => { listeners.delete(listener) }
        },
      }
      const publish = (patch) => {
        snapshot = { ...snapshot, ...patch }
        for (const listener of listeners) listener()
      }
      let noticeTimer = 0
      const setNotice = (notice) => {
        clearTimeout(noticeTimer)
        publish({ notice })
        if (notice !== null) {
          noticeTimer = setTimeout(() => { publish({ notice: null }) }, 2400)
        }
      }
      const dismissNotice = () => {
        clearTimeout(noticeTimer)
        publish({ notice: null })
      }
      const notify = (kind, text) => { setNotice({ kind, text }) }

      let cached = null
      const loadContent = () => {
        if (cached === null) {
          cached = fetchContent(sessionId).catch((error) => {
            cached = null
            throw error
          })
        }
        return cached
      }

      const writeClipboardText = async (text) => {
        if (typeof writeClipboard === 'function') {
          await writeClipboard(text)
          return
        }
        if (navigator.clipboard?.writeText === undefined) throw new Error('clipboard unavailable')
        await navigator.clipboard.writeText(text)
      }

      const operations = {
        async link(data, labels) {
          const rendered = await mountShareConversation(data, labels)
          const html = buildShareHtml(data.title, rendered.html, labels, rendered.css)
          const response = await fetch('/api/session.share.create', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ title: data.title, html }),
          })
          if (!response.ok) throw new Error(`create ${response.status}`)
          const { path, publicUrl } = await response.json()
          await writeClipboardText(publicUrl ?? new URL(path, location.href).toString())
        },
        async copyMarkdown(data, labels) {
          await writeClipboardText(buildMarkdown(data, labels, 'clipboard'))
        },
        async exportMarkdown(data, labels) {
          const markdown = buildMarkdown(data, labels, 'file')
          const blob = new Blob(['\uFEFF' + markdown], { type: 'text/markdown;charset=utf-8' })
          await downloadBlob(blob, safeFilename(data.title, 'md'))
        },
        async exportPng(data, labels) {
          const rendered = await mountShareDocument(data, labels)
          const holder = document.createElement('div')
          holder.setAttribute('style', `position:fixed;left:-10000px;top:0;width:${SHARE_WIDTH}px;pointer-events:none;z-index:-1;`)
          holder.innerHTML = rendered.html
          document.body.appendChild(holder)
          let blob
          try {
            blob = await rasterizeElement(holder.firstElementChild, SHARE_WIDTH)
          } finally {
            holder.remove()
          }
          const outcome = await downloadBlob(blob, safeFilename(data.title, 'png'))
          return outcome === 'shared' ? 'shared' : 'ok'
        },
      }

      /**
       * Run one operation under the busy guard, publishing its notice.
       * @returns 'ok' | 'shared' on success, 'busy' when guarded out, 'failed' otherwise.
       */
      const run = async (kind, data, labels, okText, failText, sharedText) => {
        if (snapshot.busy !== null) return 'busy'
        publish({ busy: kind })
        try {
          const outcome = await operations[kind](data, labels)
          setNotice({ kind: 'ok', text: outcome === 'shared' ? sharedText : okText })
          return 'ok'
        } catch (error) {
          const tooTall = error instanceof Error && error.message === 'too tall'
          setNotice({ kind: 'error', text: tooTall ? labels.tooLong : failText })
          return 'failed'
        } finally {
          publish({ busy: null })
        }
      }

      return {
        store,
        guard: () => snapshot.busy !== null,
        prepare: loadContent,
        notify,
        createLink: (data, labels, okText, failText) => run('link', data, labels, okText, failText),
        markdown: (mode, data, labels, okText, failText) => run(
          mode === 'file' ? 'exportMarkdown' : 'copyMarkdown', data, labels, okText, failText),
        pngBlob: (data, labels, okText, failText, sharedText) => run('exportPng', data, labels, okText, failText, sharedText),
        dismissNotice,
        dispose: () => { clearTimeout(noticeTimer); listeners.clear() },
      }
    }

    // ------------------------------------------------------------------
    // Assistant action entry
    // ------------------------------------------------------------------

    /**
     * The 分享 entry in the assistant message action row: one icon button, a
     * hand-written menu, a per-operation message picker, busy disablement,
     * and a 2.4s transient notice.
     */
    function ShareActions(props) {
      const {
        t, useShare, guard, prepare, notify,
        createLink, markdown, pngBlob, dismissNotice,
      } = props
      const busy = useShare(state => state.busy)
      const notice = useShare(state => state.notice)
      const [open, setOpen] = React.useState(false)
      const [menuPos, setMenuPos] = React.useState(null) // viewport rect of the button
      const [preparing, setPreparing] = React.useState(false)
      const [picker, setPicker] = React.useState(null) // { kind, data }
      const wrapRef = React.useRef(null)
      const menuRef = React.useRef(null) // portal lives outside the wrap

      React.useEffect(() => {
        if (!open) return undefined
        const onPointerDown = (event) => {
          const inside = (wrapRef.current !== null && wrapRef.current.contains(event.target))
            || (menuRef.current !== null && menuRef.current.contains(event.target))
          if (!inside) setOpen(false)
        }
        const onKeyDown = (event) => {
          if (event.key === 'Escape') setOpen(false)
        }
        document.addEventListener('pointerdown', onPointerDown)
        document.addEventListener('keydown', onKeyDown)
        return () => {
          document.removeEventListener('pointerdown', onPointerDown)
          document.removeEventListener('keydown', onKeyDown)
        }
      }, [open])

      // Unmount retires a showing notice immediately.
      React.useEffect(() => () => dismissNotice(), [dismissNotice])

      const labels = React.useMemo(() => ({
        brand: t('doc.brand'),
        user: t('doc.user'),
        assistant: t('doc.assistant'),
        omitted: t('doc.imageOmitted'),
        copyCode: t('md.copyCode'),
        codeCopied: t('md.codeCopied'),
        footnotes: t('md.footnotes'),
        savePng: t('savePng'),
        saveFailed: t('savePngFailed'),
        tooLong: t('notice.tooLong'),
        thinking: t('doc.thinking'),
        tools: t('doc.tools'),
        process: t('doc.process'),
      }), [t])

      /** Load the content and open the picker for one menu operation. */
      const begin = (kind) => {
        if (guard() || preparing) return
        setOpen(false)
        setPreparing(true)
        void Promise.resolve()
          .then(() => prepare())
          .then(
            (data) => { setPreparing(false); setPicker({ kind, data }) },
            () => {
              setPreparing(false)
              notify('error', t('notice.loadFail'))
            },
          )
      }

      /** Run the chosen operation over the picker-confirmed rounds. */
      const confirmPicker = (indices) => {
        const current = picker
        if (current === null) return
        setPicker(null)
        const rounds = groupRounds(current.data.messages ?? [])
        const messages = []
        for (const index of indices) {
          const round = rounds[index]
          if (round === undefined) continue
          if (round.user !== null) messages.push(round.user)
          messages.push(...round.replies)
        }
        const data = { ...current.data, messages }
        if (data.messages.length === 0) return
        if (current.kind === 'link') {
          void createLink(data, labels, t('notice.linkOk'), t('notice.linkFail'))
        } else if (current.kind === 'copyMarkdown') {
          void markdown('clipboard', data, labels, t('notice.mdCopyOk'), t('notice.mdFail'))
        } else if (current.kind === 'exportMarkdown') {
          void markdown('file', data, labels, t('notice.mdExportOk'), t('notice.mdFail'))
        } else if (current.kind === 'exportPng') {
          void pngBlob(data, labels, t('notice.pngOk'), t('notice.pngFail'), t('notice.pngShared'))
        }
      }

      const item = (key, icon, label, onSelect) => h('button', {
        key,
        type: 'button',
        role: 'menuitem',
        className: 'dshs-item',
        disabled: busy !== null || preparing,
        onClick: onSelect,
      }, icon, label)

      return h('span', { className: 'dshs-wrap', ref: wrapRef },
        h(Tooltip, { label: t('menu.share'), side: 'bottom' },
          h('button', {
            type: 'button',
            className: 'dshs-btn',
            'aria-label': t('menu.share'),
            'aria-haspopup': 'menu',
            'aria-expanded': open,
            disabled: busy !== null,
            onClick: () => {
              // Anchor captured NOW: the menu portals to <body> (fixed), so it
              // must not rely on the wrap's layout position. Portalling also
              // escapes the chat row's stacking context, under which the
              // absolutely-positioned menu was invisible to taps on mobile.
              if (!open && wrapRef.current !== null) {
                const rect = wrapRef.current.getBoundingClientRect()
                setMenuPos({ left: rect.left, top: rect.top })
              }
              setOpen(!open)
            },
          }, h(IconShareOutlineRegular, { size: 16 }))),
        open && menuPos !== null
          ? createPortal(h('div', {
            className: 'dshs-menu',
            role: 'menu',
            ref: menuRef,
            style: {
              position: 'fixed',
              left: menuPos.left,
              top: menuPos.top,
              bottom: 'auto',
              transform: 'translateY(calc(-100% - 6px))',
              zIndex: 1000,
            },
          },
            item('link', h(IconLinkOutlineRegular, { size: 15 }), t('menu.copyLink'), () => { begin('link') }),
            item('copy-md', h(IconCheckOutlineRegular, { size: 15 }), t('menu.copyMarkdown'), () => { begin('copyMarkdown') }),
            item('export-md', h(IconCheckOutlineRegular, { size: 15 }), t('menu.exportMarkdown'), () => { begin('exportMarkdown') }),
            item('export-png', h(IconCheckOutlineRegular, { size: 15 }), t('menu.exportPng'), () => { begin('exportPng') })),
            document.body)
          : null,
        notice !== null && wrapRef.current !== null
          ? (() => {
            const rect = wrapRef.current.getBoundingClientRect()
            return createPortal(h('span', {
              className: `dshs-notice ${notice.kind === 'ok' ? 'dshs-ok' : 'dshs-err'}`,
              style: {
                position: 'fixed',
                left: rect.right + 8,
                top: rect.top + rect.height / 2,
                transform: 'translateY(-50%)',
                zIndex: 1000,
              },
            }, notice.text), document.body)
          })()
          : null,
        picker !== null
          ? h(SharePicker, {
            data: picker.data,
            labels,
            texts: {
              title: t('picker.title'),
              confirm: t('picker.confirm'),
              cancel: t('picker.cancel'),
              all: t('picker.all'),
              none: t('picker.none'),
            },
            onConfirm: confirmPicker,
            onCancel: () => { setPicker(null) },
          })
          : null)
    }

    // ------------------------------------------------------------------
    // Plugin body
    // ------------------------------------------------------------------

    function apply(ctx) {
      ctx.effect(() => ctx.locale.register('share', { zh, en }), 'dsh-share: dictionaries')

      const controllers = new Map()
      const controllerFor = (sessionId) => {
        let controller = controllers.get(sessionId)
        if (controller === undefined) {
          controller = createShareController(sessionId)
          controllers.set(sessionId, controller)
        }
        return controller
      }
      ctx.effect(() => () => {
        for (const controller of controllers.values()) controller.dispose()
        controllers.clear()
      }, 'dsh-share: per-session controllers')

      ctx.slots.inject('conversation.chat.assistant-actions', () => ctx.slots.register({
        name: 'conversation.chat.assistant-actions',
        id: 'share',
        order: 5,
        locale: 'share',
        inject: (sessionId) => {
          const controller = controllerFor(sessionId)
          return {
            hooks: { share: controller.store },
            guard: controller.guard,
            prepare: controller.prepare,
            notify: controller.notify,
            createLink: controller.createLink,
            markdown: controller.markdown,
            pngBlob: controller.pngBlob,
            dismissNotice: controller.dismissNotice,
          }
        },
      }, ShareActions))
    }

    return { apply, inject }
  },
})
