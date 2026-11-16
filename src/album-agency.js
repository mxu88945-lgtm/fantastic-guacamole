/* v387 顾祁砚自己的相册（照搬惟境 personaAgency.ts v267–v272 的思路，代码重写）。
   纯函数，无 DOM、无存储：album.js 用它做锁/未读，index.html 通过 window.JYCAlbumAgency 调用，
   scripts/album-peek-regression.mjs 直接 import 测试。
   照片条目沿用「我们的相册」(src/album.js) 的结构，新增字段：
     by: 'char' | 'user'   他收的 / 她放的
     caption: string       一句说明（他存时写的那句；她放时用标题/说明）
     locked: boolean       在上锁那格里（密码是他设的，存在角色上 role.albumCode）
     seen: false           她新放、他还没被告知（只有显式 false 才算未读；旧照片都算看过）
     sourceKey: string     来自聊天的图：消息 id + 序号，防止重复收 */

export const ALBUM_CAPTION_MAX = 60;
export const ALBUM_PEEK_MAX = 3;

const OPEN = "[\\[【［]";
const CLOSE = "[\\]】］]";

export function albumCaption(entry) {
  return String(entry?.caption || entry?.title || "").trim().slice(0, ALBUM_CAPTION_MAX);
}

function byNewest(entries) {
  return [...(entries || [])].sort((a, b) => (Number(b?.createdAt) || 0) - (Number(a?.createdAt) || 0));
}

function herName(userName) {
  const name = String(userName || "").trim();
  return name && name !== "你" ? name : "她";
}

/** 常驻 system 里的相册说明（只随名字变，稳定前缀不受影响）。 */
export function albumPromptText(charName, userName) {
  const user = herName(userName);
  const name = String(charName || "").trim() || "你";
  return `【${name}的相册】你有一本自己的相册。${user}这轮在聊天里发来的照片，你看了觉得可爱、好看、想留着，就在回复末尾写 [存相册:一句话]（这句话是你给这张照片写的说明）；不想留就不写。她也会往你的相册里放照片，应用会告诉你。相册里有一格上锁的，密码由你定：想藏起来的写 [存相册:一句话|锁]，已有的用 [锁照片:说明里的词] / [解锁照片:说明里的词] 挪进挪出；用 [相册密码:4到12位] 设或改密码。想看哪张的原图，就只写 [翻相册:说明里的词]（不写词 = 最近几张），应用会当场把原图递给你，你看完再回应。密码只有你知道，她会来问、来哄，给不给、什么时候给，都由你。这些标记都会被隐藏。`;
}

const albumTagRe = () => new RegExp(`${OPEN}\\s*存相册\\s*(?:[:：]\\s*([^\\]】］\\n]{0,80}))?${CLOSE}`, "g");
/** [存相册:说明] 或 [存相册:说明|锁]。 */
export function parseAlbumTags(text) {
  const out = [];
  if (typeof text !== "string" || !text.includes("存相册")) return out;
  for (const match of text.matchAll(albumTagRe())) {
    const parts = String(match[1] || "").split(/[|｜]/).map(part => part.trim());
    const locked = parts.length > 1 && /^(锁|上锁|加锁|lock)$/i.test(parts[parts.length - 1]);
    out.push({ caption: (locked ? parts.slice(0, -1) : parts).filter(Boolean).join(" ").slice(0, ALBUM_CAPTION_MAX), locked });
  }
  return out;
}

/** [相册密码:xxxx]（4–12 位，不含空格和竖线）。 */
export function parseAlbumCode(text) {
  const match = String(text || "").match(new RegExp(`${OPEN}\\s*相册密码\\s*[:：]\\s*([^\\]】］\\s|｜]{4,12})\\s*${CLOSE}`));
  return match ? match[1] : null;
}

/** [锁照片:词] / [解锁照片:词]。 */
export function parseLockPhotoTags(text) {
  const out = [];
  if (typeof text !== "string" || !/锁照片/.test(text)) return out;
  for (const match of text.matchAll(new RegExp(`${OPEN}\\s*(锁照片|解锁照片)\\s*[:：]\\s*([^\\]】］\\n]{1,40})${CLOSE}`, "g")))
    out.push({ lock: match[1] === "锁照片", key: match[2].trim() });
  return out;
}

/** 按说明里的词把照片挪进/挪出上锁那格；同一张命中多个标记时以最后一个为准。返回新数组和改动数。 */
export function applyLockPhotoTags(entries, tags) {
  let changed = 0;
  const list = (entries || []).map(entry => {
    const caption = albumCaption(entry);
    const tag = [...(tags || [])].reverse().find(item => item.key && caption.includes(item.key));
    if (!tag || !!entry.locked === tag.lock) return entry;
    changed += 1;
    const next = { ...entry };
    if (tag.lock) next.locked = true; else delete next.locked;
    return next;
  });
  return { entries: list, changed };
}

/** 去掉所有相册标记；streaming 时连半截开头（[存、【翻相、[相册密…）也先藏。 */
export function stripAlbumTags(text, streaming) {
  if (typeof text !== "string" || !text || !/[\[【［]/.test(text)) return text;
  let out = text.replace(new RegExp(`${OPEN}\\s*(?:存相册|相册密码|锁照片|解锁照片|翻相册)\\s*(?:[:：][^\\]】］\\n]*)?(?:${CLOSE}|$)`, "g"), "");
  if (streaming) out = out.replace(/[\[【［]\s*(?:存(?:相(?:册)?)?|翻(?:相(?:册)?)?|相(?:册(?:密(?:码)?)?)?|锁(?:照(?:片)?)?|解(?:锁(?:照(?:片)?)?)?)$/, "");
  if (out === text) return text;
  return out.replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").replace(/\s+$/, "");
}

/** 尾巴：她新放、他还没被告知的照片（只给说明，不发图）；有上锁的照片时带上他自己的密码。 */
export function albumTurnLine(entries, code, userName) {
  const all = entries || [];
  const user = herName(userName);
  const lockedCount = all.filter(item => item.locked).length;
  const lockLine = lockedCount
    ? (code
      ? `【相册上锁｜只有你知道】上锁那格有 ${lockedCount} 张，密码是「${code}」。别主动说出口，除非你决定给${user}。`
      : `【相册上锁｜应用】上锁那格有 ${lockedCount} 张，但你还没设密码，${user}打不开；想设就写 [相册密码:…]。`)
    : "";
  const fresh = byNewest(all.filter(item => item.by === "user" && item.seen === false)).slice(0, 5).reverse();
  if (!fresh.length) return { text: lockLine, toldIds: [] };
  const captions = fresh.some(item => albumCaption(item))
    ? "：" + fresh.map(item => albumCaption(item) ? `「${albumCaption(item)}」` : "一张没写说明的").join("、") : "";
  const freshLine = `【相册｜应用事件】${user}往你的相册里放了 ${fresh.length} 张照片${captions}。看你想不想提，不必每张都说；想看原图写 [翻相册:说明里的词]。`;
  return { text: [lockLine, freshLine].filter(Boolean).join("\n"), toldIds: fresh.map(item => item.id) };
}

export const ALBUM_MENTION = /相册|照片|相片|合照|那张图/;
/** 她这轮提到相册/照片时，把目录（只有说明文字）给他翻一眼。 */
export function albumIndexLine(entries, userText) {
  const all = byNewest(entries);
  if (!all.length || !ALBUM_MENTION.test(String(userText || ""))) return "";
  const label = item => `「${albumCaption(item) || "没写说明"}」`;
  const open = all.filter(item => !item.locked).slice(0, 20).map(item => `${item.by === "char" ? "你收的" : "她放的"}${label(item)}`);
  const locked = all.filter(item => item.locked).slice(0, 20).map(label);
  return `【你的相册｜只读目录】你随时能翻自己的相册（想看原图写 [翻相册:词]）。`
    + (open.length ? `平时那页（新到旧）：${open.join("、")}。` : "")
    + (locked.length ? `上锁那格（只有你看得到）：${locked.join("、")}。` : "");
}

/** 每轮尾巴合起来：上锁行 + 新照片行 + （提到相册时）目录行。 */
export function buildAlbumTail(entries, { code = "", userText = "", userName = "" } = {}) {
  const turn = albumTurnLine(entries, code, userName);
  const index = albumIndexLine(entries, userText);
  return { text: [turn.text, index].filter(Boolean).join("\n"), toldIds: turn.toldIds };
}

/** [翻相册:词] → 词（可能是空串）；没写返回 null。 */
export function parseAlbumPeek(text) {
  const match = String(text || "").match(new RegExp(`${OPEN}\\s*翻相册\\s*(?:[:：]\\s*([^\\]】］\\n]{0,40}))?${CLOSE}`));
  return match ? String(match[1] || "").trim() : null;
}

const GENERIC_PEEK = /^(?:全部|最近|最新|所有|相册|照片|随便|随便看看|看看)$/;
/** 翻到的照片（新到旧，最多 max 张，含上锁那格——锁是他的）。没词 = 最近几张。 */
export function pickAlbumPeek(entries, key, max = ALBUM_PEEK_MAX) {
  const limit = Math.max(1, Math.min(ALBUM_PEEK_MAX, Number(max) || ALBUM_PEEK_MAX));
  const all = byNewest(entries).filter(item => typeof item?.dataUrl === "string" && item.dataUrl);
  const word = String(key || "").trim();
  if (!word || GENERIC_PEEK.test(word)) return all.slice(0, limit);
  const words = word.split(/[\s,，、|｜]+/).filter(Boolean);
  const hay = item => `${albumCaption(item)} ${item.title || ""} ${item.note || ""} ${item.date || ""}`;
  return all.filter(item => words.some(w => hay(item).includes(w))).slice(0, limit);
}

export function albumPeekResult(photos, key) {
  const word = String(key || "").trim() || "最近";
  if (!photos || !photos.length) return `【应用｜翻相册，不是她的新话】相册里没找到和「${word}」对得上的照片。照实回应她，别编照片内容；别再写 [翻相册]。`;
  return `【应用｜你翻开了相册，不是她的新话】下面是你翻到的 ${photos.length} 张原图（${photos.map(item => `${item.locked ? "上锁那格的" : ""}「${albumCaption(item) || "没写说明"}」`).join("、")}）。看着图本身接着回应她刚才的话；别再写 [翻相册]。`;
}

/** 把一段尾巴文字挂到发出去的最后一条用户消息上（只改请求副本）。format: openai | anthropic | gemini。 */
export function appendTailToWire(history, tail, format) {
  const text = String(tail || "").trim();
  if (!text || !Array.isArray(history) || !history.length) return false;
  const last = history[history.length - 1];
  if (!last || last.role !== "user") return false;
  if (format === "gemini") {
    last.parts = [...(last.parts || []), { text }];
    return true;
  }
  if (typeof last.content === "string") last.content = last.content ? `${last.content}\n\n${text}` : text;
  else if (Array.isArray(last.content)) last.content = [...last.content, { type: "text", text }];
  else last.content = text;
  return true;
}

/** 收进相册的图：本轮她发来的图（同一张不重复收）。images: [{key, dataUrl}] */
export function newAlbumAdditions(entries, images, captions, { roleId = "default", locked = false, now = Date.now(), date = "" } = {}) {
  const have = new Set((entries || []).map(item => item.sourceKey).filter(Boolean));
  const caps = (captions || []).map(c => String(c || "").slice(0, ALBUM_CAPTION_MAX));
  const out = [];
  (images || []).forEach((image, index) => {
    if (!image?.dataUrl || (image.key && have.has(image.key))) return;
    const caption = caps[index] ?? caps[caps.length - 1] ?? "";
    out.push({
      roleId, by: "char", category: "kept", caption, title: caption || "他收的照片", note: "",
      date, createdAt: now + index, dataUrl: image.dataUrl, sourceKey: image.key || "", seen: true,
      ...(locked ? { locked: true } : {}),
    });
    if (image.key) have.add(image.key);
  });
  return out;
}

// 浏览器里由 index.html 的 <script type="module" src="./src/album-agency.js"> 载入，挂到 window 上给主聊天和 album.js 用。
if (typeof window !== "undefined") {
  window.JYCAlbumAgency = {
    ALBUM_CAPTION_MAX, ALBUM_PEEK_MAX, ALBUM_MENTION, albumCaption, albumPromptText, parseAlbumTags, parseAlbumCode,
    parseLockPhotoTags, applyLockPhotoTags, stripAlbumTags, albumTurnLine, albumIndexLine, buildAlbumTail,
    parseAlbumPeek, pickAlbumPeek, albumPeekResult, appendTailToWire, newAlbumAdditions,
  };
}
