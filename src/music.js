/*
 * 顾祁砚端口的听歌房。
 *
 * The UI is intentionally separate from the chat state. It consumes the small
 * HTTP API exposed by eryu (MIT), while keeping the endpoint and token local
 * to this browser origin.
 */
import { findTrackByTitle, buildSongPickNote } from "./song-pick.js";

(() => {
  const CONFIG_KEY = "jyc_music_config_v1";
  const PLAYER_KEY = "jyc_music_player_v1";
  const LIBRARY_KEY = "jyc_music_library_v1";
  const LOCAL_KEY = "jyc_music_local_v1";
  const DEFAULT_BASE_URL = "https://eryu-cloud-functions.vercel.app";
  const $ = (id) => document.getElementById(id);
  const audio = new Audio();
  audio.preload = "metadata";

  const state = {
    config: loadConfig(),
    connected: false,
    connecting: false,
    open: false,
    openedFromDashboard: false,
    activeTab: "search",
    query: "",
    searching: false,
    error: "",
    searchResults: [],
    liked: [],
    recent: [],
    queue: [],
    history: [],
    song: null,
    playing: false,
    progress: 0,
    currentTime: 0,
    duration: 0,
    roam: false,
    lyrics: [],
    lyricTranslations: new Map(),
    lyricIndex: -1,
    lyricsOpen: false,
    lyricsLoading: false,
    sharedWithCompanion: false,
    local: [],
    lyricHint: "",
  };
  let localUrl = "";
  /* v347：后台连播——提前把下一首本地歌读进内存，放完时同步换源，不等 IndexedDB；并接入锁屏/控制中心 */
  let prefetched = null; // { songId, blob }
  async function prefetchNextLocal() {
    try {
      const nxt = state.queue[0] || localNeighbor(1);
      if (!nxt || !isLocal(nxt) || prefetched?.songId === nxt.songId) return;
      const blob = await localGet(`audio:${nxt.songId}`);
      if (blob) prefetched = { songId: nxt.songId, blob };
    } catch (_) {}
  }
  function updateMediaSession(song) {
    const ms = typeof navigator !== "undefined" && navigator.mediaSession;
    if (!ms || !song) return;
    try {
      ms.metadata = new MediaMetadata({ title: song.name, artist: song.artist, album: song.album || "", artwork: song.cover ? [{ src: song.cover, sizes: "512x512" }] : [] });
    } catch (_) {}
  }
  function bindMediaSession() {
    const ms = typeof navigator !== "undefined" && navigator.mediaSession;
    if (!ms) return;
    const set = (action, fn) => { try { ms.setActionHandler(action, fn); } catch (_) {} };
    set("play", () => { togglePlay(); });
    set("pause", () => { audio.pause(); });
    set("previoustrack", () => { playPrevious(); });
    set("nexttrack", () => { playNext(); });
    set("seekto", (d) => { if (d && Number.isFinite(d.seekTime)) audio.currentTime = d.seekTime; });
  }

  // ---- 本地歌曲（v341）：音频/歌词存在独立的 IndexedDB，只在这台设备 ----
  let localDb = null;
  function openLocalDb() {
    if (localDb) return Promise.resolve(localDb);
    return new Promise((resolve, reject) => {
      const req = indexedDB.open("jyc_music_local", 1);
      req.onupgradeneeded = () => { if (!req.result.objectStoreNames.contains("files")) req.result.createObjectStore("files"); };
      req.onsuccess = () => { localDb = req.result; resolve(localDb); };
      req.onerror = () => reject(req.error || new Error("IndexedDB open failed"));
    });
  }
  async function localGet(key) {
    const db = await openLocalDb();
    return new Promise((resolve, reject) => { const r = db.transaction("files", "readonly").objectStore("files").get(key); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); });
  }
  async function localPut(key, value) {
    const db = await openLocalDb();
    return new Promise((resolve, reject) => { const tx = db.transaction("files", "readwrite"); tx.objectStore("files").put(value, key); tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error); tx.onabort = () => reject(tx.error || new Error("写入被中止（空间可能不够）")); });
  }
  async function localDel(key) {
    const db = await openLocalDb();
    return new Promise((resolve) => { const tx = db.transaction("files", "readwrite"); tx.objectStore("files").delete(key); tx.oncomplete = () => resolve(); tx.onerror = () => resolve(); });
  }
  function isLocal(song) { return !!song && String(song.songId).startsWith("local:"); }
  function saveLocalList() { try { localStorage.setItem(LOCAL_KEY, JSON.stringify(state.local)); } catch (_) {} }
  function restoreLocalList() {
    try { const raw = JSON.parse(localStorage.getItem(LOCAL_KEY) || "[]"); state.local = Array.isArray(raw) ? raw.map(normalizeSong).filter(Boolean) : []; } catch (_) { state.local = []; }
  }
  /** 「阿梨粤-偏偏喜欢你(女声版).mp3」→ { title: "偏偏喜欢你", artist: "阿梨粤" } */
  function guessSongMeta(name) {
    let s = String(name || "").replace(/\.[a-z0-9]{2,4}$/i, "").trim();
    let artist = "";
    const m = s.match(/^(.+?)\s*[-–—]\s*(.+)$/);
    if (m) { artist = m[1].trim(); s = m[2]; }
    const title = s.replace(/[（(【[].*?[）)】\]]/g, "").replace(/[-–—]+$/, "").trim();
    return { title: title || s.trim(), artist, display: (m ? m[2] : s).trim() };
  }
  function pickLyrics(items, title) {
    const norm = (x) => String(x || "").replace(/\s+/g, "").toLowerCase();
    const t = norm(title);
    const ok = (Array.isArray(items) ? items : []).filter((i) => !i.instrumental);
    const same = ok.filter((i) => norm(i.trackName) === t);
    return same.find((i) => i.syncedLyrics)?.syncedLyrics || same.find((i) => i.plainLyrics)?.plainLyrics
      || ok.filter((i) => norm(i.trackName).includes(t)).find((i) => i.syncedLyrics)?.syncedLyrics || "";
  }
  async function fetchOnlineLyrics(song) {
    const title = guessSongMeta(song.name).title;
    const artist = song.artist && song.artist !== "本地音乐" ? song.artist : "";
    if (!title) return "";
    const get = async (q) => { const r = await fetch(`https://lrclib.net/api/search?${q}`); return r.ok ? r.json() : []; };
    let found = artist ? pickLyrics(await get(`track_name=${encodeURIComponent(title)}&artist_name=${encodeURIComponent(artist)}`), title) : "";
    if (!found) found = pickLyrics(await get(`track_name=${encodeURIComponent(title)}`), title);
    return found;
  }
  /** 纯文本歌词也能显示：没有时间轴的行按顺序排，不跟随进度 */
  function parseAnyLyrics(text) {
    const timed = parseLrc(text);
    if (timed.length) return timed;
    return String(text || "").split(/\r?\n/).map((l) => l.trim()).filter(Boolean).map((t) => ({ time: -1, text: t }));
  }
  async function importLocalFiles(files) {
    const all = Array.from(files || []);
    if (!all.length) return [];
    const isLyricFile = (f) => /\.(lrc|txt)$/i.test(f.name);
    const base = (n) => n.replace(/\.[^.]+$/, "");
    const lyricFiles = all.filter(isLyricFile);
    const added = [];
    try {
      for (const f of all) {
        if (isLyricFile(f) || /^(image|video)\//.test(f.type)) continue;
        const id = `local:${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
        await localPut(`audio:${id}`, f);
        const meta = guessSongMeta(f.name);
        const lrc = lyricFiles.find((l) => base(l.name) === base(f.name));
        if (lrc) await localPut(`lyric:${id}`, await lrc.text());
        added.push({ songId: id, name: meta.display || base(f.name), artist: meta.artist || "本地音乐", album: "", cover: "" });
      }
      if (!added.length && lyricFiles.length && isLocal(state.song)) {
        await localPut(`lyric:${state.song.songId}`, await lyricFiles[0].text());
        await loadLyrics(true);
        showToast("已给这首歌配上歌词");
        return [];
      }
      if (!added.length) { showToast("没有选到音乐文件"); return []; }
      state.local = [...state.local, ...added];
      saveLocalList();
      state.activeTab = "local";
      render();
      showToast(`已导入 ${added.length} 首`);
      notifyMusicChanged();
      return added;
    } catch (error) {
      showToast(`导入失败：${error.message || error}`);
      return [];
    }
  }
  let afterLocalImport = null;
  function pickLocalFiles(onDone) {
    afterLocalImport = typeof onDone === "function" ? onDone : null;
    let input = $("music-local-file");
    if (!input) {
      input = document.createElement("input");
      input.type = "file"; input.multiple = true; input.id = "music-local-file"; input.hidden = true;
      // 不设 accept：iOS 上混入 .lrc 会把 mp3 全部置灰
      input.addEventListener("change", async () => {
        const done = afterLocalImport; afterLocalImport = null;
        const added = await importLocalFiles(input.files); input.value = "";
        if (done) { try { await done(added || []); } catch (_) {} }
      });
      document.body.appendChild(input);
    }
    input.click();
  }
  async function removeLocal(index) {
    const song = state.local[index];
    if (!song || !confirm(`删除「${song.name}」？`)) return;
    state.local.splice(index, 1);
    saveLocalList();
    localDel(`audio:${song.songId}`); localDel(`lyric:${song.songId}`);
    state.queue = state.queue.filter((item) => item.songId !== song.songId);
    renderView(); notifyMusicChanged();
  }

  function loadConfig() {
    try {
      const raw = JSON.parse(localStorage.getItem(CONFIG_KEY) || "{}");
      return { baseUrl: cleanBase(raw.baseUrl || DEFAULT_BASE_URL), token: String(raw.token || "") };
    } catch (_) {
      return { baseUrl: DEFAULT_BASE_URL, token: "" };
    }
  }

  function cleanBase(value) {
    return String(value || "").trim().replace(/\/+$/, "");
  }

  function saveConfig(config) {
    state.config = { baseUrl: cleanBase(config.baseUrl), token: String(config.token || "").trim() };
    localStorage.setItem(CONFIG_KEY, JSON.stringify(state.config));
  }

  function savePlayerState() {
    try {
      localStorage.setItem(PLAYER_KEY, JSON.stringify({ song: state.song, queue: state.queue.slice(0, 30), roam: state.roam }));
    } catch (_) {}
  }

  function saveLibrary() {
    try {
      localStorage.setItem(LIBRARY_KEY, JSON.stringify({ liked: state.liked.slice(0, 200), recent: state.recent.slice(0, 30) }));
    } catch (_) {}
  }

  function restoreLibrary() {
    try {
      const raw = JSON.parse(localStorage.getItem(LIBRARY_KEY) || "{}");
      state.liked = Array.isArray(raw.liked) ? raw.liked.map(normalizeSong).filter(Boolean) : [];
      state.recent = Array.isArray(raw.recent) ? raw.recent.map(normalizeSong).filter(Boolean) : [];
    } catch (_) {}
  }

  function restorePlayerState() {
    try {
      const raw = JSON.parse(localStorage.getItem(PLAYER_KEY) || "{}");
      state.song = normalizeSong(raw.song);
      state.queue = Array.isArray(raw.queue) ? raw.queue.map(normalizeSong).filter(Boolean) : [];
      state.roam = !!raw.roam;
    } catch (_) {}
  }

  function authHeaders(json = false) {
    const headers = {};
    if (state.config.token) headers["X-Auth-Token"] = state.config.token;
    if (json) headers["Content-Type"] = "application/json";
    return headers;
  }

  async function api(path, options = {}) {
    if (!state.config.baseUrl) throw new Error("还没有配置 Eryu 服务地址");
    const response = await fetch(`${state.config.baseUrl}${path}`, {
      ...options,
      headers: { ...authHeaders(options.body != null), ...(options.headers || {}) },
    });
    const text = await response.text();
    let data = {};
    try { data = text ? JSON.parse(text) : {}; } catch (_) { data = { ok: false, error: text || `HTTP ${response.status}` }; }
    if (!response.ok) throw new Error(data.error || `服务返回 ${response.status}`);
    return data;
  }

  function apiPost(path, body) {
    return api(path, { method: "POST", body: JSON.stringify(body) });
  }

  function resolveUrl(value) {
    try { return new URL(String(value || ""), `${state.config.baseUrl}/`).toString(); } catch (_) { return String(value || ""); }
  }

  function normalizeSong(raw) {
    if (!raw) return null;
    const songId = raw.songId ?? raw.id;
    if (songId == null || songId === "") return null;
    return {
      songId: String(songId),
      name: String(raw.name || "未命名歌曲"),
      artist: String(raw.artist || raw.artists || "未知歌手"),
      album: String(raw.album || ""),
      cover: String(raw.cover || raw.picUrl || ""),
    };
  }

  function esc(value) {
    return String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
  }

  function fmt(seconds) {
    if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
    return `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;
  }

  function parseLrc(value) {
    const result = [];
    for (const line of String(value || "").split(/\r?\n/)) {
      const matches = [...line.matchAll(/\[(\d+):(\d+)(?:\.(\d+))?\]/g)];
      const text = line.replace(/(?:\[\d+:\d+(?:\.\d+)?\])+/, "").trim();
      if (!text) continue;
      for (const match of matches) {
        const fraction = match[3] ? Number(`0.${match[3]}`) : 0;
        result.push({ time: Number(match[1]) * 60 + Number(match[2]) + fraction, text });
      }
    }
    return result.sort((a, b) => a.time - b.time);
  }

  function showToast(message) {
    const toast = $("toast");
    if (!toast) return;
    toast.textContent = message;
    toast.classList.add("show");
    clearTimeout(showToast.timer);
    showToast.timer = setTimeout(() => toast.classList.remove("show"), 2200);
  }

  function setStatus(message, error = false) {
    state.error = error ? message : "";
    const status = $("music-connect-status");
    if (status) { status.textContent = message || ""; status.classList.toggle("error", error); }
    const head = $("music-connection-status");
    if (head) head.textContent = state.connected ? "已连接 Eryu" : "未连接音乐服务";
  }

  function notifyMusicChanged() {
    window.dispatchEvent(new CustomEvent("jyc:music-updated"));
  }

  async function testConnection(config, persist = true) {
    const next = { baseUrl: cleanBase(config.baseUrl), token: String(config.token || "").trim() };
    if (!next.baseUrl) throw new Error("请先填写 Eryu 服务地址");
    if (!next.token) throw new Error("请填写服务 token");
    const previous = state.config;
    state.config = next;
    try {
      await api("/health");
      const playlist = await api("/music/playlist");
      if (persist) saveConfig(next);
      state.connected = true;
      const remoteLiked = Array.isArray(playlist.songs) ? playlist.songs.map(normalizeSong).filter(Boolean) : [];
      state.liked = [...remoteLiked, ...state.liked.filter((local) => !remoteLiked.some((remote) => remote.songId === local.songId))];
      await loadRecent();
      saveLibrary();
      setStatus("连接成功");
      state.error = "";
      render();
      notifyMusicChanged();
      return true;
    } catch (error) {
      state.config = previous;
      state.connected = false;
      setStatus(error.message || "无法连接音乐服务", true);
      render();
      return false;
    }
  }

  async function connectFromForm() {
    if (state.connecting) return;
    state.connecting = true;
    const button = $("music-connect-btn");
    if (button) { button.disabled = true; button.textContent = "连接中…"; }
    const ok = await testConnection({ baseUrl: $("music-base-url")?.value, token: $("music-token")?.value });
    state.connecting = false;
    if (button) { button.disabled = false; button.textContent = "连接并保存"; }
    if (ok) showToast("听歌房连接成功");
  }

  function openConfig() {
    const card = $("music-connect-card");
    if (!card) return;
    card.hidden = false;
    const base = $("music-base-url");
    const token = $("music-token");
    if (base) base.value = state.config.baseUrl;
    if (token) token.value = state.config.token;
    requestAnimationFrame(() => base?.focus());
  }

  function closeConfig() {
    const card = $("music-connect-card");
    if (card && (state.connected || state.local.length)) card.hidden = true;
  }

  async function loadRemoteState() {
    if (!state.connected) return;
    try {
      const [playlist, recent] = await Promise.all([
        api("/music/playlist").catch(() => ({})),
        api("/music/recent").catch(() => ({})),
      ]);
      if (Array.isArray(playlist.songs)) {
        const remoteLiked = playlist.songs.map(normalizeSong).filter(Boolean);
        state.liked = [...remoteLiked, ...state.liked.filter((local) => !remoteLiked.some((remote) => remote.songId === local.songId))];
      }
      if (Array.isArray(recent.songs)) {
        const remoteRecent = recent.songs.map(normalizeSong).filter(Boolean);
        state.recent = [...remoteRecent, ...state.recent.filter((local) => !remoteRecent.some((remote) => remote.songId === local.songId))].slice(0, 30);
      }
      saveLibrary();
      render();
    } catch (_) {}
  }

  async function loadRecent() {
    const recent = await api("/music/recent").catch(() => ({}));
    if (Array.isArray(recent.songs)) {
      const remoteRecent = recent.songs.map(normalizeSong).filter(Boolean);
      state.recent = [...remoteRecent, ...state.recent.filter((local) => !remoteRecent.some((remote) => remote.songId === local.songId))].slice(0, 30);
      saveLibrary();
    }
  }

  async function searchSongs(query = state.query) {
    const value = String(query || "").trim();
    if (!value || state.searching || !state.connected) return;
    state.query = value;
    state.searching = true;
    state.error = "";
    renderView();
    try {
      const data = await api(`/music/search?q=${encodeURIComponent(value)}`);
      state.searchResults = Array.isArray(data.songs) ? data.songs.map(normalizeSong).filter(Boolean) : [];
      if (!state.searchResults.length) state.error = "没有找到匹配歌曲";
    } catch (error) {
      state.searchResults = [];
      state.error = error.message || "搜索失败";
    } finally {
      state.searching = false;
      renderView();
    }
  }

  async function playSong(song, rest = [], opts = {}) {
    const next = normalizeSong(song);
    if (!next) return false;
    state.blocked = false;
    if (state.song && state.song.songId !== next.songId) state.history.push(state.song);
    state.song = next;
    state.queue = rest.map(normalizeSong).filter(Boolean);
    state.currentTime = 0;
    state.duration = 0;
    state.progress = 0;
    state.lyrics = [];
    state.lyricTranslations = new Map();
    state.lyricIndex = -1;
    state.sharedWithCompanion = false;
    if (!isLocal(next)) state.recent = [next, ...state.recent.filter((item) => item.songId !== next.songId)].slice(0, 30);
    saveLibrary();
    savePlayerState();
    notifyMusicChanged();
    renderCurrent();
    renderMiniPlayer();
    loadLyrics();
    if (isLocal(next)) {
      try {
        const ready = prefetched?.songId === next.songId ? prefetched.blob : null;
        prefetched = null;
        const blob = ready || await localGet(`audio:${next.songId}`);
        if (!blob) throw new Error("这首本地歌的文件找不到了，重新导入一下");
        if (localUrl) URL.revokeObjectURL(localUrl);
        localUrl = URL.createObjectURL(blob);
        audio.src = localUrl;
        state.error = "";
        updateMediaSession(next);
        await audio.play();
        prefetchNextLocal();
        return true;
      } catch (error) {
        return playFailed(error, opts, false);
      }
    }
    try {
      const data = await api(`/music/url?id=${encodeURIComponent(next.songId)}`);
      if (!data.url) throw new Error(data.error || "这首歌暂时没有可用音源");
      audio.src = resolveUrl(data.url);
      updateMediaSession(next);
      await audio.play();
      apiPost("/music/recent/add", { song: next }).catch(() => {});
      return true;
    } catch (error) {
      return playFailed(error, opts, true);
    }
  }
  /* v359：iOS 没有手势时 play() 会被拒（NotAllowedError）——安静失败，留给点歌卡片「点一下播放」 */
  function playFailed(error, opts, remote) {
    state.playing = false;
    if (error && error.name === "NotAllowedError") {
      state.blocked = true; state.error = "";
      renderCurrent(); renderMiniPlayer();
      if (!opts.quiet) showToast("点一下播放键开始");
      return false;
    }
    state.error = (error && error.message) || "播放失败";
    if (remote) setStatus(state.error, true);
    renderCurrent();
    if (!opts.quiet) showToast(state.error);
    return false;
  }

  // ---- v359 他自己点歌：歌单 = 本地 + 喜欢 + 队列 ----
  function pickPool() {
    const seen = new Set();
    return [...state.local, ...state.liked, ...state.queue].filter((s) => s && !seen.has(s.songId) && seen.add(s.songId));
  }
  function songPickNote() {
    return buildSongPickNote(pickPool().map((s) => s.name));
  }
  function findPickSong(title, pool = pickPool()) {
    const tracks = pool.map((s) => ({ id: s.songId, name: s.name, artist: s.artist === "本地音乐" || s.artist === "未知歌手" ? "" : s.artist }));
    const hit = findTrackByTitle(tracks, title);
    return hit ? pool.find((s) => s.songId === hit.id) || null : null;
  }
  function isSongPlaying(song) {
    return !!song && !!state.song && state.song.songId === song.songId && !!audio.src && !audio.paused;
  }
  /** 返回 "playing" | "already" | "missing" | "blocked" | "error" */
  async function playPicked(title, opts = {}) {
    const song = findPickSong(title);
    if (!song) return "missing";
    if (isSongPlaying(song)) return "already";
    const ok = await playSong(song, state.queue.filter((s) => s.songId !== song.songId), { quiet: !!opts.auto });
    return ok ? "playing" : (state.blocked ? "blocked" : "error");
  }
  /** 点歌卡片：歌单里没有这首 → 打开导入；导入后歌名对得上就直接放 */
  function importForPick(title, onDone) {
    pickLocalFiles(async (added) => {
      let status = "missing";
      const song = (added.length && findPickSong(title, added)) || (added.length ? findPickSong(title) : null);
      if (song) {
        const ok = await playSong(song, [], { quiet: true });
        status = ok ? "playing" : (state.blocked ? "blocked" : "error");
      }
      if (typeof onDone === "function") onDone(status);
    });
  }

  function togglePlay() {
    if (!state.song) return;
    if (!audio.src) { playSong(state.song, state.queue); return; }
    if (audio.src && !audio.paused) audio.pause();
    else audio.play().catch(() => showToast("请先点击歌曲开始播放"));
  }

  /* v345：本地歌按「本地歌曲」列表顺序循环上下首，不依赖队列（刷新/暂停后队列可能被清空） */
  function localNeighbor(step) {
    if (!isLocal(state.song) || !state.local.length) return null;
    const i = state.local.findIndex((x) => x.songId === state.song.songId);
    const n = state.local.length;
    return state.local[((i < 0 ? -1 : i) + step + n * 2) % n] || null;
  }

  async function playNext() {
    if (state.queue.length) {
      await playSong(state.queue.shift(), state.queue);
      return;
    }
    const localNext = localNeighbor(1);
    if (localNext) { await playSong(localNext); return; }
    if (state.roam && state.song && state.connected && !isLocal(state.song)) {
      try {
        const data = await api(`/music/roam?id=${encodeURIComponent(state.song.songId)}`);
        if (data.song) await playSong(data.song);
      } catch (_) {}
    }
    renderQueue();
  }

  function playPrevious() {
    if (audio.currentTime > 3) { audio.currentTime = 0; return; }
    const localPrev = localNeighbor(-1);
    if (localPrev) { playSong(localPrev, state.queue); return; }
    const previous = state.history.pop();
    if (previous) playSong(previous, state.queue);
  }

  function addQueue(song) {
    const next = normalizeSong(song);
    if (!next) return;
    state.queue.push(next);
    savePlayerState();
    renderQueue();
    showToast("已加入播放队列");
  }

  async function toggleLike(song) {
    const next = normalizeSong(song);
    if (!next || !state.connected || isLocal(next)) return;
    const index = state.liked.findIndex((item) => item.songId === next.songId);
    try {
      if (index >= 0) {
        await apiPost("/music/playlist/remove", { songId: next.songId });
        state.liked.splice(index, 1);
        showToast("已移出喜欢");
      } else {
        await apiPost("/music/playlist/add", { song: next, by: "user" });
        state.liked.unshift(next);
        showToast("已加入喜欢");
      }
      saveLibrary();
      renderView(); renderCurrent(); notifyMusicChanged();
    } catch (error) { showToast(error.message || "歌单操作失败"); }
  }

  async function toggleRoam() {
    state.roam = !state.roam;
    savePlayerState();
    renderView();
    if (state.roam && !state.song) showToast("先播放一首歌，播完后会自动漫游");
  }

  async function loadLyrics(force = false) {
    if (!state.song) return;
    if (isLocal(state.song)) {
      const song = state.song;
      state.lyricHint = "";
      state.lyricsLoading = true;
      if (state.lyricsOpen) renderLyrics();
      try {
        let text = await localGet(`lyric:${song.songId}`).catch(() => "");
        if (!text && !force) {
          state.lyricHint = "正在网上找歌词…";
          if (state.lyricsOpen) renderLyrics();
          text = await fetchOnlineLyrics(song).catch(() => "");
          if (text) await localPut(`lyric:${song.songId}`, text).catch(() => {});
        }
        if (state.song?.songId !== song.songId) return;
        state.lyrics = parseAnyLyrics(text || "");
        state.lyricTranslations = new Map();
        state.lyricIndex = -1;
        state.lyricHint = state.lyrics.length ? "" : "没找到歌词，可以在「本地」里给这首点「+词」";
      } finally {
        state.lyricsLoading = false;
        if (state.lyricsOpen) renderLyrics();
        renderCurrent();
      }
      return;
    }
    if (!state.connected) return;
    const songId = state.song.songId;
    state.lyricsLoading = true;
    if (state.lyricsOpen) renderLyrics();
    try {
      const data = await api(`/music/lyric?id=${encodeURIComponent(songId)}`);
      if (state.song?.songId !== songId) return;
      state.lyrics = parseLrc(data.lrc || "");
      state.lyricTranslations = new Map(parseLrc(data.tlyric || "").map((line) => [Math.round(line.time * 100), line.text]));
    } catch (_) {
      state.lyrics = [];
      state.lyricTranslations = new Map();
    } finally {
      state.lyricsLoading = false;
      if (state.lyricsOpen) renderLyrics();
    }
  }

  function openLyrics() {
    if (!state.song) return;
    state.lyricsOpen = true;
    renderLyrics();
    if (!state.lyrics.length && !state.lyricsLoading) loadLyrics();
  }

  function closeLyrics() {
    state.lyricsOpen = false;
    const sheet = $("music-lyrics");
    if (sheet) sheet.hidden = true;
  }

  function shareWithCompanion() {
    if (!state.song) return;
    const line = currentLyric()?.text;
    const message = [
      `【一起听歌】我现在在听《${state.song.name}》— ${state.song.artist}。`,
      line ? `此刻的歌词：${line}` : "陪我一起听一会儿。",
    ].join("\n");
    const input = $("input");
    if (input) {
      input.value = message;
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.focus();
    }
    state.sharedWithCompanion = true;
    if (state.connected && !isLocal(state.song)) apiPost("/music/listen-together", { ...state.song, roam: state.roam }).catch(() => {});
    close();
    showToast("已把这首歌放进聊天输入框");
  }

  function currentLyric() {
    if (state.lyricIndex < 0 || !state.lyrics[state.lyricIndex]) return null;
    return state.lyrics[state.lyricIndex];
  }

  function updateLyricProgress() {
    if (!state.lyrics.length || state.lyrics[0].time < 0) return;
    let index = -1;
    for (let i = state.lyrics.length - 1; i >= 0; i -= 1) {
      if (state.currentTime >= state.lyrics[i].time) { index = i; break; }
    }
    if (index === state.lyricIndex) return;
    state.lyricIndex = index;
    const lines = document.querySelectorAll(".music-lyric-line");
    lines.forEach((line, i) => line.classList.toggle("active", i === index));
    const active = lines[index];
    const container = $("music-lyrics-lines");
    if (active && container) container.scrollTo({ top: active.offsetTop - container.clientHeight / 2, behavior: "smooth" });
  }

  function renderCurrent() {
    const song = state.song;
    const cover = $("music-cover");
    const name = $("music-current-name");
    const artist = $("music-current-artist");
    const album = $("music-current-album");
    const seek = $("music-seek");
    const current = $("music-time-current");
    const total = $("music-time-total");
    const play = $("music-play-btn");
    const like = $("music-like-btn");
    if (!song) {
      if (cover) { cover.removeAttribute("src"); cover.classList.add("music-cover-placeholder"); cover.textContent = "♪"; }
      if (name) name.textContent = "选一首歌开始";
      if (artist) artist.textContent = "和顾祁砚一起听点什么";
      if (album) album.textContent = "";
      if (play) play.textContent = "▶";
      if (like) like.disabled = true;
    } else {
      if (cover) {
        cover.classList.remove("music-cover-placeholder");
        cover.textContent = "";
        cover.src = resolveUrl(song.cover);
        cover.onerror = () => { cover.removeAttribute("src"); cover.classList.add("music-cover-placeholder"); cover.textContent = "♪"; };
      }
      if (name) name.textContent = song.name;
      if (artist) artist.textContent = isLocal(song) && state.lyricHint ? `${song.artist} · ${state.lyricHint}` : song.artist;
      if (album) album.textContent = song.album ? `专辑 · ${song.album}` : "";
      if (play) play.textContent = state.playing ? "Ⅱ" : "▶";
      if (like && isLocal(song)) { like.disabled = true; like.textContent = "♡"; like.classList.remove("liked"); }
      else if (like) { like.disabled = false; like.textContent = isLiked(song) ? "♥" : "♡"; like.classList.toggle("liked", isLiked(song)); }
    }
    if (seek) seek.value = String(Math.round(state.progress * 1000));
    if (current) current.textContent = fmt(state.currentTime);
    if (total) total.textContent = fmt(state.duration);
    const error = $("music-inline-error");
    if (error) { error.textContent = state.error || ""; error.hidden = !state.error; }
  }

  function renderMiniPlayer() {
    const mini = $("music-mini-player");
    if (!mini) return;
    // v342：有歌在放（或放到一半暂停）才自动出现
    if (!state.song || (!state.connected && !isLocal(state.song)) || (!state.playing && !(state.currentTime > 0))) { mini.hidden = true; return; }
    mini.hidden = false;
    mini.classList.toggle("playing", !!state.playing);
    mini.classList.toggle("collapsed", localStorage.getItem("jyc_music_mini") === "collapsed");
    mini.style.setProperty("--music-progress", `${state.progress * 100}%`);
    const cover = $("music-mini-cover");
    if (cover) {
      const src = state.song.cover ? resolveUrl(state.song.cover) : "";
      if (!src) cover.removeAttribute("src");
      else if (cover.getAttribute("src") !== src) { cover.src = src; cover.onerror = () => cover.removeAttribute("src"); }
    }
    const lineText = currentLyric()?.text || state.song.name;
    const name = $("music-mini-name");
    if (name.textContent !== lineText) name.textContent = lineText;
    $("music-mini-artist").textContent = state.song.artist;
    $("music-mini-play").textContent = state.playing ? "Ⅱ" : "▶";
  }

  function isLiked(song) { return !!song && state.liked.some((item) => item.songId === song.songId); }

  function songRow(song, index, options = {}) {
    const liked = isLiked(song);
    const current = state.song?.songId === song.songId;
    const remove = options.remove ? `<button class="music-song-action danger" data-music-remove="${index}" title="移除">×</button>` : "";
    const queue = options.queue === false ? "" : `<button class="music-song-action" data-music-queue="${index}" title="加入队列">＋</button>`;
    return `<div class="music-song-row" data-music-song="${index}">
      ${song.cover ? `<img class="music-song-cover" src="${esc(resolveUrl(song.cover))}" alt="" loading="lazy">` : `<span class="music-song-cover empty">♪</span>`}
      <div class="music-song-info"><div class="music-song-name">${esc(song.name)}${current ? `<span class="music-current-badge">正在播放</span>` : ""}</div><div class="music-song-artist">${esc(song.artist)}${song.album ? ` · ${esc(song.album)}` : ""}</div></div>
      <div class="music-song-actions"><button class="music-song-action ${liked ? "liked" : ""}" data-music-like="${index}" title="喜欢">${liked ? "♥" : "♡"}</button>${queue}${remove}</div>
    </div>`;
  }

  function bindSongRows(container, songs, options = {}) {
    container.querySelectorAll("[data-music-song]").forEach((row) => {
      const index = Number(row.dataset.musicSong);
      row.querySelector(".music-song-cover")?.addEventListener("click", () => playSong(songs[index], options.playRest ? songs.slice(index + 1) : []));
      row.querySelector(".music-song-info")?.addEventListener("click", () => playSong(songs[index], options.playRest ? songs.slice(index + 1) : []));
    });
    container.querySelectorAll("[data-music-like]").forEach((button) => button.addEventListener("click", (event) => { event.stopPropagation(); toggleLike(songs[Number(button.dataset.musicLike)]); }));
    container.querySelectorAll("[data-music-queue]").forEach((button) => button.addEventListener("click", (event) => { event.stopPropagation(); addQueue(songs[Number(button.dataset.musicQueue)]); }));
    container.querySelectorAll("[data-music-remove]").forEach((button) => button.addEventListener("click", (event) => { event.stopPropagation(); removeQueue(Number(button.dataset.musicRemove)); }));
  }

  function renderDiscover() {
    const view = $("music-view");
    if (!view) return;
    const results = state.searchResults;
    const recent = state.recent;
    view.innerHTML = `<div class="music-discover-head">
      <form class="music-search-form" id="music-search-form"><span>⌕</span><input id="music-search-input" value="${esc(state.query)}" placeholder="搜索歌曲或歌手" autocomplete="off"><button type="submit">${state.searching ? "…" : "搜索"}</button></form>
      <button type="button" class="music-roam-btn ${state.roam ? "active" : ""}" id="music-roam-btn">✦ ${state.roam ? "已开启漫游" : "播完漫游"}</button>
    </div>
    ${state.error ? `<div class="music-error">${esc(state.error)}</div>` : ""}
    ${results.length ? `<div class="music-section-label">搜索结果</div><div class="music-song-list" id="music-result-list">${results.map((song, i) => songRow(song, i, { playRest: true })).join("")}</div>` : ""}
    ${!results.length && recent.length ? `<div class="music-section-label">最近听过</div><div class="music-song-list" id="music-recent-list">${recent.slice(0, 10).map((song, i) => songRow(song, i, { playRest: false })).join("")}</div>` : ""}
    ${!results.length && !recent.length ? `<div class="music-empty"><div><strong>把第一首歌放进来</strong>搜一首你想和 TA 一起听的歌，歌词会在播放后同步滚动。</div></div>` : ""}`;
    $("music-search-form")?.addEventListener("submit", (event) => { event.preventDefault(); searchSongs($("music-search-input")?.value); });
    $("music-roam-btn")?.addEventListener("click", toggleRoam);
    if (results.length) bindSongRows($("music-result-list"), results, { playRest: true });
    else if (recent.length) bindSongRows($("music-recent-list"), recent, { playRest: false });
  }

  function renderLiked() {
    const view = $("music-view");
    if (!view) return;
    view.innerHTML = state.liked.length
      ? `<div class="music-section-label">我的喜欢 · ${state.liked.length} 首</div><div class="music-song-list" id="music-liked-list">${state.liked.map((song, i) => songRow(song, i, { playRest: true })).join("")}</div>`
      : `<div class="music-empty"><div><strong>喜欢列表还是空的</strong>在发现页给歌曲点一下 ♡，它会留在这里。</div></div>`;
    if (state.liked.length) bindSongRows($("music-liked-list"), state.liked, { playRest: true });
  }

  function removeQueue(index) {
    state.queue.splice(index, 1);
    savePlayerState();
    renderQueue();
  }

  function renderQueue() {
    if (state.activeTab !== "queue") return;
    const view = $("music-view");
    if (!view) return;
    view.innerHTML = `<div class="music-queue-head"><div class="music-section-label">待播队列 · ${state.queue.length} 首</div><button type="button" id="music-clear-queue">清空</button></div>
      ${state.queue.length ? `<div class="music-song-list" id="music-queue-list">${state.queue.map((song, i) => songRow(song, i, { queue: false, remove: true })).join("")}</div>` : `<div class="music-empty"><div><strong>队列是空的</strong>在搜索结果里点 ＋，把想听的歌排进来。</div></div>`}`;
    $("music-clear-queue")?.addEventListener("click", () => { state.queue = []; savePlayerState(); renderQueue(); });
    if (state.queue.length) bindSongRows($("music-queue-list"), state.queue, { queue: false, remove: true });
  }

  function renderLocal() {
    const view = $("music-view");
    if (!view) return;
    const songs = state.local;
    view.innerHTML = `<div class="music-queue-head"><div class="music-section-label">本地歌曲 · ${songs.length} 首</div><button type="button" id="music-local-import">＋ 导入</button></div>
      ${songs.length ? `<div class="music-song-list" id="music-local-list">${songs.map((song, i) => {
        const current = state.song?.songId === song.songId;
        return `<div class="music-song-row" data-music-song="${i}"><span class="music-song-cover empty">♪</span><div class="music-song-info"><div class="music-song-name">${esc(song.name)}${current ? `<span class="music-current-badge">正在播放</span>` : ""}</div><div class="music-song-artist">${esc(song.artist)}</div></div><div class="music-song-actions"><button class="music-song-action" data-music-lyricfile="${i}" title="配歌词">词</button><button class="music-song-action danger" data-music-local-del="${i}" title="删除">×</button></div></div>`;
      }).join("")}</div>` : `<div class="music-empty"><div><strong>还没有本地歌</strong>点「＋ 导入」从「文件」里选 mp3，可以连同同名 .lrc 歌词一起选；没歌词会自动上网找。</div></div>`}`;
    $("music-local-import")?.addEventListener("click", () => pickLocalFiles());
    if (!songs.length) return;
    bindSongRows($("music-local-list"), songs, { playRest: true });
    view.querySelectorAll("[data-music-local-del]").forEach((b) => b.addEventListener("click", (e) => { e.stopPropagation(); removeLocal(Number(b.dataset.musicLocalDel)); }));
    view.querySelectorAll("[data-music-lyricfile]").forEach((b) => b.addEventListener("click", async (e) => {
      e.stopPropagation();
      const song = songs[Number(b.dataset.musicLyricfile)];
      if (!song) return;
      const input = document.createElement("input");
      input.type = "file";
      input.addEventListener("change", async () => {
        const f = input.files?.[0];
        if (!f) return;
        const text = await f.text();
        if (!parseAnyLyrics(text).length) { showToast("这个歌词文件是空的"); return; }
        await localPut(`lyric:${song.songId}`, text);
        if (state.song?.songId === song.songId) await loadLyrics(true);
        showToast("歌词已保存");
      });
      input.click();
    }));
  }

  function renderView() {
    const view = $("music-view");
    if (!view) return;
    if (!state.connected && state.activeTab !== "local") state.activeTab = "local";
    document.querySelectorAll("[data-music-tab]").forEach((tab) => { if (tab.dataset.musicTab !== "local") tab.style.display = state.connected ? "" : "none"; });
    const localCount = $("music-local-count");
    if (localCount) localCount.textContent = String(state.local.length);
    if (state.activeTab === "local") { renderLocal(); document.querySelectorAll("[data-music-tab]").forEach((tab) => tab.classList.toggle("active", tab.dataset.musicTab === "local")); return; }
    if (!state.connected) return;
    if (state.activeTab === "liked") renderLiked();
    else if (state.activeTab === "queue") renderQueue();
    else renderDiscover();
    document.querySelectorAll("[data-music-tab]").forEach((tab) => tab.classList.toggle("active", tab.dataset.musicTab === state.activeTab));
    const likedCount = $("music-liked-count");
    const queueCount = $("music-queue-count");
    if (likedCount) likedCount.textContent = String(state.liked.length);
    if (queueCount) queueCount.textContent = String(state.queue.length);
  }

  function renderLyrics() {
    const sheet = $("music-lyrics");
    if (!sheet || !state.song) return;
    sheet.hidden = false;
    $("music-lyrics-name").textContent = state.song.name;
    $("music-lyrics-artist").textContent = state.song.artist;
    const cover = $("music-lyrics-cover");
    if (cover) { cover.src = resolveUrl(state.song.cover); cover.onerror = () => cover.removeAttribute("src"); }
    const lines = $("music-lyrics-lines");
    if (!lines) return;
    if (state.lyricsLoading && !state.lyrics.length) { lines.innerHTML = `<div class="music-empty">歌词加载中…</div>`; return; }
    if (!state.lyrics.length) { lines.innerHTML = `<div class="music-empty">${esc(state.lyricHint || "这首歌暂时没有同步歌词")}</div>`; return; }
    lines.innerHTML = state.lyrics.map((line, index) => {
      const translated = state.lyricTranslations.get(Math.round(line.time * 100));
      return `<div class="music-lyric-line ${index === state.lyricIndex ? "active" : ""}" data-music-lyric="${index}">${esc(line.text)}${translated ? `<div class="music-lyric-trans">${esc(translated)}</div>` : ""}</div>`;
    }).join("");
    lines.querySelectorAll("[data-music-lyric]").forEach((line) => line.addEventListener("click", () => { const item = state.lyrics[Number(line.dataset.musicLyric)]; if (item && item.time >= 0) audio.currentTime = item.time; }));
  }

  function render() {
    const panel = $("music-panel");
    if (!panel) return;
    if (!state.connected) {
      $("music-connect-card").hidden = !!state.local.length && !$("music-connect-card").dataset.editing;
      $("music-app").hidden = !state.local.length && !isLocal(state.song);
      const base = $("music-base-url");
      const token = $("music-token");
      if (base && document.activeElement !== base) base.value = state.config.baseUrl;
      if (token && document.activeElement !== token) token.value = state.config.token;
      if (!$("music-app").hidden) renderView();
    } else {
      $("music-app").hidden = false;
      if (!$("music-connect-card").dataset.editing) $("music-connect-card").hidden = true;
      renderView();
    }
    renderCurrent();
    renderMiniPlayer();
    renderQueue();
    setStatus(state.connected ? "已连接 Eryu" : (state.error || "未连接音乐服务"), !!state.error);
  }

  async function open() {
    state.open = true;
    state.openedFromDashboard = !!window.JYCDashboard?.isOpen?.();
    const panel = $("music-panel");
    if (!panel) return;
    panel.classList.add("open");
    panel.hidden = false;
    document.body.classList.add("music-open");
    if (!state.song) restorePlayerState();
    render();
    if (state.config.baseUrl && state.config.token && !state.connected) {
      setStatus("正在连接…");
      await testConnection(state.config, false);
    }
  }

  function close() {
    state.open = false;
    closeLyrics();
    const panel = $("music-panel");
    if (panel) { panel.classList.remove("open"); panel.hidden = true; }
    document.body.classList.remove("music-open");
    if (state.openedFromDashboard) window.dispatchEvent(new CustomEvent("jyc:dashboard-open"));
  }

  /** v343：一起听歌——每轮注入系统提示，让 TA 知道正在放什么、唱到哪句、歌单里有什么 */
  function promptNote() {
    const song = state.song;
    if (!song || !state.playing) return "";
    const parts = [`【一起听歌】她正在放《${song.name}》${song.artist && song.artist !== "本地音乐" && song.artist !== "未知歌手" ? `— ${song.artist}` : ""}，放到 ${fmt(state.currentTime)}${state.duration ? ` / ${fmt(state.duration)}` : ""}。你们像是在一起听。`];
    const lines = state.lyrics || [];
    if (lines.length && lines[0].time >= 0) {
      const i = state.lyricIndex;
      if (i < 0) parts.push("前奏中，还没唱到歌词。");
      else {
        const from = Math.max(0, i - 2), to = Math.min(lines.length, i + 3);
        parts.push("现在唱到（▶ 是这一句）：\n" + lines.slice(from, to).map((l, k) => (from + k === i ? "▶ " : "  ") + l.text).join("\n"));
      }
    } else if (lines.length) {
      let text = lines.map((l) => l.text).join(" / ");
      if (text.length > 600) text = text.slice(0, 600) + "…";
      parts.push("这首歌的歌词：" + text);
    }
    const list = (isLocal(song) ? state.local : state.queue).map((x) => x.name).filter(Boolean);
    if (list.length) parts.push(`${isLocal(song) ? "她的本地歌单" : "接下来的队列"}（${list.length} 首）：${list.slice(0, 20).join("、")}${list.length > 20 ? "…" : ""}`);
    parts.push("可以自然地聊这首歌、顺着歌词说点什么，别每条都提，别编造没给你的歌词，不要提“系统”“注入”“字段”。");
    return parts.join("\n");
  }

  function summary() {
    return { connected: state.connected, song: state.song, queueCount: state.queue.length, likedCount: state.liked.length, localCount: state.local.length };
  }

  audio.addEventListener("timeupdate", () => {
    state.currentTime = audio.currentTime || 0;
    state.duration = Number.isFinite(audio.duration) ? audio.duration : 0;
    state.progress = state.duration ? state.currentTime / state.duration : 0;
    updateLyricProgress();
    renderCurrent(); renderMiniPlayer();
    if (state.lyricsOpen) {
      const seek = $("music-lyrics-seek");
      if (seek) seek.value = String(Math.round(state.progress * 1000));
    }
  });
  bindMediaSession();
  audio.addEventListener("play", () => { if (typeof navigator !== "undefined" && navigator.mediaSession) navigator.mediaSession.playbackState = "playing"; state.playing = true; renderCurrent(); renderMiniPlayer(); });
  audio.addEventListener("pause", () => { if (typeof navigator !== "undefined" && navigator.mediaSession) navigator.mediaSession.playbackState = "paused"; state.playing = false; renderCurrent(); renderMiniPlayer(); });
  audio.addEventListener("ended", () => {
    state.playing = false;
    if (state.song && state.sharedWithCompanion) apiPost("/music/listen-complete", { songId: state.song.songId, source: "together" }).catch(() => {});
    playNext();
  });
  audio.addEventListener("error", () => { if (!audio.src) return; state.error = isLocal(state.song) ? "本地文件读不出来，可能格式不支持" : "音频加载失败，这首歌可能需要 VIP 或已失效"; renderCurrent(); });

  function bind() {
    $("music-close")?.addEventListener("click", close);
    $("music-config-btn")?.addEventListener("click", () => {
      const card = $("music-connect-card");
      if (card?.hidden) { card.dataset.editing = "1"; openConfig(); }
      else if (state.connected || state.local.length) { delete card.dataset.editing; closeConfig(); }
    });
    $("music-connect-btn")?.addEventListener("click", connectFromForm);
    $("music-local-import-btn")?.addEventListener("click", () => pickLocalFiles());
    $("music-cancel-config")?.addEventListener("click", () => { delete $("music-connect-card").dataset.editing; closeConfig(); });
    $("music-logout-btn")?.addEventListener("click", () => {
      state.connected = false; state.config = { baseUrl: "", token: "" }; localStorage.removeItem(CONFIG_KEY); render(); showToast("已断开音乐服务");
    });
    $("music-search-input")?.addEventListener("keydown", (event) => { if (event.key === "Enter") { event.preventDefault(); searchSongs(event.currentTarget.value); } });
    $("music-play-btn")?.addEventListener("click", togglePlay);
    $("music-prev-btn")?.addEventListener("click", playPrevious);
    $("music-next-btn")?.addEventListener("click", playNext);
    $("music-like-btn")?.addEventListener("click", () => toggleLike(state.song));
    $("music-lyrics-btn")?.addEventListener("click", openLyrics);
    $("music-share-btn")?.addEventListener("click", shareWithCompanion);
    $("music-seek")?.addEventListener("input", (event) => { if (state.duration) audio.currentTime = Number(event.currentTarget.value) / 1000 * state.duration; });
    $("music-lyrics-back")?.addEventListener("click", closeLyrics);
    $("music-lyrics-play")?.addEventListener("click", togglePlay);
    $("music-lyrics-prev")?.addEventListener("click", playPrevious);
    $("music-lyrics-next")?.addEventListener("click", playNext);
    $("music-lyrics-seek")?.addEventListener("input", (event) => { if (state.duration) audio.currentTime = Number(event.currentTarget.value) / 1000 * state.duration; });
    document.querySelectorAll("[data-music-tab]").forEach((tab) => tab.addEventListener("click", () => { state.activeTab = tab.dataset.musicTab; renderView(); }));
    $("music-mini-player")?.addEventListener("click", (event) => { if (event.target.closest("button")) return; open(); });
    $("music-mini-play")?.addEventListener("click", (event) => { event.stopPropagation(); togglePlay(); });
    $("music-mini-next")?.addEventListener("click", (event) => { event.stopPropagation(); playNext(); });
    $("music-mini-prev")?.addEventListener("click", (event) => { event.stopPropagation(); playPrevious(); });
    $("music-mini-disc")?.addEventListener("click", (event) => {
      event.stopPropagation();
      const collapsed = localStorage.getItem("jyc_music_mini") === "collapsed";
      try { localStorage.setItem("jyc_music_mini", collapsed ? "open" : "collapsed"); } catch (_) {}
      renderMiniPlayer();
    });
    window.addEventListener("jyc:role-changed", () => { if (state.open) render(); });
  }

  restoreLibrary();
  restoreLocalList();
  restorePlayerState();
  window.JYCMusic = { open, close, summary, promptNote, togglePlay, playNext, songPickNote, findPickSong, playPicked, importForPick, isSongPlaying, getState: () => ({ ...state, lyrics: undefined, lyricTranslations: undefined }) };
  bind();
  renderMiniPlayer();
})();
