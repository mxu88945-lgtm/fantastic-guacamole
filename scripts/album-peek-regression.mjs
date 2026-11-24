// v387 顾祁砚自己的相册：他能翻原图（[翻相册:词]）、喜欢她发的图就存（[存相册:一句话(|锁)]）。
// 纯规则直接 import src/album-agency.js；index.html 只 eval album-agency 段（剥离 + 发图格式），其余做接线字符串检查。
import fs from "node:fs";
import vm from "node:vm";
import * as A from "../src/album-agency.js";

const html = fs.readFileSync(new URL("../index.html", import.meta.url), "utf8");
const albumJs = fs.readFileSync(new URL("../src/album.js", import.meta.url), "utf8");
const albumCss = fs.readFileSync(new URL("../src/album.css", import.meta.url), "utf8");
const sw = fs.readFileSync(new URL("../sw.js", import.meta.url), "utf8");
let checks = 0;
const ok = (cond, msg) => { if (!cond) throw new Error(msg); checks++; };
const eq = (a, b, msg) => ok(JSON.stringify(a) === JSON.stringify(b), `${msg}\n  got:      ${JSON.stringify(a)}\n  expected: ${JSON.stringify(b)}`);

ok(sw.includes('const CACHE = "role-chat-cache-v430";'), "service worker cache was not bumped to v387");

// ── 纯规则（src/album-agency.js）──
eq(A.parseAlbumTags("好可爱。\n[存相册:她家的小玄凤歪头]"), [{ caption: "她家的小玄凤歪头", locked: false }], "存相册 tag");
eq(A.parseAlbumTags("【存相册：偷偷留着｜锁】"), [{ caption: "偷偷留着", locked: true }], "locked 存相册 tag with full-width marks");
eq(A.parseAlbumTags("没有标记"), [], "no tag");
eq(A.parseAlbumCode("[相册密码:0310]"), "0310", "album code");
eq(A.parseAlbumCode("[相册密码:12]"), null, "code too short");
eq(A.parseAlbumCode("[相册密码:1234567890123]"), null, "code too long");
eq(A.parseLockPhotoTags("[锁照片:睡衣] [解锁照片:玄凤]"), [{ lock: true, key: "睡衣" }, { lock: false, key: "玄凤" }], "lock tags");
const locks = A.applyLockPhotoTags([{ id: "a", caption: "她穿睡衣" }, { id: "b", caption: "玄凤", locked: true }, { id: "c", title: "别的" }],
  [{ lock: true, key: "睡衣" }, { lock: false, key: "玄凤" }]);
eq(locks.changed, 2, "two photos moved");
ok(locks.entries[0].locked === true && !("locked" in locks.entries[1]) && locks.entries[2].locked === undefined, "lock/unlock applied by caption");

eq(A.parseAlbumPeek("我看看。[翻相册:玄凤]"), "玄凤", "peek key");
eq(A.parseAlbumPeek("[翻相册]"), "", "peek without key = recent");
eq(A.parseAlbumPeek("【翻相册：】"), "", "peek with empty key");
eq(A.parseAlbumPeek("没有"), null, "no peek");

const strip = A.stripAlbumTags("留着了。\n[存相册:歪头|锁]\n[相册密码:0310]\n[锁照片:睡衣]\n[解锁照片:玄凤]\n[翻相册:猫]");
eq(strip, "留着了。", "all album tags stripped");
eq(A.stripAlbumTags("嗯。[存相", true), "嗯。", "half tag hidden while streaming");
eq(A.stripAlbumTags("嗯。[存相册:还没写完", true), "嗯。", "unfinished tag hidden while streaming");
eq(A.stripAlbumTags("嗯。[翻", true), "嗯。", "half peek tag hidden while streaming");
eq(A.stripAlbumTags("普通的 [链接] 不动"), "普通的 [链接] 不动", "unrelated brackets kept");

const img = (n) => `data:image/jpeg;base64,${"B".repeat(n)}`;
const entries = [
  { id: "1", by: "char", caption: "她家玄凤歪头", createdAt: 1, dataUrl: img(10) },
  { id: "2", by: "user", caption: "我们的合照", createdAt: 2, dataUrl: img(10), seen: false },
  { id: "3", by: "char", caption: "睡衣自拍", createdAt: 3, dataUrl: img(10), locked: true },
  { id: "4", by: "user", title: "海边", caption: "", createdAt: 4, dataUrl: img(10) },
  { id: "5", by: "char", caption: "玄凤洗澡", createdAt: 5, dataUrl: img(10) },
];
eq(A.pickAlbumPeek(entries, "").map(e => e.id), ["5", "4", "3"], "no key = newest 3, locked included");
eq(A.pickAlbumPeek(entries, "玄凤").map(e => e.id), ["5", "1"], "key matches captions newest first");
eq(A.pickAlbumPeek(entries, "睡衣").map(e => e.id), ["3"], "locked photo can be peeked by its owner");
eq(A.pickAlbumPeek(entries, "海边").map(e => e.id), ["4"], "falls back to title");
eq(A.pickAlbumPeek(entries, "不存在"), [], "no match");
ok(A.pickAlbumPeek([...entries, ...entries.map(e => ({ ...e, id: e.id + "x" }))], "玄凤", 9).length === 3, "peek capped at 3");
ok(A.albumPeekResult([], "猫").includes("没找到") && A.albumPeekResult([], "猫").includes("别编"), "empty peek tells him honestly");
ok(A.albumPeekResult([entries[2]], "睡衣").includes("上锁那格的「睡衣自拍」"), "peek result names locked photos");

const tail = A.buildAlbumTail(entries, { code: "0310", userText: "你相册里都有什么呀", userName: "惟惟" });
ok(tail.text.includes("密码是「0310」"), "lock line carries his own code");
ok(tail.text.includes("惟惟往你的相册里放了 1 张照片：「我们的合照」"), "unseen user photo told by caption");
ok(!tail.text.includes("data:image"), "tail never carries image data");
eq(tail.toldIds, ["2"], "told ids returned so they can be marked seen");
ok(tail.text.includes("【你的相册｜只读目录】") && tail.text.includes("上锁那格（只有你看得到）：「睡衣自拍」"), "index line when she mentions 相册");
const quiet = A.buildAlbumTail(entries.map(e => ({ ...e, seen: undefined, locked: undefined })), { userText: "今天好累" });
eq(quiet.text, "", "nothing in the tail on an ordinary turn without news");
ok(A.buildAlbumTail(entries.filter(e => e.id !== "2"), { code: "", userText: "" }).text.includes("还没设密码"), "locked without code nudges him to set one");

const prompt = A.albumPromptText("顾祁砚", "惟惟");
ok(prompt.startsWith("【顾祁砚的相册】") && prompt.includes("惟惟这轮在聊天里发来的照片"), "prompt uses names");
ok(["[存相册:一句话]", "[存相册:一句话|锁]", "[锁照片:", "[解锁照片:", "[相册密码:", "[翻相册:"].every(t => prompt.includes(t)), "prompt teaches all tags");
ok(A.albumPromptText("顾祁砚", "你").includes("她这轮"), "「你」as user name falls back to 她");
eq(A.albumPromptText("顾祁砚", "惟惟"), prompt, "prompt is stable across turns");
console.log(`album prompt: ${[...prompt].length} chars`);

const openai = [{ role: "system", content: "s" }, { role: "user", content: "看这个" }];
ok(A.appendTailToWire(openai, "【相册】x", "openai") && openai[1].content === "看这个\n\n【相册】x", "tail on string content");
const arr = [{ role: "user", content: [{ type: "image_url", image_url: { url: "data:image/png;base64,AA" } }] }];
A.appendTailToWire(arr, "T", "anthropic");
eq(arr[0].content[1], { type: "text", text: "T" }, "tail appended as text part");
const gem = [{ role: "user", parts: [{ text: "hi" }] }];
A.appendTailToWire(gem, "T", "gemini");
eq(gem[0].parts[1], { text: "T" }, "gemini tail part");
ok(!A.appendTailToWire([{ role: "assistant", content: "x" }], "T", "openai"), "never appended to an assistant turn");

const adds = A.newAlbumAdditions([{ sourceKey: "m1:0" }], [{ key: "m1:0", dataUrl: img(3) }, { key: "m1:1", dataUrl: img(3) }, { key: "m2:0", dataUrl: img(3) }],
  ["第一句", "第二句"], { roleId: "r", locked: true, now: 100, date: "2026-11-16" });
eq(adds.map(a => [a.sourceKey, a.caption, a.by, a.category, a.locked, a.seen]), [["m1:1", "第二句", "char", "kept", true, true], ["m2:0", "第二句", "char", "kept", true, true]],
  "dedup by source key, captions reuse the last one, saved as his and locked");

// ── index.html album-agency 段：剥离 + 发图格式（复用 toApiContent / geminiPartsForContent）──
function extractFunction(name) {
  const start = html.search(new RegExp(`\\n(?:async )?function ${name}\\(`));
  if (start < 0) throw new Error(`function ${name} not found`);
  let i = html.indexOf("{", html.indexOf(")", start)), depth = 0, inStr = null;
  for (; i < html.length; i++) {
    const c = html[i], prev = html[i - 1];
    if (inStr) { if (c === inStr && prev !== "\\") inStr = null; continue; }
    if (c === '"' || c === "'" || c === "`") { inStr = c; continue; }
    if (c === "{") depth++;
    else if (c === "}") { depth--; if (depth === 0) return html.slice(start, i + 1); }
  }
  throw new Error(`unterminated ${name}`);
}
const blockStart = html.indexOf("/* album-agency:start"), blockEnd = html.indexOf("/* album-agency:end */");
ok(blockStart > 0 && blockEnd > blockStart, "album-agency block missing in index.html");
const memoBlock = html.slice(html.indexOf("/* image-memo:start"), html.indexOf("/* image-memo:end */"));
const ctx = { REFERENCE_FILE_PROMPT_CHAR_BUDGET: 8000, fileAwareContentOrder: c => c, filePromptText: () => "", sendContent: m => m.content };
vm.createContext(ctx);
vm.runInContext(memoBlock + "\n" + html.slice(blockStart, blockEnd) + "\n" + ["toApiContent", "geminiPartsForContent"].map(extractFunction).join("\n")
  + "\nthis.__lib = { stripAlbumAgencyTags, albumPeekWireMessages, albumTurnImages };", ctx);
const lib = ctx.__lib;
for (const sample of ["留着。[存相册:歪头|锁]", "嗯[翻相册]", "【相册密码：0310】好", "[锁照片:x][解锁照片:y]", "嗯。[存相", "普通 [链接]"]) {
  eq(lib.stripAlbumAgencyTags(sample, true), A.stripAlbumTags(sample, true), `inline strip matches module: ${sample}`);
}
const peek = { assistant: "我翻翻。[翻相册:玄凤]", text: A.albumPeekResult([entries[4]], "玄凤"), photos: [{ dataUrl: "data:image/png;base64,QUJD", caption: "玄凤洗澡" }] };
const [oa, ou] = JSON.parse(JSON.stringify(lib.albumPeekWireMessages("openai", peek)));
eq(oa, { role: "assistant", content: "我翻翻。[翻相册:玄凤]" }, "peek: his own words go back as assistant");
ok(ou.role === "user" && ou.content[0].type === "text" && ou.content[0].text.includes("不是她的新话"), "peek: app note first");
eq(ou.content[1], { type: "image_url", image_url: { url: "data:image/png;base64,QUJD" } }, "peek: OpenAI image_url, same as chat attachments");
const [, au] = JSON.parse(JSON.stringify(lib.albumPeekWireMessages("anthropic", peek)));
eq(au.content[1], { type: "image", source: { type: "base64", media_type: "image/png", data: "QUJD" } }, "peek: Anthropic base64 image");
const [gm, gu] = JSON.parse(JSON.stringify(lib.albumPeekWireMessages("gemini", peek)));
ok(gm.role === "model" && gu.role === "user", "peek: Gemini roles");
eq(gu.parts[1], { inlineData: { mimeType: "image/png", data: "QUJD" } }, "peek: Gemini inlineData");
const noPhoto = JSON.parse(JSON.stringify(lib.albumPeekWireMessages("openai", { assistant: "[翻相册:猫]", text: A.albumPeekResult([], "猫"), photos: [] })));
ok(typeof noPhoto[1].content === "string" && noPhoto[1].content.includes("没找到"), "peek without match sends text only");

const turnList = [
  { id: "old", role: "user", content: [{ type: "image", dataUrl: "data:image/jpeg;base64,OLD" }] },
  { id: "a1", role: "assistant", content: "嗯" },
  { id: "u1", role: "user", content: [{ type: "text", text: "看" }, { type: "image", dataUrl: "data:image/jpeg;base64,NEW" }] },
  { id: "u2", role: "user", content: [{ type: "image", dataUrl: "data:image/jpeg;base64,NEW2" }, { type: "image", dataUrl: "data:image/jpeg;base64,R", _recalled: true }] },
];
eq(JSON.parse(JSON.stringify(lib.albumTurnImages(turnList))), [{ key: "u1:1", dataUrl: "data:image/jpeg;base64,NEW" }, { key: "u2:0", dataUrl: "data:image/jpeg;base64,NEW2" }],
  "存相册 takes only this turn's images (not older turns, not recalled ones)");

// ── 接线 ──
ok(html.includes('typeof stripAlbumAgencyTags === "function") text = stripAlbumAgencyTags(text, streaming)'), "album tags hidden on every strip path (via stripSelfCardTags)");
ok(/const ownAlbumNote = !rpProject && window\.JYCAlbumAgency\?\.albumPromptText/.test(html), "main chat system gets the own-album prompt (always on, not tied to 小天地)");
ok(!/agencyFlags\(\)[^\n]*album/.test(html), "album is not gated by agency switches");
const tailAt = html.indexOf("const tail = await buildAlbumTurnTail(currentConv(), historyWindow.messages)");
const bodyAt = html.indexOf('msgs.push(...apiMessagesFor(false, historyWindow.messages));');
ok(tailAt > bodyAt && bodyAt > 0, "album tail is appended to the wire after the request body is built (not into system)");
ok(html.includes("for (const peek of pendingAlbumPeeks) wireHistory.push(...albumPeekWireMessages(wireFormat, peek));"), "peek photos appended only when he peeked");
ok(html.includes('if (peekKey !== null) act = { type: "peek", q: peekKey };') && html.includes("!independent && !replyProject && searchRounds < 2"), "peek runs only in main chat, within the 2 extra rounds");
ok(html.includes("pendingAlbumPeeks.push(await albumPeekFor(replyConv, act.q, peekSaid));"), "peek feeds the next round");
const applyAt = html.indexOf("assistantMsg.content = applyAlbumReply(assistantMsg.content, replyConv, !independent && !replyProject && !backstageMode,");
ok(applyAt > 0 && applyAt < html.indexOf("assistantMsg.content = captureDiary(assistantMsg.content);", applyAt), "存相册 parsed before other stripping");
ok(html.includes("await album.addFromChat({ roleId: role?.id, images, captions: tags.map(tag => tag.caption), locked })"), "saved images go through the album (compressed there)");
ok(html.includes("album.applyAgencyUpdate({ roleId: role?.id, lockTags, seenIds: told })"), "lock tags and seen flags applied");
ok(html.includes('albumCode: () => String(activeRole()?.albumCode || "")'), "album panel reads his code from the role");
ok(html.includes('id="album-tab-kept" data-album-category="kept"'), "他收的 tab");
ok(html.includes(".album-lock-tile,"), "lock tile in the iOS one-tap selector");

// ── album.js 存储/UI ──
ok(albumJs.includes("const albumAgency = () => window.JYCAlbumAgency || null;") && !/^import /m.test(albumJs), "album.js reads the shared rules from window (stays a plain script for other harnesses)");
ok(html.indexOf('<script type="module" src="./src/album-agency.js"></script>') > 0
  && html.indexOf('<script type="module" src="./src/album-agency.js"></script>') < html.indexOf('<script type="module" src="./src/album.js"></script>'), "album-agency module loads before album.js");
ok(albumJs.includes('by: entry.by === "char" ? "char" : "user"') && albumJs.includes("...(entry.locked === true ? { locked: true } : {})") && albumJs.includes("...(entry.seen === false ? { seen: false } : {})"), "normalize keeps by/locked/seen (so backup/restore keeps them)");
ok(albumJs.includes('by: "user",') && albumJs.includes("seen: false,"), "photos she puts in herself are unread for him");
ok(albumJs.includes("await sourceToDataUrl({ dataUrl: image.dataUrl })"), "chat images compressed with the album's existing resize");
ok(albumJs.includes("&& (!entry.locked || state.unlocked)") && albumJs.includes("state.unlocked = false;\n    closeViewer();"), "locked photos hidden until unlocked; relocked on close");
ok(albumJs.includes("input.trim() === code"), "unlock checks his code");
ok(albumJs.includes("roleEntries().filter((entry) => !entry.locked).map"), "old [相册:] vision search never exposes locked photos");
ok(albumJs.includes("entriesFor, addFromChat, applyAgencyUpdate"), "album API exposed to the main chat");
ok(albumCss.includes(".album-lock-tile"), "lock tile styled");

console.log(`album peek regression: ${checks} checks passed`);
