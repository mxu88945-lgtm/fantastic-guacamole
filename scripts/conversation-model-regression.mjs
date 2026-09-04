import { readFileSync } from "node:fs";

const root = new URL("../", import.meta.url);
const html = readFileSync(new URL("index.html", root), "utf8");
const sw = readFileSync(new URL("sw.js", root), "utf8");
const ok = (condition, message) => { if (!condition) throw new Error(message); };

ok(html.includes("当前窗口接口（可存多个，随时切换）"), "current-window provider label is missing");
ok(html.includes("当前窗口模型"), "current-window model label is missing");
ok(html.includes("function conversationProvider(conv)"), "conversation provider resolver is missing");
ok(html.includes("function conversationModel(conv)"), "conversation model resolver is missing");
ok(html.includes("function activateConversationRuntime(conv)"), "conversation runtime activation is missing");
ok(/function newConversation\(\)[\s\S]*?providerId: settings\.activeProviderId[\s\S]*?model: settings\.model/.test(html),
  "new conversations do not inherit a provider and model");
ok(/function switchConversation\([\s\S]*?activateConversationRuntime\(target\)[\s\S]*?syncSettingsToUI\(\)/.test(html),
  "switching conversations does not restore its provider/model UI");
ok(/const model = conversationModel\(\);[\s\S]*?const historyWindow = buildApiHistoryWindow\(\)/.test(html),
  "chat requests do not use the conversation model");
ok(/const pickModel = \(value\)[\s\S]*?conv\.model = value[\s\S]*?saveConversations\(\)/.test(html),
  "quick model selection is not persisted to the conversation");
ok(html.includes("const windowModel = getModelDisplayLabel(conversationModel(c));"),
  "conversation list does not identify each window model");
ok(sw.includes('const CACHE = "role-chat-cache-v162";'), "service worker cache was not bumped to v162");

console.log("conversation model regression checks passed");
