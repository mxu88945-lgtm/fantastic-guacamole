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
assert.equal(legacy.leadChannel.playedByOwner, true, "existing primary cards keep the owner actor by default");
assert.equal(project.members[0].playedByOwner, false, "existing directors are independent by default");
assert.equal(project.members[1].playedByOwner, false, "new and existing supporting actors are independent by default");
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
  CONVERSATION_PROJECT_FILE_LIMIT: 12, CONVERSATION_PROJECT_PROMPT_CHAR_BUDGET: 16000,
  activeRollingSummary: () => ({ content: "较早摘要：签字后离开" }), rollingSummaryText: summary => summary?.content || "",
  updateConversationSpaceUI() {},
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

// Check real wire requests with recognizable owner-only context. Off/on/off
// must choose different builders, including native Gemini and Anthropic.
context.settings.systemPrompt = "OWNER_PERSONA_ONLY";
context.settings.systemInstruction = "OWNER_EXTRA_INSTRUCTION";
context.buildGlobalPromptPresetText = () => "OWNER_GLOBAL_PRESET";
context.buildBoundedMemoryContext = () => ({ text: "OWNER_PRIVATE_MEMORY_AND_DIARY", audit: { blocks: [] } });
context.cycleSystemNote = () => "OWNER_RECENT_LIFE";
context.charLockPromptNote = () => "OWNER_LOCK_SCREEN";
context.pendingReadingContext = "OWNER_PRIVATE_READING";
context.conversationProjectFiles = () => [{ name: "场景资料", text: "SCENE_REFERENCE_ONLY" }];
context.safeReferenceFileName = name => name;
context.boundedReferenceFileText = (text, limit) => String(text).slice(0, limit);
project.characterPrompt = "LEAD_CARD_ONLY";
const requestSystem = request => request.body.system || request.body.systemInstruction?.parts[0].text || request.body.messages[0].content;
for (const provider of ["openai", "gemini", "anthropic"]) {
  const config = { ...context.settings, provider, baseUrl: "https://member.test/v1", apiKey: "member-key", model: "member-model", temperature: 0.8 };
  const director = project.members[0];
  director.playedByOwner = false;
  await assert.rejects(() => context.streamChat(() => {}, () => {}, config, director), /captured-request/);
  let system = requestSystem(captured.at(-1));
  assert.doesNotMatch(system, /OWNER_|顾祁砚|LEAD_CARD_ONLY/, "independent members must not receive owner persona, private context or the lead's identity card");
  for (const text of ["导演", "保持节奏", "现世背景", "已经签字", "已离婚", "较早摘要：签字后离开", "SCENE_REFERENCE_ONLY"]) assert.ok(system.includes(text), `missing shared stage input: ${text}`);
  assert.equal(context.lastPromptAudit.memory.scope, "scene-only");
  director.playedByOwner = true;
  await assert.rejects(() => context.streamChat(() => {}, () => {}, config, director), /captured-request/);
  system = requestSystem(captured.at(-1));
  for (const text of ["OWNER_PERSONA_ONLY", "OWNER_EXTRA_INSTRUCTION", "OWNER_PRIVATE_MEMORY_AND_DIARY", "OWNER_GLOBAL_PRESET", "顾祁砚"]) assert.ok(system.includes(text), `owner switch on must restore: ${text}`);
  director.playedByOwner = false;
  await assert.rejects(() => context.streamChat(() => {}, () => {}, config, director), /captured-request/);
  assert.doesNotMatch(requestSystem(captured.at(-1)), /OWNER_|顾祁砚/);
  project.leadChannel.playedByOwner = false;
  await assert.rejects(() => context.streamChat(() => {}, () => {}, config), /captured-request/);
  system = requestSystem(captured.at(-1));
  assert.ok(system.includes("LEAD_CARD_ONLY"), "switching the solo lead off must keep its own character card");
  assert.doesNotMatch(system, /OWNER_|顾祁砚/, "the lead switch must also work outside group dispatch");
  project.leadChannel.playedByOwner = true;
}
context.conv.space = "private";
await assert.rejects(() => context.streamChat(() => {}, () => {}, { ...context.settings, provider: "openai", baseUrl: "https://base.test", model: "base-model" }), /captured-request/);
assert.match(requestSystem(captured.at(-1)), /OWNER_PERSONA_ONLY/, "private chats must retain the full owner identity");
context.conv.space = "roleplay";
assert.equal(context.stripIndependentRoleplayControls("剧情[私记:污染]【锁屏 5分钟：剧情】[存档:污染][提醒:污染][记忆:签字]"), "剧情[记忆:签字]", "independent replies may save scene memories but never execute owner tools");

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
const flagged = { ...context.conv.rpProject.leadChannel, providerId: "base", model: "retained-model", playedByOwner: false };
assert.ok(bridge.saveSceneSettings("scene", { leadChannel: flagged, members: context.conv.rpProject.members.map(member => ({ ...member, playedByOwner: false })) }));
assert.equal(context.conv.rpProject.leadChannel.playedByOwner, false);
assert.equal(context.conv.rpProject.leadChannel.model, "retained-model");
assert.equal(context.conv.rpProject.members[0].playedByOwner, false);

// Run the real completion handler with hostile/unexpected control markers:
// scene memory is allowed, while owner diary/search/album/actions must stay off.
const completion = vm.createContext({
  console, performance, settings: { crossSearch: true, webSearch: true }, messages: [], currentId: "scene", chatNavigationRevision: 0,
  startMessageTrace: () => ({ id: "trace" }), finishMessageTrace() {},
  abortController: null, replyBooting: false, roleplayGroupRun: null, stickBottom: false,
  TYPING_HTML: "typing", lastPromptAudit: null, lastCallUsage: null,
  roleplayIndependentSpeaker: context.roleplayIndependentSpeaker,
  stripIndependentRoleplayControls: context.stripIndependentRoleplayControls,
  isRoleplayConversation: () => true, uid: () => "independent-response",
  requestAnimationFrame: fn => { fn(); return 1; }, cancelAnimationFrame() {}, setTimeout,
  createStreamContentGate: emit => ({ push: emit, finish() {} }),
  makeMsgEl: () => ({ querySelector: () => ({ isConnected: false, innerHTML: "" }), remove() {} }),
  $: () => ({ appendChild() {} }),
  extractAssistantReasoning: text => ({ answer: text, reasoning: "" }), bubbleHtml: () => "rendered",
  streamChat: async emit => { emit("剧情正文 [搜索:本体][相册:私照][私记:污染][存档:污染][提醒:污染]【锁屏 5分钟】[工作台运行:污染][记忆:角色已签字]"); },
  extractMemorySaves: text => { completion.savedSceneFact = text.includes("[记忆:角色已签字]"); return text.replace(/\[记忆:[^\]]*\]/g, "").trim(); },
});
for (const name of ["clearError", "markSeen", "pinToBottom", "setSending", "mergeMessageHistoryRecall", "finishRunningTraces", "saveConversations", "renderMessages", "maybeAutoCompactConversation"]) completion[name] = () => {};
for (const name of ["extractPrivateDiary", "extractNotionSaves", "extractReminders", "parseCharLockCommand", "consumeWorkbenchDirective", "searchHistoryRecall", "readHistoryOriginal", "inspectAlbumForModel", "webSearch"]) completion[name] = () => { throw new Error(`independent response invoked owner capability ${name}`); };
vm.runInContext(source("async function generateSingleReply(", "function switchReplyVariant("), completion);
assert.equal(await completion.generateSingleReply(), true);
assert.equal(completion.savedSceneFact, true);
assert.equal(completion.messages[0].content, "剧情正文");
console.log("RP group regression: ordered routing, member APIs, cancellation, prompts and isolated memory editing passed");
