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

const claudeStart = html.indexOf('{ key: "claude", name: "暖杏 Claude"')
const claudeEnd = html.indexOf('{ key: "white"', claudeStart)
ok(html.slice(claudeStart, claudeEnd).includes('bg:"#f5f4ef"'), 'warm Claude theme was changed accidentally')
ok(sw.includes('const CACHE = "role-chat-cache-v118";'), 'service worker cache was not bumped to v118')

console.log(`theme regression: ${checks} checks passed`)
