const bridge = window.JYCRoleplayBridge;

if (!bridge) {
  console.error("RP theater bridge is unavailable");
} else {
  const $ = (id) => document.getElementById(id);
  const state = { editingId: "", files: [], greetings: [""], selectedGreeting: 0 };

  function safeText(value, max = 200000) {
    return String(value || "").replace(/\u0000/g, "").slice(0, max);
  }

  function escapeHtml(value) {
    return safeText(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\"/g, "&quot;");
  }

  function greetingList(data = {}) {
    const source = Array.isArray(data.greetings)
      ? data.greetings
      : [data.opening, ...(Array.isArray(data.alternateGreetings) ? data.alternateGreetings : [])];
    const list = source.map((item) => safeText(item, 300000)).filter((item, index) => item.trim() || index === 0).slice(0, 24);
    return list.length ? list : [""];
  }

  function plainPreview(value) {
    return safeText(value, 300000)
      .replace(/```(?:html)?/gi, " ").replace(/```/g, " ")
      .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
      .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
      .replace(/<[^>]+>/g, " ").replace(/&nbsp;/gi, " ")
      .replace(/&lt;/gi, "<").replace(/&gt;/gi, ">").replace(/&amp;/gi, "&")
      .replace(/\s+/g, " ").trim();
  }

  function richGreetingSource(value) {
    const source = safeText(value, 300000).trim();
    const fenced = source.match(/^```(?:html)?\s*([\s\S]*?)\s*```$/i);
    return fenced ? fenced[1].trim() : source;
  }

  function looksLikeRichGreeting(value) {
    return /<!doctype\s+html|<html\b|<head\b|<body\b|<style\b|<script\b/i.test(richGreetingSource(value));
  }

  function greetingPreviewDocument(value) {
    const source = richGreetingSource(value);
    const guard = `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data: https:; media-src data: https:; font-src data: https:; style-src 'unsafe-inline' https:; script-src 'unsafe-inline'; connect-src 'none'; frame-src 'none'; form-action 'none'; base-uri 'none'">`;
    const base = `<style>html,body{height:auto!important;min-height:0!important;overflow-x:hidden!important}body{margin:0!important}*{box-sizing:border-box;max-width:100%}</style>`;
    if (/<head\b[^>]*>/i.test(source)) return source.replace(/<head\b[^>]*>/i, (match) => `${match}${guard}${base}`);
    if (/<html\b[^>]*>/i.test(source)) return source.replace(/<html\b[^>]*>/i, (match) => `${match}<head>${guard}${base}</head>`);
    return `<!doctype html><html><head>${guard}${base}</head><body>${source}</body></html>`;
  }

  function commitGreetingDraft() {
    const field = $("rp-field-opening");
    if (!field) return;
    state.greetings[state.selectedGreeting] = safeText(field.value, 300000);
  }

  function renderGreetingPreview() {
    commitGreetingDraft();
    const holder = $("rp-greeting-preview-content");
    const value = state.greetings[state.selectedGreeting] || "";
    if (!value.trim()) {
      holder.innerHTML = '<div class="rp-greeting-preview-empty">这里还没有内容。</div>';
    } else if (looksLikeRichGreeting(value)) {
      holder.innerHTML = '<iframe class="rp-greeting-preview-frame" title="开场白美化预览" sandbox="allow-scripts"></iframe>';
      holder.querySelector("iframe").srcdoc = greetingPreviewDocument(value);
    } else {
      holder.innerHTML = `<div class="rp-greeting-preview-text">${escapeHtml(value).replace(/\n/g, "<br>")}</div>`;
    }
  }

  function selectGreeting(index) {
    commitGreetingDraft();
    state.selectedGreeting = Math.max(0, Math.min(Number(index) || 0, state.greetings.length - 1));
    $("rp-field-opening").value = state.greetings[state.selectedGreeting] || "";
    renderGreetings();
  }

  function renderGreetings() {
    const list = $("rp-greeting-list");
    $("rp-greeting-count").textContent = `${state.greetings.length} 条开场白 · 已选第 ${state.selectedGreeting + 1} 条`;
    list.innerHTML = state.greetings.map((value, index) => {
      const preview = plainPreview(value) || "空白开场，可直接在下方编辑";
      return `<article class="rp-greeting-card${index === state.selectedGreeting ? " selected" : ""}" data-rp-greeting="${index}">
        <button type="button" class="rp-greeting-select" data-rp-greeting-select="${index}"><b>开场 ${index + 1}</b><span>${escapeHtml(preview.slice(0, 108))}</span></button>
        ${state.greetings.length > 1 ? `<button type="button" class="rp-greeting-remove" data-rp-greeting-remove="${index}" aria-label="删除第 ${index + 1} 条开场白">×</button>` : ""}
      </article>`;
    }).join("");
    list.querySelectorAll("[data-rp-greeting-select]").forEach((button) => button.addEventListener("click", () => selectGreeting(button.dataset.rpGreetingSelect)));
    list.querySelectorAll("[data-rp-greeting-remove]").forEach((button) => button.addEventListener("click", () => {
      commitGreetingDraft();
      const index = Number(button.dataset.rpGreetingRemove);
      state.greetings.splice(index, 1);
      state.selectedGreeting = Math.max(0, Math.min(state.selectedGreeting - (index < state.selectedGreeting ? 1 : 0), state.greetings.length - 1));
      $("rp-field-opening").value = state.greetings[state.selectedGreeting] || "";
      renderGreetings();
    }));
  }

  function formatTime(value) {
    if (!value) return "刚刚";
    try {
      return new Date(value).toLocaleString("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });
    } catch (_) {
      return "最近更新";
    }
  }

  function panelMarkup() {
    const section = document.createElement("section");
    section.id = "rp-theater-panel";
    section.className = "rp-theater-panel";
    section.hidden = true;
    section.innerHTML = `
      <div class="rp-theater-shell">
        <header class="rp-theater-head">
          <button type="button" class="rp-icon-button" id="rp-theater-close" aria-label="关闭 RP 剧场">‹</button>
          <div><strong>RP 剧场</strong><small id="rp-theater-subtitle">本体在线，陪你入戏</small></div>
          <div><button type="button" class="rp-head-action" id="rp-home-exit">本体主页</button><button type="button" class="rp-head-action" id="rp-new-project">＋ 新剧本</button></div>
        </header>
        <main class="rp-theater-body">
          <section class="rp-theater-hero">
            <span class="rp-hero-kicker">ROLEPLAY · SHARED MEMORY</span>
            <h1><span id="rp-hero-role">TA</span> 本人陪你演戏</h1>
            <p>戏外关系与共同记忆保持连通；舞台人物、事件和感情只属于对应剧本，不会覆盖本体。</p>
            <div class="rp-memory-lanes">
              <span><b>本体记忆</b><em>双向可读</em></span>
              <i>→</i>
              <span><b>共同演出</b><em>知道演过</em></span>
              <i>→</i>
              <span><b>剧本档案</b><em>戏内隔离</em></span>
            </div>
          </section>

          <section id="rp-library-view">
            <div class="rp-section-title"><div><strong>你的剧场</strong><small id="rp-project-count">0 个剧本</small></div><button type="button" id="rp-import-project">导入角色卡</button></div>
            <input id="rp-import-file" type="file" accept=".json,.txt,.md,.markdown,application/json,text/*" hidden />
            <div class="rp-project-grid" id="rp-project-list"></div>
            <div class="rp-empty" id="rp-project-empty" hidden><span>◇</span><strong>还没有剧本</strong><p>新建一部，或直接导入惟镜使用的 JSON／文本角色卡。</p><button type="button" id="rp-empty-create">创建第一个剧本</button></div>
          </section>

          <section id="rp-editor-view" hidden>
            <div class="rp-editor-heading"><button type="button" id="rp-editor-back">‹ 返回剧场</button><div><strong id="rp-editor-title">新建剧本</strong><small>所有内容自动保存在这个剧本里</small></div></div>
            <div class="rp-editor-grid">
              <label><span>剧目名称</span><input id="rp-field-title" maxlength="80" placeholder="例如：镜澜湾三号院" /></label>
              <label><span>TA 在戏里扮演谁</span><input id="rp-field-actor" maxlength="80" placeholder="例如：虞山行" /></label>
              <label class="rp-wide"><span>你在戏里的身份</span><input id="rp-field-user-role" maxlength="240" placeholder="例如：宁梦曦；留空也可以在开场时说明" /></label>
              <label class="rp-wide"><span>角色卡 / 人物设定</span><textarea id="rp-field-character" rows="9" placeholder="身份、性格、经历、行为逻辑、关系边界、说话方式……"></textarea></label>
              <label class="rp-wide"><span>世界观与长期剧情背景</span><textarea id="rp-field-world" rows="7" placeholder="时代、地点、组织、人物关系、已经发生的事实……"></textarea></label>
              <label class="rp-wide"><span>当前场景</span><textarea id="rp-field-scenario" rows="5" placeholder="现在的时间、地点、在场人物和关系阶段。这里是本场唯一有效的现在时锚点。"></textarea></label>
              <label class="rp-wide"><span>临时剧情推进</span><textarea id="rp-field-temporary" rows="4" placeholder="可随时修改或清空；只代表接下来想推进的方向，不算已经发生。"></textarea></label>
              <section class="rp-wide rp-greeting-editor">
                <div class="rp-greeting-head"><div><strong>开场白</strong><small id="rp-greeting-count">1 条开场白</small></div><div><button type="button" id="rp-add-greeting">＋ 添加开场</button><button type="button" id="rp-preview-greeting">预览当前</button></div></div>
                <div class="rp-greeting-list" id="rp-greeting-list"></div>
                <label><span>当前选中的完整内容</span><textarea id="rp-field-opening" rows="12" placeholder="可保存多条开场白；选择其中一条作为新场次的开头。支持完整 HTML 美化卡片。"></textarea></label>
                <details class="rp-greeting-preview" id="rp-greeting-preview"><summary>美化预览</summary><div id="rp-greeting-preview-content"></div></details>
              </section>
              <label class="rp-wide"><span>本剧本连续性记忆</span><textarea id="rp-field-memory" rows="5" placeholder="戏内专属档案。模型保存的剧情记忆会进入这里，不写进 TA 的本体记忆。"></textarea></label>
            </div>
            <section class="rp-files-card">
              <div><strong>补充资料</strong><small>TXT、Markdown、JSON 等，只绑定本剧本</small></div>
              <button type="button" id="rp-add-files">＋ 添加资料</button>
              <input id="rp-files-input" type="file" accept=".json,.txt,.md,.markdown,.csv,.log,.xml,.yml,.yaml,text/*,application/json" multiple hidden />
              <div id="rp-files-list" class="rp-files-list"></div>
            </section>
            <aside class="rp-identity-note"><strong>身份保护已锁定</strong><p id="rp-identity-copy">TA 始终知道自己是谁。入戏时完整扮演舞台角色；你说“暂停”“出戏”或“停止扮演”时，由 TA 本人接话。</p></aside>
            <div class="rp-editor-actions"><button type="button" id="rp-save-only">保存剧本</button><button type="button" class="primary" id="rp-save-enter">保存并开始对戏</button></div>
          </section>
        </main>
      </div>`;
    document.body.appendChild(section);
  }

  panelMarkup();

  function projectFiles(project) {
    return Array.isArray(project?.projectFiles) ? project.projectFiles.map((file) => ({ ...file })) : [];
  }

  function currentDraft() {
    commitGreetingDraft();
    return {
      title: $("rp-field-title").value.trim(),
      actorName: $("rp-field-actor").value.trim(),
      userRole: $("rp-field-user-role").value.trim(),
      characterPrompt: $("rp-field-character").value.trim(),
      world: $("rp-field-world").value.trim(),
      scenario: $("rp-field-scenario").value.trim(),
      temporaryPlot: $("rp-field-temporary").value.trim(),
      opening: (state.greetings[state.selectedGreeting] || "").trim(),
      greetings: state.greetings.map((item) => safeText(item, 300000)),
      openingIndex: state.selectedGreeting,
      alternateGreetings: state.greetings.filter((_, index) => index !== state.selectedGreeting),
      memory: $("rp-field-memory").value.trim(),
      projectFiles: state.files.map((file) => ({ ...file })),
    };
  }

  function fillEditor(project) {
    const data = project?.rpProject || project || {};
    state.editingId = project?.id || "";
    state.files = projectFiles(project);
    $("rp-field-title").value = safeText(data.title || project?.title || "", 80);
    $("rp-field-actor").value = safeText(data.actorName || "", 80);
    $("rp-field-user-role").value = safeText(data.userRole || "", 240);
    $("rp-field-character").value = safeText(data.characterPrompt);
    $("rp-field-world").value = safeText(data.world);
    $("rp-field-scenario").value = safeText(data.scenario);
    $("rp-field-temporary").value = safeText(data.temporaryPlot);
    state.greetings = greetingList(data);
    state.selectedGreeting = Math.max(0, Math.min(Number(data.openingIndex) || 0, state.greetings.length - 1));
    $("rp-field-opening").value = state.greetings[state.selectedGreeting] || "";
    $("rp-field-memory").value = safeText(data.memory);
    $("rp-editor-title").textContent = state.editingId ? "编辑剧本" : "新建剧本";
    renderFiles();
    renderGreetings();
    $("rp-greeting-preview").open = false;
  }

  function showLibrary() {
    $("rp-library-view").hidden = false;
    $("rp-editor-view").hidden = true;
    state.editingId = "";
    render();
  }

  function showEditor(project) {
    fillEditor(project || null);
    $("rp-library-view").hidden = true;
    $("rp-editor-view").hidden = false;
    $("rp-theater-panel").querySelector(".rp-theater-body").scrollTop = 0;
    requestAnimationFrame(() => $("rp-field-title").focus());
  }

  function renderFiles() {
    const list = $("rp-files-list");
    if (!state.files.length) {
      list.innerHTML = '<span class="rp-files-empty">暂无补充资料</span>';
      return;
    }
    list.innerHTML = state.files.map((file) => `<div><span>▧</span><p><strong>${escapeHtml(file.name || "未命名资料")}</strong><small>${Number(file.size || safeText(file.text).length).toLocaleString()} 字节</small></p><button type="button" data-rp-file-remove="${escapeHtml(file.id)}" aria-label="移除资料">×</button></div>`).join("");
    list.querySelectorAll("[data-rp-file-remove]").forEach((button) => button.addEventListener("click", () => {
      state.files = state.files.filter((file) => file.id !== button.dataset.rpFileRemove);
      renderFiles();
    }));
  }

  function render() {
    const info = bridge.role();
    const projects = bridge.list();
    $("rp-hero-role").textContent = info.roleName || "TA";
    $("rp-theater-subtitle").textContent = `${info.roleName || "TA"} 本体在线 · 陪你入戏`;
    $("rp-identity-copy").textContent = `${info.roleName || "TA"} 始终知道自己是谁。入戏时完整扮演舞台角色；你说“暂停”“出戏”或“停止扮演”时，由 ${info.roleName || "TA"} 本人接话。`;
    $("rp-project-count").textContent = `${projects.length} 个剧本`;
    $("rp-project-empty").hidden = projects.length > 0;
    const list = $("rp-project-list");
    list.innerHTML = projects.map((project) => {
      const actor = project.rpProject?.actorName || "未命名角色";
      const userRole = project.rpProject?.userRole ? `你演 ${project.rpProject.userRole}` : "你的戏内身份待定";
      return `<article class="rp-project-card" data-rp-project="${escapeHtml(project.id)}">
        <span class="rp-project-mark">${escapeHtml([...actor][0] || "剧")}</span>
        <div class="rp-project-copy"><small>RP PROJECT · ${escapeHtml(formatTime(project.updatedAt))}</small><strong>${escapeHtml(project.title || "未命名剧本")}</strong><p>${escapeHtml(info.roleName || "TA")} 演 ${escapeHtml(actor)} · ${escapeHtml(userRole)}</p><em>${project.messageCount || 0} 条正文 · ${project.memoryCount || 0} 条剧情记忆</em></div>
        <button type="button" class="rp-continue" data-rp-open="${escapeHtml(project.id)}">继续对戏</button>
        <div class="rp-project-menu"><button type="button" data-rp-edit="${escapeHtml(project.id)}">编辑</button><button type="button" data-rp-duplicate="${escapeHtml(project.id)}">新场次</button><button type="button" class="danger" data-rp-delete="${escapeHtml(project.id)}">删除</button></div>
      </article>`;
    }).join("");
    list.querySelectorAll("[data-rp-open]").forEach((button) => button.addEventListener("click", () => enter(button.dataset.rpOpen)));
    list.querySelectorAll("[data-rp-edit]").forEach((button) => button.addEventListener("click", () => showEditor(bridge.get(button.dataset.rpEdit))));
    list.querySelectorAll("[data-rp-duplicate]").forEach((button) => button.addEventListener("click", () => {
      const copy = bridge.duplicate(button.dataset.rpDuplicate);
      render();
      bridge.toast(`已为《${copy?.title || "剧本"}》开启新场次`);
    }));
    list.querySelectorAll("[data-rp-delete]").forEach((button) => button.addEventListener("click", () => {
      const project = bridge.get(button.dataset.rpDelete);
      if (!project || !confirm(`删除 RP 剧本「${project.title || "未命名剧本"}」？\n这会删除它的聊天正文和戏内记忆。`)) return;
      bridge.remove(project.id);
      render();
    }));
  }

  function open(projectId) {
    $("rp-theater-panel").hidden = false;
    $("rp-theater-panel").classList.add("open");
    document.body.classList.add("rp-theater-open");
    if (projectId) showEditor(bridge.get(projectId)); else showLibrary();
    if (bridge.isMobile()) bridge.closeSidebar();
  }

  function close() {
    $("rp-theater-panel").classList.remove("open");
    $("rp-theater-panel").hidden = true;
    document.body.classList.remove("rp-theater-open");
  }

  function enter(id) {
    close();
    bridge.openConversation(id);
  }

  function validateDraft(draft) {
    if (!draft.title) { bridge.toast("先给这部戏起个名字"); $("rp-field-title").focus(); return false; }
    if (!draft.actorName) { bridge.toast(`写下 ${bridge.role().roleName || "TA"} 在戏里扮演谁`); $("rp-field-actor").focus(); return false; }
    if (!draft.characterPrompt && !draft.projectFiles.length) { bridge.toast("至少填写人物设定，或导入一份角色卡"); $("rp-field-character").focus(); return false; }
    return true;
  }

  function save(shouldEnter) {
    const draft = currentDraft();
    if (!validateDraft(draft)) return;
    const project = state.editingId ? bridge.update(state.editingId, draft) : bridge.create(draft);
    if (!project) { bridge.toast("剧本保存失败，请重试"); return; }
    state.editingId = project.id;
    bridge.toast("剧本已保存");
    window.dispatchEvent(new CustomEvent("jyc:roleplay-updated"));
    if (shouldEnter) enter(project.id); else showLibrary();
  }

  function worldBookText(book) {
    const entries = book?.entries;
    if (!entries || typeof entries !== "object") return "";
    return Object.values(entries).map((entry) => entry?.content || "").filter(Boolean).join("\n\n");
  }

  function importCharacterCard(raw, filename) {
    let parsed = null;
    try { parsed = JSON.parse(raw); } catch (_) {}
    if (!parsed || typeof parsed !== "object") {
      showEditor({ rpProject: { title: filename.replace(/\.[^.]+$/, ""), characterPrompt: raw }, projectFiles: [] });
      return;
    }
    const data = parsed.data && typeof parsed.data === "object" ? parsed.data : parsed;
    const name = safeText(data.name || parsed.name || filename.replace(/\.[^.]+$/, ""), 80);
    const characterPrompt = [
      data.description && `【人物背景】\n${data.description}`,
      data.personality && `【性格与行为】\n${data.personality}`,
      data.creator_notes && `【创作者备注】\n${data.creator_notes}`,
      data.system_prompt && `【角色卡补充指令】\n${data.system_prompt}`,
      data.mes_example && `【对话示例】\n${data.mes_example}`,
      data.post_history_instructions && `【续写要求】\n${data.post_history_instructions}`,
      data.extensions?.beautification_protocol && `【输出与美化协议】\n${data.extensions.beautification_protocol}`,
    ].filter(Boolean).join("\n\n");
    const world = [worldBookText(data.character_book), worldBookText(parsed.character_book)].filter(Boolean).join("\n\n");
    const firstGreeting = data.first_mes || data.greeting || parsed.first_mes || parsed.greeting || "";
    const alternateGreetings = [
      ...(Array.isArray(data.alternate_greetings) ? data.alternate_greetings : []),
      ...(Array.isArray(parsed.alternate_greetings) ? parsed.alternate_greetings : []),
    ];
    const greetings = [firstGreeting, ...alternateGreetings].map((item) => safeText(item, 300000)).filter((item, index) => item.trim() || index === 0).slice(0, 24);
    showEditor({ rpProject: {
      title: name ? `${name}的故事` : filename.replace(/\.[^.]+$/, ""),
      actorName: name,
      characterPrompt,
      world,
      scenario: safeText(data.scenario),
      opening: greetings[0] || "",
      greetings,
      openingIndex: 0,
      alternateGreetings: greetings.slice(1),
    }, projectFiles: [] });
    bridge.toast(`已读取角色卡：${name || filename} · ${greetings.length} 条开场白`);
  }

  async function readFiles(files, asImport) {
    for (const file of [...(files || [])]) {
      if (file.size > 1024 * 1024) { bridge.toast(`${file.name} 超过 1MB，请拆分后再导入`); continue; }
      const text = await file.text();
      if (asImport) {
        importCharacterCard(text, file.name || "角色卡");
        return;
      }
      const existing = state.files.findIndex((item) => item.name === file.name);
      const entry = { id: existing >= 0 ? state.files[existing].id : (crypto.randomUUID?.() || `${Date.now()}-${Math.random()}`), name: file.name || "未命名资料.txt", size: file.size || text.length, mediaType: file.type || "text/plain", text, updatedAt: Date.now() };
      if (existing >= 0) state.files.splice(existing, 1, entry); else state.files.push(entry);
    }
    renderFiles();
  }

  $("rp-theater-close").addEventListener("click", close);
  $("rp-home-exit").addEventListener("click", () => bridge.exitToHome());
  $("rp-new-project").addEventListener("click", () => showEditor());
  $("rp-empty-create").addEventListener("click", () => showEditor());
  $("rp-editor-back").addEventListener("click", showLibrary);
  $("rp-save-only").addEventListener("click", () => save(false));
  $("rp-save-enter").addEventListener("click", () => save(true));
  $("rp-add-greeting").addEventListener("click", () => {
    commitGreetingDraft();
    state.greetings.push("");
    state.selectedGreeting = state.greetings.length - 1;
    $("rp-field-opening").value = "";
    renderGreetings();
    $("rp-field-opening").focus();
  });
  $("rp-preview-greeting").addEventListener("click", () => {
    renderGreetingPreview();
    $("rp-greeting-preview").open = true;
    $("rp-greeting-preview").scrollIntoView({ behavior: "smooth", block: "nearest" });
  });
  $("rp-field-opening").addEventListener("input", () => {
    state.greetings[state.selectedGreeting] = safeText($("rp-field-opening").value, 300000);
  });
  $("rp-import-project").addEventListener("click", () => $("rp-import-file").click());
  $("rp-import-file").addEventListener("change", async (event) => { await readFiles(event.target.files, true); event.target.value = ""; });
  $("rp-add-files").addEventListener("click", () => $("rp-files-input").click());
  $("rp-files-input").addEventListener("change", async (event) => { await readFiles(event.target.files, false); event.target.value = ""; });
  $("rp-theater-panel").addEventListener("click", (event) => { if (event.target === $("rp-theater-panel")) close(); });
  document.addEventListener("keydown", (event) => { if (event.key === "Escape" && !$("rp-theater-panel").hidden) close(); });
  window.addEventListener("jyc:role-changed", () => { if (!$("rp-theater-panel").hidden) showLibrary(); });
  window.addEventListener("jyc:roleplay-updated", () => { if (!$("rp-theater-panel").hidden && !$("rp-library-view").hidden) render(); });
  window.addEventListener("jyc:roleplay-open", (event) => open(event.detail?.projectId || ""));

  window.JYCRoleplay = {
    open,
    close,
    editCurrent() {
      const current = bridge.current();
      open(current?.id || "");
    },
    summary: () => ({ count: bridge.list().length }),
  };
}
