const bridge = window.JYCReadingBridge;

if (!bridge) {
  console.error("Reading-room bridge is unavailable");
} else {
  const $ = (id) => document.getElementById(id);
  const DB_KEY = "readingRoomV1";
  const MAX_BOOK_BYTES = 12 * 1024 * 1024;
  const PAGE_CHARS = 1250;
  let state = { version: 1, books: [], activeByRole: {} };
  let busy = false;
  let autoTimer = 0;

  const role = () => bridge.activeRole();
  const roleId = () => role()?.id || "default";
  const roleName = () => role()?.name || role()?.aiName || "TA";
  const makeId = () => crypto.randomUUID?.() || Date.now().toString(36) + Math.random().toString(36).slice(2);
  const isMobileSpread = () => matchMedia("(max-width: 780px)").matches;
  const pageStep = () => isMobileSpread() ? 1 : 2;

  function normalize(raw) {
    const value = raw && typeof raw === "object" ? raw : {};
    const books = Array.isArray(value.books) ? value.books : [];
    return {
      version: 1,
      activeByRole: value.activeByRole && typeof value.activeByRole === "object" ? value.activeByRole : {},
      books: books.filter((book) => book && typeof book.text === "string").map((book) => ({
        id: String(book.id || makeId()),
        roleId: String(book.roleId || "default"),
        title: String(book.title || "未命名书籍").slice(0, 100),
        author: String(book.author || "").slice(0, 80),
        text: book.text,
        page: Math.max(0, Number(book.page) || 0),
        autoFollow: !!book.autoFollow,
        lastAutoPage: Number.isFinite(Number(book.lastAutoPage)) ? Number(book.lastAutoPage) : -1,
        recap: String(book.recap || "").slice(0, 8000),
        discussions: Array.isArray(book.discussions) ? book.discussions.slice(-120).map((item) => ({
          id: String(item.id || makeId()), page: Math.max(0, Number(item.page) || 0),
          question: String(item.question || "").slice(0, 500), answer: String(item.answer || "").slice(0, 5000),
          createdAt: Number(item.createdAt) || Date.now(), type: item.type === "auto" ? "auto" : "talk",
        })) : [],
        createdAt: Number(book.createdAt) || Date.now(), updatedAt: Number(book.updatedAt) || Date.now(),
      })),
    };
  }

  async function persist() {
    await bridge.dbPut(DB_KEY, state);
    window.dispatchEvent(new CustomEvent("jyc:reading-updated", { detail: { roleId: roleId() } }));
  }

  function roleBooks(targetRoleId) {
    const id = String(targetRoleId || roleId());
    return state.books.filter((book) => book.roleId === id).sort((a, b) => b.updatedAt - a.updatedAt);
  }

  function activeBook() {
    const books = roleBooks();
    const wanted = state.activeByRole[roleId()];
    return books.find((book) => book.id === wanted) || books[0] || null;
  }

  function paginate(text) {
    const clean = String(text || "").replace(/\r\n?/g, "\n").replace(/\n{4,}/g, "\n\n\n").trim();
    if (!clean) return [""];
    const paragraphs = clean.split(/\n{2,}/).map((part) => part.trim()).filter(Boolean);
    const pages = [];
    let page = "";
    const flush = () => { if (page.trim()) pages.push(page.trim()); page = ""; };
    for (const paragraph of paragraphs) {
      if (paragraph.length > PAGE_CHARS) {
        flush();
        let offset = 0;
        while (offset < paragraph.length) {
          let end = Math.min(paragraph.length, offset + PAGE_CHARS);
          if (end < paragraph.length) {
            const window = paragraph.slice(offset + Math.floor(PAGE_CHARS * .72), end);
            const stop = Math.max(window.lastIndexOf("。"), window.lastIndexOf("！"), window.lastIndexOf("？"), window.lastIndexOf("\n"));
            if (stop >= 0) end = offset + Math.floor(PAGE_CHARS * .72) + stop + 1;
          }
          pages.push(paragraph.slice(offset, end).trim());
          offset = end;
        }
      } else if (!page || page.length + paragraph.length + 2 <= PAGE_CHARS) {
        page += (page ? "\n\n" : "") + paragraph;
      } else {
        flush(); page = paragraph;
      }
    }
    flush();
    return pages.length ? pages : [clean];
  }

  function bookPages(book) { return paginate(book?.text || ""); }
  function clampPage(book, value) {
    const pages = bookPages(book);
    return Math.min(Math.max(0, Number(value) || 0), Math.max(0, pages.length - 1));
  }

  function avatar(target, value, name) {
    target.replaceChildren();
    if (/^(?:data:image\/|blob:|https?:\/\/)/i.test(String(value || ""))) {
      const image = new Image(); image.src = value; image.alt = name || "角色头像"; target.appendChild(image);
    } else target.textContent = [...String(value || name || "角")][0] || "角";
  }

  function renderLibrary() {
    const books = roleBooks();
    const current = activeBook();
    $("reading-library-role").textContent = `${roleName()}的书架`;
    $("reading-library-empty").hidden = books.length > 0;
    const list = $("reading-book-list"); list.replaceChildren();
    for (const book of books) {
      const pages = bookPages(book);
      const progress = pages.length ? Math.round((Math.min(book.page + pageStep(), pages.length) / pages.length) * 100) : 0;
      const button = document.createElement("button"); button.type = "button";
      button.className = "reading-book-item" + (current?.id === book.id ? " active" : "");
      const cover = document.createElement("span"); cover.className = "reading-book-cover"; cover.textContent = [...book.title][0] || "书";
      const title = document.createElement("strong"); title.textContent = book.title;
      const meta = document.createElement("small"); meta.textContent = `${book.author || "未署名"} · ${pages.length} 页`;
      const status = document.createElement("em"); status.textContent = `${progress}% · ${book.discussions.length} 条读书记忆`;
      button.append(cover, title, meta, status);
      button.addEventListener("click", () => {
        state.activeByRole[roleId()] = book.id; book.updatedAt = Date.now(); persist(); render();
        $("reading-room-panel").querySelector(".reading-room-shell").classList.remove("library-open");
      });
      list.appendChild(button);
    }
  }

  function renderMemory(book) {
    $("reading-memory-count").textContent = `${book.discussions.length} 条`;
    $("reading-recap-view").textContent = book.recap ? `【剧情回顾】\n${book.recap}` : "";
    const list = $("reading-memory-list"); list.replaceChildren();
    for (const item of [...book.discussions].reverse().slice(0, 30)) {
      const row = document.createElement("article"); row.className = "reading-memory-entry";
      const meta = document.createElement("small"); meta.textContent = `第 ${item.page + 1} 页 · ${item.type === "auto" ? "TA 主动跟读" : "当前页讨论"}`;
      const copy = document.createElement("p"); copy.textContent = item.answer;
      row.append(meta, copy); list.appendChild(row);
    }
  }

  function renderReply(book) {
    const latest = book.discussions[book.discussions.length - 1];
    const box = $("reading-companion-reply"); box.classList.remove("loading");
    const p = document.createElement("p");
    p.textContent = latest?.answer || "翻到想聊的地方，就把这一页递给他。";
    box.replaceChildren(p);
  }

  function render() {
    clearTimeout(autoTimer);
    const currentRole = role();
    const name = roleName();
    $("reading-room-title").textContent = `⌇ ${name}的陪读书房`;
    $("reading-empty-role").textContent = name;
    $("reading-role-name").textContent = `${name} 正陪你读`;
    avatar($("reading-role-avatar"), currentRole?.aiAvatar, name);
    renderLibrary();
    const book = activeBook();
    $("reading-empty-stage").hidden = !!book;
    $("reading-stage").hidden = !book;
    if (!book) return;

    const pages = bookPages(book);
    book.page = clampPage(book, book.page);
    $("reading-book-title").textContent = book.title;
    $("reading-book-author").textContent = book.author || "未署名";
    $("reading-auto").checked = book.autoFollow;
    $("reading-page-left").textContent = pages[book.page] || "";
    $("reading-page-left-number").textContent = book.page + 1;
    $("reading-page-right").textContent = pages[book.page + 1] || "";
    $("reading-page-right-number").textContent = Math.min(book.page + 2, pages.length);
    $("reading-progress-label").textContent = `第 ${book.page + 1} / ${pages.length} 页`;
    $("reading-page-jump").max = pages.length;
    $("reading-page-jump").value = book.page + 1;
    $("reading-prev").disabled = book.page <= 0;
    $("reading-next").disabled = book.page + pageStep() >= pages.length;
    renderReply(book); renderMemory(book);
  }

  async function decodeBook(file) {
    if (!file || file.size > MAX_BOOK_BYTES) throw new Error(`${file?.name || "文件"} 超过 12MB`);
    const buffer = await file.arrayBuffer();
    let text = new TextDecoder("utf-8").decode(buffer);
    const bad = (text.match(/�/g) || []).length;
    if (bad > Math.max(2, text.length * .002)) {
      try { text = new TextDecoder("gb18030").decode(buffer); } catch (_) {}
    }
    return text.replace(/^\uFEFF/, "").trim();
  }

  async function importFiles(files) {
    const incoming = [...(files || [])];
    if (!incoming.length) return;
    let added = 0;
    for (const file of incoming) {
      try {
        const text = await decodeBook(file);
        if (!text) continue;
        const filename = file.name.replace(/\.(?:txt|md|markdown)$/i, "") || "未命名书籍";
        const first = text.split(/\n/).map((line) => line.replace(/^#+\s*/, "").trim()).find((line) => line && line.length <= 60);
        const title = first && first !== filename && /^#{1,3}\s/.test(text.trim()) ? first : filename;
        const book = { id: makeId(), roleId: roleId(), title, author: "", text, page: 0, autoFollow: false,
          lastAutoPage: -1, recap: "", discussions: [], createdAt: Date.now(), updatedAt: Date.now() };
        state.books.push(book); state.activeByRole[roleId()] = book.id; added++;
      } catch (error) { bridge.toast(error.message || "书籍导入失败"); }
    }
    if (added) { await persist(); render(); bridge.toast(`已放进 ${added} 本书`); }
  }

  function movePage(direction) {
    const book = activeBook(); if (!book || busy) return;
    const pages = bookPages(book);
    book.page = clampPage(book, book.page + direction * pageStep());
    book.updatedAt = Date.now(); persist(); render();
    if (book.autoFollow && book.lastAutoPage !== book.page) scheduleAutoFollow(book);
  }

  function scheduleAutoFollow(book) {
    clearTimeout(autoTimer);
    autoTimer = setTimeout(() => {
      if (activeBook()?.id === book.id && book.autoFollow && book.lastAutoPage !== book.page) talk("", "auto");
    }, 900);
  }

  function currentPagePayload(book) {
    const pages = bookPages(book);
    const visible = pages.slice(book.page, book.page + pageStep()).join("\n\n—— 翻页 ——\n\n");
    return {
      bookId: book.id, title: book.title, author: book.author, page: book.page,
      pageCount: pages.length, pageText: visible.slice(0, 7000), recap: book.recap,
      recent: book.discussions.slice(-4).map((item) => `第${item.page + 1}页：${item.answer}`).join("\n").slice(0, 3000),
    };
  }

  async function talk(question, type) {
    const book = activeBook(); if (!book || busy) return;
    const prompt = String(question || "").trim() || (type === "auto"
      ? "你先读这一页，像真的坐在我旁边陪读一样，主动说说此刻最想和我分享的内容。"
      : "陪我聊聊这一页，说说你最在意的地方。知晓需要思考，但不要像写书评一样生硬。");
    busy = true;
    const reply = $("reading-companion-reply"); reply.classList.add("loading"); reply.innerHTML = "<p>他正在读这一页……</p>";
    document.querySelectorAll(".reading-companion-actions button").forEach((button) => { button.disabled = true; });
    try {
      const answer = await bridge.ask({ ...currentPagePayload(book), question: prompt, type });
      if (!answer) throw new Error("这次没有收到回复");
      book.discussions.push({ id: makeId(), page: book.page, question: prompt, answer, createdAt: Date.now(), type: type === "auto" ? "auto" : "talk" });
      book.discussions = book.discussions.slice(-120);
      book.lastAutoPage = book.page; book.updatedAt = Date.now();
      $("reading-question").value = "";
      await persist(); render();
    } catch (error) {
      reply.classList.remove("loading"); reply.innerHTML = "";
      const p = document.createElement("p"); p.textContent = error.message || "陪读回复失败"; reply.appendChild(p);
      bridge.toast(error.message || "陪读回复失败");
    } finally {
      busy = false;
      document.querySelectorAll(".reading-companion-actions button").forEach((button) => { button.disabled = false; });
    }
  }

  async function updateRecap() {
    const book = activeBook(); if (!book || busy) return;
    busy = true; $("reading-recap").disabled = true;
    try {
      const pages = bookPages(book);
      const start = Math.max(0, book.page - 7);
      const excerpt = pages.slice(start, Math.min(pages.length, book.page + pageStep()))
        .map((text, index) => `【第 ${start + index + 1} 页】\n${text}`).join("\n\n").slice(0, 11000);
      const recap = await bridge.recap({ title: book.title, page: book.page, pageCount: pages.length, excerpt, previous: book.recap });
      if (!recap) throw new Error("这次没有生成回顾");
      book.recap = recap; book.updatedAt = Date.now(); await persist(); render(); $("reading-memory").open = true;
      bridge.toast("剧情回顾已经更新");
    } catch (error) { bridge.toast(error.message || "剧情回顾失败"); }
    finally { busy = false; $("reading-recap").disabled = false; }
  }

  function openPanel() {
    render(); $("reading-room-panel").classList.add("open");
  }
  function closePanel() {
    clearTimeout(autoTimer); $("reading-room-panel").classList.remove("open");
    $("reading-room-panel").querySelector(".reading-room-shell").classList.remove("library-open");
    window.dispatchEvent(new CustomEvent("jyc:reading-updated", { detail: { roleId: roleId() } }));
  }

  function summary(targetRoleId) {
    const books = roleBooks(targetRoleId);
    const activeId = state.activeByRole[String(targetRoleId || roleId())];
    const book = books.find((item) => item.id === activeId) || books[0] || null;
    if (!book) return { count: books.length, active: null };
    const pages = bookPages(book);
    return { count: books.length, active: { title: book.title, progress: Math.round((Math.min(book.page + pageStep(), pages.length) / pages.length) * 100) } };
  }

  async function exportSnapshot() { await ready; return state; }
  async function restoreSnapshot(snapshot) { await ready; state = normalize(snapshot); await persist(); render(); }
  async function reassignRole(fromRoleId, toRoleId) {
    await ready; let changed = false;
    state.books.forEach((book) => { if (book.roleId === fromRoleId) { book.roleId = toRoleId; changed = true; } });
    if (state.activeByRole[fromRoleId] && !state.activeByRole[toRoleId]) state.activeByRole[toRoleId] = state.activeByRole[fromRoleId];
    delete state.activeByRole[fromRoleId];
    if (changed) await persist();
  }

  $("reading-room-close").addEventListener("click", closePanel);
  $("reading-import").addEventListener("click", () => $("reading-file").click());
  $("reading-empty-import").addEventListener("click", () => $("reading-file").click());
  $("reading-file").addEventListener("change", async (event) => { await importFiles(event.target.files); event.target.value = ""; });
  $("reading-library-toggle").addEventListener("click", () => $("reading-room-panel").querySelector(".reading-room-shell").classList.toggle("library-open"));
  $("reading-prev").addEventListener("click", () => movePage(-1));
  $("reading-next").addEventListener("click", () => movePage(1));
  $("reading-page-jump").addEventListener("change", (event) => {
    const book = activeBook(); if (!book) return; book.page = clampPage(book, Number(event.target.value) - 1); book.updatedAt = Date.now(); persist(); render();
    if (book.autoFollow && book.lastAutoPage !== book.page) scheduleAutoFollow(book);
  });
  $("reading-auto").addEventListener("change", (event) => {
    const book = activeBook(); if (!book) return; book.autoFollow = event.target.checked; book.updatedAt = Date.now(); persist();
    if (book.autoFollow && book.lastAutoPage !== book.page) scheduleAutoFollow(book);
  });
  $("reading-talk").addEventListener("click", () => talk($("reading-question").value, "talk"));
  $("reading-follow").addEventListener("click", () => talk("", "auto"));
  $("reading-recap").addEventListener("click", updateRecap);
  $("reading-open-chat").addEventListener("click", () => { closePanel(); bridge.openChat(); });
  $("reading-delete").addEventListener("click", async () => {
    const book = activeBook(); if (!book || !confirm(`从书架删除《${book.title}》？读书进度和讨论也会一起删除。`)) return;
    state.books = state.books.filter((item) => item.id !== book.id); delete state.activeByRole[roleId()]; await persist(); render();
  });
  window.addEventListener("resize", () => { if ($("reading-room-panel").classList.contains("open")) render(); });
  window.addEventListener("jyc:role-changed", () => { if ($("reading-room-panel").classList.contains("open")) render(); });

  const ready = (async () => {
    try { state = normalize(await bridge.dbGet(DB_KEY)); }
    catch (error) { console.warn("Reading room load failed", error); state = normalize(null); }
    render();
  })();

  window.JYCReadingRoom = { open: openPanel, close: closePanel, summary, exportSnapshot, restoreSnapshot, reassignRole, ready };
}
