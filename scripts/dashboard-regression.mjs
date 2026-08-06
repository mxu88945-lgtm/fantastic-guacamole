import { readFileSync } from "node:fs";

const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const css = readFileSync(new URL("../src/dashboard.css", import.meta.url), "utf8");
const js = readFileSync(new URL("../src/dashboard.js", import.meta.url), "utf8");
const album = readFileSync(new URL("../src/album.js", import.meta.url), "utf8");
const sw = readFileSync(new URL("../sw.js", import.meta.url), "utf8");

let checks = 0;
const ok = (condition, message) => {
  checks++;
  if (!condition) throw new Error(message);
};

ok(html.includes('id="home-dashboard"'), "homepage dashboard is missing");
ok(html.includes('id="sidebar-home"'), "sidebar home entry is missing");
ok(html.includes('data-dashboard-action="chat"'), "chat is not represented as a dashboard card");
ok(html.includes('id="dashboard-chat-title"'), "continue-chat title is missing");
ok(!html.includes('id="dashboard-chat-snippet"') && !js.includes("conversationSnippet"), "private chat content is still previewed on the dashboard");
ok(html.includes('data-dashboard-action="album"'), "album dashboard card is missing");
ok(html.includes('data-dashboard-action="mail"'), "mail dashboard card is missing");
ok(html.includes('data-dashboard-action="days"'), "special-days dashboard card is missing");
ok(html.includes('data-dashboard-action="workbench"'), "workbench dashboard action is missing");
ok(html.includes('class="sidebar-action-bubble sidebar-dashboard-secondary"'), "secondary sidebar actions were not moved off the footer");
ok(html.includes('src="./src/dashboard.js"'), "dashboard module is not loaded");
ok(html.includes('href="./src/dashboard.css"'), "dashboard stylesheet is not loaded");
ok(html.includes("window.JYCDashboardBridge"), "dashboard bridge is missing");
ok(html.includes("const target = latestRoleConversation() || currentConv()"), "continue-chat card does not restore the latest role conversation");
ok(html.includes('new CustomEvent("jyc:dashboard-open")'), "home navigation event is missing");
ok(html.includes('switchConversation(c.id, true)'), "conversation list does not enter chat mode");
ok(css.includes("body.dashboard-open .main > .composer-wrap"), "composer is not hidden on the dashboard");
ok(css.includes("body.dashboard-open .main > header > #toggle-sidebar"), "sidebar button is still visible on the dashboard");
ok(html.includes('id="toggle-sidebar"') && html.includes('$("toggle-sidebar").onclick = toggleSidebar'), "main chat lost its sidebar button");
ok(css.includes("grid-template-columns: 1.12fr .88fr 1fr"), "desktop dashboard grid is missing");
ok(css.includes("@media (max-width: 600px)"), "mobile dashboard layout is missing");
ok(js.includes('window.addEventListener("jyc:role-changed"'), "dashboard does not react to role changes");
ok(js.includes('window.JYCAlbum?.summary?.(data.roleId)'), "dashboard album summary is not role-isolated");
ok(album.includes("function summary(targetRoleId)"), "album summary API is missing");
ok(sw.includes('const CACHE = "role-chat-cache-v144";'), "service worker cache was not bumped to v144");

const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]);
ok(new Set(ids).size === ids.length, "dashboard change introduced duplicate DOM ids");

console.log(`dashboard regression checks passed (${checks})`);
