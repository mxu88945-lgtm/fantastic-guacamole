import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const music = readFileSync(new URL("../src/music.js", import.meta.url), "utf8");
const css = readFileSync(new URL("../src/music.css", import.meta.url), "utf8");
const sw = readFileSync(new URL("../sw.js", import.meta.url), "utf8");
const start = html.indexOf("/* song-annotation:start");
const end = html.indexOf("/* song-annotation:end */");
assert.ok(start > 0 && end > start);
const f = new Function(html.slice(start, end) + "\nreturn { parseSongAnnotationTags, stripSongAnnotationTags, applySongAnnotationTags, songAnnotationsFor };\n")();

assert.deepEqual(f.parseSongAnnotationTags("[批注:晴天|2026-11-22|一起听到副歌]\n【歌曲批注：夜曲｜2026-11-23｜窝在被窝里听完】"), [
  { title: "晴天", date: "2026-11-22", text: "一起听到副歌" },
  { title: "夜曲", date: "2026-11-23", text: "窝在被窝里听完" },
]);
assert.equal(f.stripSongAnnotationTags("普通话 [记忆:x]"), "普通话 [记忆:x]");
assert.equal(f.stripSongAnnotationTags("嗯。\n[批注:晴天|2026-11-22|那晚一起听]"), "嗯。");
assert.equal(f.stripSongAnnotationTags("嗯。[歌曲批注:晴天|2026-11", true), "嗯。");
const role = { songAnnotations: [] };
const applied = f.applySongAnnotationTags("记下来了。[批注:晴天|2026-11-22|那晚一起听]", role, "character");
assert.equal(applied.annotations.length, 1);
assert.equal(applied.text, "记下来了。");
assert.equal(role.songAnnotations[0].author, "character");
assert.equal(f.songAnnotationsFor(role, { songId: "song-1", name: "晴天" }).length, 1);
const guestRole = { songAnnotations: [] };
assert.equal(f.applySongAnnotationTags("[批注:晴天|2026-11-22|不应保存]", guestRole, "guest").text, "");
assert.equal(guestRole.songAnnotations.length, 0);

assert.ok(html.includes('id="music-annotations"'));
assert.ok(html.includes("applySongAnnotationTags(assistantMsg.content, activeRole(), \"character\")"));
assert.ok(html.includes("guestCleanReply") && html.includes("stripSongAnnotationTags"));
assert.ok(music.includes("JYCSongAnnotationBridge") && music.includes("music-annotation-form"));
assert.ok(css.includes(".music-annotations") && css.includes(".music-annotation-form"));
assert.match(sw, /role-chat-cache-v447/);
console.log("song annotation regression passed");
