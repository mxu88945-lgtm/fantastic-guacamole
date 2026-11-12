import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const sw = readFileSync(new URL("../sw.js", import.meta.url), "utf8");
assert.ok(sw.includes('const CACHE = "role-chat-cache-v366";'), "service worker cache bumped for the self-card release");

// ---- pure helpers from index.html ----
const start = html.indexOf("/* self-card:start");
const end = html.indexOf("/* self-card:end */");
assert.ok(start > 0 && end > start, "self-card helper block is missing from index.html");
const lib = new Function(html.slice(start, end) + `
return { SELF_CARD_SECTIONS, SELF_CARD_SECTION_MAX, SELF_CARD_TOTAL_MAX, SELF_CARD_HISTORY_MAX, selfCardSection, selfCardLabel,
  normalizeSelfCard, normalizeSelfCardHistory, selfCardLength, replaceSelfCard, setSelfCardSection, restoreSelfCard,
  parseSelfCardTag, stripSelfCardTags, extractSelfCardEdit, buildSelfCardPrompt };`)();

// sections / aliases (same keys as 惟境 personaSelfCard.ts)
assert.deepEqual(lib.SELF_CARD_SECTIONS.map((s) => s.label), ["性格", "喜好", "优点", "弱点", "性癖", "缺陷/小毛病", "习惯", "其他"]);
assert.equal(lib.SELF_CARD_SECTION_MAX, 2000);
assert.equal(lib.SELF_CARD_TOTAL_MAX, 16000);
assert.equal(lib.SELF_CARD_HISTORY_MAX, 20);
assert.equal(lib.selfCardSection("爱好"), "likes");
assert.equal(lib.selfCardSection(" 小毛病 "), "flaws");
assert.equal(lib.selfCardSection("缺陷／小毛病"), "flaws");
assert.equal(lib.selfCardSection("「其它」"), "other");
assert.equal(lib.selfCardSection("身高"), null);
assert.equal(lib.selfCardSection("toString"), null, "prototype keys are not sections");

// limits
const big = lib.normalizeSelfCard({ personality: "a".repeat(2500), likes: "b".repeat(2000), strengths: "c".repeat(2000), weaknesses: "d".repeat(2000), kinks: "e".repeat(2000), flaws: "f".repeat(2000), habits: "g".repeat(2000), other: "h".repeat(2000), junk: "x" });
assert.equal(big.personality.length, 2000, "each section ≤2000");
assert.equal(lib.selfCardLength(big), 16000, "total ≤16000");
assert.ok(!("junk" in big));

// tag parsing — last valid tag wins, brackets/colons mixed, content may wrap lines
const reply = "嗯，我知道了。\n[自我卡:喜好|喝美式\n下雨天听歌]\n【自我卡：小毛病｜嘴硬】";
assert.deepEqual(lib.parseSelfCardTag(reply), { key: "flaws", content: "嘴硬" });
assert.equal(lib.parseSelfCardTag("[自我卡:身高|188]"), null, "unknown section ignored");
assert.equal(lib.parseSelfCardTag("[自我卡:喜好|  ]"), null, "empty content ignored");
assert.equal(lib.parseSelfCardTag("普通回复"), null);
const long = lib.parseSelfCardTag(`[自我卡:其他|${"字".repeat(2600)}]`);
assert.equal(long.content.length, 2000, "content capped at 2000");
assert.equal(lib.stripSelfCardTags(`好。\n[自我卡:其他|${"字".repeat(2600)}]`), "好。", "a long tag is still stripped");

// stripping
assert.equal(lib.stripSelfCardTags(reply), "嗯，我知道了。");
assert.equal(lib.stripSelfCardTags("好。\n［自我卡:习惯|早起］"), "好。");
assert.equal(lib.stripSelfCardTags("没有标签 [记忆:x] [点歌:晴天]"), "没有标签 [记忆:x] [点歌:晴天]", "unrelated tags untouched");
// half-written while streaming
assert.equal(lib.stripSelfCardTags("嗯。\n[自我卡:喜好|还没写", true), "嗯。");
assert.equal(lib.stripSelfCardTags("嗯。\n【自我", true), "嗯。");
assert.equal(lib.stripSelfCardTags("嗯。\n[自", true), "嗯。");
assert.equal(lib.stripSelfCardTags("嗯。[", true), "嗯。");
assert.equal(lib.stripSelfCardTags("嗯。[", false), "嗯。[", "final text keeps a lone bracket");
assert.equal(lib.stripSelfCardTags("嗯。\n[自我卡:喜好|被截断的", false), "嗯。", "a truncated tag never shows in the final text");
const extracted = lib.extractSelfCardEdit("先这样。\n[自我卡:性格|话少，但会记得她说过的每件小事]");
assert.equal(extracted.text, "先这样。");
assert.deepEqual(extracted.edit, { key: "personality", content: "话少，但会记得她说过的每件小事" });
assert.deepEqual(lib.extractSelfCardEdit("普通"), { text: "普通", edit: null });

// replace / history / restore — never mutates the holder (原卡 untouched)
const role = { id: "r1", systemPrompt: "原卡：顾祁砚", selfCard: { likes: "咖啡" } };
const frozen = JSON.stringify(role);
const r1 = lib.setSelfCardSection(role, "likes", "咖啡，下雨天", "他改了「喜好」", 1000);
assert.equal(JSON.stringify(role), frozen, "input object is not mutated");
assert.equal(r1.systemPrompt, "原卡：顾祁砚", "original card is never modified");
assert.equal(r1.selfCard.likes, "咖啡，下雨天");
assert.equal(r1.selfCardHistory.length, 1);
assert.deepEqual(r1.selfCardHistory[0].card, { likes: "咖啡" });
assert.equal(r1.selfCardHistory[0].reason, "他改了「喜好」");
assert.equal(lib.setSelfCardSection(r1, "likes", "咖啡，下雨天", "x", 2000), r1, "no change → same object, no history");
const cleared = lib.setSelfCardSection(r1, "likes", "", "她改了「喜好」", 3000);
assert.ok(!cleared.selfCard, "empty content clears the section");
let h = r1;
for (let i = 0; i < 30; i++) h = lib.setSelfCardSection(h, "habits", "习惯" + i, "t", 4000 + i);
assert.equal(h.selfCardHistory.length, 20, "history keeps 20 versions");
const restored = lib.restoreSelfCard(r1, 0, 9000);
assert.deepEqual(restored.selfCard, { likes: "咖啡" }, "restore brings the old version back");
assert.deepEqual(restored.selfCardHistory.at(-1).card, { likes: "咖啡，下雨天" }, "restore keeps the current version in history");
assert.match(restored.selfCardHistory.at(-1).reason, /^恢复到/);
assert.equal(lib.setSelfCardSection({}, "other", "y".repeat(2100), "t", 1).selfCard.other.length, 2000, "section cap trims a manual edit");

// prompt block
const prompt = lib.buildSelfCardPrompt({ likes: "咖啡", flaws: "嘴硬" }, true, "顾祁砚", "周惟惟");
assert.match(prompt, /顾祁砚自己补全的自己/);
assert.ok(prompt.indexOf("【喜好】咖啡") < prompt.indexOf("【缺陷/小毛病】嘴硬"));
assert.match(prompt, /\[自我卡:栏目\|这一栏改完后的全文\]/);
assert.match(prompt, /不会显示给周惟惟/);
assert.match(lib.buildSelfCardPrompt({}, true, "顾祁砚", "你"), /空着的自我卡[\s\S]*不会显示给她/);
assert.equal(lib.buildSelfCardPrompt({}, false, "顾祁砚", "周惟惟"), "", "nothing when empty and switched off");
const offPrompt = lib.buildSelfCardPrompt({ likes: "咖啡" }, false, "顾祁砚", "");
assert.match(offPrompt, /【喜好】咖啡/);
assert.ok(!offPrompt.includes("[自我卡:"), "switched off: card still shown, no edit instructions");

// ---- wiring ----
const inject = html.indexOf('systemText = settings.systemPrompt || "";');
const selfCardAt = html.indexOf("buildSelfCardPrompt(selfCardRole?.selfCard", inject);
const presetAt = html.indexOf("if (globalPresetText) systemText = systemText ?", inject);
assert.ok(inject > 0 && selfCardAt > inject && selfCardAt < presetAt, "self card is injected right after the original card, before global presets");
assert.ok(/if \(!rpProject && typeof buildSelfCardPrompt === "function"\)/.test(html), "main chat only");
assert.ok(!/settings\.systemPrompt\s*=\s*[^=][^;]*selfCard/.test(html), "the original card is never written from the self card");
assert.ok(html.includes("stripSelfCardTags(text, !!streaming);"), "display + streaming preview strip tags");
assert.ok(/function sendContent\(m\) \{[\s\S]{0,400}stripSelfCardTags/.test(html), "history sent to the model is stripped");
assert.ok(/function messageText\(m\) \{[\s\S]{0,400}stripSelfCardTags/.test(html), "memory/summary/recall text is stripped");
assert.ok(/function exportPlainBody\(m\) \{[\s\S]{0,600}stripSelfCardTags/.test(html), "exports are stripped");
assert.ok(/const cleanPartialReply = \(\) => \{[\s\S]{0,2000}stripSelfCardTags\(assistantMsg\.content, true\)/.test(html), "stopped partial replies are stripped");
assert.ok(html.includes("const selfCardEdit = !independent && !replyProject && !backstageMode && settings.selfCardEnabled !== false ? selfCardResult.edit : null;"), "edits apply only in the main chat with the toggle on");
assert.ok(html.includes("applySelfCardReplyEdit(selfCardEdit, replyConv, selfCardTarget);"));
assert.ok(html.includes("showToast(`✎ 他改了自己的「${label}」`"), "toast when he changes it");
assert.ok(html.includes("✎ 他改了自己的「${escapeHtml(selfCardLabel(key))}」"), "chip under the message");
assert.ok(html.includes('selfCardEdit: m.role === "assistant" && !isRoleplayConversation() ? m.selfCardEdit : ""'), "chip rendered from the saved message");
assert.ok(html.includes('id="self-card-panel"') && html.includes('id="self-card-open"'), "settings page + entry");
assert.ok(html.includes('selfCardEnabled: true,'), "toggle defaults on");
assert.ok(/"songPickEnabled","selfCardEnabled"\]/.test(html), "toggle is cloud-synced");
assert.ok(html.includes("window.confirm(\"恢复到这一版？"), "restore asks first");
assert.ok(/document\.addEventListener\("focusout"[\s\S]{0,200}saveSelfCardField/.test(html), "save on blur");
assert.ok(/function closeSelfCardPanel\(\) \{[\s\S]{0,200}saveSelfCardField/.test(html), "save on close");
assert.ok(/const SEL = "[^"]*\.self-card-chip[^"]*#self-card-close[^"]*\.self-card-restore/.test(html), "buttons join the iOS one-tap selector");
assert.ok(!/self-card[^{]*\{[^}]*backdrop-filter/.test(html), "no backdrop-filter on self-card UI");

console.log("self-card regression passed");
