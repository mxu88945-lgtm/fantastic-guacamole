import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// v307: 幕后手记 — the actor's private rant tag is hidden from the stage and saved per RP conversation.
const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const sw = readFileSync(new URL("../sw.js", import.meta.url), "utf8");
assert.ok(sw.includes("role-chat-cache-v310"), "sw cache version");
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
