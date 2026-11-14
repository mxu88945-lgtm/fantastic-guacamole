import assert from "node:assert/strict";
import { readFileSync, statSync } from "node:fs";

const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const sw = readFileSync(new URL("../sw.js", import.meta.url), "utf8");
const copyStatic = readFileSync(new URL("./copy-static.mjs", import.meta.url), "utf8");
assert.ok(sw.includes('const CACHE = "role-chat-cache-v373";'), "service worker cache bumped for 立绘模式 chibi");

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
const stageCss = (html.match(/  #sprite-stage \{[^}]*\}/) || [""])[0];
assert.ok(/position: absolute; right: \d+px; bottom: calc\(var\(--composer-h/.test(stageCss), "chibi stands in the bottom-right corner, above the composer");
assert.ok(/height: clamp\(100px, [^,]+, 140px\)/.test(stageCss), "chibi is small (100–140px tall)");
assert.ok(/z-index: 1;/.test(stageCss), "chibi shares the chat/composer layer");
const iStage = html.indexOf('<div id="sprite-stage"'), iChat = html.indexOf('<div class="chat" id="chat">'), iComposer = html.indexOf('<div class="composer-wrap">');
assert.ok(iChat < iStage && iStage < iComposer, "chibi paints above the messages but below the composer and its menus");
assert.ok(html.includes('sprite.style.setProperty("--composer-h", h + "px")'), "composer height is fed to the chibi");
assert.ok(!html.includes("html[data-sprite] body:not(.rp-chat-active) .main > .chat { background: transparent; }"), "v372 theme-transparent override removed");
assert.ok(!/#sprite-stage[^{]*\{[^}]*mask-image/.test(html), "v372 bottom mask fade removed");
assert.ok(/#sprite-stage\.hop \{ animation: sprite-hop/.test(html) && /@keyframes sprite-hop \{[^\n]*translateY\(-6px\)/.test(html), "tiny hop on expression change");
assert.ok(/prefers-reduced-motion: reduce\)[^@]*#sprite-stage\.hop \{ animation: none; \}/.test(html), "hop respects reduced motion");
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
  assert.ok(statSync(url).size < 150 * 1024, `${m} chibi under 150KB`);
  const w = buf.readUIntLE(buf.indexOf("VP8X") + 12, 3) + 1, h = buf.readUIntLE(buf.indexOf("VP8X") + 15, 3) + 1;
  assert.ok(buf.indexOf("VP8X") > 0 && w < 700 && h < 1000, `${m} is the small chibi canvas, not the old big sprite (${w}x${h})`);
  assert.ok(html.includes(`sprites/guqiyan_${m}.webp`), `${m} sprite referenced`);
}
assert.ok(copyStatic.includes("sprites/guqiyan_${mood}.webp"), "copy-static ships the sprites to dist");

console.log("sprite-mode regression passed");
