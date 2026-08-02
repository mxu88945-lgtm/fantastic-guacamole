import fs from 'node:fs'

const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8')
const sw = fs.readFileSync(new URL('../sw.js', import.meta.url), 'utf8')

const requireText = (text, message) => {
  if (!html.includes(text)) throw new Error(message)
}

requireText('<div class="header-actions">', 'right-side action capsule is missing')
requireText('header > #toggle-sidebar {', 'floating menu button style is missing')
requireText('.header-actions {', 'action capsule style is missing')
requireText('background: transparent; border: 0;', 'full-width header banner was not removed')
requireText('pointer-events: none;', 'transparent header still blocks the conversation')
requireText('padding-top: calc(4px + env(safe-area-inset-top));', 'floating controls were not lifted closer to the safe area')
requireText('M21 15a4 4 0 0 1-4 4H8l-5 3V7', 'new-chat bubble icon is missing')
requireText('id="header-search-btn"', 'search action was lost')
requireText('id="header-new-btn"', 'new conversation action was lost')
requireText('id="header-more-btn"', 'more action was lost')
requireText('top: calc(100% + 8px); right: 0;', 'more menu is not anchored to the capsule')
if (!sw.includes('const CACHE = "role-chat-cache-v129";')) throw new Error('service worker cache was not bumped')

const headerStart = html.indexOf('<header>')
const headerEnd = html.indexOf('</header>', headerStart)
if (headerStart < 0 || headerEnd < 0) throw new Error('main header markup not found')
const header = html.slice(headerStart, headerEnd)
const actionsStart = header.indexOf('<div class="header-actions">')
const menuStart = header.indexOf('<div class="header-menu"')
if (actionsStart < 0 || menuStart < actionsStart) throw new Error('header menu is not inside the action capsule')

console.log('header regression: 14 checks passed')
