import { readFileSync } from "node:fs";
import vm from "node:vm";

const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const sw = readFileSync(new URL("../sw.js", import.meta.url), "utf8");
const requireText = (text, message) => {
  if (!html.includes(text)) throw new Error(message);
};

requireText('data-hact="files"', "conversation project files are missing from the header menu");
requireText('id="conversation-file-input"', "conversation project file picker is missing");
requireText('id="conversation-files-panel"', "conversation project file manager is missing");
requireText('projectFiles: []', "new conversations do not isolate their own project files");
requireText('const CONVERSATION_PROJECT_FILE_LIMIT = 12;', "project file count is unbounded");
requireText('if (a === "files") openConversationProjectFiles()', "project file manager cannot be opened");
requireText('await addConversationProjectFile(file)', "selected project files are not persisted");
requireText('const conversationProjectText = buildConversationProjectText();', "project files are not injected into chat requests");
requireText('projectFiles: conversationProjectFiles().length', "prompt audit does not report project files");
requireText('只绑定当前对话', "the UI does not explain conversation isolation");
if (!sw.includes('const CACHE = "role-chat-cache-v176";')) throw new Error("service worker cache was not bumped");

const start = html.indexOf("function conversationProjectFiles(");
const end = html.indexOf("function filePromptText(", start);
if (start < 0 || end < 0) throw new Error("conversation project prompt helpers are missing");
const conversation = {
  projectFiles: [
    { id: "a", name: "沈衍角色卡.md", size: 1200, text: "你扮演沈衍。保持强势、敏锐，不替用户行动。" },
    { id: "b", name: "世界观.txt", size: 800, text: "故事发生在临洲。" },
  ],
};
const context = {
  currentConv: () => conversation,
  CONVERSATION_PROJECT_FILE_LIMIT: 12,
  CONVERSATION_PROJECT_PROMPT_CHAR_BUDGET: 24000,
  boundedReferenceFileText: value => String(value || ""),
  safeReferenceFileName: value => String(value || ""),
};
vm.runInNewContext(
  `${html.slice(start, end)}\n` +
  "globalThis.projectHelpers = { conversationProjectFiles, buildConversationProjectText };",
  context,
);
const prompt = context.projectHelpers.buildConversationProjectText();
if (!prompt.includes("沈衍角色卡.md") || !prompt.includes("你扮演沈衍")) {
  throw new Error("role card content is absent from the persistent project prompt");
}
if (!prompt.includes("世界观.txt") || !prompt.includes("故事发生在临洲")) {
  throw new Error("multiple project files are not kept in upload order");
}
if (!prompt.includes("不得把本窗口资料泄漏或混入其他对话")) {
  throw new Error("cross-conversation isolation instruction is missing");
}
if (context.projectHelpers.buildConversationProjectText({ projectFiles: [] }) !== "") {
  throw new Error("empty conversations still spend prompt tokens on project files");
}

console.log("project files regression checks passed");
