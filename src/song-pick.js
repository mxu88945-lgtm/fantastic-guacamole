/*
 * v359 他自己点歌：歌名模糊匹配 + 提示词块。
 * 匹配逻辑照搬惟境 src/musicStore.ts（v202 影视歌匹配）：去扩展名、歌手段（" - " – — -）、
 * 括号内容、标点与全角、live/伴奏/remix 等版本尾巴，繁转简，歌名/歌手/文件名双向包含都算。
 * 纯函数，Node 回归脚本直接 import。
 */

// v202：常见繁体 → 简体（歌名里常见的字，够用就行，不引整套字库）。
const T2S = Object.fromEntries(Array.from(
  "戀恋兒儿團团愛爱聽听個个們们這这說说時时間间來来過过還还對对開开關关邊边裡里裏里後后會会經经與与為为無无見见樣样給给讓让誰谁發发夢梦憶忆淚泪憂忧傷伤歲岁風风雲云電电飛飞鳥鸟馬马魚鱼龍龙鳳凤華华國国東东門门長长遠远邊边紅红藍蓝綠绿黃黄靜静聲声樂乐歡欢戲戏劇剧話话語语詞词譜谱調调錯错對对壞坏憐怜難难離离鍾钟鐘钟記记憶忆漢汉場场燈灯塵尘輕轻舊旧親亲顏颜誓誓溫温濃浓淺浅緣缘終终結结斷断線线紙纸書书畫画筆笔煙烟織织輪轮轉转燒烧點点愛爱單单雙双萬万億亿實实壓压獨独憑凭歸归種种隨随悵怅懷怀從从幾几廣广陽阳陰阴雖虽戰战嗎吗嘆叹飄飘蕩荡漫漫謝谢塊块殘残擁拥擊击態态雪雪寫写滿满飯饭貓猫"
).reduce((out, ch, i, all) => (i % 2 === 0 ? [...out, [ch, all[i + 1]]] : out), []));

const AUDIO_EXT = /\.(?:mp3|m4a|aac|flac|wav|ogg|oga|opus|wma|ape|alac|aiff?|caf|mp4|webm)$/i;
const BRACKETS = /\([^()]*\)|（[^（）]*）|\[[^[\]]*\]|【[^【】]*】|《[^《》]*》|「[^「」]*」|『[^『』]*』|〔[^〔〕]*〕/g;
const VERSION_SUFFIX = /(?:live|伴奏|纯音乐|remix|remaster(?:ed)?|instrumental|karaoke|inst|cover|demo|ver(?:sion)?|现场|现场版|完整版|女声版|男声版|dj版|dj|铃声版|高音质|无损|hq|sq)+$/;

export function toSimplified(value) {
  return Array.from(String(value || "")).map((ch) => T2S[ch] || ch).join("");
}

/** 只留字母、数字和汉字，全角转半角，繁转简，小写，去掉 live/伴奏/remix 这类尾巴。 */
export function squashTitle(value) {
  let out = toSimplified(String(value || "").normalize("NFKC").toLowerCase()).replace(/[^\p{L}\p{N}]+/gu, "");
  for (let i = 0; i < 3; i += 1) { const next = out.replace(VERSION_SUFFIX, ""); if (next === out || !next) break; out = next; }
  return out;
}

/** 一个歌名的几种比较用写法：整串 + 按歌手分隔符拆开的各段。 */
export function songTitleKeys(raw) {
  let text = String(raw || "").normalize("NFKC").trim().replace(AUDIO_EXT, "");
  text = text.replace(/[《「『]([^《》「」『』]{1,60})[》」』]/g, " $1 ");
  text = text.replace(BRACKETS, " ");
  const parts = text.split(/\s+-+\s+|\s*[–—]+\s*|(?<=[\p{Script=Han}\p{L}\p{N}.)])-(?=[\p{Script=Han}\p{L}\p{N}])|\s*[/／|｜_]\s*/u).map(squashTitle).filter(Boolean);
  const clean = parts.map((part) => part.replace(/^\d{1,3}(?=\D)/, "")).filter(Boolean);
  return { whole: squashTitle(text).replace(/^\d{1,3}(?=\D)/, ""), parts: clean };
}

/** 短的一方至少 2 个字，且占长的一方至少 minShare（防止只靠歌手名那一小截就算匹配）。 */
function contains(long, short, minShare) {
  return short.length >= 2 && long.includes(short) && short.length >= Math.ceil(long.length * minShare);
}

/**
 * tracks: [{ id, name, title?, artist? }]，返回最像的一首或 null。
 * 相同 > 歌单包含歌名 > 歌名包含歌单段；写了歌手且对得上加分；兜底按字重合度（错一两个字）。
 */
export function findTrackByTitle(tracks, title, artist = "") {
  const list = Array.isArray(tracks) ? tracks : [];
  const wantKeys = songTitleKeys(title);
  const head = (wantKeys.parts[0] || "").match(/^(?:\p{Script=Han}+|[^\p{Script=Han}]+)/u)?.[0] || "";
  const wants = Array.from(new Set([wantKeys.parts[0], wantKeys.whole, head.length >= 2 ? head : ""].filter((key) => key && key.length >= 1)));
  if (!wants.length || !list.length) return null;
  const wantArtist = squashTitle(artist);
  let best = null;
  for (const track of list) {
    if (!track) continue;
    const fields = [track.title, track.name, track.file, track.artist && (track.title || track.name) ? `${track.title || track.name} - ${track.artist}` : ""].filter(Boolean);
    const keys = new Set();
    let haystack = "";
    for (const field of fields) {
      const k = songTitleKeys(field);
      if (k.whole) keys.add(k.whole);
      k.parts.forEach((part) => keys.add(part));
      haystack += k.whole;
    }
    if (track.artist) haystack += squashTitle(track.artist);
    let score = 0;
    for (const want of wants) {
      for (const key of keys) {
        let s = 0;
        if (key === want) s = 100;
        else if (contains(key, want, want.length >= 3 ? 0 : 0.4)) s = 80;
        else if (contains(want, key, 0.6)) s = 60;
        if (s) s += Math.min(want.length, key.length);
        if (s > score) score = s;
      }
    }
    if (!score) {
      const want = wants[0];
      for (const key of keys) {
        const chars = new Set(Array.from(key));
        const hit = Array.from(want).filter((ch) => chars.has(ch)).length;
        const ratio = hit / Math.max(want.length, 1);
        if (want.length >= 3 && ratio >= 0.75 && Math.abs(key.length - want.length) <= 2) score = Math.max(score, Math.round(40 * ratio));
      }
    }
    if (score && wantArtist && wantArtist.length >= 2 && haystack.includes(wantArtist)) score += 10;
    if (score && (!best || score > best.score)) best = { track, score };
  }
  return best ? best.track : null;
}

export const SONG_PICK_MAX_TITLES = 40;
export const SONG_PICK_MAX_CHARS = 800;

/** 歌单歌名：去重、修剪，最多 40 首、合计约 800 字。 */
export function songPickTitleList(titles) {
  const out = [];
  const seen = new Set();
  let total = 0;
  for (const raw of Array.isArray(titles) ? titles : []) {
    const t = String(raw || "").replace(/\s+/g, " ").trim().slice(0, 40);
    if (!t || seen.has(t)) continue;
    if (total + t.length + 1 > SONG_PICK_MAX_CHARS) break;
    seen.add(t); out.push(t); total += t.length + 1;
    if (out.length >= SONG_PICK_MAX_TITLES) break;
  }
  return out;
}

export function buildSongPickNote(titles) {
  const list = songPickTitleList(titles);
  if (!list.length) return "";
  return "【自己点歌】她的歌单：" + list.join("、") + "。"
    + "心情合适时可以偶尔替她点一首（大多数回复不要点，不要每轮都点），在回复最末尾单独一行写 `[点歌:歌名]`，歌名必须从上面歌单里选；应用会自动切过去播放，标记隐藏，正文里不用解释。";
}
