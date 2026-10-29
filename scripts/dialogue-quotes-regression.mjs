import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const context = vm.createContext({});
vm.runInContext(html.slice(html.indexOf('function escapeHtml('), html.indexOf('// ---------- Rendering messages ----------')), context);
for (const story of [false, true]) {
  for (const text of ['"直引号对白。"', '**"直引号加粗对白。"**', '*"直引号斜体对白。"*', '他说："直引号对白。"', '“弯引号对白。”', '「直角引号对白。」', '『双直角引号对白。』']) {
    const rendered = context.renderMarkdown(text, story);
    assert.match(rendered, /class="chat-quote"/, `${story ? 'RP' : 'main'} missed ${text}`);
    assert.equal((rendered.match(/<span\b/g) || []).length, (rendered.match(/<\/span>/g) || []).length);
  }
  const multiline = context.renderMarkdown('"第一行对白\n第二行对白。"', story);
  assert.equal((multiline.match(/class="chat-quote"/g) || []).length, 2);
  assert.match(multiline, /第一行对白<\/span><\/p><p><span class="chat-quote">第二行对白/);
  for (const code of ['`const x = "原样保留"`', '```js\nconst x = "原样保留";\n```', '`“代码内的弯引号”`']) {
    const rendered = context.renderMarkdown(code, story);
    assert.match(rendered, /<code>/);
    assert.doesNotMatch(rendered, /class="chat-quote"/);
  }
  const escaped = context.renderMarkdown('"<img src=x onerror=alert(1)>"', story);
  assert.ok(escaped.includes('&lt;img') && !escaped.includes('<img'));
}
console.log('dialogue quote regression: punctuation, emphasis, soft line breaks, code and HTML safety passed');
