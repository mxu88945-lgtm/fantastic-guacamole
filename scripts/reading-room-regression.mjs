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
ok(html.includes('id="reading-recap"') && html.includes('id="reading-memory"'), "recap or reading memory is missing");
ok(html.includes('href="./src/reading-room.css"'), "reading-room stylesheet is not loaded");
ok(html.includes('src="./src/reading-room.js"'), "reading-room module is not loaded");

ok(js.includes('const DB_KEY = "readingRoomV1"'), "reading-room data is not persisted independently");
ok(js.includes("book.roleId === id"), "books are not isolated by active role");
ok(js.includes("async function importFiles(files)"), "multi-book import flow is missing");
ok(js.includes("function paginate(text)"), "reader pagination is missing");
ok(js.includes("scheduleAutoFollow(book)"), "proactive follow-reading is missing");
ok(js.includes("await bridge.ask"), "page discussion is not connected to the main character");
ok(js.includes("await bridge.recap"), "plot recap is not connected to the model");
ok(js.includes("exportSnapshot") && js.includes("restoreSnapshot") && js.includes("reassignRole"), "reading-room lifecycle APIs are incomplete");

ok(html.includes("window.JYCReadingBridge"), "main-chat reading bridge is missing");
ok(html.includes("pendingReadingContext"), "current-page context is not injected into main chat");
ok(html.includes("await generateReply()"), "reading discussion does not use the main chat reply pipeline");
ok(html.includes("readingRoom: { bookId: payload.bookId"), "reading turns are not retained in main chat history");
ok(html.includes("readingRoom = window.JYCReadingRoom"), "reading-room data is missing from backup export");
ok(html.includes("restoreSnapshot(data.readingRoom)"), "reading-room data is missing from backup restore");
ok(html.includes("JYCReadingRoom.reassignRole"), "role deletion can orphan reading-room data");
ok(dashboard.includes("JYCReadingRoom?.summary?.(data.roleId)"), "dashboard reading progress is not role-aware");

ok(css.includes("grid-template-columns: 270px minmax(0, 1fr)"), "desktop bookshelf-reader layout is missing");
ok(css.includes("@media (max-width: 780px)"), "mobile reading-room layout is missing");
ok(css.includes(".reading-spread") && css.includes(".reading-page"), "page-spread styling is missing");
ok(sw.includes('const CACHE = "role-chat-cache-v134";'), "service worker cache was not bumped to v134");

const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]);
ok(new Set(ids).size === ids.length, "reading-room change introduced duplicate DOM ids");

console.log(`reading-room regression checks passed (${checks})`);
