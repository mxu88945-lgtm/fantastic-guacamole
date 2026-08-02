import fs from 'node:fs'

const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8')
const sw = fs.readFileSync(new URL('../sw.js', import.meta.url), 'utf8')
let checks = 0

const ok = (value, message) => {
  if (!value) throw new Error(message)
  checks++
}

const whiteStart = html.indexOf('{ key: "white", name: "极简白"')
const whiteEnd = html.indexOf('// 墨黑金', whiteStart)
ok(whiteStart >= 0 && whiteEnd > whiteStart, 'minimal white theme block was not found')
const white = html.slice(whiteStart, whiteEnd)

ok(white.includes('bg:"#ffffff"'), 'minimal white canvas is not pure white')
ok(white.includes('"bg-soft":"#ffffff"'), 'minimal white soft surfaces are still tinted')
ok(white.includes('"bg-panel":"#ffffff"'), 'minimal white panels are still grey')
ok(white.includes('border:"#eaeaea"'), 'minimal white surfaces lack the intended subtle boundary')
ok(white.includes('"assistant-bubble":"#ffffff"'), 'assistant surface is not pure white')
ok(white.includes('"code-bg":"#f7f7f7"'), 'code blocks do not retain a readable neutral contrast')
ok(white.includes('"item-active":"#f5f5f5"'), 'pressed controls do not retain visible feedback')
ok(html.includes('root.setAttribute("data-theme-key", t.key);'),
  'active theme key is not exposed for isolated theme surfaces')
ok(html.includes('html[data-theme-key="white"] .model-quick {')
  && html.includes('background: var(--item-active); border-color: var(--border);'),
  'minimal white model picker has no visible pill surface')

const claudeStart = html.indexOf('{ key: "claude", name: "暖杏 Claude"')
const claudeEnd = html.indexOf('{ key: "white"', claudeStart)
ok(html.slice(claudeStart, claudeEnd).includes('bg:"#f5f4ef"'), 'warm Claude theme was changed accidentally')

const snowStart = html.indexOf('{ key: "snowblush", name: "樱雪"')
const snowEnd = html.indexOf('// 墨黑金', snowStart)
ok(snowStart >= 0 && snowEnd > snowStart, 'snow blush theme block was not found')
const snow = html.slice(snowStart, snowEnd)
ok(snow.includes('dark: false, glass: true, liquid: true'), 'snow blush theme is not using the intended liquid glass treatment')
ok(snow.includes('linear-gradient(180deg,#fffafa 0%,#fff8fa 28%,#fdf2f6 58%,#f8e8ef 100%)'),
  'snow blush gradient changed unexpectedly')
ok(snow.includes('bg:"#fffafa"'), 'snow blush notch fallback does not match the gradient top')
ok(snow.includes('"bg-panel":"#fbeff4"'), 'snow blush panels lost their soft rose surface')
ok(snow.includes('accent:"#d66f96"'), 'snow blush accent changed unexpectedly')
ok(html.includes('root.setAttribute("data-liquid", t.liquid ? "1" : "");'),
  'liquid theme marker is not applied or cleared on theme changes')
ok(html.includes('html[data-liquid="1"] .msg.assistant .bubble,'),
  'liquid message surface is missing')
ok(html.includes('backdrop-filter: blur(18px) saturate(1.42);'),
  'liquid message surface lost its optical blur')
ok(html.includes('inset 0 1px 0 rgba(255,255,255,.94)'),
  'liquid message surface lost its inner highlight')
ok(html.includes('html[data-glass="1"] .msg.flat.assistant .bubble { width: 100%; }'),
  'glass assistant cards still shrink with short replies')
ok(!html.includes('html[data-glass="1"] .msg.flat.user .bubble { width: 100%; }'),
  'glass user bubbles no longer hug their text')
ok(html.includes('.backdrop.show { display: block; left: min(78vw, 300px); }'),
  'mobile dim layer still darkens the translucent theme drawer')
const mistStart = html.indexOf('{ key: "mistgreen", name: "黛绿"')
const mistEnd = html.indexOf('];', mistStart)
ok(!html.slice(mistStart, mistEnd).includes('liquid: true'), 'liquid styling leaked into the existing mist green theme')

// CC's iOS standalone status-bar chain is protected: default status-bar mode,
// pre-paint local restoration, root background fallback and runtime meta refresh.
ok(html.includes('<meta name="apple-mobile-web-app-status-bar-style" content="default" />'),
  'iOS opaque status-bar mode was changed')
ok(html.includes('var bg = localStorage.getItem("jyc_themebg");')
  && html.includes('var dark = localStorage.getItem("jyc_themedark");'),
  'pre-paint notch colors are no longer restored')
ok(html.includes('html { height: 100%; background: var(--app-gradient, var(--bg)); }'),
  'root notch background fallback was changed')
ok(html.includes('document.querySelectorAll(\'meta[name="theme-color"]\').forEach((el) => el.remove());')
  && html.includes('tc.setAttribute("content", t.vars.bg);'),
  'runtime theme-color refresh was changed')
ok(html.includes('localStorage.setItem("jyc_themebg", t.vars.bg);')
  && html.includes('localStorage.setItem("jyc_themedark", t.dark ? "1" : "0");'),
  'runtime notch color persistence was changed')

ok(sw.includes('const CACHE = "role-chat-cache-v126";'), 'service worker cache was not bumped to v126')

console.log(`theme regression: ${checks} checks passed`)
