import { readFileSync } from "node:fs";
import vm from "node:vm";
import assert from "node:assert/strict";

const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
class Element {
  handlers = {}; attrs = {}; style = {}; children = []; classes = new Set();
  classList = { toggle: (name, enabled) => enabled ? this.classes.add(name) : this.classes.delete(name) };
  addEventListener(type, fn) { (this.handlers[type] ||= []).push(fn); }
  emit(type, extra = {}) { for (const fn of this.handlers[type] || []) fn({ preventDefault() {}, stopPropagation() { this.stopped = true; }, ...extra }); }
  setAttribute(name, value) { this.attrs[name] = value; }
  append(node) { this.children.push(node); }
  getBoundingClientRect() { return { left: 10, width: 200 }; }
}
const ids = Object.fromEntries(["musicPlayer", "playBtn", "playerCard", "playBtnIcon", "currentTime", "durationTime", "progressFill", "progressTrack"].map(id => [id, new Element()]));
const audio = ids.musicPlayer;
let plays = 0, loads = 0;
Object.assign(audio, { paused: true, ended: false, currentTime: 0, duration: 120,
  play() { plays++; this.paused = false; this.emit("playing"); return Promise.resolve(); },
  pause() { this.paused = true; this.emit("pause"); }, load() { loads++; this.error = null; },
});
const context = vm.createContext({ document: { getElementById: id => ids[id], createElement: () => new Element() },
  roleplayRichSource: value => value, currentConv: () => ({}), normalizedRoleplayProject: () => ({ greetings: [] }) });
vm.runInContext(html.slice(html.indexOf("function roleplayPlayerCompatibility("), html.indexOf("function roleplayRichFrameHtml(")), context);
context.roleplayPlayerCompatibility();
const status = ids.playerCard.children[0];
ids.playBtn.emit("click");
assert.equal(plays, 1, "play() must run synchronously in the tap handler for iOS");
assert.ok(ids.playBtnIcon.classes.has("pause-icon"));
assert.equal(ids.playBtn.attrs["aria-label"], "暂停");
audio.currentTime = 30; audio.emit("timeupdate");
assert.equal(ids.currentTime.textContent, "0:30");
assert.equal(ids.durationTime.textContent, "2:00");
assert.equal(ids.progressFill.style.width, "25%");
ids.progressTrack.emit("click", { clientX: 110 });
assert.equal(audio.currentTime, 60);
ids.progressTrack.emit("keydown", { key: "ArrowRight" });
assert.equal(audio.currentTime, 65);
ids.playBtn.emit("click"); assert.equal(audio.paused, true);
audio.error = { code: 2 }; audio.emit("error");
assert.match(status.textContent, /音源加载失败/);
ids.playBtn.emit("click"); assert.equal(loads, 1); assert.equal(plays, 2);
assert.equal(status.hidden, true);
audio.ended = true; audio.emit("ended"); assert.ok(ids.playBtnIcon.classes.has("play-icon"));
audio.play = () => Promise.reject({ name: "NotAllowedError" });
ids.playBtn.emit("click"); await Promise.resolve();
assert.match(status.textContent, /再点一次/);
const bare = '<html><head></head><body><audio id="musicPlayer"><source src="https://example.com/song.mp3"></audio><button id="playBtn"></button></body></html>';
const repaired = context.roleplayRichDocument(bare, "test");
assert.ok(repaired.includes("function roleplayPlayerCompatibility()"), "scriptless imported controls must receive the compatibility controller");
assert.ok(!context.roleplayRichDocument(bare.replace("</body>", "<script>originalPlayer()</script></body>"), "test").includes("function roleplayPlayerCompatibility()"), "cards with their own scripts must not receive duplicate handlers");
assert.ok(repaired.includes('sandbox') === false && repaired.includes("default-src 'none'"), "the repair must preserve the iframe content policy");
console.log("RP player regression: tap playback, pause, seek, timing, retry and script isolation passed");
