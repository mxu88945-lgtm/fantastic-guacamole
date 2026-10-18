import { readFileSync } from "node:fs";

const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const css = readFileSync(new URL("../src/rp-theater.css", import.meta.url), "utf8");
const js = readFileSync(new URL("../src/rp-theater.js", import.meta.url), "utf8");
const dashboard = readFileSync(new URL("../src/dashboard.js", import.meta.url), "utf8");

let checks = 0;
const ok = (condition, message) => {
  checks++;
  if (!condition) throw new Error(message);
};

ok(html.includes('href="./src/rp-theater.css"'), "RP theater stylesheet is not loaded");
ok(html.includes('src="./src/rp-theater.js"'), "RP theater module is not loaded");
ok(html.includes('data-dashboard-action="roleplay"'), "dashboard has no RP theater entry");
ok(html.includes("window.JYCRoleplayBridge"), "RP bridge is missing");
ok(html.includes('newConversation("roleplay")'), "RP projects do not create isolated conversations");
ok(html.includes("function privateRoleConvs()"), "private chats are not separated from RP projects");
ok(html.includes("privateRoleConvs().filter(c => c.messages.length > 0)"), "private sidebar still includes RP projects");
ok(html.includes("return privateRoleConvs().filter(c => Array.isArray(c.messages)"), "main-chat continuation can still select RP");
ok(html.includes("【RP 剧场·双层身份协议】"), "RP identity-layer prompt is missing");
ok(html.includes("戏内事件、感情和人物关系只属于本剧本档案"), "fiction memory isolation rule is missing");
ok(html.includes("不代替用户说话、行动、作决定、下心理结论或预设同意"), "user agency rule is missing");
ok(html.includes("addRoleplayMemory(t, sourceMessageId)"), "RP memory tokens are not routed to project memory");
ok(html.includes("RP 剧本的戏内连续性档案整理器"), "RP rolling-summary prompt is missing");
ok(html.includes("RP 剧情档案"), "cross-window RP source labeling is missing");
ok(js.includes("importCharacterCard") && js.includes("character_book"), "character-card import is incomplete");
ok(js.includes("bridge.duplicate"), "new-scene duplication is missing");
ok(css.includes(".rp-theater-panel") && css.includes("@media (max-width: 680px)"), "RP theater responsive layout is missing");
ok(dashboard.includes('action === "roleplay"') && dashboard.includes("jyc:roleplay-updated"), "dashboard does not open or refresh RP theater");

console.log(`RP theater regression checks passed (${checks})`);
