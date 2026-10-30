import fs from 'node:fs'

const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8')
const sw = fs.readFileSync(new URL('../sw.js', import.meta.url), 'utf8')

const requireText = (text, message) => {
  if (!html.includes(text)) throw new Error(message)
}

requireText(
  'width: min(180px, 29vw); height: 120px;',
  'chat image preview is not a compact thumbnail grid',
)
requireText('function openImageGallery(parts, initialIndex = 0)', 'swipeable image gallery is missing')
requireText('image-gallery-nav', 'image gallery navigation controls are missing')
requireText('Math.abs(dx) > 45', 'image gallery does not support touch swipes')
requireText('data-gallery-index="${index}"', 'message images are not grouped into a gallery')
requireText('String(reader.result || "")', 'original image data is not retained for preview and sending')
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

if (!sw.includes('const CACHE = "role-chat-cache-v268";')) {
  throw new Error('service worker cache was not bumped for the image fixes')
}

console.log('image attachment regression: 11 checks passed')

{
  const { readFileSync } = await import("node:fs");
  const src = readFileSync(new URL("../index.html", import.meta.url), "utf8");
  if (!src.includes('thumbImg.onclick = (event) => { event.stopPropagation(); openImageGallery(pendingImages, pendingIndex); };'))
    throw new Error("pending image thumbnails cannot be opened before sending");
}
