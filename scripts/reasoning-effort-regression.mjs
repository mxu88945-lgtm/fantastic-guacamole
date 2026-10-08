import { readFileSync } from "node:fs";
import vm from "node:vm";

const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
let checks = 0;
const ok = (condition, message) => {
  checks++;
  if (!condition) throw new Error(message);
};

ok(html.includes('id="reasoningEffort"'), "reasoning effort selector is missing");
ok(html.includes('id="model-config-btn"') && html.includes('id="model-config-overlay"'),
  "composer model configuration sheet is missing");
ok(html.includes('id="reasoning-quick"'), "composer reasoning selector is missing");
ok(html.includes('function openModelConfig()') && html.includes('function closeModelConfig()'),
  "composer configuration sheet cannot open and close");
ok(html.includes('if (conv) conv.reasoningEffort = effort;'),
  "composer reasoning selection is not saved to the current conversation");
ok(html.includes('setQuickReasoningEffort("auto", false);'),
  "composer configuration reset does not restore automatic reasoning");
ok(html.includes('trigger.style.removeProperty("width")'),
  "composer model control should size itself to its visible contents");
for (const value of ["auto", "off", "low", "medium", "high", "xhigh", "max"])
  ok(html.includes(`value="${value}"`), `reasoning option ${value} is missing`);
ok(html.includes('reasoningEffort: normalizeReasoningEffort(settings.reasoningEffort)'),
  "new conversations do not retain an independent reasoning setting");
ok(html.includes('$("reasoningEffort").value = conversationReasoningEffort();'),
  "settings UI does not restore the current conversation reasoning setting");
ok(html.includes('if (conv) conv.reasoningEffort = settings.reasoningEffort;'),
  "reasoning setting is not persisted to the current conversation");
ok(html.includes('body.reasoning_effort = reasoningEffort === "off" ? "none" : reasoningEffort;'),
  "OpenAI-compatible reasoning effort is not sent");
ok(html.includes('body.thinking = { type: "enabled", budget_tokens: thinkBudget };'),
  "Anthropic thinking budget is not sent");
ok(html.includes('body.thinking = { type: "adaptive" };')
  && html.includes('body.output_config = { effort: reasoningEffort };'),
  "Anthropic xhigh/max adaptive effort is not sent");
ok(html.includes('applyGeminiThinkingControl(body.generationConfig, model, reasoningEffort);'),
  "Gemini thinking control is not sent");
ok(html.includes('removeReasoningControl(body, headers);'),
  "unsupported reasoning controls do not fall back safely");

const start = html.indexOf('function normalizeReasoningEffort(');
const end = html.indexOf('function temperatureIsDeprecated(', start);
ok(start >= 0 && end > start, "reasoning helper section is missing");
const context = {};
vm.runInNewContext(`${html.slice(start, end)}; globalThis.api = {
  normalizeReasoningEffort, anthropicThinkingBudget, applyGeminiThinkingControl,
  hasReasoningControl, removeReasoningControl, reasoningControlUnsupported
};`, context);
const api = context.api;
ok(api.normalizeReasoningEffort("xhigh") === "xhigh" && api.normalizeReasoningEffort("max") === "max"
  && api.normalizeReasoningEffort("wild") === "auto",
  "reasoning effort normalization failed");
ok(api.anthropicThinkingBudget("low") === 1024 && api.anthropicThinkingBudget("high") === 8192
  && api.anthropicThinkingBudget("xhigh") === 16384 && api.anthropicThinkingBudget("max") === 32768,
  "Anthropic thinking budgets are wrong");
const gemini25 = {};
api.applyGeminiThinkingControl(gemini25, "gemini-2.5-flash", "off");
ok(gemini25.thinkingConfig?.thinkingBudget === 0, "Gemini 2.5 off control is wrong");
const gemini3 = {};
api.applyGeminiThinkingControl(gemini3, "gemini-3.8-flash", "high");
ok(gemini3.thinkingConfig?.thinkingLevel === "high", "Gemini 3 thinking level is wrong");
const geminiMax = {};
api.applyGeminiThinkingControl(geminiMax, "gemini-3.8-flash", "max");
ok(geminiMax.thinkingConfig?.thinkingLevel === "high", "Claude-only max effort was not clamped for Gemini");
const gemini38Off = {};
api.applyGeminiThinkingControl(gemini38Off, "gemini-3.8-flash", "off");
ok(gemini38Off.thinkingConfig?.thinkingLevel === "low", "Gemini 3.8 least-thought fallback is wrong");
const body = { reasoning_effort: "high", generationConfig: { thinkingConfig: { thinkingLevel: "high" } } };
api.removeReasoningControl(body, {});
ok(!api.hasReasoningControl(body), "fallback did not remove all reasoning controls");
ok(api.reasoningControlUnsupported("reasoning_effort is not supported by this model"),
  "unsupported reasoning error was not recognized");
ok(api.reasoningControlUnsupported("Extra inputs are not permitted for reasoning_effort"),
  "reverse-order unsupported reasoning error was not recognized");

console.log(`reasoning effort regression checks passed (${checks})`);
