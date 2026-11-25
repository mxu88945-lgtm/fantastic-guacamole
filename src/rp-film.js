/**
 * 1.0.36 剧场美化卡（从惟境 v198–v283 搬来）。
 * 剧场里每条回复末尾，模型写一个 <film>…</film> 块：歌 / 幕 / 题 / 人 / 心声。
 * 界面把块从正文拿掉，在消息底部渲染成 唱片机 + 胶片 + 题记 + 人物档案 + 心声 的小卡。
 * 回复写完时自动放卡里点的歌：先找本地 / 喜欢 / 队列，没有就去网易云搜（连着的话）。
 * 块缺行、没闭合都不会崩；所有正则都在函数内新建。
 */
(function () {
  const OPEN_SRC = "<\\s*film\\b[^>]*>";
  const CLOSE_SRC = "<\\s*\\/\\s*film\\s*>";
  const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  function tidy(value) {
    return value
      .replace(new RegExp("```[a-z]*[ \\t]*\\n?\\s*```", "gi"), "")
      .replace(new RegExp("[ \\t]+\\n", "g"), "\n")
      .replace(new RegExp("\\n{3,}", "g"), "\n\n")
      .trim();
  }

  /** 去掉所有 film 块（含未闭合尾巴、落单的 </film>）；streaming 时末尾半截的 "<fi" 也藏起来。 */
  function strip(value, streaming) {
    if (typeof value !== "string" || !value) return value;
    let src = value;
    if (streaming) src = src.replace(new RegExp("<\\s*\\/?\\s*(?:f(?:i(?:l(?:m)?)?)?)?$", "i"), "");
    if (!new RegExp("<\\s*\\/?\\s*film\\b", "i").test(src)) return src === value ? value : src;
    const out = src
      .replace(new RegExp(`${OPEN_SRC}[\\s\\S]*?${CLOSE_SRC}`, "gi"), "")
      .replace(new RegExp(`${OPEN_SRC}[\\s\\S]*$`, "i"), "")
      .replace(new RegExp(CLOSE_SRC, "gi"), "");
    return tidy(out);
  }

  const splitFields = (v) => v.split(new RegExp("[｜|]")).map((p) => p.trim());
  function danger(value) {
    const v = String(value || "").trim().toLowerCase();
    if (!v) return "";
    if (/^(?:高|high|极高|危|危险)/.test(v)) return "高";
    if (/^(?:中|mid|medium|一般)/.test(v)) return "中";
    if (/^(?:低|low|无|安全)/.test(v)) return "低";
    if (v.includes("高")) return "高";
    if (v.includes("中")) return "中";
    if (v.includes("低")) return "低";
    return "";
  }
  function parseSong(value) {
    const clean = value.replace(/[《》「」“”"]/g, "").trim();
    if (!clean || /^(?:无|没有|none|-|—)$/i.test(clean)) return null;
    const parts = clean.split(/\s+[-–—]+\s+|\s*——\s*|\s*[/／]\s*/);
    const title = (parts[0] || "").trim();
    const artist = parts.slice(1).join(" ").trim();
    return title ? { title: title.slice(0, 60), artist: artist.slice(0, 40) } : null;
  }
  function keyOf(label) {
    const l = label.trim().toLowerCase();
    const table = [
      [/^(?:歌|歌曲|曲|音乐|bgm|song|music)$/i, "song"],
      [/^(?:幕|场景|画面|scene)$/i, "scene"],
      [/^(?:题|题记|点题|句|caption|quote)$/i, "caption"],
      [/^(?:人|人物|npc|角色|档案)$/i, "npc"],
      [/^(?:心声|心|内心|没说出口|heart|inner)$/i, "heart"],
    ];
    for (const [re, key] of table) if (re.test(l)) return key;
    return "";
  }
  function parseBody(inner, closed = true) {
    const card = { song: null, sceneTitle: "", sceneDesc: "", en: "", zh: "", npcs: [], heart: "", closed };
    const lineRe = /^\s*(?:[-*•·]\s*)?([^：:\s]{1,8})\s*[：:]\s*(.*)$/;
    for (const raw of inner.replace(/\r\n?/g, "\n").split("\n")) {
      const m = lineRe.exec(raw);
      if (!m) continue;
      const key = keyOf(m[1]);
      const value = m[2].trim();
      if (!key || !value) continue;
      if (key === "song") card.song = parseSong(value);
      else if (key === "scene") {
        const [title, ...rest] = splitFields(value);
        card.sceneTitle = (title || "").slice(0, 40);
        card.sceneDesc = rest.join("，").slice(0, 120);
      } else if (key === "caption") {
        const [en, ...rest] = splitFields(value);
        if (rest.length) { card.en = (en || "").slice(0, 120); card.zh = rest.join("，").slice(0, 80); }
        else if (/[\u3400-\u9fff]/.test(en || "")) card.zh = (en || "").slice(0, 80);
        else card.en = (en || "").slice(0, 120);
      } else if (key === "npc") {
        if (card.npcs.length >= 4) continue;
        const [name, role = "", stance = "", dg = "", ...desc] = splitFields(value);
        if (!name) continue;
        card.npcs.push({ name: name.slice(0, 16), role: role.slice(0, 24), stance: stance.slice(0, 24), danger: danger(dg), desc: desc.join("，").slice(0, 120) });
      } else if (key === "heart") card.heart = value.replace(/^[「“"]|[」”"]$/g, "").slice(0, 80);
    }
    const empty = !card.song && !card.sceneTitle && !card.sceneDesc && !card.en && !card.zh && !card.npcs.length && !card.heart;
    return empty ? null : card;
  }
  /** 从一条回复里拿出卡（用最后一个闭合块；没闭合的尾巴在非流式时也尽量解析）。 */
  function extract(text, streaming) {
    if (typeof text !== "string" || !new RegExp("<\\s*film\\b", "i").test(text)) return null;
    let lastInner = null;
    const pairRe = new RegExp(`${OPEN_SRC}([\\s\\S]*?)${CLOSE_SRC}`, "gi");
    const rest = text.replace(pairRe, (_m, inner) => { lastInner = inner; return ""; });
    const dangling = new RegExp(`${OPEN_SRC}([\\s\\S]*)$`, "i").exec(rest);
    if (dangling && streaming) return null;
    let card = null;
    if (dangling) card = parseBody(dangling[1], false);
    if (!card && lastInner !== null) card = parseBody(lastInner, true);
    return card;
  }

  function playlistForPrompt(names, maxCount = 40, maxChars = 800) {
    const out = [], seen = new Set();
    let total = 0;
    for (const raw of names || []) {
      const name = String(raw || "").replace(/\.(mp3|m4a|aac|flac|wav|ogg|opus|alac|aiff?|wma|webm|mp4)$/i, "").replace(/\s+/g, " ").trim();
      if (!name || seen.has(name)) continue;
      if (out.length >= maxCount || total + name.length + 3 > maxChars) break;
      seen.add(name); out.push(name); total += name.length + 3;
    }
    return out;
  }

  const REMINDER = "【剧场美化卡】按上面「剧场美化卡」的格式，在整条回复最末尾输出且只输出一个闭合的 <film>…</film> 块。";
  function instruction(speakerName, userName) {
    const music = window.JYCMusic;
    let names = [], connected = false;
    try { names = music?.playlistNames?.() || []; connected = !!music?.getState?.().connected; } catch (_) {}
    const songs = playlistForPrompt(names);
    const online = connected ? "她连着网易云，歌单里没有合适的，也可以写别的真实歌曲（写准歌名和歌手），应用会去网易云搜来放。" : "";
    const songRule = songs.length
      ? `- 「歌」：${userName}的歌单里有这些歌：${songs.map((n) => `《${n}》`).join("")}。优先从里面挑一首最贴这一幕氛围的，歌名照歌单写法原样写；${online || "实在没有合适的，可以写别的真实歌曲，或者整行省略。"}不要编造不存在的歌。`
      : `- 「歌」：挑一首最贴这一幕氛围的真实歌曲（歌名 - 歌手）。${online}没有合适的就整行省略，不要编造不存在的歌。`;
    return `【剧场美化卡｜每次回复都要输出】
写完本轮剧情正文之后，在整条回复的最后另起一行，输出且只输出一个 <film> 块，格式固定如下（每行一个字段，字段内用全角竖线｜分隔）：
<film>
歌：歌名 - 歌手
幕：这一幕的标题（4—10 字）｜一句画面描述（20 字内）
题：一句简短英文｜一句中文点题（12 字内）
人：名字｜身份｜立场｜危险度（低/中/高）｜一句描述（30 字内）
心声：${speakerName}没说出口的一句话
</film>
规则：
${songRule}
- 这首歌是这一幕的背景配乐，只烘托气氛；正文里不要写成「她在放歌」「一起听歌」，也不要因为配乐跳出剧情。
- 「人」写 0—4 行，只写这一幕在场或与这一幕直接相关的人物；可以不写${userName}，也可以写${speakerName}本人。
- 「心声」是${speakerName}此刻心里想却没说出口的话，一句，第一人称，不要旁白腔。
- <film> 块只能放在全文最末尾，必须写出 </film> 闭合；不能写进正文中间，正文里也不要提到这个块或复述其中内容。不要加代码围栏、不要加别的标签。`;
  }

  function archiveNo(seed) {
    let h = 2166136261;
    for (let i = 0; i < seed.length; i += 1) h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
    return String((h >>> 0) % 10000).padStart(4, "0");
  }
  const ICON = {
    play: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8.5 5.8v12.4L18 12z"/></svg>',
    pause: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5.5v13M15 5.5v13"/></svg>',
    next: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M17.5 5.5v13"/><path d="M6 5.8v12.4L15.5 12z"/></svg>',
  };
  function dial() {
    const ticks = Array.from({ length: 12 }, (_, i) => i * 30).map((d) => `<line x1="20" y1="5.5" x2="20" y2="${d % 90 === 0 ? 9.5 : 8}" transform="rotate(${d} 20 20)"/>`).join("");
    return `<svg class="film-dial" viewBox="0 0 40 40" aria-hidden="true"><circle cx="20" cy="20" r="17"/>${ticks}<line class="film-dial-needle" x1="20" y1="20" x2="20" y2="9" transform="rotate(38 20 20)"/><circle class="film-dial-hub" cx="20" cy="20" r="2"/></svg>`;
  }
  function dangerHtml(level) {
    const filled = level === "高" ? 3 : level === "中" ? 2 : level === "低" ? 1 : 0;
    return `<span class="film-danger film-danger-${filled}">${[1, 2, 3].map((n) => `<i class="${n <= filled ? "on" : ""}"></i>`).join("")}<b>${esc(level || "—")}</b></span>`;
  }

  // 每条消息的放歌状态（只在本次打开期间）：playing | already | missing | blocked | error
  const status = new Map();
  const cardSpeaker = new Map(); // id → 点歌的角色名
  const handled = new Set();
  const songQuery = (card) => card?.song ? `${card.song.title}${card.song.artist ? " " + card.song.artist : ""}` : "";

  // 每张卡真正放上的那首（网易云搜到的歌名常和卡里写的不完全一样，比如 的/地）
  const pickedSong = new Map(); // id → songId
  const norm = (v) => String(v || "").toLowerCase().replace(/[\s·・.,，。!！?？'"“”‘’《》「」()（）\[\]【】\-–—_/／]/g, "").replace(/[的地得]/g, "的");
  function nowInfo() {
    try {
      const st = globalThis.JYCMusic?.getState?.();
      if (!st?.song) return null;
      const artist = st.song.artist && st.song.artist !== "本地音乐" && st.song.artist !== "未知歌手" ? st.song.artist : "";
      return { id: st.song.songId, name: st.song.name || "", artist, playing: !!st.playing };
    } catch (_) { return null; }
  }
  function isCardSong(card, id, now) {
    if (!now || !card?.song) return false;
    if (pickedSong.get(String(id)) && pickedSong.get(String(id)) === now.id) return true;
    const a = norm(now.name), b = norm(card.song.title);
    return !!a && !!b && (a === b || a.includes(b) || b.includes(a));
  }
  function isThisPlaying(card, id) { const now = nowInfo(); return !!now?.playing && isCardSong(card, id, now); }

  // v200 同款：放的不是卡里的歌 → 显示真正在放的歌；卡里的歌退成一行小字「X点的：…」，点它就放
  function gramoHtml(card, id) {
    const st = status.get(id) || "";
    const now = nowInfo();
    const here = !!now?.playing && isCardSong(card, id, now);
    const other = !!now?.playing && !here;
    const who = cardSpeaker.get(id) || "他";
    let title, sub, hint = "";
    if (other) {
      title = now.name;
      sub = now.artist || "正在放";
      if (card.song) hint = st === "missing"
        ? `<button type="button" class="film-gramo-import" data-film-act="import">${esc(who)}点的：${esc(card.song.title)} · <b>导入这首</b></button>`
        : `<button type="button" class="film-gramo-import" data-film-act="play">${esc(who)}点的：<b>${esc(card.song.title)}</b> ▶</button>`;
    } else if (card.song) {
      title = card.song.title;
      sub = here ? (now.artist || card.song.artist || "正在放") : (card.song.artist || "");
      if (!here) {
        if (st === "missing") hint = `<button type="button" class="film-gramo-import" data-film-act="import"><b>点这里导入《${esc(card.song.title)}》</b></button>`;
        else hint = `<small class="film-gramo-requested film-gramo-tap">点播放 ▶ 听《${esc(card.song.title)}》</small>`;
      }
    } else {
      title = now?.name || "背景配乐";
      sub = now ? (now.artist || "你的歌单") : "这一幕没点歌";
    }
    const playingAny = !!now?.playing;
    return `<div class="film-gramo">
      <span class="film-gramo-disc${playingAny ? " spinning" : ""}" aria-hidden="true"></span>
      <div class="film-gramo-text"><small>GRAMOPHONE · SIDE A</small><strong>${esc(title)}</strong>${sub ? `<em>${esc(sub)}</em>` : ""}${hint}</div>
      <div class="film-gramo-actions"><button type="button" data-film-act="toggle" class="${card.song && !here && !other ? "film-gramo-nudge" : ""}" aria-label="${playingAny ? "暂停" : "播放"}">${playingAny ? ICON.pause : ICON.play}</button><button type="button" data-film-act="next" aria-label="下一首">${ICON.next}</button></div>
    </div>`;
  }

  /** 卡片 HTML。opts: { id, speakerName, avatar } */
  function html(text, opts = {}) {
    const card = extract(text, false);
    if (!card) return "";
    const id = String(opts.id || "");
    const name = opts.speakerName || "";
    if (name) cardSpeaker.set(id, name);
    const no = archiveNo(id + "|" + (card.sceneTitle || "") + "|" + (card.heart || ""));
    const avatar = opts.avatar && /^(?:https?:|data:image\/|blob:|\.?\/)/.test(opts.avatar) ? opts.avatar : "";
    const frame = avatar
      ? `<div class="film-frame"><div class="film-frame-bg" style="background-image:url('${esc(avatar)}')"></div><img class="film-frame-avatar" src="${esc(avatar)}" alt="" loading="lazy">${card.sceneTitle ? `<span class="film-frame-title">${esc(card.sceneTitle)}</span>` : ""}</div>`
      : `<div class="film-frame film-frame-empty"><span>FILM</span>${card.sceneTitle ? `<span class="film-frame-title">${esc(card.sceneTitle)}</span>` : ""}</div>`;
    const npcs = card.npcs.length ? `<div class="film-npc">
      <div class="film-npc-grid">${card.npcs.map((n, i) => `<button type="button" data-film-npc="${i}" class="${i === 0 ? "active" : ""}"><small>NPC ${String(i + 1).padStart(2, "0")}</small><span>${esc(n.name)}${n.role ? "·" + esc(n.role) : ""}</span></button>`).join("")}</div>
      ${card.npcs.map((n, i) => `<div class="film-npc-detail" data-film-npc-detail="${i}"${i ? " hidden" : ""}>
        <div class="film-npc-head"><small>FILE ${String(i + 1).padStart(2, "0")}</small><strong>${esc(n.name)}</strong>${n.role ? `<span>${esc(n.role)}</span>` : ""}</div>
        <dl><div><dt>STANCE</dt><dd>${esc(n.stance || "—")}</dd></div><div><dt>DANGER</dt><dd>${dangerHtml(n.danger)}</dd></div></dl>
        ${n.desc ? `<p>${esc(n.desc)}</p>` : ""}</div>`).join("")}
    </div>` : "";
    return `<section class="film-card" data-film-id="${esc(id)}" data-film-song="${esc(songQuery(card))}" data-film-title="${esc(card.song?.title || "")}" aria-label="剧场美化卡">
      <div class="film-gramo-host">${gramoHtml(card, id)}</div>
      <div class="film-strip">${frame}${dial()}</div>
      <div class="film-caption">
        <div class="film-archive"><span>ARCHIVE · No.${no}</span>${name ? `<span>${esc(name)}</span>` : ""}</div>
        ${card.sceneDesc ? `<p class="film-scene-desc">${esc(card.sceneDesc)}</p>` : ""}
        ${card.en ? `<p class="film-en">${esc(card.en)}</p>` : ""}
        ${card.zh ? `<p class="film-zh">${esc(card.zh)}</p>` : ""}
      </div>
      ${npcs}
      ${card.heart ? `<div class="film-heart"><small>UNSAID · 心声</small><p>${esc(card.heart)}</p></div>` : ""}
    </section>`;
  }

  // 卡片挂在页面上时，唱片机那一条跟着播放状态刷新
  const cardCache = new Map(); // id → card
  function refresh(id) {
    document.querySelectorAll(".film-card").forEach((el) => {
      const cid = el.dataset.filmId || "";
      if (id && cid !== id) return;
      const card = cardCache.get(cid);
      const host = el.querySelector(".film-gramo-host");
      if (!card || !host) return;
      const next = gramoHtml(card, cid);
      if (host.dataset.sig !== next) { host.innerHTML = next; host.dataset.sig = next; }
    });
  }
  function remember(id, text) { const c = extract(text, false); if (c) cardCache.set(String(id || ""), c); return c; }

  async function playCard(id, card, auto) {
    const music = globalThis.JYCMusic;
    id = String(id);
    let st = "error";
    try { st = await music.playPicked(songQuery(card), { auto }); } catch (_) { st = "error"; }
    if (st === "missing" && card.song.artist) { try { st = await music.playPicked(card.song.title, { auto }); } catch (_) { st = "error"; } }
    try { const lp = music.getState?.().lastPicked; if (lp?.songId && (st === "playing" || st === "already")) pickedSong.set(id, lp.songId); } catch (_) {}
    status.set(id, st);
    refresh(id);
    setTimeout(() => refresh(id), 1200);
    return st;
  }

  /** 回复刚写完时调用一次：自动放卡里点的歌。 */
  async function autoplay(id, text) {
    const card = remember(id, text);
    if (!card?.song?.title) return "no-card";
    const key = `${id}|${card.song.title}`;
    if (handled.has(key)) return "done-before";
    handled.add(key);
    const music = window.JYCMusic;
    if (!music?.playPicked) return "no-player";
    if (isThisPlaying(card, id)) { status.set(String(id), "already"); refresh(String(id)); return "already"; }
    const st = await playCard(id, card, true);
    return st;
  }

  document.addEventListener("click", (event) => {
    const t = event.target && event.target.closest ? event.target : null;
    if (!t) return;
    const npcBtn = t.closest("[data-film-npc]");
    if (npcBtn) {
      const cardEl = npcBtn.closest(".film-card");
      const i = npcBtn.dataset.filmNpc;
      cardEl.querySelectorAll("[data-film-npc]").forEach((b) => b.classList.toggle("active", b.dataset.filmNpc === i));
      cardEl.querySelectorAll("[data-film-npc-detail]").forEach((d) => { d.hidden = d.dataset.filmNpcDetail !== i; });
      event.stopPropagation();
      return;
    }
    const act = t.closest("[data-film-act]");
    if (!act) return;
    event.preventDefault(); event.stopPropagation();
    const cardEl = act.closest(".film-card");
    const id = cardEl?.dataset.filmId || "";
    const query = cardEl?.dataset.filmSong || "";
    const title = cardEl?.dataset.filmTitle || "";
    const music = window.JYCMusic;
    if (!music) return;
    const done = (st) => { status.set(id, st); refresh(id); };
    const kind = act.dataset.filmAct;
    const later = () => { refresh(id); setTimeout(() => refresh(id), 700); setTimeout(() => refresh(id), 2000); };
    if (kind === "next") {
      // 1.0.39：卡里点了歌但现在放的不是它 → 下一首先切到卡里的歌
      const c = cardCache.get(id); const n = nowInfo();
      if (c?.song && !isCardSong(c, id, n) && (music.findPickSong?.(title || query) || music.getState?.().connected)) { void playCard(id, c, false); return; }
      try { music.playNext?.(); } catch (_) {} later(); return;
    }
    if (kind === "import") { music.importForPick?.(title || query, done); return; }
    const card = cardCache.get(id);
    const now = nowInfo();
    // 大按钮：在放就暂停；没在放时有卡里的歌就放它，没有就接着放
    if (kind === "toggle" && (now?.playing || !card?.song)) { music.togglePlay?.(); later(); return; }
    if (!card?.song) return;
    if (now && !now.playing && isCardSong(card, id, now)) { music.togglePlay?.(); later(); return; }
    // iOS 要同步打开文件选择，所以先同步查歌单
    if (!music.findPickSong?.(title || query) && !music.getState?.().connected) { music.importForPick?.(title || query, done); return; }
    void playCard(id, card, false);
  });
  // 播放器换歌 / 暂停时，卡上的唱片跟着转停
  setInterval(() => { if (document.querySelector(".film-card")) refresh(); }, 1500);

  window.JYCFilm = { strip, extract, html, instruction, REMINDER, autoplay, remember, refresh };
})();
