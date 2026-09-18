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
requireText('const REFERENCE_FILE_PROMPT_CHAR_BUDGET = 8000;',
  'large reference files are not bounded before entering model context')
requireText('type: "file",', 'selected text files are not stored as attachment parts')
requireText('function fileCardHtml(filePart)', 'file attachment card renderer is missing')
requireText('if (p.type === "file") return filePromptText(p);',
  'file contents are not expanded for text-only model requests')
requireText('content = fileAwareContentOrder(content);',
  'file references are not ordered before the current user request')
requireText('【用户当前请求】',
  'current user instruction is not repeated after the reference attachment')
requireText('【只读附件到此结束】',
  'reference attachment has no trailing identity boundary')
requireText('p.type === "image" || p.type === "sticker" || p.type === "file"',
  'edit-and-resend does not preserve file attachments')
rejectText('已插入文件内容', 'legacy behavior still inserts an entire file into the composer')

if (!sw.includes('const CACHE = "role-chat-cache-v168";')) {
  throw new Error('service worker cache was not bumped for file attachments')
}

console.log('file attachment regression: 8 checks passed')
