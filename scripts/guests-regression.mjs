import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const sw = readFileSync(new URL("../sw.js", import.meta.url), "utf8");
const mentions = readFileSync(new URL("../src/rp-mentions.js", import.meta.url), "utf8");
assert.ok(sw.includes('const CACHE = "role-chat-cache-v416";'), "service worker cache bumped for the guests release");

// ---- pure helpers from index.html ----
const start = html.indexOf("/* guests:start");
const end = html.indexOf("/* guests:end */");
assert.ok(start > 0 && end > start, "guests helper block is missing from index.html");
const lib = new Function(html.slice(start, end) + `
return { GUEST_LIMIT, GUEST_MAIN_ID, isGuestId, isGuestMessage, guestResolve, guestPresentIds, guestPresentList, guestGroupActive, guestReplyMode,
  guestParseMentions, guestPlanTurn, guestSystemBlock, guestTurnOrder, guestSoloTail, guestAfterTail, guestIsSkip, guestOwnSegment,
  guestStripLeadMarker, guestParseKicks, stripGuestTags, guestWireLabels, guestTrimTurnReplies, guestAppendTail, guestPendingMessages,
  guestMemoryExtractionPrompt, guestParseMemoryJson, guestInvite, guestDismiss, guestAdd, guestUpdate, guestDelete, guestAddMemories, guestExtractMemoryTags };`)();

// library / presence
const role = { id: "r1" };
const conv = { id: "c1", messages: [] };
const ah = lib.guestAdd(role, conv, { source: "custom", name: "阿七", avatar: "🐱", persona: "{{char}}爱笑" }, ["顾祁砚", "惟惟"], 1);
assert.ok(lib.isGuestId(ah.id));
assert.deepEqual(conv.guestIds, [ah.id], "a new guest is invited right away");
const dup = lib.guestAdd(role, conv, { source: "card", name: "顾祁砚", persona: "x" }, ["顾祁砚", "惟惟"], 2);
assert.equal(dup.name, "顾祁砚2", "name clashing with the host gets a suffix");
assert.equal(lib.guestResolve(ah).persona, "阿七爱笑");
assert.equal(lib.guestPresentList(role, conv).length, 2);
assert.ok(lib.guestGroupActive(role, conv));
assert.equal(lib.guestGroupActive(role, { id: "c2" }), false, "no guests → not a group");
assert.equal(lib.guestGroupActive({}, conv), false, "guest ids without a library entry do not count");
lib.guestDismiss(conv, dup.id);
assert.deepEqual(conv.guestIds, [ah.id]);
assert.ok(lib.guestInvite(role, conv, dup.id));
assert.equal(lib.guestInvite(role, conv, dup.id), false, "already present");
for (let i = 0; i < 6; i++) lib.guestAdd(role, conv, { name: "客" + i }, [], 10 + i);
assert.equal(conv.guestIds.length, lib.GUEST_LIMIT, "at most 6 guests at once");

// mentions & turn planning
const speakers = [{ id: "main", name: "顾祁砚", main: true }, { id: "guest-a", name: "阿七" }, { id: "guest-b", name: "阿" }];
assert.deepEqual(lib.guestParseMentions("@阿七 你好 @顾祁砚", speakers), ["guest-a", "main"], "order kept, longer names first");
assert.deepEqual(lib.guestParseMentions("＠所有人 吃饭", speakers), ["main", "guest-a", "guest-b"]);
assert.deepEqual(lib.guestParseMentions("没有点名", speakers), []);
const r2 = { guests: [{ id: "guest-a", name: "阿七", memories: [] }, { id: "guest-b", name: "小林", memories: [] }] };
const c2 = { guestIds: ["guest-a", "guest-b"] };
let plan = lib.guestPlanTurn(r2, c2, "今天好累", { name: "顾祁砚" });
assert.deepEqual(plan.targets, ["main"], "@ mode without @ → only the host");
plan = lib.guestPlanTurn(r2, c2, "@小林 @阿七 出来", { name: "顾祁砚" });
assert.deepEqual(lib.guestTurnOrder(plan, ""), ["guest-b", "guest-a"]);
c2.guestReplyMode = "natural";
plan = lib.guestPlanTurn(r2, c2, "小林你说呢", { name: "顾祁砚" });
assert.equal(plan.targets, null);
assert.equal(plan.cap, 3);
assert.deepEqual(lib.guestTurnOrder(plan, "小林你说呢"), ["guest-b", "main", "guest-a"], "named guests first, then host, then the rest");
assert.equal(lib.guestPlanTurn(r2, { guestIds: [] }, "hi", { name: "顾祁砚" }), null);

// prompt pieces
const names = { char: "顾祁砚", user: "惟惟" };
const sys = lib.guestSystemBlock(plan, names, false);
assert.ok(sys.startsWith("【临时群聊"));
assert.ok(sys.includes("〔阿七｜临时加入的客人〕") && sys.includes("自然接话"));
assert.ok(!sys.includes("[请出:"), "kick rule only when the toggle is on");
assert.ok(lib.guestSystemBlock(plan, names, true).includes("[请出:客人名字]"));
const tail = lib.guestSoloTail(plan, "guest-a", [{ name: "小林", text: "我先说" }], true);
assert.ok(tail.includes("轮到 阿七") && tail.includes("【小林】\n我先说") && tail.includes("[不接话]"));
assert.ok(!lib.guestSoloTail(plan, "main", [], false).includes("[不接话]"));
assert.ok(lib.guestAfterTail(names).includes("只以顾祁砚的身份回复"));

// reply parsing
assert.ok(lib.guestIsSkip("[不接话]") && lib.guestIsSkip("【阿七】\n［不接话］"));
assert.equal(lib.guestIsSkip("我不接话了"), false);
assert.equal(lib.guestOwnSegment("【阿七】\n你好呀\n【顾祁砚】\n别闹", "阿七", ["顾祁砚", "小林"], "惟惟"), "你好呀", "lines written for others are dropped");
assert.equal(lib.guestOwnSegment("你好\n【惟惟】\n我替她说", "阿七", ["顾祁砚"], "惟惟"), "你好");
assert.equal(lib.guestOwnSegment("【其他】正文", "阿七", ["顾祁砚"], "惟惟"), "【其他】正文", "unknown brackets stay as prose");
assert.equal(lib.guestStripLeadMarker("【阿七】\n你好", false), "你好");
assert.equal(lib.guestStripLeadMarker("【阿", true), "", "half marker hidden while streaming");
assert.equal(lib.guestStripLeadMarker("没标记", true), "没标记");
assert.deepEqual(lib.guestParseKicks("出去。\n[请出:阿七]\n[请出：不在场]", r2.guests).map(g => g.id), ["guest-a"]);
assert.equal(lib.stripGuestTags("好。\n[请出:阿七]"), "好。");
assert.equal(lib.stripGuestTags("嗯 [请出", true), "嗯");
assert.equal(lib.stripGuestTags("普通文本 [没事]"), "普通文本 [没事]");
const memo = lib.guestExtractMemoryTags("记下了。[记忆:惟惟怕冷]");
assert.equal(memo.text, "记下了。");
assert.deepEqual(memo.entries.map(e => e.content), ["惟惟怕冷"]);

// wire labels: group → every speaker change labelled; after the group only guest replies
const history = [
  { role: "user", content: "hi" },
  { role: "assistant", content: "a", speakerId: "main" },
  { role: "assistant", content: "a2", speakerId: "main" },
  { role: "assistant", content: "b", speakerId: "guest-a", speakerName: "阿七旧名" },
  { role: "user", content: "again" },
  { role: "assistant", content: "c" },
];
const labelled = lib.guestWireLabels(history, true, "顾祁砚", id => id === "guest-a" ? "阿七" : "");
assert.deepEqual(labelled.map(m => m._guestLabel || ""), ["", "顾祁砚", "", "阿七", "", "顾祁砚"]);
const after = lib.guestWireLabels(history, false, "顾祁砚", () => "");
assert.deepEqual(after.map(m => m._guestLabel || ""), ["", "", "", "阿七旧名", "", ""]);
assert.ok(!("_guestLabel" in history[1]), "stored messages are not touched");
assert.deepEqual(lib.guestTrimTurnReplies([...history, { role: "assistant", content: "turn" }]).map(m => m.content), ["hi", "a", "a2", "b", "again"]);
const wire = [{ role: "user", content: "hi" }];
assert.ok(lib.guestAppendTail(wire, "TAIL", "openai"));
assert.equal(wire[0].content, "hi\n\nTAIL");
const gem = [{ role: "user", parts: [{ text: "hi" }] }];
lib.guestAppendTail(gem, "TAIL", "gemini");
assert.equal(gem[0].parts[1].text, "TAIL");
assert.equal(lib.guestAppendTail([{ role: "assistant", content: "x" }], "TAIL", "openai"), false, "tail only on her message");

// guest memory
const mc = { messages: [
  { role: "user", content: "x", ts: 1, present: ["guest-a"] },
  { role: "assistant", content: "y", ts: 2, speakerId: "guest-a" },
  { role: "assistant", content: "z", ts: 3, speakerId: "main" },
  { role: "user", content: "w", ts: 4 },
], guestMemoryThrough: { "guest-a": 1 } };
assert.deepEqual(lib.guestPendingMessages(mc, "guest-a").map(m => m.ts), [2]);
assert.ok(lib.guestMemoryExtractionPrompt({ name: "阿七", world: "" }, "惟惟", "顾祁砚").includes("只输出 JSON"));
assert.deepEqual(lib.guestParseMemoryJson('```json\n{"memories":[{"title":"称呼","content":"叫她惟惟"}]}\n```'), [{ title: "称呼", content: "叫她惟惟" }]);
assert.deepEqual(lib.guestParseMemoryJson("不是 JSON"), []);
assert.equal(lib.guestAddMemories(role, ah.id, [{ content: "她怕冷" }, { content: "她怕冷" }], 5), 1, "no duplicates");
lib.guestUpdate(role, ah.id, { providerId: "p1", model: "m1" });
assert.equal(role.guests.find(g => g.id === ah.id).model, "m1");
lib.guestUpdate(role, ah.id, { providerId: "" });
assert.ok(!("model" in role.guests.find(g => g.id === ah.id)), "clearing the channel follows the main chat again");
assert.ok(lib.guestDelete(role, ah.id, [conv]));
assert.ok(!conv.guestIds.includes(ah.id));
assert.ok(lib.isGuestMessage({ role: "assistant", speakerId: "guest-x" }));
assert.equal(lib.isGuestMessage({ role: "assistant", speakerId: "main" }), false);

// ---- wiring ----
assert.ok(html.includes('<button data-hact="guests">') && html.includes('else if (a === "guests") openGuestPanel();'), "header ⋯ entry");
assert.ok(html.includes('id="guest-panel"') && html.includes('id="guest-close"'), "panel markup");
assert.ok(html.includes("guestGroupActive(selfCardRoleFor(conv), conv)) return generateGuestGroupReply(conv);"), "generateReply routes groups only when guests are present");
assert.ok(html.includes("async function generateSingleReply(speaker = null, requestSettings = null, guestTurn = null)"));
assert.ok(html.includes("requestSettings, speaker, guestTurn\n"), "streamChat receives the turn");
assert.ok(html.includes("const guestCtx = guestStreamContext(currentConv(), historyWindow.messages, guestTurn);"), "history labels and prompt are built in streamChat");
assert.ok(html.includes('if (guestSystemText) systemText = systemText ? systemText + "\\n\\n" + guestSystemText : guestSystemText;'), "group block rides in the one leading system");
assert.ok(html.includes("if (guestTailText) guestAppendTail("), "per-turn tail on her last message");
assert.ok(html.includes("if (guestSpeaking) break;"), "only the host gets tool rounds");
assert.ok(html.includes("if (typeof stripGuestTags === \"function\") text = stripGuestTags(text, streaming);"), "every strip point hides guest tags");
assert.ok(html.includes("m._guestLabel && typeof content === \"string\""), "wire label in sendContent");
assert.ok(html.includes("speakerId: m.speakerId, speakerName: m.speakerName, speakerAvatar: m.speakerAvatar,"), "bubbles get the speaker");
assert.ok(html.includes("guestCast: () =>"), "@ picker bridge");
assert.ok(mentions.includes("bridge.guestCast?.()") && mentions.includes('"jyc:guests-changed"'), "@ picker understands guests");
assert.ok(mentions.includes("scene && !scene.guestCast && scene.id === selectedSceneId"), "guest @ never becomes an RP recipient");
assert.ok(html.includes("#guest-close, #guest-panel button, #global-prompt-add\";"), "iOS one-tap selector");

// no guests → streamChat context is null (request unchanged)
const ctxStart = html.indexOf("function guestStreamContext(");
const ctxBody = html.slice(ctxStart, html.indexOf("\n}\n", ctxStart));
assert.ok(ctxBody.includes("if (!active && !hadGuests) return null;"), "nothing changes without guests");

assert.ok(html.includes('data-guest-field="keepStory"'), "card guests can opt into their original story");
assert.ok(html.includes("function guestCardRule(") && html.includes("guest.keepStory === true"), "keepStory toggles the 借人不借戏 rule per guest");

assert.ok(html.includes("guestIsMentionOnly(m, guestMentionNames)") && html.includes("guestStripMentions(m.content, guestMentionNames)"), "@ names hidden from her bubble, pure-@ messages hidden");

{
  // v401：没勾原卡剧情的客人开口时，看不到别的客人的原卡剧情
  const kid = { id: "g-kid", name: "小Eli", fromCard: true, keepStory: true, persona: "三岁", world: "在孤儿院长大", memories: [] };
  const other = { id: "g-b", name: "阿七", fromCard: true, persona: "侠客", world: "", memories: [] };
  const p2 = { mode: "mention", guests: [kid, other] };
  const asOther = lib.guestSystemBlock(p2, names, false, "g-b");
  assert.ok(!asOther.includes("孤儿院") && asOther.includes("阿七不在那出戏里") && asOther.includes("这一轮是阿七开口"), "strip guest does not see keepStory guest's story");
  for (const id of ["g-kid", undefined]) assert.ok(lib.guestSystemBlock(p2, names, false, id).includes("孤儿院"), "keepStory guest and host still see it");
}

console.log("guests regression passed");
