import fs from 'node:fs'

const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8')
const sw = fs.readFileSync(new URL('../sw.js', import.meta.url), 'utf8')
let checks = 0

const ok = (value, message) => {
  if (!value) throw new Error(message)
  checks++
}

const shellStart = html.indexOf('/* Claude app shell')
const shellEnd = html.indexOf('.workbench-shell {', shellStart)
ok(shellStart >= 0 && shellEnd > shellStart, 'Claude shell style block was not found')
const shell = html.slice(shellStart, shellEnd)

ok(shell.includes('html[data-theme-key="claude"] .messages') && shell.includes('max-width: 720px'),
  'Claude conversation column is not constrained to the app width')
ok(shell.includes('.msg:not(.flat) > .avatar') && shell.includes('.msg.flat > .msg-head'),
  'Claude shell still exposes role avatars or message headers')
ok(shell.includes('.msg.assistant .bubble') && shell.includes('width: 100%; max-width: none; padding: 0;'),
  'Claude assistant replies are not rendered as flat page copy')
ok(shell.includes('.msg.user .bubble') && shell.includes('background: #eeeeec; box-shadow: none;'),
  'Claude user messages are not rendered as quiet right-side bubbles')
ok(shell.includes('.composer {') && shell.includes('border-radius: 28px') && shell.includes('max-width: 720px'),
  'Claude composer shell is missing')
ok(shell.includes('#scroll-top-btn { display: none; }') && shell.includes('right: 50%; transform: translateX(50%);'),
  'Claude scroll-to-bottom control is not centred')
ok(shell.includes('.sidebar {') && shell.includes('background: #f1f1ee'),
  'Claude sidebar surface is missing')
ok(shell.includes('@media (max-width: 720px)') && shell.includes('width: min(84vw, 320px)'),
  'Claude mobile drawer is not bounded')

ok(html.includes('<svg class="think-clock"') && html.includes('processTraceLabel(phases, reasoning')
  && html.includes('<span class="think-label">${escapeHtml(label)}</span>')
  && html.includes('<svg class="think-chevron"'), 'reasoning trace row is missing its semantic controls')
ok(html.includes('currentTheme().key === "claude" ? ("回复给 " + aiName)'),
  'Claude composer does not use the role-aware reply placeholder')
ok(html.includes('<html lang="zh-CN" data-theme="light" data-theme-key="claude">')
  && html.includes('document.documentElement.setAttribute("data-theme-key", preSettings.themeName || "claude");'),
  'Claude shell is not restored before the first PWA paint')
ok(html.includes('applyFont();\n  updateSilentUI();'),
  'switching themes does not immediately refresh the composer placeholder')
ok(html.includes('#plus-menu {\n    display: none; position: fixed; z-index: 55;'),
  'composer attachment menu still participates in layout flow')
ok(html.includes('const positionPlusMenu = () => {')
  && html.includes('const trigger = $("plus-btn").getBoundingClientRect();')
  && html.includes('requestAnimationFrame(positionPlusMenu);'),
  'composer attachment menu is not anchored to the plus button')
ok(html.includes('window.visualViewport.addEventListener("resize", positionPlusMenu'),
  'composer attachment menu does not follow the iOS visual viewport')
ok(sw.includes('const CACHE = "role-chat-cache-v162";'), 'service worker cache was not bumped to v160')

console.log(`Claude shell regression: ${checks} checks passed`)
