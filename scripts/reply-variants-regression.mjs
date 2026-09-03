import { readFileSync } from "node:fs";

const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const sw = readFileSync(new URL("../sw.js", import.meta.url), "utf8");

function ok(condition, message) {
  if (!condition) throw new Error(message);
}

ok(html.includes('data-mact="fork"'), "message menu is missing conversation branching");
ok(html.includes('data-mact="rewind"'), "message menu is missing rewind");
ok(html.includes("function branchConversationFrom(idx)"), "branch implementation is missing");
ok(html.includes("function rewindToMessage(idx)"), "rewind implementation is missing");

ok(html.includes("function recordReplyVariant(turn, list)"), "reply candidate storage is missing");
ok(html.includes("function switchReplyVariant(direction)"), "reply candidate switching is missing");
ok(html.includes('invalidateDerivedForRemovedMessages(currentTail, "reply-variant-switch")'),
  "switching candidates must invalidate derived memory from the reply being hidden");
ok(html.includes("reactivateDerivedForMessages(restored)"),
  "switching candidates must restore provenance-linked memory for the selected reply");
ok(html.includes("state.variants.length < 2"), "candidate navigation should stay hidden for one reply");
ok(html.includes('className = "reply-variant-nav"'), "candidate navigation UI is missing");

ok(html.includes("不设固定频率"), "sticker prompt should explicitly avoid a fixed cadence");
ok(!html.includes("约每几条一个"), "old mechanical sticker cadence is still present");
ok(sw.includes('const CACHE = "role-chat-cache-v161";'), "service worker cache was not bumped to v160");

console.log("reply variants regression passed");
