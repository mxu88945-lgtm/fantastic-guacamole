import assert from "node:assert/strict";
import { readFileSync, statSync } from "node:fs";

const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const sw = readFileSync(new URL("../sw.js", import.meta.url), "utf8");
const copyStatic = readFileSync(new URL("./copy-static.mjs", import.meta.url), "utf8");
assert.ok(sw.includes('const CACHE = "role-chat-cache-v372";'), "service worker cache bumped for 立绘模式");

// ---- pure classifier from index.html ----
const start = html.indexOf("/* sprite-mode:start");
const end = html.indexOf("/* sprite-mode:end */");
assert.ok(start > 0 && end > start, "sprite-mode helper block is missing from index.html");
const lib = new Function(html.slice(start, end) + `
return { classifySpriteMood, spriteMoodText, spriteReplyTail };`)();
const { classifySpriteMood: mood } = lib;

assert.equal(mood("（他皱眉，沉下脸）不许再熬夜了。"), "angry");
assert.equal(mood("啧，你还敢跟我顶嘴？"), "angry");
assert.equal(mood("他勾唇轻笑，挑眉看你：“这么得意？”"), "smirk");
assert.equal(mood("乖，过来。"), "smirk");
assert.equal(mood("他耳根有点红，轻声哄你：“宝宝，抱一下。”"), "shy");
assert.equal(mood("心软下来，温柔地亲了亲你的额头。"), "shy");
assert.equal(mood("嗯。知道了，早点睡。"), "cold");
assert.equal(mood(""), "cold");
assert.equal(mood(null), "cold");
assert.equal(mood("抱歉，刚才在开会。"), "cold", "抱歉 is not a hug");
assert.equal(mood("[自我卡:喜好|喜欢她笑]\n嗯。"), "cold", "status/tool markers are not scored");
assert.equal(mood("<span title=\"笑\" class=\"smirk\">知道了。</span>"), "cold", "html markup is not scored");
assert.equal(mood("啧。笑什么。"), "angry", "ties prefer the stronger mood");

// tail of his turn: multi-bubble segments + reminder cards skipped, stops at her message
const read = (m) => m.content;
const list = [
  { role: "assistant", content: "宝宝" },
  { role: "user", content: "我生气了" },
  { role: "assistant", content: "啧。" },
  { role: "assistant", content: "不许生气。" },
  { role: "reminder", text: "喝水" },
];
assert.equal(lib.spriteReplyTail(list, read), "啧。\n不许生气。");
assert.equal(mood(lib.spriteReplyTail(list, read)), "angry");
assert.equal(lib.spriteReplyTail([{ role: "user", content: "hi" }], read), "");

// ---- wiring ----
assert.ok(/<input type="checkbox" id="spriteMode"[^>]*>\s*立绘模式/.test(html), "立绘模式 toggle exists in settings");
assert.ok(/spriteMode:\s*false/.test(html), "立绘模式 defaults to off");
assert.ok(html.includes('"locationAware","spriteMode"'), "spriteMode is a synced setting");
assert.ok(html.includes('<div id="sprite-stage" aria-hidden="true" hidden>'), "sprite stage starts hidden");
assert.ok(/#sprite-stage \{[^}]*pointer-events: none/.test(html), "sprite never takes taps");
assert.ok(/#sprite-stage \{[^}]*z-index: 0/.test(html), "sprite sits below the messages");
assert.ok(!/#sprite-stage[^{]*\{[^}]*backdrop-filter/.test(html), "no backdrop-filter on the sprite");
for (const cls of ["html[data-kb] #sprite-stage", "body.dashboard-open #sprite-stage", "body.rp-chat-active #sprite-stage", "body.rp-theater-open #sprite-stage"])
  assert.ok(html.includes(cls), `sprite hidden for ${cls}`);
assert.ok(html.includes("syncSpriteStage();  // 立绘模式"), "expression refreshes after each finished reply");

// prompts / memory / export never read the sprite
const promptish = html.slice(html.indexOf("async function send("), html.indexOf("async function send(") + 400);
assert.ok(!promptish.includes("sprite"), "send() itself does not touch the sprite");
assert.ok(!/systemText[^\n]*sprite/i.test(html), "no sprite text in the system prompt");

// ---- assets ----
for (const m of ["cold", "shy", "angry", "smirk"]) {
  const url = new URL(`../sprites/guqiyan_${m}.webp`, import.meta.url);
  const buf = readFileSync(url);
  assert.equal(buf.slice(0, 4).toString(), "RIFF", `${m} is RIFF`);
  assert.equal(buf.slice(8, 12).toString(), "WEBP", `${m} is WebP`);
  assert.ok(statSync(url).size < 300 * 1024, `${m} sprite under 300KB`);
  assert.ok(html.includes(`sprites/guqiyan_${m}.webp`), `${m} sprite referenced`);
}
assert.ok(copyStatic.includes("sprites/guqiyan_${mood}.webp"), "copy-static ships the sprites to dist");

console.log("sprite-mode regression passed");
