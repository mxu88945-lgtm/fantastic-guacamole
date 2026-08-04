import fs from "node:fs";

const html = fs.readFileSync(new URL("../index.html", import.meta.url), "utf8");
const css = fs.readFileSync(new URL("../src/album.css", import.meta.url), "utf8");
const js = fs.readFileSync(new URL("../src/album.js", import.meta.url), "utf8");
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
ok(css.includes("-webkit-overflow-scrolling: touch"), "album panel is not iOS-scroll-safe");
ok(css.includes("grid-template-columns: repeat(2"), "mobile album grid is missing");

console.log(`album regression: ${checks} checks passed`);
