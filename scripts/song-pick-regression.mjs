import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { rankLyrics, mergeCandidates, nextCandidateIndex, shiftLyricLines, guessLyricMeta } from "../src/music-lyrics.js";
import { findTrackByTitle, songTitleKeys, buildSongPickNote, songPickTitleList, toSimplified } from "../src/song-pick.js";

const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const music = readFileSync(new URL("../src/music.js", import.meta.url), "utf8");
const css = readFileSync(new URL("../src/music.css", import.meta.url), "utf8");
const sw = readFileSync(new URL("../sw.js", import.meta.url), "utf8");

// ---- inline tag helpers from index.html ----
const start = html.indexOf("/* song-pick:start");
const end = html.indexOf("/* song-pick:end */");
assert.ok(start > 0 && end > start, "song-pick helper block is missing from index.html");
const helpers = new Function(html.slice(start, end) + "\nreturn { stripSongPickTags, extractSongPick };")();
const { stripSongPickTags, extractSongPick } = helpers;

assert.equal(stripSongPickTags("今晚听这个。\n[点歌:晴天]"), "今晚听这个。");
assert.equal(stripSongPickTags("好。\n【点歌：夜曲】"), "好。");
assert.equal(stripSongPickTags("好。\n［点歌:夜曲］"), "好。");
assert.equal(stripSongPickTags("好。\n[点歌：夜曲]\n"), "好。");
assert.equal(stripSongPickTags("没有标签 [记忆:x]"), "没有标签 [记忆:x]", "unrelated text is untouched");
// streaming: partial tag hidden, whole text kept otherwise
assert.equal(stripSongPickTags("嗯。\n[点歌:晴", true), "嗯。");
assert.equal(stripSongPickTags("嗯。\n【点", true), "嗯。");
assert.equal(stripSongPickTags("嗯。[", true), "嗯。");
assert.equal(stripSongPickTags("嗯。\n[点歌:晴", false), "嗯。\n[点歌:晴", "non-streaming keeps an unfinished bracket");

const picked = extractSongPick("先听这首。\n[点歌:晴天]\n再换。\n【点歌：《夜曲》】");
assert.equal(picked.title, "夜曲", "last tag wins and 书名号 are trimmed");
assert.equal(picked.text, "先听这首。\n\n再换。");
assert.ok(!/点歌/.test(picked.text));
assert.deepEqual(extractSongPick("普通回复"), { text: "普通回复", title: "" });

// ---- fuzzy matching (ported from 惟境 musicStore v202) ----
const tracks = [
  { id: "1", name: "周杰伦 - 晴天.mp3", artist: "" },
  { id: "2", name: "夜曲(Live)", artist: "周杰伦" },
  { id: "3", name: "阿梨粤-偏偏喜欢你(女声版)", artist: "" },
  { id: "4", name: "千年之戀", artist: "F.I.R." },
  { id: "5", name: "Shape of You - Remix", artist: "Ed Sheeran" },
  { id: "6", name: "07 稻香", artist: "" },
];
const id = (t) => findTrackByTitle(tracks, t)?.id || null;
assert.equal(id("晴天"), "1", "artist prefix and extension stripped");
assert.equal(id("夜曲"), "2", "(Live) bracket stripped");
assert.equal(id("偏偏喜欢你"), "3", "artist split on bare hyphen + 女声版");
assert.equal(id("千年之恋"), "4", "traditional → simplified");
assert.equal(id("shape of you"), "5", "case/space/remix suffix");
assert.equal(id("稻香"), "6", "track number prefix stripped");
assert.equal(id("《晴天》"), "1");
assert.equal(id("晴天 - 周杰伦"), "1", "artist on either side");
assert.equal(id("完全不存在的歌"), null);
assert.equal(toSimplified("戀愛"), "恋爱");
assert.deepEqual(songTitleKeys("周杰伦 - 晴天 (Live).mp3").parts, ["周杰伦", "晴天"]);

// ---- prompt block ----
assert.equal(buildSongPickNote([]), "", "empty playlist adds nothing");
const many = Array.from({ length: 90 }, (_, i) => `  歌曲${i}  `);
const list = songPickTitleList(many);
assert.ok(list.length <= 40 && list[0] === "歌曲0", "max 40, trimmed");
const longList = songPickTitleList(Array.from({ length: 40 }, (_, i) => "很长的歌名".repeat(6) + i));
assert.ok(longList.join("、").length <= 800, "about 800 chars max");
const note = buildSongPickNote(["晴天", "夜曲"]);
assert.match(note, /\[点歌:歌名\]/);
assert.match(note, /晴天、夜曲/);
assert.match(note, /不要每轮/);

// ---- wiring ----
assert.ok(html.includes("window.JYCMusic?.songPickNote?.()"), "main prompt must append the song-pick block");
assert.ok(html.includes('id="songPickEnabled"') && html.includes("songPickEnabled: true"), "toggle defaults on");
assert.ok(html.includes("stripSongPickTags(text, !!streaming);"), "display strips tags while streaming");
assert.ok(/function sendContent\(m\) \{[\s\S]{0,200}stripSongPickTags/.test(html), "history sent to the model is stripped");
assert.ok(/function messageText\(m\) \{[\s\S]{0,120}stripSongPickTags/.test(html), "memory/summary text is stripped");
assert.ok(/function exportPlainBody\(m\) \{[\s\S]{0,400}stripSongPickTags/.test(html), "exports are stripped");
assert.ok(html.includes("songPickHandled.has(message.id)"), "auto-switch at most once per message");
assert.ok(html.includes('.song-pick-chip, '), "chip joins the iOS one-tap selector");
assert.ok(!/function renderMessages\(\) \{[\s\S]{0,4000}autoPlaySongPick\(/.test(html), "history rendering never auto-plays");
assert.ok(music.includes('import { findTrackByTitle, buildSongPickNote } from "./song-pick.js"'));
assert.ok(music.includes('error.name === "NotAllowedError"'), "autoplay block fails quietly");
assert.ok(!/accept\s*=\s*["']/.test(music) && !/\.accept\s*=/.test(music.slice(music.indexOf("function pickLocalFiles"), music.indexOf("function pickLocalFiles") + 900)), "import picker has no accept attribute");
assert.ok(css.includes(".song-pick-chip"));
assert.ok(sw.includes('const CACHE = "role-chat-cache-v367";'), "service worker cache bumped");

// ---- v361 换一版歌词 + 本地管理多选 ----
const cands = rankLyrics([
  { trackName: "晴天", duration: 300, syncedLyrics: "[00:01]far" },
  { trackName: "晴天", duration: 269, syncedLyrics: "[00:01]close" },
  { trackName: "晴天", duration: 269, plainLyrics: "plain" },
  { trackName: "晴天 (Live)", duration: 269, syncedLyrics: "[00:01]live" },
  { trackName: "晴天", duration: 269, syncedLyrics: "[00:01]close" },
  { trackName: "晴天", instrumental: true, syncedLyrics: "[00:01]inst" },
  { trackName: "别的歌", syncedLyrics: "[00:01]other" },
], "晴天", 270);
assert.deepEqual(cands, ["[00:01]close", "[00:01]far", "plain", "[00:01]live"], "closest duration first, synced over plain, deduped");
assert.deepEqual(mergeCandidates(["a", "b"], ["b", "c"]), ["a", "b", "c"]);
assert.equal(nextCandidateIndex({ list: ["a", "b", "c"], idx: 0 }), 1);
assert.equal(nextCandidateIndex({ list: ["a", "b", "c"], idx: 2 }), 0, "cycles back");
assert.equal(nextCandidateIndex({ list: ["a"], idx: -1 }), 0);
assert.equal(nextCandidateIndex({ list: [], idx: 0 }), -1);
assert.deepEqual(shiftLyricLines([{ time: 1, text: "x" }, { time: -1, text: "p" }], 0.5).map((l) => l.time), [1.5, -1]);
assert.equal(shiftLyricLines([{ time: 0.2, text: "x" }], -1)[0].time, 0, "never negative");
assert.deepEqual(guessLyricMeta("阿梨粤-偏偏喜欢你(女声版).mp3"), { title: "偏偏喜欢你", artist: "阿梨粤" });
assert.ok(html.includes('id="music-version-btn"') && html.indexOf('id="music-version-btn"') - html.indexOf('id="music-lyrics-btn"') < 200, "换一版歌词 sits next to 歌词");
assert.ok(music.includes("第 ${c.idx + 1}/${c.list.length} 版歌词"), "toast shows 第 x/y 版歌词");
assert.ok(/const saved = await localGet\(`lyric:\$\{songId\}`\)/.test(music), "online songs read the switched lyric version");
assert.ok(/id="music-local-manage">管理<\/button>[^<]{0,12}<button type="button" id="music-local-import">＋ 导入/.test(music), "管理 next to ＋ 导入");
assert.ok(music.includes("全选") && music.includes("取消全选") && music.includes("删除选中（${picked}）") && music.includes(">完成<"));
const delSel = music.slice(music.indexOf("async function removeLocalSelected"), music.indexOf("async function removeLocalSelected") + 900);
assert.ok(delSel.includes("confirm(") && delSel.includes("localDel(`audio:${id}`)") && delSel.includes("localDel(`lyric:${id}`)") && delSel.includes("saveLocalList()"), "batch delete mirrors removeLocal");
assert.ok(css.includes(".music-check") && css.includes(".music-lyric-tools"));

console.log("song pick regression passed");
