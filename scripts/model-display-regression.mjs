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

console.log("model display regression passed");
