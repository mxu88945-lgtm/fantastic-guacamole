import { readFileSync } from 'node:fs'
import assert from 'node:assert/strict'
const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8')
const css = readFileSync(new URL('../src/theme-greynote.css', import.meta.url), 'utf8')
assert.ok(html.includes('<link rel="stylesheet" href="./src/theme-greynote.css" />'))
assert.ok(html.includes('{ key: "greynote", name: "浅灰信笺"'))
assert.ok(html.includes('if (theme === "greynote") return'))
assert.equal((html.match(/"nightglow", "pudding", "greynote"\]/g) || []).length, 2)
assert.ok(css.includes('#messages .msg.archive-greynote.user .archive-body { width: fit-content !important; min-width: 190px;'))
assert.ok(/span\.chat-quote[^{]*\{ display: inline !important;[^}]*linear-gradient\(100deg,#e5eaee,#f0e7e9\) !important/.test(css))
assert.ok(!/url\(|animation/.test(css))
console.log('greynote regression ok')
