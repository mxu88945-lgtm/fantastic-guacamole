import { readFileSync } from "node:fs";

const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const css = readFileSync(new URL("../src/game-room.css", import.meta.url), "utf8");
const js = readFileSync(new URL("../src/game-room.js", import.meta.url), "utf8");
const dashboard = readFileSync(new URL("../src/dashboard.js", import.meta.url), "utf8");
const sw = readFileSync(new URL("../sw.js", import.meta.url), "utf8");

let checks = 0;
const ok = (condition, message) => {
  checks++;
  if (!condition) throw new Error(message);
};

ok(html.includes('data-dashboard-action="game"'), "game room is missing from the dashboard");
ok(html.includes('id="game-room-panel"'), "game room panel is missing");
ok(html.includes('id="game-room-modes"'), "game mode picker is missing");
ok(html.includes('id="game-room-play"'), "play action is missing");
ok(html.includes('href="./src/game-room.css"'), "game room stylesheet is not loaded");
ok(html.includes('src="./src/game-room.js"'), "game room module is not loaded");
ok(js.includes('jealousy: ['), "jealousy deck is missing");
ok(js.includes('truth: ['), "truth deck is missing");
ok(js.includes('sync: ['), "sync deck is missing");
ok(js.includes('task: ['), "task deck is missing");
ok(js.includes('jyc_game_room_v1'), "role game state is not persisted");
ok(js.includes('bridge.openChatWithDraft?.(gamePrompt(info))'), "game card cannot continue in chat");
ok(js.includes('state.value.history = state.value.history.slice(0, 30)'), "game history is not bounded");
ok(dashboard.includes('window.JYCGameRoom?.summary?.(data.roleId)'), "dashboard game summary is not role-isolated");
ok(html.includes('openChatWithDraft: (text)'), "dashboard bridge cannot carry a game prompt to chat");
ok(css.includes('@media (max-width: 720px)'), "mobile game-room layout is missing");
ok(sw.includes('const CACHE = "role-chat-cache-v156";'), "service worker cache was not bumped to v156");

const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]);
ok(new Set(ids).size === ids.length, "game-room change introduced duplicate DOM ids");

console.log(`game-room regression checks passed (${checks})`);
