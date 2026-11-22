import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const settingsBlock = html.slice(html.indexOf("const DEFAULTS"), html.indexOf("const SYNCED_KEYS"));
const syncBlock = html.slice(html.indexOf("const SYNCED_KEYS"), html.indexOf("let conversations"));
const backupBlock = html.slice(html.indexOf("const BACKUP_SECRET_KEYS"), html.indexOf("function mergeBackupSettings"));

assert.match(settingsBlock, /relayEnabled:\s*false/);
assert.match(settingsBlock, /relayUrl:\s*[\"']{2}/);
assert.match(settingsBlock, /relayKey:\s*[\"']{2}/);
assert.doesNotMatch(syncBlock, /relayEnabled|relayUrl|relayKey/);
assert.match(backupBlock, /relayEnabled/);
assert.match(backupBlock, /relayUrl/);
assert.match(backupBlock, /relayKey/);
assert.match(html, /POST\s*\/start|\/start\",\s*\{/);
assert.match(html, /authorization:\s*\"Bearer \" \+ config\.key/);
assert.match(html, /base:\s*modelUrl/);
assert.match(html, /key:\s*headers\.authorization/);
assert.match(html, /relayCall\(url, headers, requestBody, \"工具回合\"\)/);
assert.match(html, /relayCall\(url, headers, body, \"主聊天\"\)/);
assert.match(html, /if \(!rpProject && !guestTurn && !speaker && !isGemini\)/);
assert.match(html, /relayRecoverPending\(\)/);
assert.match(html, /extractMemorySaves\(msg\.content, sourceId\)/);
assert.match(html, /stripGateTags\(msg\.content\)/);
assert.match(html, /roleplayGroupRun|isRoleplayConversation\(\)/);

console.log("relay regression passed");
