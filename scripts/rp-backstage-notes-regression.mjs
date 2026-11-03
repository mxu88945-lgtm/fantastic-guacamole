import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// v307: 幕后手记 — the actor's private rant tag is hidden from the stage and saved per RP conversation.
const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const sw = readFileSync(new URL("../sw.js", import.meta.url), "utf8");
assert.ok(sw.includes("role-chat-cache-v312"), "sw cache version");
const a = html.indexOf("const RP_NOTE_TAG"), b = html.indexOf("function rpBackstageNoteRule");
const { hide, TAG } = new Function(`${html.slice(a, b)}; return { hide: hideRpBackstageNotes, TAG: RP_NOTE_TAG };`)();
assert.equal(hide("他抬眼。\n[幕后:她又对那个男配笑，我演得很憋屈。]").trim(), "他抬眼。");
assert.equal(hide("他抬眼。\n【幕后：气死了】").trim(), "他抬眼。");
assert.equal(hide("他抬眼。\n[幕后:正在写还没写完").trim(), "他抬眼。", "streaming partial tag hidden");
assert.equal(hide("[记忆:x] 普通 [括号]"), "[记忆:x] 普通 [括号]", "other tags untouched");
assert.ok(html.includes("rpBackstageNoteRule(backstageName, backstageUserName, p) : \"\""), "rule in stage prompt");
assert.ok(html.includes("extractRpBackstageNotes(assistantMsg.content, assistantMsg.id, !backstageMode && !independent)"), "extract after reply");
assert.ok(html.includes('id="header-rp-notes"') && html.includes('if (a === "rp-notes") openRpBackstageNotes()'), "menu entry");
console.log("RP backstage notes regression: hidden tags, streaming hide, prompt rule and menu entry passed");
const group = readFileSync(new URL("../src/rp-group.js", import.meta.url), "utf8");
assert.ok(group.includes("data-backstage-notes") && group.includes("bridge.openBackstageNotes"), "共演设置 entry");
assert.ok(html.includes("openBackstageNotes: () => openRpBackstageNotes()"), "bridge exposes notes");
// v310: 她可以在手记里回他，下一轮提示他回她，回应后标记已回
assert.ok(html.includes("data-rp-reply-open") && html.includes("data-rp-reply-send"), "reply UI");
assert.ok(html.includes("+ rpBackstagePendingReplyText(userName)"), "pending replies in rule");
assert.ok(html.includes('<div class="rp-note-head">') && !html.includes('<article class="rp-note${n.unread ? " is-new" : ""}"><header>'), "note head is not a global <header>");
{
  const s = html.indexOf("function rpBackstagePendingReplies"), e = html.indexOf("function extractRpBackstageNotes");
  const conv = { rpBackstageNotes: [{ id: "n1", text: "气死了", replies: [{ text: "乖，别气", answered: false }] }] };
  const fn = new Function("currentConv", `${html.slice(s, e)}; return rpBackstagePendingReplyText("周惟惟");`);
  const out = fn(() => conv);
  assert.ok(out.includes("乖，别气") && out.includes("气死了"), "pending reply text");
  conv.rpBackstageNotes[0].replies[0].answered = true;
  assert.equal(fn(() => conv), "", "answered replies not repeated");
}
console.log("RP backstage notes v310 reply regression passed");
// v311: 手记成为他本人的记忆：戏里带最近+命中的旧手记，主聊天只带最近 1 篇 + 话题命中
{
  const s = html.indexOf("function rpBackstageSceneSnippet"), e = html.indexOf("function extractRpBackstageNotes");
  const ms = html.indexOf("const MEM_STOP"), me = html.indexOf("function memScore");
  const memEnd = html.indexOf("\n}", me) + 2;
  const now = Date.now();
  const rp = { space: "roleplay", title: "谢聿衡的故事", rpBackstageNotes: [
    { id: "a", ts: now - 9e7, text: "陆屿那段我真的吃醋了，看她对陆屿笑我就烦", scene: "陆屿递过伞", replies: [] },
    { id: "b", ts: now - 1e5, text: "今晚这场戏演得我憋屈死了", scene: "谢聿衡沉默", replies: [{ text: "乖", answered: true }] } ], messages: [] };
  const env = new Function("currentConv", "roleConvs", "isRoleplayConversation", "currentMemoryRecallQuery", "messageText",
    `${html.slice(ms, memEnd)}\n${html.slice(s, e)}; return { main: buildBackstageNotesMemoryText, own: rpBackstageOwnHistoryText, snip: rpBackstageSceneSnippet };`);
  let q = "今天好累";
  const api = env(() => ({ space: "chat" }), () => [rp], c => (c || { space: "chat" }).space === "roleplay", () => q, m => m.content);
  const plain = api.main();
  assert.ok(plain.includes("憋屈") && !plain.includes("陆屿那段"), "unrelated main turn: only newest recent note");
  q = "你上次是不是因为陆屿吃醋了";
  const hit = api.main();
  assert.ok(hit.includes("陆屿那段") && hit.includes("《谢聿衡的故事》"), "recall old note by topic");
  q = "谢聿衡那部剧你还记得吗";
  const named = api.main();
  assert.ok(named.includes("陆屿那段") && named.includes("憋屈"), "naming the script pulls its notes");
  assert.ok(api.own(rp).includes("你之前在这本戏的幕后写过"), "RP side sees own notes");
  assert.ok(api.snip("他抬眼。[记忆:x]").indexOf("记忆") < 0, "scene snippet strips tags");
}
assert.ok(html.includes('key: "backstageNotes"'), "main chat memory block");
console.log("RP backstage notes v311 memory regression passed");
