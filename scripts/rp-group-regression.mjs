import { readFileSync } from "node:fs";
import vm from "node:vm";
import assert from "node:assert/strict";

const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const source = (start, end) => html.slice(html.indexOf(start), html.indexOf(end, html.indexOf(start)));
let id = 0;
const context = vm.createContext({
  uid: () => `id-${++id}`, cloneChatData: structuredClone, console,
  settings: { aiName: "顾祁砚", activeRoleId: "gu", provider: "openai", apiKey: "base-key", model: "base-model" },
  currentId: "scene", chatNavigationRevision: 0, abortController: null, replyBooting: false,
  messages: [{ role: "user", content: "继续" }],
  conversationModel: () => "window-model", messageText: message => message.content || "",
  setSending() {}, showToast(message) { context.toast = message; },
});
vm.runInContext(source("function normalizedRoleplayProject(", "function addRoleplayMemory("), context);
const project = context.normalizedRoleplayProject({
  actorName: "周竞尧", groupEnabled: true, replyMode: "round", memory: "已离婚", world: "现世背景",
  worldEntries: [{ content: "顾屿修复的世界书" }], regexRules: [{ pattern: "保留正则" }],
  memories: [{ id: "fact", text: "已经签字", at: 1 }],
  members: [{ id: "director", name: "导演", kind: "director", providerId: "other", model: "director-model", prompt: "保持节奏" },
    { id: "guest", name: "江屿", enabled: false }],
}, { title: "测试场" });
context.conv = { id: "scene", roleId: "gu", space: "roleplay", rpProject: project, messages: [] };
context.currentConv = () => context.conv;
context.isRoleplayConversation = (conv = context.conv) => conv?.space === "roleplay";
assert.equal(context.roleplayReplyMembers(project).map(member => member.name).join(","), "周竞尧,导演");
assert.equal(context.roleplayReplyMembers(project, "@江屿 你来")[0].id, "guest", "@ can explicitly invite an unchecked member");
assert.equal(context.roleplayReplyMembers(project, "@导演 不要接管主角")[0].kind, "director");
assert.equal(context.roleplayReplyMembers(project, "提到了导演").length, 2, "plain names are not @ commands");
assert.equal(context.roleplayReplyMembers(project, "@江屿abc").length, 2, "partial Latin name matches cannot select a member");
assert.equal(context.roleplayReplyMembers(project, "@江屿你来接话")[0].id, "guest", "Chinese text need not have a space after the mention");
assert.equal(context.roleplayMentionSelection(project, "＠江屿，你来").text, "，你来");
assert.equal(context.roleplayReplyMembers(project, "继续", ["guest"])[0].id, "guest", "persisted UI selection must determine the next API call");
assert.equal(context.roleplayReplyMembers(project, "继续", ["removed-member"]).length, 0, "stale selections must not fall back to the lead");
assert.equal(context.roleplayMentionSelection(project, "a@江屿.example").memberIds.length, 0, "emails are not mentions");
const prompt = context.roleplaySpeakerPrompt(project.members[0], project);
assert.match(prompt, /只由|仅由「导演」发言/);
assert.match(prompt, /不替用户决定|不要替用户决定/);
assert.match(prompt, /保持节奏/);
assert.match(prompt, /后台共享不等于人物全知/);
const legacy = context.normalizedRoleplayProject({ actorName: "旧角色" }, { title: "旧场次" });
assert.equal(legacy.groupEnabled, false);
assert.equal(context.roleplayMembers(legacy).length, 1);
const mentionDefault = context.normalizedRoleplayProject({ ...project, replyMode: undefined });
assert.equal(mentionDefault.replyMode, "mention");
assert.equal(context.roleplayReplyMembers(mentionDefault, "继续").map(member => member.id).join(","), "lead", "new and existing groups must not invite every member by default");
assert.equal(context.roleplayReplyMembers(mentionDefault, "@江屿你来").map(member => member.id).join(","), "guest");

const profiles = { base: { id: "base", provider: "openai", baseUrl: "https://base.test/v1", apiKey: "base-key", model: "profile-model" },
  other: { id: "other", provider: "gemini", baseUrl: "https://other.test/v1beta", apiKey: "other-key", model: "other-model" } };
context.conversationProvider = () => profiles.base;
context.providerById = id => profiles[id];
context.calls = [];
context.generateSingleReply = async (speaker, config) => { context.calls.push({ speaker, config }); return true; };
vm.runInContext(source("let roleplayGroupRun = null;", "async function generateSingleReply("), context);
const beforeSettings = JSON.stringify(context.settings);
await context.generateReply();
assert.equal(context.calls.map(call => call.speaker.name).join(","), "周竞尧,导演");
assert.equal(context.calls[0].config.model, "window-model");
assert.equal(context.calls[1].config.model, "director-model");
assert.equal(context.calls[1].config.apiKey, "other-key");
assert.equal(context.calls[1].config.provider, "gemini");
assert.equal(JSON.stringify(context.settings), beforeSettings, "member channels must not mutate the main identity or API settings");
context.calls = [];
context.messages[0].content = "@导演 继续";
await context.generateReply();
assert.equal(context.calls.length, 1);
assert.equal(context.calls[0].speaker.name, "导演");
context.messages[0].content = "继续";
context.messages[0].rpReplyMemberIds = ["guest"];
context.calls = [];
await context.generateReply();
assert.equal(context.calls.map(call => call.speaker.id).join(","), "guest", "selecting a member without visible @ text must route only that member");
delete context.messages[0].rpReplyMemberIds;
context.calls = [];
context.generateSingleReply = async () => { context.calls.push(1); vm.runInContext("roleplayGroupRun.cancelled = true", context); return true; };
await context.generateReply();
assert.equal(context.calls.length, 1, "stop cancels all remaining group replies");
context.calls = [];
context.generateSingleReply = async () => { context.calls.push(1); context.chatNavigationRevision++; return true; };
await context.generateReply();
assert.equal(context.calls.length, 1, "switching away and back cancels the remaining queue");
context.calls = [];
context.generateSingleReply = async () => { context.calls.push(1); return false; };
await context.generateReply();
assert.equal(context.calls.length, 1, "an API error stops the queue without sending other members");
context.calls = [];
project.members[0].providerId = "deleted-channel";
await context.generateReply();
assert.equal(context.calls.length, 0, "removed API profiles must not silently use another key");
project.members[0].providerId = "other";

// Run the actual request builder up to fetch for every supported wire protocol.
context.DEFAULTS = Object.fromEntries(["openai", "gemini", "anthropic"].map(provider => [provider, { baseUrl: "https://default.test" }]));
Object.assign(context, {
  AbortController, performance, pendingSearchContext: "", pendingReadingContext: "", lastCallTiming: null, lastPromptAudit: null,
  conversationReasoningEffort: () => "off", activeRole: () => ({}),
  buildApiHistoryWindow: () => ({ messages: [{ role: "user", content: "继续" }], sentMessages: 1 }),
  buildBoundedMemoryContext: () => ({ text: "较早摘要：签字后离开", audit: {} }),
  buildSpecialDaysPromptClaim: () => ({ text: "" }), conversationProjectFiles: () => [],
  estimateTextTokens: text => text.length / 4, estimateContentTokens: text => String(text).length / 4,
  geminiPartsTokenEstimate: parts => JSON.stringify(parts).length / 4,
  apiMessagesFor: () => [{ role: "assistant", content: "主角刚说完" }], geminiContentsFor: () => [{ role: "model", parts: [{ text: "主角刚说完" }] }],
  geminiModelId: name => name, applyGeminiThinkingControl() {}, temperatureUnsupportedFor: () => false,
  compatibleTemperature: (model, temperature) => temperature, shouldRequestStructuredReasoning: () => false,
});
for (const name of ["buildGlobalPromptPresetText", "buildConversationProjectText", "buildSharedRoleplayExperienceText", "emojiStyleNote", "chatStyleNote", "cycleSystemNote", "workbenchSystemNote", "charLockPromptNote", "buildCharLockBreachNote", "buildWxPromptNote"]) context[name] = () => "";
vm.runInContext(source("function buildRoleplayProjectText(", "function buildSharedRoleplayExperienceText("), context);
vm.runInContext(source("function sendContent(", "// Map the chosen"), context);
vm.runInContext(source("function chatRuntimeSettings(", "// Normalize a raw usage object"), context);
const captured = [];
context.fetch = async (url, init) => { captured.push({ url, init, body: JSON.parse(init.body) }); throw new Error("captured-request"); };
for (const provider of ["openai", "gemini", "anthropic"]) {
  await assert.rejects(() => context.streamChat(() => {}, () => {}, { ...context.settings, provider, baseUrl: "https://member.test/v1", apiKey: "member-key", model: "member-model", temperature: 0.8 }, project.members[0]), /captured-request/);
  const request = captured.at(-1);
  const system = request.body.system || request.body.systemInstruction?.parts[0].text || request.body.messages[0].content;
  assert.match(system, /已经签字/, "automatic scene memories must reach every member's actual request");
  assert.match(system, /已离婚/, "manual scene memory must reach every member");
  assert.match(system, /较早摘要：签字后离开/);
  assert.match(system, /仅由「导演」发言/);
  assert.equal(request.init.headers[provider === "anthropic" ? "x-api-key" : provider === "gemini" ? "x-goog-api-key" : "authorization"], provider === "openai" ? "Bearer member-key" : "member-key");
  assert.match(request.url, /member\.test/);
  const wireHistory = request.body.contents || request.body.messages;
  assert.equal(wireHistory.at(-1).role, "user", "a group member's response needs a valid final API turn");
  assert.match(JSON.stringify(wireHistory.at(-1)), /共演调度/);
}
assert.equal(context.sendContent({ role: "assistant", content: "我接着说", rpSpeakerName: "江屿" }), "【共演发言：江屿】\n我接着说");
assert.equal(context.sendContent({ role: "assistant", content: "普通对话" }), "普通对话");

// Editing scene memories must preserve worlds, regex and other windows without re-rendering chat.
context.window = {};
context.isMobile = () => false;
context.closeSidebar = () => {};
context.roleplayPublicProject = conv => ({ id: conv.id, rpProject: structuredClone(conv.rpProject) });
vm.runInContext(source("window.JYCRoleplayBridge =", "window.JYCDashboardBridge ="), context);
context.abortController = null;
context.conversations = [context.conv, { id: "private", roleId: "gu", space: "private", messages: [{ content: "本体聊天" }] }];
context.saveConversations = () => {};
context.window.dispatchEvent = () => {};
context.CustomEvent = class {};
context.renderMessages = () => { throw new Error("memory edits must not redraw chat or reset scroll"); };
const bridge = context.window.JYCRoleplayBridge;
const privateBefore = JSON.stringify(context.conversations[1]);
assert.ok(bridge.saveSceneSettings("scene", { memory: "新的连续性档案", world: "不允许覆盖世界观" }));
assert.equal(context.conv.rpProject.world, "现世背景");
assert.equal(context.conv.rpProject.worldEntries[0].content, "顾屿修复的世界书");
assert.equal(context.conv.rpProject.regexRules[0].pattern, "保留正则");
assert.equal(context.conv.rpProject.memories[0].text, "已经签字");
assert.ok(bridge.editSceneMemory("scene", "fact", "已经签字并交接"));
assert.equal(context.conv.rpProject.memories[0].text, "已经签字并交接");
assert.ok(bridge.editSceneMemory("scene", "", "交还钥匙"));
assert.equal(context.conv.rpProject.memories.length, 2);
assert.ok(bridge.editSceneMemory("scene", "fact", ""));
assert.equal(context.conv.rpProject.memories.length, 1);
assert.equal(JSON.stringify(context.conversations[1]), privateBefore);
assert.equal(bridge.editSceneMemory("private", "", "串入本体"), false);
console.log("RP group regression: ordered routing, member APIs, cancellation, prompts and isolated memory editing passed");
