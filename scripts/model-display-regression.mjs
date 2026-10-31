import { readFileSync } from "node:fs";

const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const start = html.indexOf("function getModelDisplayLabel");
const end = html.indexOf("function parseModelLine", start);
if (start < 0 || end < 0) throw new Error("model display helper is missing");

const getModelDisplayLabel = new Function(
  `${html.slice(start, end)}; return getModelDisplayLabel;`
)();

function ok(condition, message) {
  if (!condition) throw new Error(message);
}

ok(getModelDisplayLabel("kiro claude-opus5 不补") === "Claude-opus5",
  "route prefix and local suffix were not hidden from the model label");
ok(getModelDisplayLabel("[Kiro] claude-opus-5 [不补]") === "Claude-opus-5",
  "bracketed route and local suffix were not hidden from the model label");
ok(getModelDisplayLabel("claude-opus-4-8") === "Claude-opus-4-8",
  "a normal Claude model id was changed beyond casing");
ok(getModelDisplayLabel("openrouter/gpt-4o") === "GPT-4o",
  "a known relay prefix or GPT casing was not normalized");
ok(getModelDisplayLabel("custom/model-v1") === "custom/model-v1",
  "an unknown model id was rewritten unexpectedly");
ok(getModelDisplayLabel("") === "", "empty model labels should stay empty");
ok(getModelDisplayLabel("openrouter/anthropic/claude-3-7-sonnet") === "Claude-3-7-sonnet",
  "nested provider paths were not reduced to the model family");
ok(getModelDisplayLabel("[OpenRouter] gpt-4o [no-think]") === "GPT-4o",
  "bracketed relay and no-think hints were not removed");
ok(getModelDisplayLabel("gateway:gemini-2.5-pro") === "Gemini-2.5-pro",
  "plain gateway prefixes were not normalized");
ok(getModelDisplayLabel("azure/openai/gpt-4o") === "GPT-4o",
  "stacked provider prefixes were not peeled");


ok(getModelDisplayLabel("[UnknownChannel] anthropic/claude-opus-5 [不补]") === "Claude-opus-5",
  "an unknown channel wrapper leaked into a known Claude model label");
ok(getModelDisplayLabel("vendor-x::openai/gpt-4o (no-thinking)") === "GPT-4o",
  "a provider-specific GPT route was not reduced to the model family");
ok(getModelDisplayLabel("relay99/google/gemini-2.5-pro") === "Gemini-2.5-pro",
  "a custom relay path leaked into a Gemini model label");
ok(getModelDisplayLabel("[私人线路] qwen2.5-72b-instruct（高价）") === "Qwen2.5-72b-instruct",
  "a custom channel annotation leaked into a Qwen model label");
ok(html.includes('o.textContent = (getModelDisplayLabel(value) || value) + "（自定义）"'),
  "memory-model custom values bypass the shared display formatter");
ok(html.includes('opt.value = cur; opt.textContent = (getModelDisplayLabel(cur) || cur) + "（自定义）"'),
  "quick-switch custom values bypass the shared display formatter");
ok(html.includes('${getModelDisplayLabel(d.model) || d.model}'),
  "provider defaults bypass the shared display formatter");

console.log("model display regression passed");

ok(getModelDisplayLabel("KE【vertex/按量】gemini-4-argon-high") === "Gemini-4-argon-high",
  "a 【channel】 wrapper leaked into the model label");
ok(html.includes('id="model-alias-input"') && html.includes("function modelShownName(id)"),
  "users cannot rename the model pill");
ok(html.includes("flex: 0 1 auto; width: auto; min-width: 0; max-width: 72vw"),
  "the model pill can push the send button off the composer");

// iOS can retain an 844px layout viewport while only 360px remains above the keyboard.
const sheet = { scrollTop: 0, getBoundingClientRect: () => ({ top: 63, bottom: 387 }) };
const input = { getBoundingClientRect: () => ({ top: 460, bottom: 496 }) };
let open = true;
const overlay = { style: {}, classList: { contains: () => open }, querySelector: () => sheet };
const viewport = { height: 360, width: 390, offsetTop: 45, offsetLeft: 0 };
const syncStart = html.indexOf('function syncModelConfigViewport()');
const syncEnd = html.indexOf('function openModelConfig()', syncStart);
const sync = new Function('$', 'window', 'document', 'requestAnimationFrame',
  html.slice(syncStart, syncEnd) + '; return syncModelConfigViewport;'
)(id => id === 'model-config-overlay' ? overlay : input,
  { visualViewport: viewport, innerHeight: 844, innerWidth: 390 },
  { activeElement: input }, callback => callback());
sync();
ok(overlay.style.height === '360px' && overlay.style.top === '45px', 'model sheet ignores the visible keyboard viewport');
ok(sheet.scrollTop === 125, 'focused model alias does not scroll into the visible sheet');
open = false;
viewport.height = 844;
sync();
ok(overlay.style.height === '360px', 'closed model sheet should ignore viewport events');
