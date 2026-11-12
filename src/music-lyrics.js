/*
 * v361 歌词候选（移植自惟境 lyrics.ts）：lrclib 搜出来的多版歌词按
 * 同名 → 带时间轴 → 时长最接近这首歌 排序，同一份歌词去重；
 * 「换一版歌词」就在这串候选里轮换。纯函数，方便回归测试。
 */

/** 「阿梨粤-偏偏喜欢你(女声版).mp3」→ { title: "偏偏喜欢你", artist: "阿梨粤" } */
export function guessLyricMeta(name) {
  let s = String(name || "").replace(/\.[a-z0-9]{2,4}$/i, "").trim();
  let artist = "";
  const m = s.match(/^(.+?)\s*[-–—]\s*(.+)$/);
  if (m) { artist = m[1].trim(); s = m[2]; }
  const title = s.replace(/[（(【[].*?[）)】\]]/g, "").replace(/[-–—]+$/, "").trim();
  return { title: title || s.trim(), artist };
}

export function rankLyrics(items, title, dur = 0) {
  const norm = (x) => String(x || "").replace(/\s+/g, "").toLowerCase();
  const t = norm(title);
  const ok = (Array.isArray(items) ? items : []).filter((i) => i && !i.instrumental && norm(i.trackName).includes(t) && (i.syncedLyrics || i.plainLyrics));
  const score = (i) => {
    const same = norm(i.trackName) === t ? 0 : 1000;
    const synced = i.syncedLyrics ? 0 : 500;
    const gap = dur > 0 && i.duration ? Math.abs(i.duration - dur) : 100;
    return same + synced + gap;
  };
  const seen = new Set();
  const out = [];
  for (const i of ok.slice().sort((a, b) => score(a) - score(b))) {
    const text = String(i.syncedLyrics || i.plainLyrics || "");
    if (!text || seen.has(text)) continue;
    seen.add(text);
    out.push(text);
  }
  return out;
}

/** 按艺人搜的结果排前面，再接上只按歌名搜的（去重） */
export function mergeCandidates(byArtist, all) {
  const a = Array.isArray(byArtist) ? byArtist : [];
  return [...a, ...(Array.isArray(all) ? all : []).filter((x) => !a.includes(x))];
}

/** 轮到下一版：返回新的 idx（列表为空返回 -1） */
export function nextCandidateIndex(entry) {
  const n = entry?.list?.length || 0;
  if (!n) return -1;
  return ((Number.isInteger(entry.idx) ? entry.idx : -1) + 1) % n;
}

/** 整体平移时间轴（秒，正数 = 歌词晚一点出现）；纯文本行（time < 0）不动 */
export function shiftLyricLines(lines, offset) {
  const list = Array.isArray(lines) ? lines : [];
  if (!offset) return list;
  return list.map((l) => (l.time >= 0 ? { ...l, time: Math.max(0, l.time + offset) } : l));
}
