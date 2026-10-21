import { readFileSync } from "node:fs";
import vm from "node:vm";
import assert from "node:assert/strict";

const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const ui = readFileSync(new URL("../src/rp-theater.js", import.meta.url), "utf8");
const source = (start, end) => html.slice(html.indexOf(start), html.indexOf(end, html.indexOf(start)));
const disk = new Map();
let serial = 0, writes = 0, failReads = false;
const noop = () => {};
const context = vm.createContext({
  console, structuredClone, uid: () => `new-${++serial}`, cloneChatData: structuredClone,
  roleplayCardLibrary: [], roleplayCardWriteQueue: Promise.resolve(),
  settings: { activeRoleId: "gu", roles: [{ id: "gu", name: "顾祁砚" }] },
  conversations: [], currentId: "private", abortController: null, replyBooting: false, roleplayGroupRun: null,
  dbGet: async key => { if (failReads) throw new Error("temporarily unavailable"); return structuredClone(disk.get(key)); },
  dbPut: async (key, value) => { writes++; disk.set(key, structuredClone(value)); },
  isRoleplayConversation: conv => conv?.space === "roleplay", roleConvs: () => context.conversations.filter(c => c.roleId === context.settings.activeRoleId),
  roleplayPublicProject: conv => conv ? structuredClone(conv) : null,
  newConversation: () => ({ id: `scene-${++serial}`, roleId: context.settings.activeRoleId, space: "roleplay", messages: [] }),
  isMobile: () => false, closeSidebar: noop, showToast: noop, saveConversations: noop, saveSettings: noop, syncSettingsToUI: noop,
  renderConvList: noop, renderMessages: noop, updateConvTitle: noop, updateConversationSpaceUI: noop,
  renderConversationProjectFiles: noop, confirm: () => true,
  window: { dispatchEvent: noop }, CustomEvent: class {},
});
vm.runInContext(source("const ROLEPLAY_MEMORY_DEFAULT_SUMMARY_PROMPT", "function addRoleplayMemory("), context);
vm.runInContext(source("function roleplayCardTemplate(", "function roleplaySaveDraft("), context);
vm.runInContext(source("window.JYCRoleplayBridge =", "window.JYCDashboardBridge ="), context);
vm.runInContext(source("function deleteConversation(", "function touchConversation("), context);
const bridge = context.window.JYCRoleplayBridge;
const scene = {
  id: "original", roleId: "gu", space: "roleplay", updatedAt: 100,
  title: "周竞尧的故事", messages: [{ role: "user", content: "PRIVATE_CHAT" }],
  rpProject: {
    actorName: "周竞尧", characterPrompt: "主角原始人设", greetings: ["首页", "正文开场"],
    worldEntries: [{ content: "世界书原文", enabled: false }], regexRules: [{ findRegex: "a", replaceString: "b" }],
    memory: "PRIVATE_SHARED_MEMORY", memories: [{ text: "PRIVATE_FACT" }],
    temporaryPlot: "PRIVATE_TEMPORARY_PLOT", leadChannel: { playedByOwner: true, privateMemory: "PRIVATE_OWNER_MEMORY" },
    members: [{ id: "jiang", name: "江屹琛", prompt: "江屹琛完整独立人设", greeting: "江屹琛开场白",
      beautificationProtocol: "保留美化协议", regexRules: [{ findRegex: "x", replaceString: "y" }],
      playedByOwner: false, avatar: "data:image/png;base64,AAAA", privateMemory: "PRIVATE_GUEST_MEMORY", providerId: "SECRET_PROVIDER", model: "SECRET_MODEL" }],
  },
};
context.conversations = [scene];
context.rememberRoleplayCards();
await context.roleplayCardWriteQueue;
assert.equal(context.savedRoleplayCards().length, 2);
const originalBefore = JSON.stringify(scene);
const guest = context.savedRoleplayCards().find(card => card.rpProject.actorName === "江屹琛");
assert.ok(guest);
const serialized = JSON.stringify(disk.get("roleplayCardLibrary"));
assert.ok(!serialized.includes("PRIVATE_") && !serialized.includes("SECRET_"), "templates must exclude messages, memories, temporary plots and channel bindings");
assert.equal(guest.rpProject.leadChannel.playedByOwner, false);
assert.equal(guest.rpProject.beautificationProtocol, "保留美化协议");
assert.equal(guest.rpProject.regexRules[0].findRegex, "x");
assert.equal(context.savedRoleplayCards().find(card => card.memberId === "lead").rpProject.worldEntries[0].enabled, false);
assert.equal(JSON.stringify(scene), originalBefore, "migration must not mutate the original scene");
const beforeWrites = writes;
context.savedRoleplayCards(); await context.roleplayCardWriteQueue;
assert.equal(writes, beforeWrites, "opening the library repeatedly must not rewrite identical cards");

// Exercise the actual settings and deletion entry points, not a simulated filter.
assert.ok(bridge.saveSceneSettings("original", { members: [] }));
assert.ok(context.savedRoleplayCards().some(card => card.rpProject.actorName === "江屹琛"), "removing a member must retain its card");
context.deleteConversation("original");
await context.roleplayCardWriteQueue;
assert.equal(context.conversations.length, 0);
context.roleplayCardLibrary = [];
context.mergeRoleplayCardLibrary(await context.dbGet("roleplayCardLibrary"));
assert.ok(context.savedRoleplayCards().some(card => card.id === guest.id), "deleted-scene cards must survive a reload");
assert.ok(bridge.castLibrary().some(card => card.name === "江屹琛"), "archived cards must remain available to the cast picker");
const restored = bridge.restoreCard(guest.id);
assert.equal(restored.rpProject.actorName, "江屹琛");
assert.equal(restored.rpProject.characterPrompt, "江屹琛完整独立人设");
assert.equal(restored.messages[0].content, "江屹琛开场白");
assert.equal(restored.rpProject.memory, "");
assert.equal(restored.rpProject.leadChannel.playedByOwner, false, "restoring a guest must not enable the owner identity");
assert.equal(restored.rpProject.regexRules[0].replaceString, "y");

// A new opening creates a scene, not new identities in the role-library view.
const theater = vm.createContext({ detailCast: project => project.cast });
vm.runInContext(ui.slice(ui.indexOf("function roleLibraryEntries("), ui.indexOf("function render()", ui.indexOf("function roleLibraryEntries("))), theater);
const cast = [{ id: "lead", kind: "lead", name: "周竞尧", prompt: "原始主角人设" },
  { id: "jiang", kind: "actor", name: "江屹琛", prompt: "原始共演人设" }];
const projects = ["new-2", "new-1", "original"].map(id => ({ id, cast: structuredClone(cast) }));
const saved = [{ id: "saved-jiang", memberId: "jiang", kind: "actor", rpProject: { actorName: "江屹琛", characterPrompt: "原始共演人设" } }];
const beforeScenes = JSON.stringify(projects);
const uniqueRoles = theater.roleLibraryEntries(projects, saved);
assert.equal(uniqueRoles.length, 2, "opening several scenes must not multiply the two role cards");
assert.equal(uniqueRoles[0].project.id, "new-2", "the visible card must retain a live detail destination");
assert.equal(JSON.stringify(projects), beforeScenes, "view deduplication must never remove scene cast");
assert.equal(theater.roleLibraryEntries([...projects, { id: "variant", cast: [{ ...cast[1], prompt: "独立修改后的人设" }] }], saved).length, 3, "distinct card versions must remain visible");
assert.equal(theater.roleLibraryEntries([], saved).length, 1, "a removed-scene role must remain recoverable from its archive");

const familyCard = { actorName: "周竞尧", characterPrompt: "原始主角人设", greetings: ["开场一", "开场二"] };
const history = [
  { id: "new-2", title: "周竞尧的故事 · 新场次", updatedAt: 3, rpProject: structuredClone(familyCard), messageCount: 1 },
  { id: "original", title: "周竞尧的故事", updatedAt: 1, rpProject: structuredClone(familyCard), messageCount: 189, memoryCount: 12 },
  { id: "new-1", title: "周竞尧的故事 · 新场次", updatedAt: 2, rpProject: structuredClone(familyCard), messageCount: 1 },
];
const beforeGrouping = JSON.stringify(history);
const grouped = theater.projectGroups(history);
assert.equal(grouped.length, 1, "legacy opening scenes must belong to a single visible project");
assert.equal(grouped[0].sessions.length, 3, "all old conversations must stay reachable");
assert.equal(grouped[0].sessions[0].id, "new-2", "continue must open the most recent conversation");
assert.equal(grouped[0].sessions.find(s => s.id === "original").memoryCount, 12);
assert.equal(JSON.stringify(history), beforeGrouping, "grouping must never mutate old chat or memory data");
assert.equal(theater.projectGroups([...history, { ...history[1], id: "independent", title: "另一部故事" }]).length, 2);
assert.equal(theater.projectGroups([...history, { ...history[1], id: "ambiguous" }]).length, 4, "ambiguous independent originals must not be merged");
assert.equal(theater.projectGroups([...history, { ...history[0], id: "future", familyId: "original", title: "改名的对话" }]).length, 1, "explicit lineage must survive conversation renaming");

// Independent owner libraries must stay isolated; cloud/backup merges are additive.
const count = context.roleplayCardLibrary.length;
context.mergeRoleplayCardLibrary([{ ...guest, id: "foreign", ownerRoleId: "other", updatedAt: 200 }]);
assert.equal(context.roleplayCardLibrary.length, count + 1);
assert.equal(bridge.restoreCard("foreign"), null);
assert.ok(!context.savedRoleplayCards().some(card => card.id === "foreign"));
context.mergeRoleplayCardLibrary([]);
assert.ok(context.roleplayCardLibrary.some(card => card.id === guest.id), "an older cloud payload cannot clear the library");
context.mergeRoleplayCardLibrary([{ ...guest, updatedAt: 0, rpProject: { actorName: "旧快照" } }]);
assert.equal(context.roleplayCardLibrary.find(card => card.id === guest.id).rpProject.actorName, "江屹琛");

// A failed read must never replace an existing archive with the in-memory subset.
await context.roleplayCardWriteQueue;
const durable = JSON.stringify(disk.get("roleplayCardLibrary"));
failReads = true;
context.roleplayCardLibrary = [];
await context.persistRoleplayCardLibrary();
assert.equal(JSON.stringify(disk.get("roleplayCardLibrary")), durable);
failReads = false;

assert.ok(html.includes("roleplayCards: clone(roleplayCardLibrary)"), "cloud payload must carry the standalone library");
assert.ok(html.includes("roleplayCards: cloneChatData(roleplayCardLibrary)"), "file backups must carry the standalone library");
assert.ok(ui.includes("bridge.savedCards?.()") && ui.includes("bridge.restoreCard(button.dataset.rpSavedCard)"), "saved cards need a visible recovery action");
console.log("RP library regression: removal, deletion, reload, recovery, owner isolation and failed-read protection passed");
