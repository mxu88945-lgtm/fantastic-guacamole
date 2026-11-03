import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// v306: 幕后手记 — the actor's private rant tag is hidden from the stage and saved per RP conversation.
const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const sw = readFileSync(new URL("../sw.js", import.meta.url), "utf8");
assert.ok(sw.includes("role-chat-cache-v306"), "sw cache version");
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
