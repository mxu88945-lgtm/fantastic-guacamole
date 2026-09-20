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
ok(html.includes('id="settings-status-prompt"'), "system prompt status is missing");
ok(html.includes('id="settings-status-account"'), "sync status is missing");
ok(html.includes('$("settings-panel").classList.remove("settings-home")'), "subpages do not restore the standard header");
ok(html.includes('$("settings-panel").classList.add("settings-home")'), "settings home styling is not activated");
ok(html.includes("-webkit-overflow-scrolling: touch"), "mobile settings scrolling lost momentum support");

for (const tab of ["account", "role", "prompt", "services", "billing", "memory", "media", "appearance", "data"]) {
  ok(html.includes(`data-settings-tab="${tab}"`), `settings category ${tab} was removed`);
  ok(html.includes(`${tab}: { title:`), `settings subpage ${tab} was removed`);
}

ok(html.includes('id="system-prompt-role-name"'), "system prompt does not identify its active role");
ok(html.includes('id="system-prompt-save-status"'), "system prompt save status is missing");
ok(html.includes('id="system-prompt-count"'), "system prompt character count is missing");
ok(html.includes('$("systemPrompt").addEventListener("input", queueSystemPromptSave)'), "system prompt is not auto-saved while typing");
ok(html.includes('let systemText = settings.systemPrompt || "";'), "system prompt is not connected to chat requests");
ok(html.includes('const ROLE_FIELDS = ["systemPrompt"'), "system prompt is not isolated per role");
ok(html.includes('id="systemInstruction"'), "independent system instruction input is missing");
ok(html.includes('id="system-instruction-save-status"'), "system instruction save status is missing");
ok(html.includes('id="system-instruction-count"'), "system instruction character count is missing");
ok(html.includes('$("systemInstruction").addEventListener("input", queueSystemInstructionSave)'), "system instruction is not auto-saved while typing");
ok(html.includes('const additionalSystemInstruction = String(settings.systemInstruction || "").trim()'), "system instruction is not connected to chat requests");
ok(html.includes('"systemPrompt", "systemInstruction"'), "system instruction is not stored separately per role");
ok(html.includes('const DEFAULT_GLOBAL_PROMPT_PRESETS = ['), "global prompt preset defaults are missing");
ok(html.includes('id="global-prompt-presets"') && html.includes('id="global-prompt-add"'),
  "global prompt preset editor is missing from system prompt settings");
ok(html.includes('function renderGlobalPromptPresets()') && html.includes('function addGlobalPromptPreset()'),
  "global prompt presets cannot be rendered or added");
ok(html.includes('"globalPromptPresets"') && html.includes('buildGlobalPromptPresetText()'),
  "global prompt presets are not persisted and injected into model requests");
ok(html.includes('【全局预设 · ${item.name.trim() || "未命名预设"}】'),
  "global preset order is not represented in the injected system prompt");
ok(html.includes('settings.globalPromptPresets = presets;\n      saveSettings(); renderGlobalPromptPresets(); renderSettingsHome();'),
  "global prompt presets cannot be reordered");

ok(html.includes('const CHAT_BG_DB_KEY = "chatBackgroundV1";'), "chat background is not isolated in IndexedDB");
ok(html.includes('await dbPut(CHAT_BG_DB_KEY, blob);'), "compressed chat background is not persisted in IndexedDB");
ok(html.includes('canvas.toBlob(') && !html.includes('settings.chatBg = canvas.toDataURL('),
  "chat background still uses blocking Base64 localStorage persistence");
ok(html.includes('let chatBgLoadRevision = 0;') && html.includes('revision !== chatBgLoadRevision'),
  "overlapping background replacements can still finish out of order");
ok(html.includes('e.target.value = "";\n    await setChatBgFile(file);'),
  "background picker cannot reliably select another image while replacement runs");
ok(html.includes('await restoreChatBackground();'), "legacy or IndexedDB background is not restored during startup");
ok(html.includes('$("bg-clear").onclick = clearChatBackground;'), "background clear does not remove IndexedDB state");

ok(sw.includes('const CACHE = "role-chat-cache-v172";'), "service worker cache was not bumped for global prompt presets");

const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]);
ok(new Set(ids).size === ids.length, "settings redesign introduced duplicate DOM ids");

console.log(`settings regression checks passed (${checks})`);
