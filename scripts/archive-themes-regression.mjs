import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const manuscript = readFileSync(new URL('../src/manuscript-themes.css', import.meta.url), 'utf8');
const archives = readFileSync(new URL('../src/theme-archives.css', import.meta.url), 'utf8');
const catalogContext = vm.createContext({ settings: { themeName: 'snowblush' } });
vm.runInContext(html.slice(html.indexOf('const THEMES = ['), html.indexOf('function applyTheme()')), catalogContext);
const keys = vm.runInContext('THEMES.map(theme => theme.key)', catalogContext);
for (const key of ['snowblush', 'diffuse', 'gold', 'mistgreen', 'tidalpearl', 'tidalharbor']) assert.ok(!keys.includes(key), `retired theme ${key} must not appear in picker or cycling`);
for (const key of ['claude', 'white', 'frostbubble', 'amberglow', 'liquidglass', 'paper', 'scrapbook', 'academy', 'vinyl']) assert.ok(keys.includes(key), `retained theme ${key} must remain available`);
assert.equal(catalogContext.currentTheme().key, 'claude', 'a retired saved theme must have a usable fallback');
assert.ok(!archives.includes('archive-castle.svg') && archives.includes("content: '♫'"), 'autumn divider should use a quiet musical rule');
assert.match(manuscript, /body:not\(\.rp-chat-active\) \.main > \.chat\s*\{[^}]*min-height: 0;[^}]*overflow-x: hidden;[^}]*flex: 1 1 0;/, 'main chat must shrink within the keyboard viewport and own scrolling');
assert.match(manuscript, /body:not\(\.rp-chat-active\) \.main > \.composer-wrap\s*\{[^}]*flex: 0 0 auto;/, 'composer must remain outside the scrolling message list');
assert.match(manuscript, /body:not\(\.rp-chat-active\) \.main > header\s*\{[^}]*border-bottom: 0;/, 'manuscript header must not draw a line across the dashboard');
assert.match(archives, /\.msg\.archive-row\s*\{[^}]*align-items: stretch;/, 'archive sizing must override the ordinary flat user row alignment');
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
let sceneTheme = 'scene-academy';
let sceneActive = true;
const renderContext = vm.createContext({
  settings: { themeName: 'vinyl' },
  currentConv: () => ({ rpProject: { rpTheme: sceneTheme, actorName: 'Lead' } }),
  isRoleplayConversation: () => sceneActive,
  nameFor: role => role === 'user' ? 'User' : 'Lead',
  avatarFor: () => 'https://example.test/lead.png',
  avatarHtml: () => '<div class="avatar"></div>',
  isImageRef: value => String(value).startsWith('https:'),
  escapeHtml: context.escapeHtml,
  messageContentHtml: () => '<div class="bubble">hello</div>',
  looksLikeRoleplayRichHtml: () => false,
  roleplayRegexDisplay: value => value,
  roleplayMembers: () => [{ id: 'support', avatar: 'https://example.test/support.png' }],
  document: { createElement: () => ({ classList: { add() {} }, querySelectorAll: () => [] }) },
});
vm.runInContext(html.slice(html.indexOf('function mainArchiveHeading('), html.indexOf('function updateScrollControls(')), renderContext);
for (const theme of ['scene-academy', 'scene-vinyl']) {
  sceneTheme = theme;
  const row = renderContext.makeMsgEl('assistant', 'text', { rpSpeakerId: 'support', rpSpeakerName: 'Support', rpSpeakerAvatar: 'https://example.test/support.png' });
  assert.ok(row.innerHTML.includes('support.png') && row.innerHTML.includes('Support'), 'RP archive header must use the speaking cast member');
}
sceneTheme = 'liquid-pearl';
assert.ok(!renderContext.makeMsgEl('assistant', 'text', {}).innerHTML.includes('archive-heading'), 'liquid RP must retain its original message structure');
sceneActive = false;
assert.ok(renderContext.makeMsgEl('user', 'text', {}).innerHTML.includes('archive-heading'), 'main-chat archive selection must remain independent');
console.log('archive theme regression: scoped identity headers, escaped avatars and decorative record artwork passed');
