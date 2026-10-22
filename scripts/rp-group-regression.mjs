import { readFileSync } from "node:fs";
import vm from "node:vm";
import assert from "node:assert/strict";

const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const groupUi = readFileSync(new URL("../src/rp-group.js", import.meta.url), "utf8");
const source = (start, end) => html.slice(html.indexOf(start), html.indexOf(end, html.indexOf(start)));
let id = 0;
const context = vm.createContext({
  uid: () => `id-${++id}`, cloneChatData: structuredClone, console,
  ROLEPLAY_ADULT_SCENE_PRESET_CONTENT: "SCENE_ADULT_PRESET_DEFAULT",
  settings: { aiName: "顾祁砚", activeRoleId: "gu", provider: "openai", apiKey: "base-key", model: "base-model" },
  currentId: "scene", chatNavigationRevision: 0, abortController: null, replyBooting: false, roleplayGroupRun: null,
  messages: [{ role: "user", content: "继续" }],
  conversationModel: () => "window-model", messageText: message => message.content || "",
  setSending() {}, showToast(message) { context.toast = message; },
});
vm.runInContext(source("const ROLEPLAY_MEMORY_DEFAULT_SUMMARY_PROMPT", "function addRoleplayMemory("), context);
const project = context.normalizedRoleplayProject({
  actorName: "周竞尧", groupEnabled: true, replyMode: "round", memory: "已离婚", world: "现世背景",
  worldEntries: [
    { content: "顾屿修复的世界书", enabled: true, constant: true },
    { content: "关闭的转世世界观", enabled: false, constant: true },
  ], regexRules: [{ pattern: "保留正则" }],
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
assert.match(prompt, /<director_status>[\s\S]*<\/director_status>/, "director replies must keep a stable status protocol");
const actorWithStatus = { id: "guest", name: "江屹琛", kind: "actor", prompt: "结尾输出 <gts_status>状态</gts_status>" };
assert.equal(context.roleplayStatusTag(actorWithStatus, project), "gts_status");
assert.match(context.ensureRoleplayStatusOutput("<scene>深夜｜休息室</scene>\n他抬眼。", actorWithStatus, project), /<gts_status>[\s\S]*<\/gts_status>$/);
const legacy = context.normalizedRoleplayProject({ actorName: "旧角色" }, { title: "旧场次" });
assert.equal(legacy.groupEnabled, false);
assert.equal(legacy.sceneSystemPromptEnabled, true, "existing scenes should receive the late scene preset by default");
assert.equal(legacy.sceneSystemPrompt, "SCENE_ADULT_PRESET_DEFAULT");
assert.equal(legacy.chatTextColor, "");
assert.equal(context.normalizedRoleplayProject({ chatTextColor: "#AABBCC", chatNarrationColor: "invalid", chatQuoteColor: "#123456" }, {}).chatTextColor, "#aabbcc");
assert.equal(context.roleplayMembers(legacy).length, 1);
assert.equal(legacy.leadChannel.playedByOwner, true, "existing primary cards keep the owner actor by default");
assert.equal(project.members[0].playedByOwner, false, "existing directors are independent by default");
assert.equal(project.members[1].playedByOwner, false, "new and existing supporting actors are independent by default");
const mentionDefault = context.normalizedRoleplayProject({ ...project, replyMode: undefined });
assert.equal(mentionDefault.replyMode, "mention");
assert.equal(context.roleplayReplyMembers(mentionDefault, "继续").map(member => member.id).join(","), "lead", "new and existing groups must not invite every member by default");
assert.equal(context.roleplayReplyMembers(mentionDefault, "@江屿你来").map(member => member.id).join(","), "guest");
const privatePlot = context.normalizedRoleplayProject({ actorName: "周竞尧", groupEnabled: true, temporaryPlot: { text: "让电话响起", mode: "counted", remainingUses: 2, recipientIds: ["director"] }, userRole: "宁梦曦", userIdentity: "A市资产管理人" }, { title: "临时剧情" });
assert.equal(privatePlot.temporaryPlot, "让电话响起");
assert.equal(privatePlot.temporaryPlotMode, "counted");
assert.equal(privatePlot.temporaryPlotRemainingUses, 2);
assert.deepEqual(Array.from(privatePlot.temporaryPlotRecipientIds), ["director"]);
assert.match(context.roleplayUserIdentityBlock(privatePlot), /宁梦曦[\s\S]*A市资产管理人/);
const plotUserMessage = { role: "user", content: "继续", rpReplyMemberIds: ["director"] };
assert.equal(context.roleplayTemporaryPlotFor(privatePlot, { id: "lead" }, plotUserMessage), null, "unselected members must not receive private plot directions");
assert.match(context.roleplayTemporaryPlotFor(privatePlot, { id: "director" }, plotUserMessage).text, /电话/);
assert.ok(groupUi.includes('id="rp-temporary-section"') && groupUi.includes('data-plot-recipient'), "right drawer temporary plot editor is missing");
assert.ok(groupUi.includes('id="rp-user-profile"') && groupUi.includes('id="rp-user-identity"'), "right drawer user identity editor is missing");
assert.ok(groupUi.includes('id="rp-display-section"') && groupUi.includes('textThemeRow("chatTextColor"') && groupUi.includes("previewSceneTextTheme"), "RP text color theme controls are missing");
assert.ok(groupUi.includes('type="range" data-rp-font="chatFontSize"') && groupUi.includes("data-rp-font-size-follow") && groupUi.includes("data-rp-font-size-sample"), "RP font size must be a slider with a follow-main option and a live preview");
assert.equal(context.normalizedRoleplayProject({ chatFontSize: "15.5" }, {}).chatFontSize, "15.5", "numeric RP font sizes must survive normalization");
assert.equal(context.normalizedRoleplayProject({ chatFontSize: "99" }, {}).chatFontSize, "24", "numeric RP font sizes must clamp");
assert.equal(context.normalizedRoleplayProject({ chatFontSize: "huge" }, {}).chatFontSize, "", "invalid RP font sizes must fall back to follow-main");
vm.runInContext(source("function roleplayTypography(", "function normalizeRoleplayMixedMarkup("), context);
assert.equal(context.roleplayTypography({ chatFontSize: "15.5" }).size, "15.5px");
assert.equal(context.roleplayTypography({ chatFontSize: "medium" }).size, "14.5px");
assert.equal(context.roleplayTypography({}).size, "14.5px");
assert.ok(groupUi.includes('id="rp-scene-preset-section"') && groupUi.includes('id="rp-scene-system-prompt"') && groupUi.includes('data-fill-scene-preset="adult-fiction"'), "per-scene system preset editor is missing");
assert.ok(html.includes("function applyRoleplayTextTheme(") && html.includes('"chatTextColor", "chatNarrationColor", "chatQuoteColor"'), "per-scene text colors are not persisted and applied");
assert.ok(html.includes("--rp-msg-font") && html.includes("--rp-msg-font-family"), "RP typography must use story-scoped variables");
assert.ok(html.includes("body.rp-chat-active #messages .bubble") && !html.includes('box.style.setProperty("--msg-font", typography.size)'), "RP typography must not overwrite main chat font variables");
assert.ok(groupUi.includes("data-export-scene") && groupUi.includes("data-import-scene"), "right drawer TXT export/import actions are missing");
assert.ok(groupUi.includes('<select data-field="model">') && !groupUi.includes("<datalist"), "member models must use a real mobile-friendly select");
assert.ok(groupUi.includes("这里是这位角色实际使用的线路") && groupUi.includes('if (member) member.model = ""'), "member routing must remain editable and clear a stale model when its channel changes");
assert.ok(groupUi.includes("data-fetch-models") && groupUi.includes("pullChannelModels"), "member channels cannot fetch their own model lists");
assert.ok(groupUi.includes("!profile.hasModelList") && groupUi.includes("refreshMemberModels(id, true)"), "changing to an uncached interface must pull models automatically");
assert.ok(html.includes("async function pullProviderModels(profile)") && html.includes("async pullChannelModels(profileId)"), "the RP drawer is not wired to the main provider model loader");
assert.ok(groupUi.includes("data-refresh>立即总结当前对话") && groupUi.includes("bridge.extractSceneMemories(sceneId)"), "the memory action must run extraction instead of only repainting the drawer");
assert.ok(groupUi.includes('id="rp-memory-action-status"') && groupUi.includes("这条剧情记忆已经保存"), "manual memory actions need visible success feedback");
assert.ok(groupUi.includes("data-collapse-section") && groupUi.includes("rp-group-collapsible"), "major drawer sections need explicit collapse controls");
// Exercise the accordion against retained form controls: folding must preserve
// input values and close sibling sections and member details together.
const sectionFixture = () => {
  const classes = new Set();
  const controls = [false, true].map(arrow => ({ expanded: null, textContent: "", classList: { contains: () => arrow }, setAttribute(key, value) { this.expanded = value; } }));
  const row = { open: true };
  return { controls, row, value: "尚未保存的人设", classList: { contains: name => classes.has(name), toggle(name, on) { if (on) classes.add(name); else classes.delete(name); } },
    querySelectorAll: selector => selector === "[data-collapse-section]" ? controls : [row] };
};
const folds = [sectionFixture(), sectionFixture()];
const foldContext = vm.createContext({ panel: { querySelectorAll: () => folds } });
vm.runInContext(groupUi.slice(groupUi.indexOf("function setSectionCollapsed("), groupUi.indexOf('  panel.addEventListener("toggle"')), foldContext);
folds.forEach(section => foldContext.setSectionCollapsed(section, true));
assert.ok(folds.every(section => section.classList.contains("is-collapsed") && section.controls.every(button => button.expanded === "false")));
foldContext.expandSection(folds[0]); folds[0].row.open = true;
foldContext.expandSection(folds[1]);
assert.ok(folds[0].classList.contains("is-collapsed") && !folds[1].classList.contains("is-collapsed"), "opening a second section must fold the first automatically");
assert.equal(folds[0].row.open, false);
assert.equal(folds[0].value, "尚未保存的人设", "folding must not rebuild or erase the form");
assert.equal(folds[1].controls[1].textContent, "收起");
assert.ok(!groupUi.includes("index === 0 || member.newMember"), "existing cast cards should start collapsed when the drawer opens");
assert.ok(groupUi.includes('openMember: memberId => open(memberId || "lead")'), "the group settings page must open directly on a selected cast member");
assert.ok(html.includes('if (isRoleplayConversation())') && html.includes('window.JYCRoleplayGroup?.open?.();'), "the RP header more button must open the large group page directly instead of the small menu");
assert.ok(groupUi.includes("记忆模型暂时不可用（503）") && !groupUi.includes('const message = error?.message || "剧情记忆提取失败"'), "raw memory 503 payloads must be translated into a readable retry hint");
assert.ok(html.includes("async function extractRoleplaySceneMemories(conv)") && html.includes("async extractSceneMemories(id)"), "scene memory extraction is not exposed through the RP bridge");
assert.ok(html.includes("roleConvs().filter(isRoleplayConversation)") && html.includes("label: source ? `${name} · ${source}` : name"), "the cast library must include roles from existing RP scenes");
assert.ok(html.includes("本轮若产生会影响后续的新增既成事实，必须"), "RP replies must actively emit hidden memory markers when durable facts are created");
assert.ok(groupUi.includes('data-private-member') && groupUi.includes("角色私人核心记忆"), "the long-memory page needs an isolated private-memory editor for each role");
assert.ok(groupUi.includes("data-open-memory") && groupUi.includes("记忆注入位置") && groupUi.includes("提取关键词"), "long memory must open as a dedicated settings page with real recall controls");
assert.ok(html.includes("memorySettings.autoEvery") && html.includes("memoryScannedCount"), "RP memory extraction must resume incrementally with a configurable threshold");
assert.ok(html.includes("keywords") && html.includes("roleplayMemoryInjection"), "memory keywords and injection placement must affect real request construction");

Object.assign(context, {
  visibleAssistantText: text => text,
  memoryRuntimeConfig: () => ({ apiKey: "memory-key" }),
  isChatContentMessage: message => ["user", "assistant"].includes(message.role),
  isHiddenRoleplayMentionMessage: () => false,
  completeOnce: async system => system.includes("私人核心记忆提炼器")
    ? JSON.stringify({ private: { director: ["导演已经知道密钥藏在书房"] } })
    : JSON.stringify({ memories: [
      { title: "交付钥匙", text: "周竞尧已经把钥匙交给顾里", keywords: ["周竞尧", "顾里", "钥匙"] },
      { title: "明早赴约", text: "顾里答应明早赴约", keywords: ["顾里", "赴约"] },
    ] }),
  saveConversations: () => { context.memorySaved = true; },
  window: { dispatchEvent() {} }, CustomEvent: class {},
});
vm.runInContext(source("function parseRoleplayMemoryCandidates(", "function roleplaySceneFromGreeting("), context);
const extractConv = { ...context.conv, rpProject: structuredClone(context.conv.rpProject), messages: [
  { id: "u1", role: "user", content: "我把钥匙收好，明早见。" },
  { id: "a1", role: "assistant", content: "他把钥匙交给她，约定明早见面。" },
] };
const extracted = await context.extractRoleplaySceneMemories(extractConv);
assert.equal(extracted.added, 2, "manual extraction must persist newly derived scene facts");
assert.equal(extracted.privateAdded, 1, "manual extraction must persist role-isolated private facts");
assert.match(extractConv.rpProject.members[0].privateMemory, /密钥藏在书房/);
assert.equal(extractConv.rpProject.memories.at(-1).sourceMessageId, "a1");
assert.deepEqual(Array.from(extractConv.rpProject.memories.at(-2).keywords), ["周竞尧", "顾里", "钥匙"]);
assert.equal(context.memorySaved, true);
project.members[0].privateMemory = "- 导演已经知道密钥藏在书房";

const profiles = { base: { id: "base", provider: "openai", baseUrl: "https://base.test/v1", apiKey: "base-key", model: "profile-model" },
  other: { id: "other", provider: "gemini", baseUrl: "https://other.test/v1beta", apiKey: "other-key", model: "other-model" } };
context.conversationProvider = () => profiles.base;
context.providerById = id => profiles[id];
project.leadChannel.providerId = "other";
project.leadChannel.model = "lead-model";
const soloRoute = context.roleplaySpeakerRequest(context.roleplayMembers(project)[0], context.conv);
assert.equal(soloRoute.profile.id, "other", "single-speaker RP must honor the lead's selected channel");
assert.equal(soloRoute.config.model, "lead-model", "single-speaker RP must honor the lead's selected model");
project.leadChannel.providerId = "";
project.leadChannel.model = "";
const windowRoute = context.roleplaySpeakerRequest(context.roleplayMembers(project)[0], context.conv);
assert.equal(windowRoute.profile.id, "base", "empty member channel must follow the current RP window");
assert.equal(windowRoute.config.model, "window-model", "empty member channel must follow the current RP window model");
context.calls = [];
context.generateSingleReply = async (speaker, config) => { context.calls.push({ speaker, config }); return true; };
vm.runInContext(source("let roleplayGroupRun = null;", "async function generateSingleReply("), context);
const beforeSettings = JSON.stringify(context.settings);
await context.generateReply();
assert.equal(context.calls.map(call => call.speaker.name).join(","), "周竞尧,导演");
assert.equal(context.calls[0].config.model, "window-model");
assert.equal(context.calls[0].config.apiKey, "base-key");
assert.equal(context.calls[0].config._routeProfileId, "base");
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
  assert.match(system, /SCENE_ADULT_PRESET_DEFAULT/, "the scene-specific system preset must reach every member request");
  assert.ok(system.lastIndexOf("SCENE_ADULT_PRESET_DEFAULT") > system.lastIndexOf("仅由「导演」发言"), "the scene preset must be appended after the role card and speaker prompt");
  assert.match(system, /唯一的身份是「导演」/, "independent speakers need a final identity lock");
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
  for (const privateText of ["OWNER_PERSONA_ONLY", "OWNER_EXTRA_INSTRUCTION", "OWNER_PRIVATE_MEMORY_AND_DIARY", "OWNER_RECENT_LIFE", "OWNER_LOCK_SCREEN", "OWNER_PRIVATE_READING", "顾祁砚", "LEAD_CARD_ONLY"])
    assert.ok(!system.includes(privateText), `independent member received owner-only context: ${privateText}`);
  assert.ok(system.includes("OWNER_GLOBAL_PRESET"), "independent members must still receive enabled global writing presets");
  for (const text of ["导演", "保持节奏", "顾屿修复的世界书", "已经签字", "已离婚", "较早摘要：签字后离开", "SCENE_REFERENCE_ONLY"]) assert.ok(system.includes(text), `missing shared stage input: ${text}`);
  assert.ok(system.includes("导演已经知道密钥藏在书房"), "a member must receive its own private core memory");
  assert.ok(!system.includes("关闭的转世世界观"), "disabled worldbook entries must not reach the live model request");
  assert.equal(context.lastPromptAudit.memory.scope, "scene-only");
  director.playedByOwner = true;
  await assert.rejects(() => context.streamChat(() => {}, () => {}, config, director), /captured-request/);
  system = requestSystem(captured.at(-1));
  for (const text of ["OWNER_PERSONA_ONLY", "OWNER_EXTRA_INSTRUCTION", "OWNER_PRIVATE_MEMORY_AND_DIARY", "OWNER_GLOBAL_PRESET", "顾祁砚"]) assert.ok(system.includes(text), `owner switch on must restore: ${text}`);
  assert.match(system, /后台主体唯一是「顾祁砚」/, "owner-performed scenes need a late backstage identity lock");
  assert.ok(system.lastIndexOf("后台主体唯一是「顾祁砚」") > system.lastIndexOf("LEAD_CARD_ONLY"), "the backstage identity lock must follow the character card");
  director.playedByOwner = false;
  await assert.rejects(() => context.streamChat(() => {}, () => {}, config, director), /captured-request/);
  system = requestSystem(captured.at(-1));
  assert.ok(system.includes("OWNER_GLOBAL_PRESET"));
  for (const privateText of ["OWNER_PERSONA_ONLY", "OWNER_EXTRA_INSTRUCTION", "OWNER_PRIVATE_MEMORY_AND_DIARY", "OWNER_RECENT_LIFE", "OWNER_LOCK_SCREEN", "OWNER_PRIVATE_READING", "顾祁砚"])
    assert.ok(!system.includes(privateText), `switching owner off leaked: ${privateText}`);
  project.leadChannel.playedByOwner = false;
  await assert.rejects(() => context.streamChat(() => {}, () => {}, config), /captured-request/);
  system = requestSystem(captured.at(-1));
  assert.ok(system.includes("LEAD_CARD_ONLY"), "switching the solo lead off must keep its own character card");
  assert.ok(!system.includes("导演已经知道密钥藏在书房"), "one member's private core memory must not leak to the lead");
  assert.ok(system.includes("OWNER_GLOBAL_PRESET"), "the independent lead keeps shared writing presets");
  for (const privateText of ["OWNER_PERSONA_ONLY", "OWNER_EXTRA_INSTRUCTION", "OWNER_PRIVATE_MEMORY_AND_DIARY", "OWNER_RECENT_LIFE", "OWNER_LOCK_SCREEN", "OWNER_PRIVATE_READING", "顾祁砚"])
    assert.ok(!system.includes(privateText), `the independent lead received owner-only context: ${privateText}`);
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
context.roleplayCardLibrary = [];
context.roleplayCardWriteQueue = Promise.resolve();
context.dbGet = async () => [];
context.dbPut = async () => {};
vm.runInContext(source("function roleplayCardTemplate(", "function roleplaySaveDraft("), context);
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
assert.ok(bridge.saveSceneSettings("scene", { sceneSystemPromptEnabled: true, sceneSystemPrompt: "仅本场使用的写作要求" }));
assert.equal(context.conv.rpProject.sceneSystemPrompt, "仅本场使用的写作要求");

// Run the real completion handler with hostile/unexpected control markers:
// scene memory is allowed, while owner diary/search/album/actions must stay off.
const completion = vm.createContext({
  console, performance, settings: { crossSearch: true, webSearch: true, apiKey: "base-key", provider: "openai", model: "base-model" }, messages: [], currentId: "scene", chatNavigationRevision: 0,
  startMessageTrace: () => ({ id: "trace" }), finishMessageTrace() {},
  abortController: null, replyBooting: false, roleplayGroupRun: null, stickBottom: false,
  TYPING_HTML: "typing", lastPromptAudit: null, lastCallUsage: null,
  roleplayIndependentSpeaker: context.roleplayIndependentSpeaker,
  roleplaySpeakerRequest: context.roleplaySpeakerRequest,
  providerById: context.providerById,
  conversationProvider: context.conversationProvider,
  conversationModel: () => "window-model",
  currentConv: () => ({ id: "scene", space: "roleplay", rpProject: project, messages: completion.messages }),
  normalizedRoleplayProject: context.normalizedRoleplayProject,
  roleplayMembers: context.roleplayMembers,
  ensureRoleplayStatusOutput: text => text,
  roleplayTemporaryPlotFor: () => null,
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
for (const name of ["clearError", "markSeen", "pinToBottom", "setSending", "mergeMessageHistoryRecall", "finishRunningTraces", "saveConversations", "renderMessages", "maybeAutoCompactConversation", "maybeAutoExtractRoleplayMemories"]) completion[name] = () => {};
for (const name of ["extractPrivateDiary", "extractNotionSaves", "extractReminders", "parseCharLockCommand", "consumeWorkbenchDirective", "searchHistoryRecall", "readHistoryOriginal", "inspectAlbumForModel", "webSearch"]) completion[name] = () => { throw new Error(`independent response invoked owner capability ${name}`); };
vm.runInContext(source("async function generateSingleReply(", "function switchReplyVariant("), completion);
assert.equal(await completion.generateSingleReply(), true);
assert.equal(completion.savedSceneFact, true);
assert.equal(completion.messages[0].content, "剧情正文");
console.log("RP group regression: ordered routing, member APIs, cancellation, prompts and isolated memory editing passed");
