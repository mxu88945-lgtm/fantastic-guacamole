import assert from "node:assert/strict";
import { readFileSync, statSync } from "node:fs";

const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const sw = readFileSync(new URL("../sw.js", import.meta.url), "utf8");
const copyStatic = readFileSync(new URL("./copy-static.mjs", import.meta.url), "utf8");
assert.ok(sw.includes('const CACHE = "role-chat-cache-v374";'), "service worker cache bumped for 立绘模式 8 表情 + 悬浮/隐身");

// ---- pure classifier from index.html ----
const start = html.indexOf("/* sprite-mode:start");
const end = html.indexOf("/* sprite-mode:end */");
assert.ok(start > 0 && end > start, "sprite-mode helper block is missing from index.html");
const lib = new Function(html.slice(start, end) + `
return { classifySpriteMood, spriteMoodText, spriteReplyTail, spriteMoodScores, spriteSnapPos, SPRITE_MOODS };`)();
const { classifySpriteMood: mood } = lib;

assert.deepEqual(lib.SPRITE_MOODS, ["cold", "shy", "angry", "smirk", "love", "smug", "sad", "surprised"], "8 moods");
const cases = [
  // angry 皱眉
  ["（他皱眉，沉下脸）不许再熬夜了。", "angry"],
  ["啧，你还敢跟我顶嘴？", "angry"],
  ["闭嘴，别胡闹。", "angry"],
  ["啧。笑什么。", "angry"],
  // smug 坏笑 (勾唇/挑眉/冷笑 never count as plain 笑)
  ["他勾唇轻笑，挑眉看你：“这么得意？”", "smug"],
  ["他冷笑一声：“就这？”", "smug"],
  ["乖乖的，逗你玩呢，哼。", "smug"],
  // shy 脸红
  ["乖，过来。", "shy"],
  ["他耳根有点红，轻声哄你：“宝宝，抱一下。”", "shy"],
  ["心软下来，温柔地亲了亲你的额头。", "shy"],
  // smirk = 开心/打招呼
  ["早安，小懒猫。", "smirk"],
  ["我回来了，哈哈。", "smirk"],
  ["晚安。", "smirk"],
  // love 比心
  ["*张开手比心* 爱你。", "love"],
  ["想你了，抱抱。", "love"],
  ["喜欢你。", "love"],
  // sad 委屈 (心疼 is sad, not love)
  ["心疼你，别哭了。", "sad"],
  ["对不起，让你委屈了。", "sad"],
  ["舍不得你走。", "sad"],
  // surprised
  ["什么？！你真的去了？", "surprised"],
  ["居然真的？", "surprised"],
  ["诶？吓我一跳。", "surprised"],
  // cold / neutral
  ["嗯。知道了，早点睡。", "cold"],
  ["好啊。", "cold"],             // a lone 啊 is too weak
  ["小心点，放心吧。", "cold"],     // 小心/放心 are not love
  ["抱歉，刚才在开会。", "cold"],   // 抱歉 is not a hug
  ["", "cold"],
  [null, "cold"],
  ["[自我卡:喜好|喜欢她笑]\n嗯。", "cold"],
  ["<span title=\"笑\" class=\"smirk\">知道了。</span>", "cold"],
];
for (const [text, want] of cases) assert.equal(mood(text), want, `${JSON.stringify(text)} → ${want}`);
// action / narration text outweighs the spoken line
assert.equal(mood("（他红着眼眶，声音发哽）没事，我笑一下就好。"), "sad", "（…） narration wins over a spoken 笑");
assert.equal(mood("*眼眶泛红* 哈。"), "sad", "*…* narration wins");
// later sentences weigh a bit more
assert.equal(mood("哭什么。早安。"), "smirk", "later sentence decides between equal hits");
const sc = lib.spriteMoodScores("哭。哭。");
assert.ok(Math.abs(sc.sad - 1.3 * 2.5) < 1e-6, "second sentence weighs 1.5x");
// ties → previous mood, else cold
assert.equal(mood("对不起，喜欢。", "sad"), "sad", "tie keeps the previous mood");
assert.equal(mood("哭，喜欢", ""), "cold", "tie without a previous mood → cold");
assert.equal(mood("哭，喜欢", "love"), "love", "tie prefers previous mood");

// drag snap: nearest edge, clamped above the composer and below the header
const box = { mainW: 390, mainH: 800, composerH: 90, headerB: 60, w: 80, h: 130 };
assert.deepEqual(lib.spriteSnapPos({ x: 30, y: 200 }, box), { side: "left", y: 200 });
assert.deepEqual(lib.spriteSnapPos({ x: 260, y: -40 }, box), { side: "right", y: 0 }, "never under the composer");
assert.deepEqual(lib.spriteSnapPos({ x: 10, y: 9999 }, box), { side: "left", y: 800 - 90 - 60 - 130 }, "never under the header");

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
assert.ok(/#sprite-stage \{[^}]*pointer-events: none/.test(html), "the stage box never takes taps");
assert.ok(/#sprite-stage \.sprite-img \{[^}]*pointer-events: none/.test(html), "the image boxes never take taps");
assert.ok(/#sprite-stage \.sprite-hit \{[^}]*pointer-events: auto; touch-action: none/.test(html), "only his body (.sprite-hit) takes the drag");
assert.ok(html.includes('<div class="sprite-hit"'), "hit area inside the stage");
assert.ok(/#sprite-stage\.away \.sprite-hit \{ pointer-events: none; \}/.test(html), "hidden figure takes no taps");
assert.ok(/#sprite-stage\[data-side="left"\] \{ right: auto; left: max\(4px, env\(safe-area-inset-left\)\)/.test(html), "left edge inside the safe area");
assert.ok(/bottom: calc\(var\(--composer-h, 84px\) - 4px \+ var\(--sprite-y, 0px\)\)/.test(html), "dragged height sits above the composer");
// 悬浮可拖
assert.ok(html.includes('setTimeout(() => { if (drag) { drag.moving = true; stage.classList.add("dragging"); } }, 250)'), "long press (250ms) starts a drag");
assert.ok(html.includes("Math.hypot(dx, dy) > 6"), "or a direct drag");
assert.ok(html.includes('localStorage.setItem("jyc_sprite_pos", JSON.stringify(pos))'), "position remembered");
assert.ok(/hit\.addEventListener\("pointerdown", \(e\) => \{[\s\S]{0,80}e\.preventDefault\(\); e\.stopPropagation\(\);/.test(html), "taps on him never reach the chat");
assert.ok(html.includes('hit.addEventListener("click", stop)'), "click swallowed too");
// 隐身
assert.ok(html.includes('<div id="sprite-tab" role="button"'), "edge tab exists");
assert.ok(/#sprite-tab::before \{[^}]*width: 8px; height: 18px/.test(html), "tab is tiny (~18px)");
assert.ok(/#sprite-tab::before \{[^}]*background: rgba\([^)]*,\.32\)/.test(html), "tab is half-transparent");
assert.ok(html.includes('localStorage.setItem("jyc_sprite_hidden", "1")'), "hidden state remembered");
// 需要才出现
assert.ok(/<select id="spriteAppear"[^>]*><option value="mood">有情绪时出现<\/option><option value="always">常驻<\/option>/.test(html), "出现方式 setting (default first)");
assert.ok(/spriteAppear: "mood",/.test(html), "default 有情绪时出现");
assert.ok(html.includes('"spriteMode","spriteAppear"'), "spriteAppear is a synced setting");
assert.ok(html.includes("const SPRITE_STAY_MS = 8000;"), "stays ~8s");
assert.ok(html.includes('if (mood !== "cold") { setSpriteMood(mood); spriteShowFor(SPRITE_STAY_MS); return; }'), "pops in only for non-neutral replies");
assert.ok(html.includes("spritePinned = true;  // summoned by hand: stays until tapped"), "manual summon stays");
for (const cls of ["html[data-kb] #sprite-tab", "body.dashboard-open #sprite-tab", "body.rp-chat-active #sprite-tab", "body.rp-theater-open #sprite-tab", "html[data-kb] #sprite-stage .sprite-hit"])
  assert.ok(html.includes(cls), `tab/hit hidden for ${cls}`);
assert.ok(/prefers-reduced-motion: reduce\)[^@]*#sprite-stage, #sprite-stage \.sprite-img, #sprite-stage\.snapping \{ transition: none; \}/.test(html), "snap glide respects reduced motion");
const stageCss = (html.match(/  #sprite-stage \{[^}]*\}/) || [""])[0];
assert.ok(/position: absolute; right: max\(4px, env\(safe-area-inset-right\)\); bottom: calc\(var\(--composer-h/.test(stageCss), "chibi defaults to the bottom-right corner, above the composer");
assert.ok(/height: clamp\(100px, [^,]+, 140px\)/.test(stageCss), "chibi is small (100–140px tall)");
assert.ok(/z-index: 1;/.test(stageCss), "chibi shares the chat/composer layer");
const iStage = html.indexOf('<div id="sprite-stage"'), iChat = html.indexOf('<div class="chat" id="chat">'), iComposer = html.indexOf('<div class="composer-wrap">');
assert.ok(iChat < iStage && iStage < iComposer, "chibi paints above the messages but below the composer and its menus");
assert.ok(html.includes('sprite.style.setProperty("--composer-h", h + "px")'), "composer height is fed to the chibi");
assert.ok(!html.includes("html[data-sprite] body:not(.rp-chat-active) .main > .chat { background: transparent; }"), "v372 theme-transparent override removed");
assert.ok(!/#sprite-stage[^{]*\{[^}]*mask-image/.test(html), "v372 bottom mask fade removed");
assert.ok(/#sprite-stage\.hop \{ animation: sprite-hop/.test(html) && /@keyframes sprite-hop \{[^\n]*translateY\(-6px\)/.test(html), "tiny hop on expression change");
assert.ok(/prefers-reduced-motion: reduce\)[^@]*#sprite-stage\.hop \{ animation: none; \}/.test(html), "hop respects reduced motion");
assert.ok(!/#sprite-(stage|tab)[^{]*\{[^}]*backdrop-filter/.test(html), "no backdrop-filter on the sprite or tab");
for (const cls of ["html[data-kb] #sprite-stage", "body.dashboard-open #sprite-stage", "body.rp-chat-active #sprite-stage", "body.rp-theater-open #sprite-stage"])
  assert.ok(html.includes(cls), `sprite hidden for ${cls}`);
assert.ok(html.includes("syncSpriteStage({ reply: !!assistantMsg && assistantMsg.responseState !== \"error\" });  // 立绘模式"), "expression refreshes after each finished reply");

// prompts / memory / export never read the sprite
const promptish = html.slice(html.indexOf("async function send("), html.indexOf("async function send(") + 400);
assert.ok(!promptish.includes("sprite"), "send() itself does not touch the sprite");
assert.ok(!/systemText[^\n]*sprite/i.test(html), "no sprite text in the system prompt");

// ---- assets ----
for (const m of ["cold", "shy", "angry", "smirk", "love", "smug", "sad", "surprised"]) {
  const url = new URL(`../sprites/guqiyan_${m}.webp`, import.meta.url);
  const buf = readFileSync(url);
  assert.equal(buf.slice(0, 4).toString(), "RIFF", `${m} is RIFF`);
  assert.equal(buf.slice(8, 12).toString(), "WEBP", `${m} is WebP`);
  assert.ok(statSync(url).size < 150 * 1024, `${m} chibi under 150KB`);
  const w = buf.readUIntLE(buf.indexOf("VP8X") + 12, 3) + 1, h = buf.readUIntLE(buf.indexOf("VP8X") + 15, 3) + 1;
  assert.ok(buf.indexOf("VP8X") > 0 && w < 700 && h < 1000, `${m} is the small chibi canvas, not the old big sprite (${w}x${h})`);
  assert.ok(html.includes("sprites/guqiyan_${m}.webp") && html.includes(`"${m}"`), `${m} sprite referenced`);
}
assert.ok(copyStatic.includes("sprites/guqiyan_${mood}.webp"), "copy-static ships the sprites to dist");

console.log("sprite-mode regression passed");
