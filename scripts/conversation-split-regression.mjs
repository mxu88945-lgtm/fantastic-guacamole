import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// v305: each conversation is its own IndexedDB value; saves only rewrite changed ones.
const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const sw = readFileSync(new URL("../sw.js", import.meta.url), "utf8");
assert.ok(sw.includes("role-chat-cache-v337"), "sw cache version");
const a = html.indexOf("const CONV_KEY_PREFIX"), b = html.indexOf("async function migrateConversationsToDb");
assert.ok(a > 0 && b > a, "split persistence block present");
const db = new Map(); let puts = [];
const env = {
  dbPut: async (k, v) => { puts.push(k); db.set(k, structuredClone(v)); },
  dbGet: async k => db.get(k), dbDelete: async k => { db.delete(k); },
  localStorage: { removeItem() {} },
};
const fn = new Function(...Object.keys(env), `let dbWriteQueue = Promise.resolve();\n${html.slice(a, b)}\nreturn { splitLegacyConversations, loadSplitConversations, queueConversationWrite, convForceDirty };`);
const api = fn(...Object.values(env));
const legacy = [{ id: "a", title: "A", messages: [{ id: 1, content: "x" }] }, { id: "b", title: "B", messages: [] }];
await api.splitLegacyConversations(legacy);
const loaded = await api.loadSplitConversations();
assert.equal(loaded.length, 2);
puts = []; await api.queueConversationWrite(loaded, "a");
assert.deepEqual(puts, ["conv:a", "currentId"], "untouched conversations are not rewritten");
loaded[1].messages.push({ id: 2, content: "y" });
puts = []; await api.queueConversationWrite(loaded, "a");
assert.ok(puts.includes("conv:b"), "changed conversation is rewritten");
loaded[1].messages[0].content = "z"; api.convForceDirty.add("b");
puts = []; await api.queueConversationWrite(loaded, "a");
assert.ok(puts.includes("conv:b"), "force-dirty conversation is rewritten");
puts = []; await api.queueConversationWrite([loaded[0]], "a");
assert.ok(!db.has("conv:b") && db.get("convIds").length === 1, "deleted conversation removed");
assert.ok(html.includes('stored = await dbGet("conversations");') && html.includes("await splitLegacyConversations(stored)"), "legacy blob is split on first run");
assert.ok(html.includes("setTimeout(onAppActive, 8000)") && html.includes("shrinkOldChatImages"), "startup work is staggered");
console.log("Conversation split regression: per-conversation saves, deletion, legacy split and staggered startup passed");
