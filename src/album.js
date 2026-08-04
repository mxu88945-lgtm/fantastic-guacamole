const bridge = window.JYCAlbumBridge;

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
  const categoryName = (category) => category === "role" ? roleName() : category === "user" ? userName() : "画册";
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
        category: ["role", "user", "art"].includes(entry.category) ? entry.category : "art",
        title: String(entry.title || "未命名照片").slice(0, 80),
        note: String(entry.note || "").slice(0, 600),
        date: validDate(entry.date),
        createdAt: Number(entry.createdAt) || Date.now(),
        dataUrl: entry.dataUrl,
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
    const list = roleEntries().filter((entry) => state.category === "all" || entry.category === state.category);
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
    $("album-category-role").textContent = roleName();
    $("album-category-user").textContent = userName();
  }

  function render() {
    if (!state.ready) return;
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
    $("album-empty").hidden = state.visible.length > 0;
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
        meta.textContent = categoryName(entry.category);
        button.append(thumb, title, meta);
        button.addEventListener("click", () => openViewer(state.visible.findIndex((item) => item.id === entry.id)));
        grid.appendChild(button);
      }
      section.append(label, grid);
      timeline.appendChild(section);
    }
  }

  function openPanel() {
    $("album-panel").classList.add("open");
    closeComposer();
    render();
    if (bridge.isMobile()) bridge.closeSidebar();
  }

  function closePanel() {
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
    $("album-view-meta").textContent = `${categoryName(entry.category)} · ${formatDate(entry.date)} · ${index + 1}/${state.visible.length}`;
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

  function addFromDataUrl(dataUrl, name = "聊天图片") {
    if (typeof dataUrl !== "string" || !dataUrl.startsWith("data:image/")) {
      bridge.toast("这张图片不是可保存的本地图片");
      return;
    }
    openPanel();
    openComposer([{ dataUrl, name }]);
  }

  async function exportSnapshot() {
    if (!state.ready) await ready;
    return state.entries;
  }

  async function restoreSnapshot(snapshot) {
    if (!state.ready) await ready;
    state.entries = normalizeEntries(snapshot);
    await persist();
    render();
  }

  async function reassignRole(fromRoleId, toRoleId) {
    if (!state.ready) await ready;
    let changed = false;
    for (const entry of state.entries) {
      if (entry.roleId === fromRoleId) {
        entry.roleId = toRoleId;
        changed = true;
      }
    }
    if (changed) await persist();
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
  $("sidebar-album").addEventListener("click", openPanel);
  window.addEventListener("jyc:role-changed", render);

  const ready = (async () => {
    try {
      state.entries = normalizeEntries(await bridge.dbGet(DB_KEY));
    } catch (error) {
      console.warn("Album load failed", error);
      state.entries = [];
    }
    state.ready = true;
    render();
  })();

  window.JYCAlbum = { open: openPanel, addFromDataUrl, exportSnapshot, restoreSnapshot, reassignRole, ready };
}
