import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const sw = readFileSync(new URL("../sw.js", import.meta.url), "utf8");
assert.ok(sw.includes('const CACHE = "role-chat-cache-v398";'), "service worker cache bumped for the agency release");

const start = html.indexOf("/* agency:start");
const end = html.indexOf("/* agency:end */");
assert.ok(start > 0 && end > start, "agency helper block is missing");
const lib = new Function(html.slice(start, end) + `
return { agencyParseDuration, agencyParsePause, agencyHasResume, agencyParseRoom, agencyParseShare, agencyParseBody, stripAgencyTags,
  agencyAddNotes, agencyCanAsk, agencyCurrentBody, agencyAfterReply, agencyRulesText, agencyFormatLeft };`)();

assert.equal(lib.agencyParseDuration("30分钟"), 30 * 60000);
assert.equal(lib.agencyParseDuration("2小时"), 2 * 3600000);
assert.equal(lib.agencyParseDuration("半小时"), 30 * 60000);
assert.equal(lib.agencyParseDuration("三天"), 24 * 3600000, "clamped to 24h");
assert.deepEqual(lib.agencyParsePause("先这样。\n【暂停：2小时｜我想静静】", 1000), { until: 1000 + 7200000, reason: "我想静静", at: 1000 });
assert.ok(lib.agencyHasResume("好。[继续]"));
assert.deepEqual(lib.agencyParseRoom("[隐私室:那天的雨|其实我在楼下\n等了很久]"), [{ title: "那天的雨", text: "其实我在楼下\n等了很久" }]);
assert.deepEqual(lib.agencyParseShare("给你。[分享:《那天的雨》]"), ["那天的雨"]);
assert.deepEqual(lib.agencyParseBody("[状态:精力 40|困意 70|有点累]"), { energy: 40, sleepy: 70, note: "有点累" });

const shown = lib.stripAgencyTags("先这样。\n[隐私室:秘密|第一行\n第二行]\n[状态:精力 40]\n[继续]\n[暂停:1小时|冷静]\n[分享:秘密]");
assert.equal(shown, "先这样。");
assert.equal(lib.stripAgencyTags("嗯。[暂", true), "嗯。", "half tag hidden while streaming");
assert.equal(lib.stripAgencyTags("没有标记"), "没有标记");

const room = lib.agencyAddNotes(lib.agencyAddNotes([], [{ title: "t", text: "a" }], 1), [{ title: "t", text: "b" }], 2);
assert.equal(room.length, 1); assert.equal(room[0].text, "b");
assert.equal(lib.agencyCanAsk({ declinedAt: Date.now() }), false);

const noon = new Date(2026, 10, 16, 12).getTime();
assert.equal(lib.agencyCurrentBody({ energy: 30, sleepy: 15, note: "", at: noon }, noon + 7200000).energy, 50);
assert.equal(lib.agencyAfterReply({ energy: 30, sleepy: 15, note: "", at: noon }, null, noon).energy, 28.5);
const night = new Date(2026, 10, 16, 3).getTime();
assert.equal(lib.agencyCurrentBody({ energy: 80, sleepy: 15, note: "", at: night - 4 * 3600000 }, night).sleepy, 75);

assert.equal(lib.agencyRulesText({}, "顾祁砚", "惟惟"), "");
assert.ok(lib.agencyRulesText({ pause: true, room: true, body: true }, "顾祁砚", "惟惟").includes("[暂停:"));

// wiring
assert.ok(html.includes('"agencyPauseEnabled","agencyRoomEnabled","agencyBodyEnabled"]'), "flags synced");
assert.ok(html.includes("if (typeof stripAgencyTags === \"function\") text = stripAgencyTags(text, streaming);"), "every strip point hides agency tags");
assert.ok(html.includes("applyAgencyReply(assistantMsg.content, replyConv,"), "reply processing wired");
assert.ok(html.includes("buildAgencyPromptText(currentConv())"), "prompt wired");
assert.ok(html.includes('id="agency-panel"') && html.includes('id="agency-open"'), "panel and entry present");
assert.ok(html.includes('id="agency-status-bar"') && html.includes("function renderAgencyStatusBar("), "header status bar present");
console.log("agency regression passed");
