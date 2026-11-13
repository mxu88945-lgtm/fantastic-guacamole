import { readFileSync } from "node:fs";
import vm from "node:vm";

const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const css = readFileSync(new URL("../src/dashboard.css", import.meta.url), "utf8");
const js = readFileSync(new URL("../src/dashboard.js", import.meta.url), "utf8");
const album = readFileSync(new URL("../src/album.js", import.meta.url), "utf8");
const sidechat = readFileSync(new URL("../src/rp-sidechat.js", import.meta.url), "utf8");
const sidechatCss = readFileSync(new URL("../src/rp-sidechat.css", import.meta.url), "utf8");
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
ok(html.includes('data-dashboard-action="game"'), "game-room dashboard card is missing");
ok(html.includes('id="dashboard-game-meta"'), "game-room dashboard summary is missing");
ok(html.includes('class="sidebar-action-bubble sidebar-dashboard-secondary"'), "secondary sidebar actions were not moved off the footer");
ok(html.includes('src="./src/dashboard.js"'), "dashboard module is not loaded");
ok(html.includes('href="./src/dashboard.css"'), "dashboard stylesheet is not loaded");
ok(html.includes("window.JYCDashboardBridge"), "dashboard bridge is missing");
ok(html.includes("const target = latestRoleConversation() || currentConv()"), "continue-chat card does not restore the latest role conversation");
ok(html.includes("const RP_RENDER_WINDOW = 18") && html.includes('window.addEventListener("jyc:chat-opened", ensureCurrentConversationRendered)'), "long RP chats are not deferred and windowed on iOS");
ok(html.includes('renderedConversationId = null;\n  $("messages").replaceChildren();'), "startup still renders the hidden chat behind the dashboard");
ok(html.includes('if (document.hidden) { clearTimeout(pushTimer); pushTimer = null; }'), "backgrounding still starts a full cloud upload beside the IndexedDB save");
ok(html.includes('new CustomEvent("jyc:dashboard-open")'), "home navigation event is missing");
ok(html.includes('switchConversation(c.id, true)'), "conversation list does not enter chat mode");
ok(css.includes("body.dashboard-open .main > .composer-wrap"), "composer is not hidden on the dashboard");
ok(css.includes("body.dashboard-open .main > header > #toggle-sidebar"), "sidebar button is still visible on the dashboard");
ok(css.includes("body.dashboard-open .main > header > #rp-chat-identity") && css.includes("body.dashboard-open .main > header > #rp-chat-mode"), "RP controls can leak into the dashboard header");
ok(html.includes('function isRoleplaySurfaceActive(conv = currentConv())') && html.includes('const active = isRoleplaySurfaceActive(conv);'), "dashboard does not suspend the restored RP conversation shell");
ok(html.includes('typeof isRoleplaySurfaceActive === "function" && isRoleplaySurfaceActive()'), "main wallpaper can recurse back into a dashboard-suspended RP wallpaper");
ok(html.includes("syncConversationSurface: updateConversationSpaceUI"), "dashboard bridge cannot resync the shared conversation shell");
ok(js.includes("bridge.syncConversationSurface?.();"), "dashboard visibility changes do not resync the shared conversation shell");
ok(sidechat.includes('!document.body.classList.contains("dashboard-open")') && sidechat.includes('"jyc:dashboard-open"'), "RP side chat can survive on the dashboard");
ok(sidechatCss.includes("body.dashboard-open > .rp-sidechat-tab") && sidechatCss.includes("body.dashboard-open > .rp-sidechat-panel"), "dashboard lacks a defensive RP side-chat boundary");

// Exercise the wallpaper hand-off instead of only checking selectors. A
// restored RP record under the dashboard must fall through to the main
// wallpaper exactly once, never bounce recursively between both owners.
const surfaceSource = html.slice(html.indexOf("function isRoleplaySurfaceActive"), html.indexOf("function roleplayDisplayMode"));
const rpWallpaperSource = html.slice(html.indexOf("function applyRoleplayWallpaper"), html.indexOf("function applyRoleplayTextTheme"));
const mainWallpaperSource = html.slice(html.indexOf("function applyChatBg"), html.indexOf("const PET_DEFS"));
const classSet = new Set(["dashboard-open"]);
const nodes = {
  "chat-bg": { style: {} },
  "rp-wallpaper-bg": { style: {} },
};
const rootStyle = { setProperty() {}, removeProperty() {} };
const context = vm.createContext({
  currentConv: () => ({ space: "roleplay", rpProject: {} }),
  isRoleplayConversation: () => true,
  document: {
    body: { classList: { contains: name => classSet.has(name), toggle() {} }, dataset: {}, style: rootStyle },
    documentElement: { setAttribute() {}, style: rootStyle },
  },
  $: id => nodes[id] || { hidden: false, textContent: "", setAttribute() {} },
  settings: { chatBg: "", chatBgDim: 35, chatBgBlur: 6, aiName: "顾祁砚" },
  window: { __jycSafeBoot: false },
  normalizedRoleplayProject: value => value || {},
  roleplayThemePreset: () => ({ id: "liquid-pearl", base: "#f4f8fb", text: "#34404a", narration: "#6f7b86", quote: "#607f9b", accent: "#7896ad" }),
  roleplayColorWithAlpha: () => "rgba(244,248,251,1)",
  currentTheme: () => ({ dark: false, vars: { bg: "#fff" } }),
  syncStatusBarToWallpaper() {},
  chatBgObjectUrl: "",
  updateRoleplayDisplayMode() {}, updateBrand() {}, applyChatBg: undefined,
});
vm.runInContext(`${surfaceSource}\n${rpWallpaperSource}\n${mainWallpaperSource}`, context);
context.applyRoleplayWallpaper();
ok(nodes["rp-wallpaper-bg"].style.display === "none" && nodes["chat-bg"].style.display === "none", "dashboard wallpaper hand-off did not terminate cleanly");
ok(html.includes('id="toggle-sidebar"') && html.includes('$("toggle-sidebar").onclick = toggleSidebar'), "main chat lost its sidebar button");
ok(css.includes("grid-template-columns: 1.12fr .88fr 1fr"), "desktop dashboard grid is missing");
ok(css.includes("@media (max-width: 600px)"), "mobile dashboard layout is missing");
ok(js.includes('window.addEventListener("jyc:role-changed"'), "dashboard does not react to role changes");
ok(js.includes('window.JYCGameRoom?.open?.()'), "dashboard does not open the game room");
ok(js.includes('window.JYCAlbum?.summary?.(data.roleId)'), "dashboard album summary is not role-isolated");
ok(album.includes("function summary(targetRoleId)"), "album summary API is missing");
ok(sw.includes("const cacheRequest = new Request(url.origin + url.pathname"), "cache-busting launch URLs still create duplicate iOS cache entries");
ok(sw.includes('const CACHE = "role-chat-cache-v368";'), "service worker cache was not bumped for the RP theater release");

const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]);
ok(new Set(ids).size === ids.length, "dashboard change introduced duplicate DOM ids");

console.log(`dashboard regression checks passed (${checks})`);
