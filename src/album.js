const bridge = window.JYCAlbumBridge;
// v387 他自己的相册：规则在 src/album-agency.js（单独的 module 脚本，挂在 window.JYCAlbumAgency 上）。
// 这里不 import，保持本文件能被回归脚本当普通脚本跑；用到时再取。
const albumAgency = () => window.JYCAlbumAgency || null;
const CAPTION_MAX = 60;

if (!bridge) {
  console.error("Album bridge is unavailable");
} else {
  const $ = (id) => document.getElementById(id);
  const DB_KEY = "albumEntriesV1";
  const MAX_SOURCE_BYTES = 35 * 1024 * 1024;
  const MAX_EDGE = 2200;
  const state = {
    entries: [],
    category: "all",
    newestFirst: true,
    openIndex: -1,
    visible: [],
    pending: [],
    ready: false,
    unlocked: false,
  };

  const localDate = () => {
    const now = new Date();
    const offset = now.getTimezoneOffset() * 60000;
    return new Date(now.getTime() - offset).toISOString().slice(0, 10);
  };
  const roleId = () => bridge.activeRole()?.id || "default";
  const roleName = () => bridge.activeRole()?.name || bridge.activeRole()?.aiName || "TA";
  const userName = () => bridge.userName() || "我";
  const entryId = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2));
  const categoryName = (category) => category === "role" ? roleName() : category === "user" ? userName() : category === "kept" ? `${roleName()}收的` : "画册";
  const albumCode = () => String(bridge.albumCode?.() || "");
  const validDate = (value) => /^\d{4}-\d{2}-\d{2}$/.test(String(value || "")) ? value : localDate();
  const formatDate = (value) => {
    const [year, month, day] = validDate(value).split("-");
    return `${year} 年 ${Number(month)} 月 ${Number(day)} 日`;
  };

  function normalizeEntries(value) {
    if (!Array.isArray(value)) return [];
    return value.filter((entry) => entry && typeof entry.dataUrl === "string" && entry.dataUrl.startsWith("data:image/"))
      .map((entry) => ({
        id: String(entry.id || entryId()),
        roleId: String(entry.roleId || "default"),
        category: ["role", "user", "art", "kept"].includes(entry.category) ? entry.category : "art",
        title: String(entry.title || "未命名照片").slice(0, 80),
        note: String(entry.note || "").slice(0, 600),
        date: validDate(entry.date),
        createdAt: Number(entry.createdAt) || Date.now(),
        dataUrl: entry.dataUrl,
        // v387 他自己的相册：谁放的、一句说明、上锁、她新放还没告诉他（只有显式 false 算未读）
        by: entry.by === "char" ? "char" : "user",
        caption: String(entry.caption || "").trim().slice(0, CAPTION_MAX),
        ...(entry.locked === true ? { locked: true } : {}),
        ...(entry.seen === false ? { seen: false } : {}),
        ...(entry.sourceKey ? { sourceKey: String(entry.sourceKey).slice(0, 120) } : {}),
      }));
  }

  async function persist() {
    try {
      await bridge.dbPut(DB_KEY, state.entries);
      window.dispatchEvent(new CustomEvent("jyc:album-updated", { detail: { count: state.entries.length } }));
    } catch (error) {
      console.error("Album save failed", error);
      bridge.toast("相册保存失败：本机空间可能不足");
      throw error;
    }
  }

  function roleEntries() {
    return state.entries.filter((entry) => entry.roleId === roleId());
  }

  function currentList() {
    const list = roleEntries().filter((entry) => (state.category === "all" || entry.category === state.category)
      && (!entry.locked || state.unlocked));
    list.sort((a, b) => state.newestFirst
      ? b.date.localeCompare(a.date) || b.createdAt - a.createdAt
      : a.date.localeCompare(b.date) || a.createdAt - b.createdAt);
    return list;
  }

  function groupByDate(entries) {
    const groups = [];
    const byDate = new Map();
    for (const entry of entries) {
      if (!byDate.has(entry.date)) {
        byDate.set(entry.date, []);
        groups.push(entry.date);
      }
      byDate.get(entry.date).push(entry);
    }
    return groups.map((date) => ({ date, entries: byDate.get(date) }));
  }

  function updateDynamicLabels() {
    $("album-title").textContent = `${roleName()}的相册`;
    $("album-hero-title").textContent = `${roleName()}的相册`;
    $("album-tab-role").textContent = roleName();
    $("album-tab-user").textContent = userName();
    if ($("album-tab-kept")) $("album-tab-kept").textContent = `${roleName()}收的`;
    $("album-category-role").textContent = roleName();
    $("album-category-user").textContent = userName();
  }

  function render() {
    if (!state.ready || !$("album-panel").classList.contains("open")) return;
    updateDynamicLabels();
    state.visible = currentList();
    $("album-count").textContent = `${roleEntries().length} 张`;
    $("album-order").textContent = state.newestFirst ? "最新在前 ↓" : "最早在前 ↑";
    document.querySelectorAll(".album-tab").forEach((button) => {
      const active = button.dataset.albumCategory === state.category;
      button.classList.toggle("active", active);
      button.setAttribute("aria-selected", String(active));
    });
    const timeline = $("album-timeline");
    timeline.replaceChildren();
    const lockedCount = roleEntries().filter((entry) => entry.locked).length;
    $("album-empty").hidden = state.visible.length > 0 || lockedCount > 0;
    if (lockedCount) timeline.appendChild(lockTile(lockedCount));
    for (const group of groupByDate(state.visible)) {
      const section = document.createElement("section");
      section.className = "album-date-group";
      const label = document.createElement("div");
      label.className = "album-date-label";
      label.textContent = formatDate(group.date);
      const grid = document.createElement("div");
      grid.className = "album-grid";
      for (const entry of group.entries) {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "album-card";
        button.setAttribute("aria-label", `查看 ${entry.title}`);
        const thumb = document.createElement("span");
        thumb.className = "album-thumb";
        const image = document.createElement("img");
        image.src = entry.dataUrl;
        image.alt = "";
        image.loading = "lazy";
        thumb.appendChild(image);
        const title = document.createElement("span");
        title.className = "album-card-title";
        title.textContent = entry.title;
        const meta = document.createElement("span");
        meta.className = "album-card-meta";
        meta.textContent = cardMeta(entry);
        if (entry.locked) button.classList.add("locked");
        button.append(thumb, title, meta);
        button.addEventListener("click", () => openViewer(state.visible.findIndex((item) => item.id === entry.id)));
        grid.appendChild(button);
      }
      section.append(label, grid);
      timeline.appendChild(section);
    }
  }

  // v387：谁放的 + 分类；她新放、他还没被告知的标一下。
  function cardMeta(entry) {
    const who = entry.by === "char" ? `${roleName()}收的` : "我放的";
    const kind = entry.category === "kept" ? "" : ` · ${categoryName(entry.category)}`;
    return `${entry.locked ? "🔒 " : ""}${who}${kind}${entry.by === "user" && entry.seen === false ? ` · ${roleName()}还没看到` : ""}`;
  }

  // 上锁那格：密码是他设的（存在角色上）；猜对这次打开，关掉相册就重新锁上。
  function lockTile(count) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "album-lock-tile" + (state.unlocked ? " open" : "");
    const icon = document.createElement("span");
    icon.className = "album-lock-icon";
    icon.textContent = state.unlocked ? "🔓" : "🔒";
    const copy = document.createElement("span");
    copy.className = "album-lock-copy";
    const strong = document.createElement("strong");
    strong.textContent = state.unlocked ? "上锁的照片已打开" : `上锁的 ${count} 张`;
    const small = document.createElement("small");
    small.textContent = state.unlocked ? "点一下重新锁上" : `密码是${roleName()}设的`;
    copy.append(strong, small);
    button.append(icon, copy);
    button.addEventListener("click", tryUnlock);
    return button;
  }

  function tryUnlock() {
    if (state.unlocked) { state.unlocked = false; closeViewer(); render(); return; }
    const code = albumCode();
    if (!code) { alert(`${roleName()}还没设密码，这格谁都打不开。去问问他？`); return; }
    const input = prompt(`上锁的照片。输入${roleName()}的相册密码：`, "");
    if (input == null) return;
    if (input.trim() === code) { state.unlocked = true; render(); bridge.toast("🔓 打开了"); }
    else alert(`密码不对。去哄哄${roleName()}？`);
  }

  async function openPanel() {
    await ready();
    $("album-panel").classList.add("open");
    closeComposer();
    render();
    if (bridge.isMobile()) bridge.closeSidebar();
  }

  function closePanel() {
    state.unlocked = false;
    closeViewer();
    closeComposer();
    $("album-panel").classList.remove("open");
  }

  function openComposer(items) {
    state.pending = Array.isArray(items) ? items : [];
    $("album-form").hidden = false;
    $("album-date").value = localDate();
    $("album-category").value = "role";
    $("album-photo-title").value = state.pending.length === 1 ? String(state.pending[0].name || "").replace(/\.[^.]+$/, "") : "";
    $("album-photo-note").value = "";
    $("album-file-summary").textContent = state.pending.length ? `已选 ${state.pending.length} 张照片` : "选择照片后再保存";
    $("album-form").scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function closeComposer() {
    state.pending = [];
    $("album-form").hidden = true;
    $("album-file").value = "";
  }

  function loadImage(source) {
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error("图片格式暂时无法读取"));
      image.src = source;
    });
  }

  async function sourceToDataUrl(item) {
    if (item.file && item.file.size > MAX_SOURCE_BYTES) throw new Error(`${item.file.name} 超过 35MB`);
    const temporaryUrl = item.file ? URL.createObjectURL(item.file) : "";
    try {
      const source = temporaryUrl || item.dataUrl;
      const image = await loadImage(source);
      const scale = Math.min(1, MAX_EDGE / Math.max(image.naturalWidth || image.width, image.naturalHeight || image.height));
      const width = Math.max(1, Math.round((image.naturalWidth || image.width) * scale));
      const height = Math.max(1, Math.round((image.naturalHeight || image.height) * scale));
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext("2d", { alpha: false });
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, width, height);
      context.drawImage(image, 0, 0, width, height);
      return canvas.toDataURL("image/jpeg", .86);
    } finally {
      if (temporaryUrl) URL.revokeObjectURL(temporaryUrl);
    }
  }

  async function savePending() {
    if (!state.pending.length) {
      bridge.toast("先选择一张照片");
      return;
    }
    const saveButton = $("album-save");
    const previous = saveButton.textContent;
    saveButton.disabled = true;
    saveButton.textContent = "正在整理…";
    const category = $("album-category").value;
    const date = validDate($("album-date").value);
    const customTitle = $("album-photo-title").value.trim();
    const note = $("album-photo-note").value.trim();
    const additions = [];
    try {
      for (let index = 0; index < state.pending.length; index += 1) {
        const item = state.pending[index];
        saveButton.textContent = state.pending.length > 1 ? `整理 ${index + 1}/${state.pending.length}…` : "正在整理…";
        const dataUrl = await sourceToDataUrl(item);
        const filename = String(item.name || "").replace(/\.[^.]+$/, "").trim();
        additions.push({
          id: entryId(),
          roleId: roleId(),
          category,
          title: (customTitle && state.pending.length === 1 ? customTitle : filename) || `${categoryName(category)}的照片`,
          note,
          date,
          createdAt: Date.now() + index,
          dataUrl,
          // v387：她直接放的照片算「我放的」，下一轮用一句说明告诉他（不发图）
          by: "user",
          caption: (customTitle && state.pending.length === 1 ? customTitle : note).slice(0, CAPTION_MAX),
          seen: false,
        });
      }
      state.entries.unshift(...additions);
      await persist();
      closeComposer();
      render();
      bridge.toast(`已放进相册 · ${additions.length} 张`);
    } catch (error) {
      bridge.toast(error?.message || "照片保存失败");
    } finally {
      saveButton.disabled = false;
      saveButton.textContent = previous;
    }
  }

  function openViewer(index) {
    if (index < 0 || index >= state.visible.length) return;
    state.openIndex = index;
    const entry = state.visible[index];
    $("album-view-image").src = entry.dataUrl;
    $("album-view-title").textContent = entry.title;
    $("album-view-meta").textContent = `${cardMeta(entry)} · ${formatDate(entry.date)} · ${index + 1}/${state.visible.length}`;
    $("album-view-note").textContent = entry.note;
    $("album-view-note").hidden = !entry.note;
    $("album-viewer").hidden = false;
    $("album-view-close").focus();
  }

  function closeViewer() {
    $("album-viewer").hidden = true;
    $("album-view-image").removeAttribute("src");
    state.openIndex = -1;
  }

  function stepViewer(delta) {
    if (!state.visible.length) return;
    const next = (state.openIndex + delta + state.visible.length) % state.visible.length;
    openViewer(next);
  }

  async function deleteCurrent() {
    const entry = state.visible[state.openIndex];
    if (!entry || !confirm(`从相册删除「${entry.title}」？\n删除后只能通过之前导出的备份恢复。`)) return;
    state.entries = state.entries.filter((item) => item.id !== entry.id);
    await persist();
    closeViewer();
    render();
    bridge.toast("已从相册删除");
  }

  function downloadCurrent() {
    const entry = state.visible[state.openIndex];
    if (!entry) return;
    const anchor = document.createElement("a");
    anchor.href = entry.dataUrl;
    anchor.download = `${entry.date}-${entry.title.replace(/[\\/:*?\"<>|]/g, "-")}.jpg`;
    anchor.click();
  }

  async function addFromDataUrl(dataUrl, name = "聊天图片") {
    if (typeof dataUrl !== "string" || !dataUrl.startsWith("data:image/")) {
      bridge.toast("这张图片不是可保存的本地图片");
      return;
    }
    await openPanel();
    openComposer([{ dataUrl, name }]);
  }

  async function exportSnapshot() {
    if (!state.ready) await ready();
    return state.entries;
  }

  async function restoreSnapshot(snapshot) {
    if (!state.ready) await ready();
    state.entries = normalizeEntries(snapshot);
    await persist();
    render();
  }

  async function reassignRole(fromRoleId, toRoleId) {
    if (!state.ready) await ready();
    let changed = false;
    for (const entry of state.entries) {
      if (entry.roleId === fromRoleId) {
        entry.roleId = toRoleId;
        changed = true;
      }
    }
    if (changed) await persist();
  }

  function summary(targetRoleId) {
    const list = state.entries.filter((entry) => entry.roleId === String(targetRoleId || roleId()))
      .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt);
    return { loaded: state.ready, count: list.length, latest: list[0] || null };
  }

  // Model access stays behind this role-scoped query instead of exposing the
  // complete album database. The caller receives only the best few matches and
  // decides whether one image needs a vision pass for the current chat turn.
  function findForModel(query, limit = 3) {
    if (!state.ready) return [];
    const raw = String(query || "").trim();
    const needle = raw.toLocaleLowerCase();
    const generic = !needle || /^(?:最新|最近|第一张|相册|照片|看看|随便看看|全部)$/.test(needle);
    const terms = needle.split(/[\s,，、/]+/).filter(Boolean);
    const ranked = roleEntries().filter((entry) => !entry.locked).map((entry) => {
      const title = entry.title.toLocaleLowerCase();
      const note = entry.note.toLocaleLowerCase();
      const date = entry.date.toLocaleLowerCase();
      const category = categoryName(entry.category).toLocaleLowerCase();
      let score = generic ? 1 : 0;
      if (needle && title === needle) score += 100;
      if (needle && title.includes(needle)) score += 45;
      if (needle && note.includes(needle)) score += 24;
      if (needle && (date.includes(needle) || category.includes(needle))) score += 18;
      for (const term of terms) {
        if (title.includes(term)) score += 12;
        if (note.includes(term)) score += 7;
        if (date.includes(term) || category.includes(term)) score += 5;
      }
      return { entry, score };
    }).filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score || b.entry.date.localeCompare(a.entry.date) || b.entry.createdAt - a.entry.createdAt)
      .slice(0, Math.max(1, Math.min(5, Number(limit) || 3)));
    return ranked.map(({ entry }) => ({ ...entry }));
  }

  // ── v387 他自己的相册：给主聊天用的接口（都只碰指定角色的照片）──
  function entriesFor(targetRoleId) {
    if (!state.ready) return [];
    const id = String(targetRoleId || roleId());
    return state.entries.filter((entry) => entry.roleId === id).map((entry) => ({ ...entry }));
  }

  // 他写了 [存相册:…]：把她这轮发来的图压缩后收进来（by:'char'）。返回收了几张。
  async function addFromChat({ roleId: targetRoleId, images, captions, locked } = {}) {
    await ready();
    const id = String(targetRoleId || roleId());
    const have = new Set(state.entries.map((entry) => entry.sourceKey).filter(Boolean));
    const fresh = (images || []).filter((image) => image?.dataUrl && !(image.key && have.has(image.key)));
    if (!fresh.length) return 0;
    const compressed = [];
    for (const image of fresh) {
      try { compressed.push({ key: image.key, dataUrl: await sourceToDataUrl({ dataUrl: image.dataUrl }) }); }
      catch (error) { console.warn("Album compress failed", error); }
    }
    if (!albumAgency()?.newAlbumAdditions) return 0;
    const additions = albumAgency().newAlbumAdditions(state.entries, compressed, captions, { roleId: id, locked: !!locked, now: Date.now(), date: localDate() });
    if (!additions.length) return 0;
    state.entries.unshift(...additions.map((entry) => ({ id: entryId(), ...entry })));
    await persist();
    render();
    return additions.length;
  }

  // [锁照片:词]/[解锁照片:词] + 本轮已告诉他的新照片标成看过。
  async function applyAgencyUpdate({ roleId: targetRoleId, lockTags, seenIds } = {}) {
    await ready();
    const id = String(targetRoleId || roleId());
    let changed = 0;
    if (Array.isArray(lockTags) && lockTags.length) {
      const mine = state.entries.filter((entry) => entry.roleId === id);
      const result = albumAgency()?.applyLockPhotoTags(mine, lockTags) || { entries: mine, changed: 0 };
      if (result.changed) {
        const byId = new Map(result.entries.map((entry) => [entry.id, entry]));
        state.entries = state.entries.map((entry) => byId.get(entry.id) || entry);
        changed += result.changed;
      }
    }
    const seen = new Set(seenIds || []);
    if (seen.size) state.entries = state.entries.map((entry) => {
      if (!seen.has(entry.id) || entry.seen !== false) return entry;
      changed += 1;
      const next = { ...entry };
      delete next.seen;
      return next;
    });
    if (changed) { await persist(); render(); }
    return changed;
  }

  document.querySelectorAll(".album-tab").forEach((button) => button.addEventListener("click", () => {
    state.category = button.dataset.albumCategory;
    render();
  }));
  $("album-order").addEventListener("click", () => { state.newestFirst = !state.newestFirst; render(); });
  $("album-add").addEventListener("click", () => { $("album-file").value = ""; $("album-file").click(); });
  $("album-file").addEventListener("change", (event) => {
    const files = [...(event.target.files || [])].filter((file) => file.type.startsWith("image/"));
    openComposer(files.map((file) => ({ file, name: file.name })));
  });
  $("album-cancel").addEventListener("click", closeComposer);
  $("album-save").addEventListener("click", savePending);
  $("album-close").addEventListener("click", closePanel);
  $("album-view-close").addEventListener("click", closeViewer);
  $("album-view-prev").addEventListener("click", () => stepViewer(-1));
  $("album-view-next").addEventListener("click", () => stepViewer(1));
  $("album-view-delete").addEventListener("click", deleteCurrent);
  $("album-view-download").addEventListener("click", downloadCurrent);
  $("album-viewer").addEventListener("click", (event) => { if (event.target === $("album-viewer")) closeViewer(); });
  document.addEventListener("keydown", (event) => {
    if ($("album-viewer").hidden) return;
    if (event.key === "Escape") closeViewer();
    if (event.key === "ArrowLeft") stepViewer(-1);
    if (event.key === "ArrowRight") stepViewer(1);
  });
  $("sidebar-album")?.addEventListener("click", openPanel);
  window.addEventListener("jyc:role-changed", render);

  let loadPromise;
  function ready() {
    return loadPromise ||= load();
  }
  async function load() {
    try {
      state.entries = normalizeEntries(await bridge.dbGet(DB_KEY));
    } catch (error) {
      console.warn("Album load failed", error);
      state.entries = [];
    }
    state.ready = true;
    render();
    window.dispatchEvent(new CustomEvent("jyc:album-updated"));
  }

  window.JYCAlbum = { open: openPanel, addFromDataUrl, exportSnapshot, restoreSnapshot, reassignRole, summary, entriesFor, addFromChat, applyAgencyUpdate, findForModel, ready: null };
  Object.defineProperty(window.JYCAlbum, "ready", { get: ready });
}
