import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const manuscript = readFileSync(new URL('../src/manuscript-themes.css', import.meta.url), 'utf8');
const rpManuscript = readFileSync(new URL('../src/rp-manuscript-themes.css', import.meta.url), 'utf8');
const archives = readFileSync(new URL('../src/theme-archives.css', import.meta.url), 'utf8');
const catalogContext = vm.createContext({ settings: { themeName: 'snowblush' } });
vm.runInContext(html.slice(html.indexOf('const THEMES = ['), html.indexOf('function applyTheme()')), catalogContext);
const keys = vm.runInContext('THEMES.map(theme => theme.key)', catalogContext);
for (const key of ['snowblush', 'diffuse', 'gold', 'mistgreen', 'tidalpearl', 'tidalharbor']) assert.ok(!keys.includes(key), `retired theme ${key} must not appear in picker or cycling`);
for (const key of ['claude', 'white', 'frostbubble', 'amberglow', 'liquidglass', 'paper', 'scrapbook', 'academy', 'vinyl', 'letter', 'mistnote']) assert.ok(keys.includes(key), `retained theme ${key} must remain available`);
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
assert.ok(keys.includes('mobile'), 'the mobile card theme must be selectable in main chat');
const mobile = context.mainArchiveHeading('mobile', '<角色>', '', true);
assert.ok(mobile.includes('&lt;角色&gt;') && mobile.includes('我的消息') && mobile.includes('mobile-status'));
const mobileCharacter = context.mainArchiveHeading('mobile', '顾祁砚', '', false);
assert.ok(mobileCharacter.includes('他的来信') && !mobileCharacter.includes('角色来信'), 'main mobile character cards must use the requested letter label');
assert.ok(!mobile.includes('archive-grade') && !mobile.includes('3759908261'));
assert.ok(archives.includes('.archive-mobile.user .archive-heading { flex-direction: row-reverse;'), 'user mobile identity must dock right');
assert.ok(archives.includes('margin-left: auto !important; margin-right: 0 !important;'), 'short and long user messages must anchor right');
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
for (const theme of ['scene-academy', 'scene-vinyl', 'scene-mobile', 'scene-letter', 'scene-mistnote']) {
  sceneTheme = theme;
  const row = renderContext.makeMsgEl('assistant', 'text', { rpSpeakerId: 'support', rpSpeakerName: 'Support', rpSpeakerAvatar: 'https://example.test/support.png' });
  assert.ok(row.innerHTML.includes('support.png') && row.innerHTML.includes('Support'), 'RP archive header must use the speaking cast member');
}

assert.ok(html.includes('key: "letter", name: "雾白来信"'), 'main Mist Letter theme is missing');
assert.ok(html.includes('"scene-letter": "letter"'), 'RP Mist Letter archive mapping is missing');
assert.ok(html.includes('theme === "letter"'), 'Mist Letter profile heading is missing');
assert.ok(html.includes('key: "mistnote", name: "雾蓝长笺"'), 'main Mist Note theme is missing');
assert.ok(html.includes('"scene-mistnote": "mistnote"'), 'RP Mist Note archive mapping is missing');
assert.ok(html.includes('theme === "mistnote"'), 'Mist Note identity heading is missing');
assert.ok(archives.includes('.archive-mistnote.user') && archives.includes('display: table; width: fit-content; max-width: 100%;'), 'main Mist Note right-side user and independent quote bubbles are missing');
assert.ok(archives.includes('width: calc(100vw - 20px); max-width: calc(100vw - 20px);') && archives.includes('margin-left: calc(50% - 50vw + 10px) !important;') && archives.includes('.archive-row.archive-mistnote.user { width: min(92%, calc(100vw - 20px)); padding-left: 0; padding-right: 0; margin-left: auto !important; margin-right: calc(50% - 50vw + 10px) !important; }'), 'main Mist Note character cards must fill the mobile viewport without widening user cards');
assert.ok(archives.includes('.archive-mistnote:not(.user) .archive-body :is(.message-quote,.chat-quote)') && archives.includes('display: table !important; box-sizing: border-box; width: fit-content !important; max-width: 100% !important;') && archives.includes('overflow-wrap: anywhere; box-decoration-break: slice;'), 'main Mist Note character dialogue must stay in one content-sized bubble and wrap only at the prose width');
assert.ok(rpManuscript.includes('[data-rp-theme="scene-mistnote"]') && rpManuscript.includes('margin: 0 0 1.18em !important'), 'RP Mist Note prose spacing is missing');
assert.ok(manuscript.includes('[data-theme-key="letter"]') && manuscript.includes('.msg.archive-letter.user'), 'main Mist Letter user-right layout is missing');
assert.ok(rpManuscript.includes('[data-rp-theme="scene-letter"]') && rpManuscript.includes('.msg.archive-letter.user'), 'RP Mist Letter user-right layout is missing');
assert.ok(manuscript.includes('.archive-letter.user .archive-portrait') && manuscript.includes('width: fit-content; max-width: 100%; margin-left: auto;'), 'main Mist Letter user identity and short dialogue must dock right');
assert.ok(rpManuscript.includes('.archive-letter.user .archive-heading-copy') && rpManuscript.includes('width: fit-content !important; max-width: 100% !important; margin-left: auto !important;'), 'RP Mist Letter user identity and short dialogue must dock right');
assert.ok(manuscript.includes(':is(.message-quote,.chat-quote)') && rpManuscript.includes(':is(.message-quote,.chat-quote)'), 'Mist Letter quote capsules are missing');
for (const theme of ['scene-paper', 'scene-scrapbook', 'scene-academy', 'scene-vinyl', 'scene-mobile', 'scene-letter', 'scene-mistnote']) {
  assert.ok(rpManuscript.includes(`[data-rp-theme="${theme}"] #messages .msg :is(.rp-story-text,.roleplay-opening-text) :is(.chat-quote,.message-quote)`) || rpManuscript.includes(`[data-rp-theme="${theme}"] #messages .msg :is(.rp-story-text,.roleplay-opening-text) :is(.message-quote,.chat-quote)`), `${theme} must theme dialogue in both replies and opening text`);
  assert.ok(html.includes(`"${theme}": \`<style>`), `${theme} must theme dialogue inside rich opening cards`);
}
assert.ok(html.includes('${base}${manuscriptCss}${greetingBridge}'), 'rich opening cards must inject the active manuscript theme after the generic quote CSS');
sceneTheme = 'liquid-pearl';
assert.ok(!renderContext.makeMsgEl('assistant', 'text', {}).innerHTML.includes('archive-heading'), 'liquid RP must retain its original message structure');
sceneActive = false;
assert.ok(renderContext.makeMsgEl('user', 'text', {}).innerHTML.includes('archive-heading'), 'main-chat archive selection must remain independent');
console.log('archive theme regression: scoped identity headers, escaped avatars and decorative record artwork passed');

const htmlMist = readFileSync(new URL("../index.html", import.meta.url), "utf8");
assert.ok(htmlMist.includes('const mistTime = !hideStats && Number.isFinite(Number(opts.ts));') && htmlMist.includes('tm.className = "msg-latency msg-local-time"'), 'Every main-chat theme footer shows local time instead of latency');
assert.ok(archives.includes('.archive-mistnote:not(.user) .mistnote-kicker { flex-direction: row-reverse; }'), 'Mist Note kicker: his on the right');
// v316 暗夜流光（v325 起浅色）
assert.ok(html.includes('key: "nightglow", name: "暗夜流光", dark: false') && html.includes('"scene-nightglow": "nightglow"') && html.includes('theme === "nightglow"'), 'Nightglow theme wiring missing');
assert.ok(archives.includes('.archive-nightglow.user .archive-heading { flex-direction: row-reverse !important; }') && archives.includes('color:#a8383c!important') && archives.includes('"Huiwen-mincho"') && archives.includes('#f6f1ee'), 'Nightglow user right + red serif quotes missing');
assert.ok(rpManuscript.includes('[data-rp-theme="scene-nightglow"]'), 'RP Nightglow css missing');
