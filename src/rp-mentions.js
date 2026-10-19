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
    const tools = document.createElement("div");
    tools.className = "rp-mention-tools";
    tools.hidden = true;
    const tags = document.createElement("div");
    tags.className = "rp-mention-tags";
    tags.setAttribute("aria-live", "polite");
    const trigger = document.createElement("button");
    trigger.type = "button";
    trigger.className = "rp-mention-trigger";
    trigger.textContent = "@ 选择回复角色";
    const list = document.createElement("div");
    list.className = "rp-mention-options";
    list.id = "rp-mention-options";
    list.hidden = true;
    list.setAttribute("role", "listbox");
    list.setAttribute("aria-label", "选择本轮发言成员");
    trigger.setAttribute("aria-controls", list.id);
    trigger.setAttribute("aria-expanded", "false");
    tools.append(tags, trigger, list);
    composer.before(tools);
    let ids = [], selectedSceneId = "", query = null, offered = [], activeIndex = 0, explicitOpen = false, composing = false;

    function currentScene() {
      try { const scene = bridge.current(); return scene?.rpProject?.groupEnabled ? scene : null; }
      catch (_) { return null; }
    }
    function members(scene) {
      const p = scene.rpProject;
      return [{ id: "lead", name: p.actorName || "舞台主角", avatar: p.actorAvatar || "", kind: "actor" }, ...(p.members || [])];
    }
    function hide() {
      list.hidden = true; explicitOpen = false;
      trigger.setAttribute("aria-expanded", "false");
      input.setAttribute("aria-expanded", "false");
      input.removeAttribute("aria-activedescendant");
    }
    function renderTags(cast) {
      tags.replaceChildren();
      for (const id of ids) {
        const member = cast.find(item => item.id === id);
        if (!member) continue;
        const chip = document.createElement("button");
        chip.type = "button";
        chip.className = "rp-mention-tag";
        chip.textContent = `@${member.name} ×`;
        chip.setAttribute("aria-label", `取消本轮选择 ${member.name}`);
        chip.onclick = () => { ids = ids.filter(value => value !== id); refresh(); };
        tags.append(chip);
      }
    }
    function refresh() {
      const scene = currentScene();
      tools.hidden = !scene;
      if (!scene) { ids = []; selectedSceneId = ""; hide(); return; }
      if (selectedSceneId !== scene.id) { ids = []; selectedSceneId = scene.id; explicitOpen = false; }
      const cast = members(scene);
      ids = ids.filter(id => cast.some(member => member.id === id));
      renderTags(cast);
      query = mentionQuery(input.value, input.selectionStart ?? input.value.length);
      if ((!query && !explicitOpen) || composing) { hide(); return; }
      offered = cast.filter(member => !ids.includes(member.id) && (!query?.query || member.name.toLowerCase().includes(query.query.toLowerCase())));
      activeIndex = Math.min(activeIndex, Math.max(0, offered.length - 1));
      list.replaceChildren();
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
        const hint = document.createElement("small"); hint.textContent = member.kind === "director" ? "导演" : member.id === "lead" ? "主角" : "共演角色";
        option.append(portrait, name, hint);
        list.append(option);
      });
      list.hidden = false;
      trigger.setAttribute("aria-expanded", "true");
      input.setAttribute("aria-controls", list.id);
      input.setAttribute("aria-expanded", "true");
      input.setAttribute("aria-activedescendant", `rp-mention-option-${activeIndex}`);
    }
    function choose(id) {
      const scene = currentScene();
      if (!scene || !members(scene).some(member => member.id === id)) return;
      const range = mentionQuery(input.value, input.selectionStart ?? input.value.length);
      if (!ids.includes(id)) ids.push(id);
      if (range) {
        input.value = input.value.slice(0, range.start) + input.value.slice(range.end);
        input.setSelectionRange(range.start, range.start);
      }
      hide();
      input.focus();
      input.dispatchEvent(new Event("input", { bubbles: true }));
      refresh();
    }
    trigger.onclick = () => { explicitOpen = list.hidden; activeIndex = 0; refresh(); };
    list.addEventListener("pointerdown", event => event.preventDefault());
    list.addEventListener("click", event => { const option = event.target.closest("[data-mention-id]"); if (option) choose(option.dataset.mentionId); });
    input.addEventListener("input", () => { activeIndex = 0; refresh(); });
    input.addEventListener("click", refresh);
    input.addEventListener("compositionstart", () => { composing = true; hide(); });
    input.addEventListener("compositionend", () => { composing = false; refresh(); });
    input.addEventListener("keydown", event => {
      if (list.hidden || event.isComposing) return;
      if (["ArrowDown", "ArrowUp", "Enter", "Escape", "Tab"].includes(event.key)) {
        event.preventDefault(); event.stopImmediatePropagation();
        if (event.key === "Escape") { hide(); return; }
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
      return scene?.id === selectedSceneId ? ids.filter(id => members(scene).some(member => member.id === id)) : [];
    }, clear, restore: values => {
      const scene = currentScene();
      selectedSceneId = scene?.id || "";
      ids = Array.isArray(values) ? [...new Set(values)] : [];
      hide(); refresh();
    } };
    refresh();
  }
}
