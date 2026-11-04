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
requireText('const CHAT_IMAGE_MAX_EDGE = 2048;', 'chat images are not capped before entering conversation state')
requireText('async function prepareChatImage(file)', 'memory-safe image preparation is missing')
requireText('let imageStageQueue = Promise.resolve()', 'multiple selected images are not decoded serially on iOS')
requireText('previewDataUrl || p.dataUrl', 'message bubbles still decode the full provider image for thumbnails')
requireText('previewDataUrl || part.dataUrl', 'composer preview still decodes the full provider image')
requireText('【此前发送过一张图片】', 'older image pixels are still resent on later requests')
requireText('try { await dbWriteQueue; } catch (_) {}', 'image sends can overlap IndexedDB cloning with request serialization')
if (html.includes('push(String(reader.result || ""), file.type || "image/jpeg")')) {
  throw new Error('image staging still keeps an unbounded original base64 payload')
}
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

if (!sw.includes('const CACHE = "role-chat-cache-v320";')) {
  throw new Error('service worker cache was not bumped for the image fixes')
}

console.log('image attachment regression: 18 checks passed')

{
  const { readFileSync } = await import("node:fs");
  const src = readFileSync(new URL("../index.html", import.meta.url), "utf8");
  if (!src.includes('thumbImg.onclick = (event) => { event.stopPropagation(); openImageGallery(pendingImages, pendingIndex); };'))
    throw new Error("pending image thumbnails cannot be opened before sending");
}
