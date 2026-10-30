import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const context = vm.createContext({
  isImageRef: value => /^(https?:\/\/|data:image\/)/.test(value || ''),
  escapeHtml: value => String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'),
});
vm.runInContext(html.slice(html.indexOf('function mainArchiveHeading('), html.indexOf('function makeMsgEl(')), context);
const head = context.mainArchiveHeading('academy', '<script>name</script>', 'https://example.test/" onerror="x', true);
assert.ok(head.includes('&lt;script&gt;') && !head.includes('<script>'));
assert.ok(head.includes('&quot; onerror=&quot;') && !head.includes('" onerror="'));
assert.ok(head.includes('A+') && !head.includes('archive-kicker'));
const record = context.mainArchiveHeading('vinyl', '角色', '', false);
assert.ok(record.includes('archive-disc') && record.includes('角色'));
assert.ok(!record.includes('<button') && !record.includes('archive-grade'));
assert.ok(html.includes('const archiveTheme = !isRoleplayConversation()'), 'the main archive layout must not own RP messages');
assert.ok(html.includes('priorThemeKey !== t.key') && html.includes('renderMessages();'), 'switching themes must refresh the identity header DOM');
console.log('archive theme regression: scoped identity headers, escaped avatars and decorative record artwork passed');
