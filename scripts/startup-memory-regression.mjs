import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
function harness(filename, bridgeName, apiName, stored) {
  const nodes = new Map(), events = new Map(), reads = [], writes = [];
  let created = 0;
  function node() {
    const classes = new Set();
    return { hidden: true, style: {}, dataset: {}, value: "", children: [],
      classList: { contains: x => classes.has(x), add: x => classes.add(x), remove: x => classes.delete(x),
        toggle(x, force) { const next = force ?? !classes.has(x); if (next) classes.add(x); else classes.delete(x); } },
      addEventListener() {}, setAttribute() {}, append(...items) { this.children.push(...items); },
      appendChild(item) { this.children.push(item); }, replaceChildren(...items) { this.children = items; },
      querySelector() { return node(); }, querySelectorAll() { return []; },
    };
  }
  const get = id => { if (!nodes.has(id)) nodes.set(id, node()); return nodes.get(id); };
  const context = vm.createContext({ console, setTimeout, clearTimeout,
    crypto: { randomUUID: () => "new-id" }, matchMedia: () => ({ matches: true }),
    CustomEvent: class { constructor(type, options) { this.type = type; this.detail = options?.detail; } },
    Image: class {},
    document: { getElementById: get, querySelectorAll: () => [], addEventListener() {},
      createElement() { created++; return node(); } },
    window: { addEventListener(type, fn) { (events.get(type) || events.set(type, []).get(type)).push(fn); },
      dispatchEvent(event) { for (const fn of events.get(event.type) || []) fn(event); } },
  });
  context.window[bridgeName] = {
    dbGet: async key => { reads.push(key); return structuredClone(stored); },
    dbPut: async (key, value) => { writes.push({ key, value: structuredClone(value) }); },
    activeRole: () => ({ id: "owner", name: "测试角色" }), userName: () => "测试用户",
    isMobile: () => true, closeSidebar() {}, toast() {}, resolveChat: () => null,
  };
  vm.runInContext(readFileSync(new URL(`../src/${filename}`, import.meta.url), "utf8"), context);
  return { context, api: context.window[apiName], nodes, reads, writes, created: () => created };
}

const photo = { id: "photo", roleId: "owner", dataUrl: "data:image/jpeg;base64," + "a".repeat(500000),
  title: "原始照片", date: "2026-11-02", category: "art", createdAt: 1 };
const album = harness("album.js", "JYCAlbumBridge", "JYCAlbum", [photo]);
assert.equal(album.reads.length, 0, "importing the album must not read photo payloads");
assert.equal(album.api.summary("owner").loaded, false);
assert.equal(album.created(), 0);
await Promise.all([album.api.ready, album.api.ready]);
assert.equal(album.reads.length, 1, "concurrent requests must share one load");
assert.equal(album.created(), 0, "loading data for export/model access must not draw hidden photos");
assert.equal((await album.api.exportSnapshot())[0].dataUrl, photo.dataUrl);
await album.api.open();
assert.equal(album.nodes.get("album-panel").classList.contains("open"), true);
assert.ok(album.created() > 0, "photos must render when opened");
assert.equal(album.api.summary("owner").count, 1);
assert.equal(album.reads.length, 1);

const book = { id: "book", roleId: "owner", title: "长篇", text: "长篇正文。\n\n".repeat(20000),
  page: 2, pageChats: [], memories: [], createdAt: 1, updatedAt: 1 };
const reader = harness("reading-room.js", "JYCReadingBridge", "JYCReadingRoom",
  { version: 3, books: [book], activeByRole: { owner: "book" } });
assert.equal(reader.reads.length, 0, "importing the reader must not read or paginate all books");
assert.equal(reader.api.summary("owner").loaded, false);
reader.context.window.dispatchEvent({ type: "jyc:app-ready" });
assert.equal(reader.reads.length, 0, "app-ready must not start a hidden reader migration");
await Promise.all([reader.api.ready, reader.api.ready]);
assert.equal(reader.reads.length, 1);
assert.equal(reader.created(), 0, "export readiness must not paginate/render the hidden library");
assert.equal((await reader.api.exportSnapshot()).books[0].text, book.text);
await reader.api.open();
assert.equal(reader.nodes.get("reading-room-panel").classList.contains("open"), true);
assert.ok(reader.created() > 0);
assert.equal(reader.reads.length, 1);

const home = vm.createContext({ currentId: "original", abortController: null, renderedConversationId: "original",
  $: () => ({ replaceChildren() {} }), window: { dispatchEvent() {} }, CustomEvent: class {},
  saveConversations() { throw new Error("home must not write the archive"); },
  switchConversation() { throw new Error("home must not render a hidden chat"); },
});
vm.runInContext(html.slice(html.indexOf("function goHome()"), html.indexOf("function deleteConversation(")), home);
home.goHome();
assert.equal(home.currentId, "original", "returning home must preserve the selected record");
assert.equal(home.renderedConversationId, null);

const dashboard = readFileSync(new URL("../src/dashboard.js", import.meta.url), "utf8");
const render = dashboard.slice(dashboard.indexOf("async function render()"), dashboard.indexOf("function show()"));
assert.ok(!render.includes(".ready"), "dashboard summaries must not activate lazy payloads");
assert.ok(html.includes('if (!window.__jycSafeBoot) initCloud()'), "recovery entry must suppress automatic full cloud payloads");
console.log("startup memory regression: lazy payloads, shared loads, hidden DOM, open/export fidelity and read-only home passed");
