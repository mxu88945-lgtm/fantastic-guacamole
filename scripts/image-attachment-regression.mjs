import fs from 'node:fs'

const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8')
const sw = fs.readFileSync(new URL('../sw.js', import.meta.url), 'utf8')

const requireText = (text, message) => {
  if (!html.includes(text)) throw new Error(message)
}

requireText(
  'max-width: min(210px, 60vw); max-height: 240px;',
  'chat image preview is not compact on mobile',
)
requireText(
  'function openComposerFilePicker(inputId)',
  'iOS-safe composer picker helper is missing',
)
requireText(
  'picker.click();\n  requestAnimationFrame(() => $("plus-menu").classList.remove("show"));',
  'picker is not opened before the source menu closes',
)
requireText(
  'if (act === "image") openComposerFilePicker("attach-file");',
  'image action does not use the iOS-safe picker path',
)
requireText(
  'else if (act === "file") openComposerFilePicker("file-input");',
  'file action does not use the iOS-safe picker path',
)

if (!sw.includes('const CACHE = "role-chat-cache-v152";')) {
  throw new Error('service worker cache was not bumped for the image fixes')
}

console.log('image attachment regression: 6 checks passed')
