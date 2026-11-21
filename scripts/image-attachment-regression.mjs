import fs from 'node:fs'

const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8')
const sw = fs.readFileSync(new URL('../sw.js', import.meta.url), 'utf8')

const requireText = (text, message) => {
  if (!html.includes(text)) throw new Error(message)
}

requireText(
  'msg-photo-stack',
  'chat image preview is not a compact thumbnail grid',
)
requireText('function openImageGallery(parts, initialIndex = 0)', 'swipeable image gallery is missing')
requireText('image-gallery-track', 'image gallery swipe track is missing')
requireText('scroll-snap-type: x mandatory', 'image gallery does not support touch swipes')
requireText('data-gallery-index="${index}"', 'message images are not grouped into a gallery')
requireText('const CHAT_IMAGE_MAX_EDGE = 2048;', 'chat images are not capped before entering conversation state')
requireText('async function prepareChatImage(file)', 'memory-safe image preparation is missing')
requireText('let imageStageQueue = Promise.resolve()', 'multiple selected images are not decoded serially on iOS')
requireText('previewDataUrl || p.dataUrl', 'message bubbles still decode the full provider image for thumbnails')
requireText('previewDataUrl || part.dataUrl', 'composer preview still decodes the full provider image')
requireText('【此前发过的图片】', 'older image pixels are still resent on later requests')
requireText('const liveImages = liveImageMessages(source);', 'image pixels are not limited to the current turn (v377)')
if (html.includes('systemText + "\\n\\n" + imageMemoPrompt()')) throw new Error('图记 instruction is back in the resident system prompt (v377)')
requireText('messagePromptTokens(usable[i], fileBudget, liveVisual.has(usable[i]))', 'image tokens are counted inside the history window budget')
requireText('await withTimeout(dbWriteQueue, IMAGE_SEND_SAVE_WAIT_MS', 'image sends must flush IndexedDB first, but only for a bounded time')
if (html.includes('try { await dbWriteQueue; } catch (_) {}')) throw new Error('image send waits on IndexedDB without a timeout (v376 regression)')
requireText('withTimeout(prepareChatImage(file), CHAT_IMAGE_STAGE_TIMEOUT_MS', 'one stuck image decode can freeze the serial staging queue')
requireText('withTimeout(Promise.all(attachmentStaging)', 'send waits on image staging without a timeout')
requireText('signal: visionAbort.signal', 'vision relay request has no timeout')
requireText('db.onclose = () => { if (appDb === db) appDb = null; };', 'stale IndexedDB connection is never dropped after iOS suspends the PWA')
requireText('withTimeout(write, IDB_TX_TIMEOUT_MS', 'a hung IndexedDB transaction can block every later save')
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

if (!sw.includes('const CACHE = "role-chat-cache-v407";')) {
  throw new Error('service worker cache was not bumped for the image fixes')
}

console.log('image attachment regression: 26 checks passed')

{
  const { readFileSync } = await import("node:fs");
  const src = readFileSync(new URL("../index.html", import.meta.url), "utf8");
  if (!src.includes('thumbImg.onclick = (event) => { event.stopPropagation(); openImageGallery(pendingImages, pendingIndex); };'))
    throw new Error("pending image thumbnails cannot be opened before sending");
}
