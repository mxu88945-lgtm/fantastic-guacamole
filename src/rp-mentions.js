export function mentionQuery(text, cursor = text.length) {
  const before = text.slice(0, cursor);
  const match = before.match(/[@＠]([^@＠\s]*)$/u);
  if (!match) return null;
  const start = before.length - match[0].length;
  if (start && /[A-Za-z0-9_.]/.test(text[start - 1])) return null;
  return { start, end: cursor, query: match[1] };
}

if (typeof document !== "undefined" && window.JYCRoleplayBridge) {
  const bridge = window.JYCRoleplayBridge;
  const input = document.getElementById("input");
  const composer = input?.closest(".composer");
  if (input && composer) {
    const defaultPlaceholder = input.placeholder || "写点什么…";
    const tools = document.createElement("div");
    tools.className = "rp-mention-tools";
    tools.hidden = true;
    const list = document.createElement("div");
    list.className = "rp-mention-options";
    list.id = "rp-mention-options";
    list.hidden = true;
    list.setAttribute("role", "listbox");
    list.setAttribute("aria-label", "选择本轮发言成员");
    // 惟镜式底部面板：挂在 body 上，带遮罩、标题和关闭按钮。
    const backdrop = document.createElement("div");
    backdrop.className = "rp-mention-backdrop";
    tools.append(backdrop, list);
    document.body.append(tools);
    const touchUI = () => { try { return window.matchMedia("(hover: none) and (pointer: coarse)").matches; } catch (_) { return false; } };
    let ids = [], selectedSceneId = "", query = null, offered = [], activeIndex = 0, composing = false, dismissedKey = "";

    function currentScene() {
      try { const scene = bridge.current(); return scene?.rpProject?.groupEnabled ? scene : null; }
      catch (_) { return null; }
    }
    function members(scene) {
      const p = scene.rpProject;
      return [{ id: "lead", name: p.actorName || "舞台主角", avatar: p.actorAvatar || "", kind: "actor" }, ...(p.members || [])];
    }
    function dismiss() {
      const range = mentionQuery(input.value, input.selectionStart ?? input.value.length);
      dismissedKey = range ? `${input.value}|${range.start}` : "";
      hide();
    }
    function hide() {
      document.documentElement.classList.remove("rp-mention-open");
      list.hidden = true;
      tools.hidden = true;
      input.setAttribute("aria-expanded", "false");
      input.removeAttribute("aria-activedescendant");
    }
    function selectedFromText(cast) {
      const selected = [];
      for (const match of input.value.matchAll(/[@＠]/gu)) {
        const start = (match.index || 0) + match[0].length;
        const member = cast.filter(item => input.value.startsWith(item.name, start)).sort((a, b) => b.name.length - a.name.length)[0];
        if (member && !selected.includes(member.id)) selected.push(member.id);
      }
      return selected;
    }
    function refresh() {
      const scene = currentScene();
      input.placeholder = scene ? "输入 @ 选择回答的角色……" : defaultPlaceholder;
      if (!scene) { ids = []; selectedSceneId = ""; hide(); return; }
      const cast = members(scene);
      if (selectedSceneId && selectedSceneId !== scene.id) {
        for (const member of cast) input.value = input.value.replace(new RegExp(`[@＠]${member.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*`, "gu"), "");
      }
      if (selectedSceneId !== scene.id) { ids = []; selectedSceneId = scene.id; }
      ids = selectedFromText(cast);
      query = mentionQuery(input.value, input.selectionStart ?? input.value.length);
      if (!query || composing) { hide(); return; }
      if (dismissedKey && dismissedKey === `${input.value}|${query.start}`) { hide(); return; }
      dismissedKey = "";
      const wasHidden = list.hidden;
      offered = cast.filter(member => !query.query || member.name.toLowerCase().includes(query.query.toLowerCase()));
      activeIndex = Math.min(activeIndex, Math.max(0, offered.length - 1));
      list.replaceChildren();
      const head = document.createElement("div"); head.className = "rp-mention-head";
      const title = document.createElement("strong"); title.textContent = "选择 @ 的角色";
      const close = document.createElement("button"); close.type = "button"; close.className = "rp-mention-close"; close.dataset.mentionClose = "1"; close.setAttribute("aria-label", "关闭"); close.textContent = "×";
      head.append(title, close);
      list.append(head);
      if (!offered.length) {
        const empty = document.createElement("p"); empty.textContent = "没有匹配的成员，可在右侧群聊设置中添加"; list.append(empty);
      }
      offered.forEach((member, index) => {
        const option = document.createElement("button");
        option.type = "button"; option.id = `rp-mention-option-${index}`; option.dataset.mentionId = member.id;
        option.setAttribute("role", "option"); option.setAttribute("aria-selected", String(index === activeIndex));
        const portrait = document.createElement("span"); portrait.className = "rp-mention-portrait";
        if (/^(https?:\/\/|data:image\/)/.test(member.avatar || "")) { const image = document.createElement("img"); image.src = member.avatar; image.alt = ""; portrait.append(image); }
        else portrait.textContent = member.name.slice(0, 1);
        const name = document.createElement("span"); name.textContent = member.name;
        name.className = "rp-mention-name";
        option.append(portrait, name);
        list.append(option);
      });
      tools.hidden = false;
      list.hidden = false;
      document.documentElement.classList.add("rp-mention-open");
      // 手机上像惟镜一样先收起键盘，让面板从屏幕底部完整升起。
      if (wasHidden && touchUI() && document.activeElement === input) input.blur();
      input.setAttribute("aria-controls", list.id);
      input.setAttribute("aria-expanded", "true");
      input.setAttribute("aria-activedescendant", `rp-mention-option-${activeIndex}`);
    }
    function choose(id) {
      const scene = currentScene();
      if (!scene || !members(scene).some(member => member.id === id)) return;
      const range = mentionQuery(input.value, input.selectionStart ?? input.value.length);
      const member = members(scene).find(item => item.id === id);
      if (range) {
        const token = `@${member.name} `;
        input.value = input.value.slice(0, range.start) + token + input.value.slice(range.end);
        const cursor = range.start + token.length;
        input.setSelectionRange(cursor, cursor);
      }
      hide();
      input.focus();
      input.dispatchEvent(new Event("input", { bubbles: true }));
      refresh();
    }
    list.addEventListener("pointerdown", event => event.preventDefault());
    backdrop.addEventListener("pointerdown", event => event.preventDefault());
    backdrop.addEventListener("click", event => { event.preventDefault(); dismiss(); });
    list.addEventListener("click", event => { if (event.target.closest("[data-mention-close]")) { dismiss(); return; } const option = event.target.closest("[data-mention-id]"); if (option) choose(option.dataset.mentionId); });
    input.addEventListener("input", () => { activeIndex = 0; refresh(); });
    input.addEventListener("click", refresh);
    input.addEventListener("compositionstart", () => { composing = true; hide(); });
    input.addEventListener("compositionend", () => { composing = false; refresh(); });
    input.addEventListener("keydown", event => {
      if (list.hidden || event.isComposing) return;
      if (["ArrowDown", "ArrowUp", "Enter", "Escape", "Tab"].includes(event.key)) {
        event.preventDefault(); event.stopImmediatePropagation();
        if (event.key === "Escape") { dismiss(); return; }
        if ((event.key === "Enter" || event.key === "Tab") && offered[activeIndex]) { choose(offered[activeIndex].id); return; }
        if (event.key === "ArrowDown") activeIndex = (activeIndex + 1) % Math.max(1, offered.length);
        if (event.key === "ArrowUp") activeIndex = (activeIndex + offered.length - 1) % Math.max(1, offered.length);
        refresh();
      }
    }, true);
    document.addEventListener("pointerdown", event => { if (event.target !== input && !tools.contains(event.target)) hide(); });
    function clear() { ids = []; hide(); refresh(); }
    for (const event of ["jyc:app-ready", "jyc:chat-opened", "jyc:role-changed", "jyc:roleplay-updated"]) window.addEventListener(event, refresh);
    window.JYCRoleplayMentions = { selectedIds: () => {
      const scene = currentScene();
      return scene?.id === selectedSceneId ? selectedFromText(members(scene)) : [];
    }, clear, restore: values => {
      const scene = currentScene();
      selectedSceneId = scene?.id || "";
      const cast = scene ? members(scene) : [];
      ids = Array.isArray(values) ? [...new Set(values)].filter(id => cast.some(member => member.id === id)) : [];
      const prefix = ids.map(id => `@${cast.find(member => member.id === id).name}`).join(" ");
      if (prefix) input.value = `${prefix} ${input.value}`.trimStart();
      hide(); refresh();
    } };
    refresh();
  }
}
