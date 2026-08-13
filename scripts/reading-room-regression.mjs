import { readFileSync } from "node:fs";

const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const css = readFileSync(new URL("../src/reading-room.css", import.meta.url), "utf8");
const js = readFileSync(new URL("../src/reading-room.js", import.meta.url), "utf8");
const dashboard = readFileSync(new URL("../src/dashboard.js", import.meta.url), "utf8");
const sw = readFileSync(new URL("../sw.js", import.meta.url), "utf8");

let checks = 0;
const ok = (condition, message) => {
  checks++;
  if (!condition) throw new Error(message);
};

ok(html.includes('data-dashboard-action="reading"'), "reading-room dashboard card is missing");
ok(html.includes('id="reading-room-panel"'), "reading-room panel is missing");
ok(html.includes('id="reading-library"'), "role bookshelf is missing");
ok(html.includes('id="reading-file"') && html.includes("multiple"), "multi-book import is missing");
ok(html.includes('id="reading-page-left"') && html.includes('id="reading-page-right"'), "two-page reader is missing");
ok(html.includes('id="reading-page-jump"'), "page-number jump is missing");
ok(html.includes('id="reading-auto"'), "proactive follow-reading toggle is missing");
ok(html.includes('id="reading-question"') && html.includes('id="reading-talk"'), "current-page conversation is missing");
ok(html.includes('id="reading-recap"') && html.includes('id="reading-recap-panel"'), "objective recap section is missing");
ok(html.includes('id="reading-extract-memory"') && html.includes('id="reading-memory"'), "reading-memory extraction is missing");
ok(html.includes('id="reading-chat-history"') && html.includes('id="reading-chat-list"'), "page-chat history is missing");
ok(html.includes('href="./src/reading-room.css"'), "reading-room stylesheet is not loaded");
ok(html.includes('src="./src/reading-room.js"'), "reading-room module is not loaded");

ok(js.includes('const DB_KEY = "readingRoomV1"'), "reading-room data is not persisted independently");
ok(js.includes("const STATE_VERSION = 3"), "reading-room reference schema was not upgraded");
ok(js.includes("book.roleId === id"), "books are not isolated by active role");
ok(js.includes("async function importFiles(files)"), "multi-book import flow is missing");
ok(js.includes("function paginate(text)"), "reader pagination is missing");
ok(js.includes("scheduleAutoFollow(book)"), "proactive follow-reading is missing");
ok(js.includes("await bridge.ask"), "page discussion is not connected to the main character");
ok(js.includes("await bridge.recap"), "plot recap is not connected to the model");
ok(js.includes("await bridge.memory"), "reading memories are not model-refined");
ok(js.includes("pageChats: pageChatSource") && js.includes("book.discussions"), "legacy discussions are not migrated to page chat");
ok(js.includes("book.pageChats.push") && !js.includes("book.discussions.push"), "full replies are still being written as reading memory");
ok(js.includes("answerPreview: answer.slice(0, 360)") && js.includes("assistantMessageIds"), "new page chats do not store compact main-chat references");
ok(js.includes('item.answer = ""') && js.includes("linked?.linked"), "linked legacy replies are not compacted safely");
ok(js.includes("pageChatContent(book, item)"), "page-chat history cannot resolve its canonical main-chat content");
ok(js.includes("book.memories.push") && js.includes("sourceChatIds"), "refined memories do not have independent storage and provenance");
ok(js.includes("pageChats: []") && js.includes("memories: []"), "new books do not initialize all reading layers");
ok(js.includes("lastReadAt") && js.includes("recapPage"), "reading progress and recap position are not stored independently");
ok(js.includes("exportSnapshot") && js.includes("restoreSnapshot") && js.includes("reassignRole"), "reading-room lifecycle APIs are incomplete");

ok(html.includes("window.JYCReadingBridge"), "main-chat reading bridge is missing");
ok(html.includes("pendingReadingContext"), "current-page context is not injected into main chat");
ok(html.includes("await generateReply()"), "reading discussion does not use the main chat reply pipeline");
ok(html.includes("function resolveReadingChat(ref)"), "main-chat reference resolver is missing");
ok(html.includes("userMessageId: String(readingUserMessage.id") && html.includes("assistantMessageIds: answerMessages.map"), "reading replies do not return canonical message IDs");
ok(html.includes("resolveChat: resolveReadingChat"), "reading room cannot resolve referenced chat messages");
ok(html.includes("async memory(payload)"), "reading-memory bridge is missing");
ok(html.includes("客观剧情回顾") && html.includes("不加入角色与用户的私人互动"), "plot recap prompt is not objectively isolated");
ok(html.includes("共同读书记忆提炼") && html.includes("只输出 NO_MEMORY"), "reading-memory prompt does not filter transient chat");
ok(html.includes("readingRoom: { bookId: payload.bookId"), "reading turns are not retained in main chat history");
ok(html.includes("readingRoom = window.JYCReadingRoom"), "reading-room data is missing from backup export");
ok(html.includes("restoreSnapshot(data.readingRoom)"), "reading-room data is missing from backup restore");
ok(html.includes("JYCReadingRoom.reassignRole"), "role deletion can orphan reading-room data");
ok(dashboard.includes("JYCReadingRoom?.summary?.(data.roleId)"), "dashboard reading progress is not role-aware");

ok(css.includes("grid-template-columns: 270px minmax(0, 1fr)"), "desktop bookshelf-reader layout is missing");
ok(css.includes("@media (max-width: 780px)"), "mobile reading-room layout is missing");
ok(css.includes(".reading-spread") && css.includes(".reading-page"), "page-spread styling is missing");
ok(sw.includes('const CACHE = "role-chat-cache-v153";'), "service worker cache was not bumped to v152");

const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]);
ok(new Set(ids).size === ids.length, "reading-room change introduced duplicate DOM ids");

console.log(`reading-room regression checks passed (${checks})`);
