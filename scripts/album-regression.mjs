import fs from "node:fs";

const html = fs.readFileSync(new URL("../index.html", import.meta.url), "utf8");
const css = fs.readFileSync(new URL("../src/album.css", import.meta.url), "utf8");
const js = fs.readFileSync(new URL("../src/album.js", import.meta.url), "utf8");
const sw = fs.readFileSync(new URL("../sw.js", import.meta.url), "utf8");
let checks = 0;
const ok = (value, message) => { if (!value) throw new Error(message); checks += 1; };

ok(html.includes('id="sidebar-album"') && html.includes('id="album-panel"'), "album entry or panel is missing");
ok(html.includes('type="module" src="./src/album.js"'), "album module is not loaded by the app");
ok(html.includes('href="./src/album.css"'), "album stylesheet is not loaded by the app");
ok(html.includes('window.JYCAlbumBridge'), "album cannot reach the existing persistence bridge");
ok(html.includes('album:') || html.includes("workbench: workbenchBackupSnapshot(), album"), "backup does not include album photos");
ok(html.includes("window.JYCAlbum.restoreSnapshot(data.album)"), "backup restore does not restore album photos");
ok(js.includes('const DB_KEY = "albumEntriesV1"'), "album does not use an isolated IndexedDB key");
ok(js.includes('entry.roleId === roleId()'), "album photos are not isolated by role");
ok(js.includes('canvas.toDataURL("image/jpeg", .86)'), "album uploads are not resized and compressed");
ok(js.includes("addFromDataUrl"), "chat images cannot be added to the album");
ok(js.includes("function findForModel(query"), "the active model cannot query its album");
ok(js.includes("const ranked = roleEntries()"), "model album search can escape the active role");
ok(js.includes("findForModel, ready"), "model album search is not exposed through the album API");
ok(html.includes("async function inspectAlbumForModel(query)"), "main chat cannot inspect an album match");
ok(html.includes("await describeImage(matches[0].dataUrl)"), "album matches are not actually sent through vision");
ok(html.includes("[相册:标题/日期/关键词]"), "the model was not taught the private album tool syntax");
ok(html.includes('act = { type: "album"'), "the active tool loop does not execute album requests");
ok(html.includes("(?:搜索|联网|相册)"), "album tool markers may leak into visible replies");
ok(sw.includes('const CACHE = "role-chat-cache-v159";'), "service worker cache was not bumped to v159");
ok(css.includes("-webkit-overflow-scrolling: touch"), "album panel is not iOS-scroll-safe");
ok(css.includes("grid-template-columns: repeat(2"), "mobile album grid is missing");

console.log(`album regression: ${checks} checks passed`);
