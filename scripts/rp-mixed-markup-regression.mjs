import { readFileSync } from "node:fs";
import vm from "node:vm";
import assert from "node:assert/strict";

const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const sceneRule = { findRegex: "/<scene>\\s*([\\s\\S]*?)\\s*<\\/scene>/gi", replaceString: '<div class="weijing-workshop-scene" style="white-space:pre-wrap">$1</div>', placement: [2] };
const project = { greetings: [], regexRules: [sceneRule] };
const context = vm.createContext({ console, uid: () => "fixture", currentConv: () => ({ rpProject: project }),
  normalizedRoleplayProject: () => project, isRoleplayConversation: () => true });
const run = (start, end) => vm.runInContext(html.slice(html.indexOf(start), html.indexOf(end, html.indexOf(start))), context);
run("function escapeHtml(", "// ---------- Rendering messages ----------");
run("function roleplayRichSource(", "// Older imported player templates");
run("function roleplayPlayerCompatibility(", "function restoreRoleplayOpeningCard(");

// The supplied card uses a scene regex plus ordinary, explicitly spaced prose.
// The old code sent the entire result into one iframe and collapsed those breaks.
const paragraph = "六月的晨光透过窗帘，落在床边。".repeat(12);
const opening = `<scene>清晨 · 中央公园公寓主卧</scene>\r\n\r\n${paragraph}\r\n\r\n他说："还不醒？"\r\n\r\n她看着他说：“再陪我一会儿。”`;
const display = context.roleplayRegexDisplay(opening);
assert.equal(context.looksLikeRoleplayRichHtml(display), true);
const normalized = context.normalizeRoleplayMixedMarkup(display);
assert.ok((normalized.match(/class="rp-mixed-paragraph"/g) || []).length >= 4);
assert.ok(normalized.includes('<span class="chat-quote">"还不醒？"</span>'));
assert.ok(normalized.includes('<span class="chat-quote">“再陪我一会儿。”</span>'));
assert.ok(normalized.includes('<div class="weijing-workshop-scene" style="white-space:pre-wrap">清晨 · 中央公园公寓主卧</div>'));
assert.equal(context.normalizeRoleplayMixedMarkup(normalized), normalized, "formatting an old display again must not nest bubbles");
const frame = context.roleplayRichFrameHtml(display);
assert.ok(frame.includes('sandbox="allow-scripts"'));
assert.ok(frame.includes('class=&quot;rp-mixed-paragraph&quot;'), "the real iframe srcdoc must contain the paragraph markup");
assert.ok(frame.includes('class=&quot;chat-quote&quot;'));
project.chatFontSize = "large"; project.chatFontFamily = "kai";
const largeKaiFrame = context.roleplayRichFrameHtml(display);
assert.ok(largeKaiFrame.includes('--rp-story-font-size:16.5px') && largeKaiFrame.includes('STKaiti'), "HTML stories must receive the saved scene font and size");
assert.ok(largeKaiFrame.includes('jyc-rp-typography'), "an already-open HTML story must accept live typography previews from its parent");
assert.equal(opening.includes("rp-mixed"), false, "original message text stays untouched");

const style = '<style>.card::before{content:"原始样式"} .card{white-space:pre-wrap}</style>';
const script = '<script>const label="原始脚本"; const template="<div>别动</div>";</script>';
const details = '<details open><summary>状态栏</summary><div>' + paragraph + '</div></details>';
const code = '<pre>const x = "原样";\n  next();</pre>';
const button = '<button data-choice="1 > 0">"点我"</button>';
const protectedOutput = context.normalizeRoleplayMixedMarkup(style + script + details + code + button);
assert.equal(protectedOutput, style + script + details + code + button, "scripts, styles, controls and status details must stay byte-identical");
assert.ok(context.normalizeRoleplayMixedMarkup('<p>他说：&lt;你好&gt; &amp; 再见。</p>').includes('&lt;你好&gt; &amp; 再见。'), "HTML entities must not be double escaped");
console.log("RP mixed markup regression: scene regex → mixed HTML → iframe paragraphs/quotes, controls and source preservation passed");
