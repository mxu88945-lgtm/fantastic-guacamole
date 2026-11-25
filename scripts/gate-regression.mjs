import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const sw = readFileSync(new URL("../sw.js", import.meta.url), "utf8");
assert.ok(sw.includes('const CACHE = "role-chat-cache-v438";'), "service worker cache bumped for the gate release");

const start = html.indexOf("/* gate:start");
const end = html.indexOf("/* gate:end */");
assert.ok(start > 0 && end > start, "gate helper block is missing");
const lib = new Function(html.slice(start, end) + `
return { GATE_BASE, gateParseKey, stripGateTags, extractGateCommands, gateCommandBodies, buildGatePromptText };`)();

const KEY = "bw0123456789abcdef0123456789abcd";
assert.equal(lib.GATE_BASE, "https://gate.zhouweiweihome.top");
assert.equal(lib.gateParseKey(KEY), KEY, "bare key");
assert.equal(lib.gateParseKey(`https://gate.zhouweiweihome.top/lock?k=${KEY}&app=抖音`), KEY, "link with k=");
assert.equal(lib.gateParseKey(`shortcuts://x?url=${encodeURIComponent("https://g.dev/open?k=" + KEY)}`), KEY, "encoded link");
assert.equal(lib.gateParseKey("short"), "");
assert.equal(lib.gateParseKey("https://example.com/?q=1"), "");

// strip
assert.equal(lib.stripGateTags("去吃饭。\n【锁屏 30分钟：去吃饭】"), "去吃饭。");
assert.equal(lib.stripGateTags("好了。[解锁]\n【宵禁 22:30】"), "好了。");
assert.equal(lib.stripGateTags("乖。【锁屏 20分", true), "乖。", "half lock hidden while streaming");
assert.equal(lib.stripGateTags("乖。【锁", true), "乖。");
assert.equal(lib.stripGateTags("乖。【解", true), "乖。");
assert.equal(lib.stripGateTags("乖。【宵禁 2", true), "乖。");
assert.equal(lib.stripGateTags("乖。【锁屏 20分钟：吃"), "乖。", "unclosed lock at the end is dropped on save too");
assert.equal(lib.stripGateTags("【解释一下】这个"), "【解释一下】这个", "ordinary brackets survive");
assert.equal(lib.stripGateTags("[解锁照片:海边]"), "[解锁照片:海边]", "album unlock tag is not ours");
assert.equal(lib.stripGateTags("没有标记"), "没有标记");

// commands
assert.deepEqual(lib.extractGateCommands("x【锁屏 300分钟：睡觉】"), [{ kind: "lock", minutes: 180, reason: "睡觉" }]);
assert.deepEqual(lib.extractGateCommands("x[锁屏 1分钟]"), [{ kind: "lock", minutes: 5, reason: "" }]);
assert.deepEqual(lib.extractGateCommands("【解锁】【宵禁 9:05】【宵禁 25:00】"), [{ kind: "unlock" }, { kind: "curfew", start: "09:05" }]);
const bodies = lib.gateCommandBodies([{ kind: "lock", minutes: 30, reason: "吃饭" }, { kind: "unlock" }, { kind: "curfew", start: "22:30" }], "顾祁砚", "", "https://a.b/", 1000);
assert.deepEqual(bodies[0], { by: "顾祁砚", avatar: "", appUrl: "https://a.b/", lock: { until: 1000 + 1800000, startedAt: 1000, reason: "吃饭" } });
assert.deepEqual(bodies[1], { by: "顾祁砚", lock: null });
assert.deepEqual(bodies[2], { by: "顾祁砚", tonight: "22:30" });
for (const b of bodies) assert.ok(!("name" in b) && !("curfew" in b) && !("limit" in b), "guests never send name/curfew/limit");

// prompt
const now = 10 * 3600e3;
const report = {
  lock: { until: now + 20 * 60000, startedAt: now - 600000, reason: "专心", by: "" },
  curfewNow: true, curfewStart: "23:30", counts: { 抖音: 3, 小红书: 0 },
  breaches: [
    { at: now - 5 * 60000, kind: "lock", app: "抖音", minutes: 12, reason: "去吃饭", by: "顾祁砚" },
    { at: now - 30 * 60000, kind: "lock", app: "抖音", minutes: 8, reason: "", by: "谢聿衡" },
    { at: now - 40 * 60000, kind: "curfew", app: "微博", minutes: 0, reason: "", by: "" },
    { at: now - 4 * 3600e3, kind: "lock", app: "抖音", minutes: 3, reason: "", by: "顾祁砚" },
    { at: 100, kind: "limit", app: "抖音", minutes: 0, reason: "", by: "" },
  ],
};
const built = lib.buildGatePromptText({ name: "顾祁砚", user: "惟惟", report, toldUntil: 200, now });
assert.ok(built.text.includes("【锁屏 30分钟：去吃饭】") && built.text.includes("【解锁】") && built.text.includes("【宵禁 22:30】"));
assert.ok(built.text.includes("5–180") && built.text.includes("一天一两次"));
assert.ok(!/伯恩|谢聿衡|共用|别人/.test(built.text), "never mentions other people or sharing");
assert.ok(built.text.includes("现在是宵禁时间"));
assert.ok(built.text.includes("抖音 3 次") && !built.text.includes("小红书"));
assert.ok(built.text.includes("解开了你给她上的锁屏（理由：去吃饭）"), "his own lock breach");
assert.equal((built.text.match(/【告状】/g) || []).length, 1, "only his own fresh lock breach");
assert.equal(built.toldMark, now - 5 * 60000);
const mine = lib.buildGatePromptText({ name: "顾祁砚", user: "惟惟", report: { ...report, lock: { ...report.lock, by: "顾祁砚" }, breaches: [] }, toldUntil: 0, now });
assert.ok(mine.text.includes("你给她的锁屏还有 20 分钟，理由：专心"));
assert.equal(mine.toldMark, 0);
assert.ok(!lib.buildGatePromptText({ name: "顾祁砚", user: "惟惟", report: null, now }).text.includes("告状"), "no report → rules only");

// wiring
assert.ok(html.includes('if (typeof stripGateTags === "function") text = stripGateTags(text, streaming);'), "every strip point hides gate tags");
assert.ok(html.includes("gateNote = await gatePromptNote();"), "prompt wired into streamChat");
assert.ok(html.includes("isGuestId(guestTurn.speakerId)) && typeof gatePromptNote"), "guests never get the gate prompt");
assert.ok(html.includes("extractGateCommands(assistantMsg.content)") && html.includes("gateApplyCommands(gateCmds);") && html.includes("gateMarkTold();"), "reply execution wired");
assert.ok(html.includes("!independent && !replyProject && !backstageMode && typeof gateActive"), "main chat only");
assert.ok(html.includes('id="gate-settings"') && html.includes('id="gate-key-input"') && html.includes('id="gate-on"') && html.includes("在伯恩 设置→他管着你 复制任意一条链接粘贴到这里，用同一扇门"), "settings section present");
assert.ok(html.includes('stripGateTags(String(m.text || ""))'), "proactive push text stripped");
assert.ok(html.includes("setTimeout(() => ctrl.abort(), 4000)"), "report fetch has a timeout");
console.log("gate regression passed");
