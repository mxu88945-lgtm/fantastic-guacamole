import fs from 'node:fs'

const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8')
const sw = fs.readFileSync(new URL('../sw.js', import.meta.url), 'utf8')

const requireText = (text, message) => {
  if (!html.includes(text)) throw new Error(message)
}

requireText('let bottomPinUntil = 0;', 'send-time bottom pin state is missing')
requireText('function pinToBottom(duration = 800)', 'multi-layout bottom pin helper is missing')
requireText('[60, 180, 360, 700].forEach', 'iOS layout follow-up passes are missing')
requireText('pinToBottom();\n  markSeen();', 'send does not pin the newly rendered user message')
requireText('pinToBottom();               // follow iOS keyboard/composer reflow as the reply starts', 'reply start does not keep the viewport pinned')
requireText('bottomPinUntil = 0;        // an intentional touch always wins over auto-follow', 'manual scrolling cannot cancel the bottom pin')
requireText('Date.now() < bottomPinUntil || fromBottom < 140', 'scroll listener can disable the active bottom pin')
requireText('input.value = ""; autoResize();\n  dismissComposerKeyboard(input);', 'composer send does not dismiss the touch keyboard')
requireText('if (!input || !isTouchComposer() || document.activeElement !== input) return;\n  input.blur();', 'keyboard dismissal is not limited to touch devices')
requireText('window.matchMedia("(pointer: coarse)").matches', 'touch detection for keyboard dismissal is missing')
requireText('window.__jycSyncAppH = setAppH;', 'pre-paint viewport sync is not exposed for post-send re-measure')
requireText('[120, 360, 700].forEach(ms => setTimeout(sync, ms));', 'composer blur does not re-measure the shell height after the keyboard closes')
if ((html.match(/dismissComposerKeyboard\(/g) || []).length !== 2) throw new Error('keyboard dismissal must only be called from send()')

if (!sw.includes('const CACHE = "role-chat-cache-v189";')) {
  throw new Error('service worker cache was not bumped for the scroll fix')
}

console.log('send scroll regression: 14 checks passed')
