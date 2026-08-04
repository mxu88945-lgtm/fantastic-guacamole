import fs from 'node:fs'

const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8')
const sw = fs.readFileSync(new URL('../sw.js', import.meta.url), 'utf8')

const requireText = (text, message) => {
  if (!html.includes(text)) throw new Error(message)
}
const rejectText = (text, message) => {
  if (html.includes(text)) throw new Error(message)
}

requireText('id="file-input" accept=".txt,.md,.markdown,.json,.csv,.log,.js,.ts,.py,.html,.css,.xml,.yml,.yaml,text/*" multiple',
  'composer file picker does not support selecting multiple text files')
requireText('const TEXT_FILE_MAX_BYTES = 1024 * 1024;',
  'text attachment ceiling is not the intended 1MB')
requireText('type: "file",', 'selected text files are not stored as attachment parts')
requireText('function fileCardHtml(filePart)', 'file attachment card renderer is missing')
requireText('if (p.type === "file") return filePromptText(p);',
  'file contents are not expanded for text-only model requests')
requireText('p.type === "image" || p.type === "sticker" || p.type === "file"',
  'edit-and-resend does not preserve file attachments')
rejectText('已插入文件内容', 'legacy behavior still inserts an entire file into the composer')

if (!sw.includes('const CACHE = "role-chat-cache-v138";')) {
  throw new Error('service worker cache was not bumped for file attachments')
}

console.log('file attachment regression: 8 checks passed')
