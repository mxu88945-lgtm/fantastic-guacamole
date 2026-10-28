import { readFileSync } from "node:fs";
import vm from "node:vm";
import assert from "node:assert/strict";

const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const helperStart = html.indexOf("const REPLY_HELPER_MAX_TOKENS");
const helperEnd = html.indexOf("// Non-streaming one-shot completion", helperStart);
assert.ok(helperStart >= 0 && helperEnd > helperStart, "AI 帮答 implementation is missing");
const helperSource = html.slice(helperStart, helperEnd);

assert.ok(html.includes('<button data-act="assist" type="button">'), "AI 帮答 is missing from the composer menu");
assert.ok(html.includes('if (act === "assist") generateReplyHelperDraft();'), "AI 帮答 menu action is not wired");
assert.match(helperSource, /input\.value = result;/, "AI 帮答 must place the draft in the composer");
assert.doesNotMatch(helperSource, /\bsend\s*\(/, "AI 帮答 must never auto-send its draft");
assert.match(helperSource, /绝不扮演、代写或操控[\s\S]*角色、男主、女主、导演或 NPC/, "AI 帮答 lacks the user-only identity boundary");

const context = vm.createContext({
  messages: [
    { role: "assistant", rpSpeakerName: "谢聿衡", content: "<scene>傍晚｜休息室</scene>他问她是否愿意留下。<xie_status>内心：等待回答</xie_status>" },
    { role: "assistant", content: "（无回复）" },
    { role: "user", content: "我想先冷静一下。" },
  ],
  settings: { userName: "裴以沫", aiName: "顾祁砚", apiKey: "key" },
  document: { querySelector: () => null },
  $: () => ({ classList: { remove() {} }, value: "" }),
  visibleAssistantText: value => value,
  messageText: message => String(message?.content || ""),
  isNoReplyPlaceholder: message => message?.content === "（无回复）",
  isHiddenRoleplayMentionMessage: () => false,
  isRoleplayConversation: () => true,
  currentConv: () => ({ rpProject: {} }),
  normalizedRoleplayProject: () => ({ actorName: "谢聿衡", userRole: "裴以沫", userIdentity: "建筑设计师" }),
  stripRoleplayPresentationalHtmlForPrompt: value => String(value).replace(/<[^>]+>/g, ""),
  updateSilentUI() {}, showToast() {}, showError() {}, clearError() {}, openSettings() {}, autoResize() {},
  completeOnce: async () => "草稿", console,
  abortController: null, roleplayGroupRun: null, replyBooting: false, replyHelperRunning: false,
});
vm.runInContext(helperSource, context);
const prompt = context.buildReplyHelperPrompt("我还没想好");
assert.match(prompt.userText, /裴以沫：我想先冷静一下。/, "visible user transcript is missing");
assert.match(prompt.userText, /谢聿衡：傍晚｜休息室他问她是否愿意留下。/, "visible role transcript is missing");
assert.doesNotMatch(prompt.userText, /等待回答|（无回复）/, "private status or failed placeholder leaked into AI 帮答");
assert.match(prompt.userText, /我还没想好/, "the current composer draft must guide AI 帮答");

assert.doesNotMatch(html, /messages\.push\(\{ id: uid\(\), role: "assistant", content: "（无回复）"/, "failed replies must not create visible placeholder messages");
assert.ok(html.includes("isNoReplyPlaceholder(m)) continue;"), "old failed placeholders must be hidden and excluded from provider history");
assert.ok(html.includes("if (last && last.role === m.role) last.content = mergeApiContent"), "consecutive user turns must be merged for alternating provider APIs");

console.log("reply helper regression: passed");
