/*
 * 顾祁砚端口的听歌房。
 *
 * The UI is intentionally separate from the chat state. It consumes the small
 * HTTP API exposed by eryu (MIT), while keeping the endpoint and token local
 * to this browser origin.
 */
(() => {
  const CONFIG_KEY = "jyc_music_config_v1";
  const PLAYER_KEY = "jyc_music_player_v1";
  const LIBRARY_KEY = "jyc_music_library_v1";
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
  };

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
    if (card && state.connected) card.hidden = true;
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

  async function playSong(song, rest = []) {
    const next = normalizeSong(song);
    if (!next) return;
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
    state.recent = [next, ...state.recent.filter((item) => item.songId !== next.songId)].slice(0, 30);
    saveLibrary();
    savePlayerState();
    notifyMusicChanged();
    renderCurrent();
    renderMiniPlayer();
    loadLyrics();
    try {
      const data = await api(`/music/url?id=${encodeURIComponent(next.songId)}`);
      if (!data.url) throw new Error(data.error || "这首歌暂时没有可用音源");
      audio.src = resolveUrl(data.url);
      await audio.play();
      apiPost("/music/recent/add", { song: next }).catch(() => {});
    } catch (error) {
      state.playing = false;
      state.error = error.message || "播放失败";
      setStatus(state.error, true);
      renderCurrent();
      showToast(state.error);
    }
  }

  function togglePlay() {
    if (!state.song) return;
    if (!audio.src) { playSong(state.song); return; }
    if (audio.src && !audio.paused) audio.pause();
    else audio.play().catch(() => showToast("请先点击歌曲开始播放"));
  }

  async function playNext() {
    if (state.queue.length) {
      await playSong(state.queue.shift(), state.queue);
      return;
    }
    if (state.roam && state.song) {
      try {
        const data = await api(`/music/roam?id=${encodeURIComponent(state.song.songId)}`);
        if (data.song) await playSong(data.song);
      } catch (_) {}
    }
    renderQueue();
  }

  function playPrevious() {
    if (audio.currentTime > 3) { audio.currentTime = 0; return; }
    const previous = state.history.pop();
    if (previous) playSong(previous);
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
    if (!next || !state.connected) return;
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

  async function loadLyrics() {
    if (!state.song || !state.connected) return;
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
    if (state.connected) apiPost("/music/listen-together", { ...state.song, roam: state.roam }).catch(() => {});
    close();
    showToast("已把这首歌放进聊天输入框");
  }

  function currentLyric() {
    if (state.lyricIndex < 0 || !state.lyrics[state.lyricIndex]) return null;
    return state.lyrics[state.lyricIndex];
  }

  function updateLyricProgress() {
    if (!state.lyrics.length) return;
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
      if (artist) artist.textContent = song.artist;
      if (album) album.textContent = song.album ? `专辑 · ${song.album}` : "";
      if (play) play.textContent = state.playing ? "Ⅱ" : "▶";
      if (like) { like.disabled = false; like.textContent = isLiked(song) ? "♥" : "♡"; like.classList.toggle("liked", isLiked(song)); }
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
    if (!state.song || !state.connected) { mini.hidden = true; return; }
    mini.hidden = false;
    mini.style.setProperty("--music-progress", `${state.progress * 100}%`);
    const cover = $("music-mini-cover");
    if (cover) { cover.src = resolveUrl(state.song.cover); cover.onerror = () => cover.removeAttribute("src"); }
    $("music-mini-name").textContent = state.song.name;
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

  function renderView() {
    const view = $("music-view");
    if (!view || !state.connected) return;
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
    if (!state.lyrics.length) { lines.innerHTML = `<div class="music-empty">这首歌暂时没有同步歌词</div>`; return; }
    lines.innerHTML = state.lyrics.map((line, index) => {
      const translated = state.lyricTranslations.get(Math.round(line.time * 100));
      return `<div class="music-lyric-line ${index === state.lyricIndex ? "active" : ""}" data-music-lyric="${index}">${esc(line.text)}${translated ? `<div class="music-lyric-trans">${esc(translated)}</div>` : ""}</div>`;
    }).join("");
    lines.querySelectorAll("[data-music-lyric]").forEach((line) => line.addEventListener("click", () => { const item = state.lyrics[Number(line.dataset.musicLyric)]; if (item) audio.currentTime = item.time; }));
  }

  function render() {
    const panel = $("music-panel");
    if (!panel) return;
    if (!state.connected) {
      $("music-connect-card").hidden = false;
      $("music-app").hidden = true;
      const base = $("music-base-url");
      const token = $("music-token");
      if (base && document.activeElement !== base) base.value = state.config.baseUrl;
      if (token && document.activeElement !== token) token.value = state.config.token;
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

  function summary() {
    return { connected: state.connected, song: state.song, queueCount: state.queue.length, likedCount: state.liked.length };
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
  audio.addEventListener("play", () => { state.playing = true; renderCurrent(); renderMiniPlayer(); });
  audio.addEventListener("pause", () => { state.playing = false; renderCurrent(); renderMiniPlayer(); });
  audio.addEventListener("ended", () => {
    state.playing = false;
    if (state.song && state.sharedWithCompanion) apiPost("/music/listen-complete", { songId: state.song.songId, source: "together" }).catch(() => {});
    playNext();
  });
  audio.addEventListener("error", () => { state.error = "音频加载失败，这首歌可能需要 VIP 或已失效"; renderCurrent(); });

  function bind() {
    $("music-close")?.addEventListener("click", close);
    $("music-config-btn")?.addEventListener("click", () => {
      const card = $("music-connect-card");
      if (card?.hidden) { card.dataset.editing = "1"; openConfig(); }
      else if (state.connected) { delete card.dataset.editing; closeConfig(); }
    });
    $("music-connect-btn")?.addEventListener("click", connectFromForm);
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
    window.addEventListener("jyc:role-changed", () => { if (state.open) render(); });
  }

  restoreLibrary();
  restorePlayerState();
  window.JYCMusic = { open, close, summary, togglePlay, playNext, getState: () => ({ ...state, lyrics: undefined, lyricTranslations: undefined }) };
  bind();
  renderMiniPlayer();
})();
