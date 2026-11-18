// v385：消息底部照惟境——••• 收起，文字小胶囊（复制/引用/…/删除），保留时间。
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const sw = readFileSync(new URL("../sw.js", import.meta.url), "utf8");
assert.ok(sw.includes("role-chat-cache-v403"));
assert.ok(html.includes("function collapseMsgActionBar(bar, messageIndex)"));
assert.equal((html.match(/collapseMsgActionBar\(bar, messageIndex\);/g) || []).length, 2, "user + assistant bars collapse");
for (const word of ['addText("引用"', 'addText("删除"', 'addText("更多"', '"重新生成": "重新生成"', '"改文字": "编辑"']) assert.ok(html.includes(word), word);
assert.ok(html.includes('.msg-actions .msg-pill[hidden] { display: none; }'));
assert.ok(html.includes("msg-local-time"), "time stays");
console.log("msg-footer regression ok");
