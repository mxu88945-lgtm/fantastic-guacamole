import fs from 'node:fs'

const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8')
const sw = fs.readFileSync(new URL('../sw.js', import.meta.url), 'utf8')
const roleplayCss = fs.readFileSync(new URL('../src/rp-theater.css', import.meta.url), 'utf8')

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
requireText('input.value = ""; autoResize();\n    dismissComposerKeyboard(input);', 'composer send does not dismiss the touch keyboard')
requireText('if (!input || !isTouchComposer() || document.activeElement !== input) return;\n  input.blur();', 'keyboard dismissal is not limited to touch devices')
requireText('window.matchMedia("(pointer: coarse)").matches', 'touch detection for keyboard dismissal is missing')
requireText('window.__jycSyncAppH = setAppH;', 'pre-paint viewport sync is not exposed for post-send re-measure')
requireText('[120, 360, 700].forEach(ms => setTimeout(sync, ms));', 'composer blur does not re-measure the shell height after the keyboard closes')
if ((html.match(/dismissComposerKeyboard\(/g) || []).length !== 2) throw new Error('keyboard dismissal must only be called from send()')
requireText('const CHAT_RESIZE_PIN_SLACK = 120;', 'keyboard-resize bottom pin threshold is missing')
requireText('chatWasAtBottom = fromBottom < CHAT_RESIZE_PIN_SLACK;', 'scroll listener does not remember whether the chat was at the bottom before a resize')
requireText('new ResizeObserver(() => repinChatAfterResize()).observe(c);', 'chat container resize (iOS keyboard) is not observed')
requireText('if (!chatWasAtBottom) {', 'keyboard resize re-pin would pull her down while reading history')
requireText('if (token === chatResizePinToken && chatWasAtBottom) scrollToBottom();\n  }, ms));', 'keyboard resize re-pin lacks the cancellable follow-up passes')
requireText('[120, 360].forEach(ms => setTimeout(() => {', 'keyboard resize re-pin is missing its 120/360ms passes')
requireText('chatResizePinToken++;      // ...including a keyboard-resize re-pin still in flight', 'touching the chat does not cancel a pending keyboard re-pin')
requireText('let chatWasAtBottom = true, chatResizePinToken = 0, chatLastHeight = 0, chatUserScrollRevision = 0;', 'reply scroll needs a user-gesture revision separate from layout reflows')
requireText('chatUserScrollRevision++;  // distinguish a real read gesture from iOS layout scroll events', 'manual reading gesture is not tracked for reply completion')
requireText('const replyStartedAtBottom = stickBottom || Date.now() < bottomPinUntil;', 'reply completion does not remember the starting bottom state')
requireText('const followReplyToBottom = replyStartedAtBottom && chatUserScrollRevision === replyScrollRevision;', 'reply completion can lose the real latest-message bottom')
requireText('if (h === chatLastHeight) return;', 'width-only resizes re-pin the chat')
requireText('window.dispatchEvent(new Event("jyc-app-h"));', 'pre-paint viewport sync does not announce --app-h changes')
requireText('  watchChatResizePin();\n', 'keyboard resize watcher is never started')
requireText('$("chat").addEventListener("touchmove", wakeNav, { passive: true });', 'touch scrolling does not wake the shared chat navigation')
requireText('topBtn.classList.toggle("show", scrollControlsAwake && scrollable && fromTop > 180);', 'top jump button does not honor the auto-hide state')
requireText('bottomBtn.classList.toggle("show", scrollControlsAwake && scrollable && fromBottom > 180);', 'bottom jump button does not honor the auto-hide state')
requireText('scrollControlsHideTimer = setTimeout(() => {\n    scrollControlsAwake = false;', 'scroll jump buttons are missing their delayed auto-hide')
requireText('if (scrollControlsAwake) wakeScrollControls();\n    else updateScrollControls();', 'momentum scrolling does not extend an active navigation session safely')
if (!roleplayCss.includes('body.rp-chat-active .scroll-nav { display: flex !important;')
    || !roleplayCss.includes('html[data-theme-key="claude"] body.rp-chat-active #scroll-top-btn { display: grid; }')) {
  throw new Error('RP chat does not expose the same two-way scroll controls as the main chat')
}

if (!sw.includes('const CACHE = "role-chat-cache-v254";')) {
  throw new Error('service worker cache was not bumped for the scroll fix')
}

console.log('send scroll regression: 24 checks passed')
