import { readFileSync } from "node:fs";

const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const sw = readFileSync(new URL("../sw.js", import.meta.url), "utf8");

let checks = 0;
const ok = (condition, message) => {
  checks++;
  if (!condition) throw new Error(message);
};

ok(html.includes('class="settings-profile-hero"'), "settings profile hero is missing");
ok(html.includes('id="settings-home-avatar"'), "active-role avatar is missing from settings home");
ok(html.includes('id="settings-home-role-name"'), "active-role name is missing from settings home");
ok(html.includes("function renderSettingsHome()"), "dynamic settings-home summary is missing");
ok(html.includes("settingsCompanionSince()"), "companion start date is not rendered");
ok(html.includes('class="settings-nav-card"'), "settings categories are not grouped into cards");
ok(html.includes('id="settings-status-services"'), "current model status is missing");
ok(html.includes('id="settings-status-appearance"'), "current theme status is missing");
ok(html.includes('id="settings-status-memory"'), "memory count status is missing");
ok(html.includes('id="settings-status-account"'), "sync status is missing");
ok(html.includes('$("settings-panel").classList.remove("settings-home")'), "subpages do not restore the standard header");
ok(html.includes('$("settings-panel").classList.add("settings-home")'), "settings home styling is not activated");
ok(html.includes("-webkit-overflow-scrolling: touch"), "mobile settings scrolling lost momentum support");

for (const tab of ["account", "role", "services", "billing", "memory", "media", "appearance", "data"]) {
  ok(html.includes(`data-settings-tab="${tab}"`), `settings category ${tab} was removed`);
  ok(html.includes(`${tab}: { title:`), `settings subpage ${tab} was removed`);
}

ok(sw.includes('const CACHE = "role-chat-cache-v152";'), "service worker cache was not bumped to v152");

const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]);
ok(new Set(ids).size === ids.length, "settings redesign introduced duplicate DOM ids");

console.log(`settings regression checks passed (${checks})`);
