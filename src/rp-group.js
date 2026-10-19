import "./rp-group.css";
import "./rp-mentions.js";
import { readRoleplayAvatar } from "./rp-avatar.js";

const bridge = window.JYCRoleplayBridge;
if (bridge) {
  const escape = value => String(value ?? "").replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
  const panel = document.createElement("div");
  panel.className = "rp-group-overlay";
  panel.hidden = true;
  document.body.append(panel);
  let sceneId = "";
  let previousFocus = null;
  let draft = null;
  let dirty = false;
  let library = [];
  let avatarPending = 0;
  let draftRevision = 0;

  const channels = () => bridge.channels();
  const memberId = () => globalThis.crypto?.randomUUID?.() || `cast-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  function collect() {
    if (!draft) return;
    draft.groupEnabled = panel.querySelector("#rp-group-enabled").checked;
    draft.replyMode = panel.querySelector("#rp-group-reply-mode").value;
    panel.querySelectorAll("[data-member]").forEach(row => {
      const member = row.dataset.member === "lead" ? draft.leadChannel : draft.members.find(item => item.id === row.dataset.member);
      if (!member) return;
      row.querySelectorAll("[data-field]").forEach(input => { member[input.dataset.field] = input.type === "checkbox" ? input.checked : input.value; });
    });
  }
  function save() {
    if (avatarPending) { bridge.toast("头像正在处理，稍等一下再保存"); return false; }
    collect();
    if (!draft) return false;
    if (draft.members.some(member => !member.name.trim())) { bridge.toast("给每位成员填一个名字再保存"); return false; }
    const names = [draft.actorName, ...draft.members.map(member => member.name)].map(name => name.trim());
    if (new Set(names).size !== names.length) { bridge.toast("成员名字不能重复，方便用 @ 指定回复"); return false; }
    const result = bridge.saveSceneSettings(sceneId, { groupEnabled: draft.groupEnabled, replyMode: draft.replyMode, actorAvatar: draft.actorAvatar, leadChannel: draft.leadChannel, members: draft.members });
    if (result) { dirty = false; return true; }
    return false;
  }
  function close() {
    if (dirty && !save()) return;
    panel.hidden = true;
    previousFocus?.focus?.();
  }
  function channelFields(member, index) {
    const profiles = channels();
    const selected = profiles.find(profile => profile.id === member.providerId);
    const missing = member.providerId && !selected;
    return `<label>接口<select data-field="providerId"><option value="">沿用本窗口接口</option>${missing ? `<option selected value="${escape(member.providerId)}">原接口已移除，请重新选择</option>` : ""}${profiles.map(profile => `<option value="${escape(profile.id)}" ${profile.id === member.providerId ? "selected" : ""}>${escape(profile.name)}</option>`).join("")}</select></label>
      <label>模型<input data-field="model" list="rp-cast-models-${index}" value="${escape(member.model)}" placeholder="留空沿用所选接口模型"><datalist id="rp-cast-models-${index}">${[...new Set(profiles.flatMap(profile => profile.models))].map(model => `<option value="${escape(model)}"></option>`).join("")}</datalist></label>`;
  }
  function memberHtml(member, index) {
    const lead = member.id === "lead";
    return `<details class="rp-cast-member" data-member="${escape(member.id)}" ${index === 0 || member.newMember ? "open" : ""}>
      <summary><span class="rp-cast-avatar">${member.avatar ? `<img src="${escape(member.avatar)}" alt="">` : escape(member.kind === "director" ? "导" : member.name.slice(0, 1))}</span><span><strong>${escape(member.name)}</strong><small>${lead ? "剧本主角" : member.kind === "director" ? "共演导演" : "共演角色"}</small></span><span class="rp-cast-expand">⌄</span></summary>
      <div class="rp-cast-fields"><label class="rp-cast-check"><input type="checkbox" data-field="enabled" ${member.enabled !== false ? "checked" : ""}>参与每轮回复</label>
      <label class="rp-cast-check"><input type="checkbox" data-field="playedByOwner" ${(lead ? member.playedByOwner !== false : member.playedByOwner === true) ? "checked" : ""}>由 ${escape(bridge.role().roleName)} 出演</label><p class="rp-group-note">开启：保留本体身份和戏外记忆来扮演。关闭：只用这个角色自己的设定与本场剧情资料。主角默认开，其他成员默认关。</p>
      ${lead ? `<p class="rp-group-note">主角人设沿用角色卡，可在“情景与角色资料”中修改。</p>` : `<label>成员名字<input data-field="name" maxlength="80" value="${escape(member.name)}"></label><label>共演身份<select data-field="kind"><option value="actor" ${member.kind !== "director" ? "selected" : ""}>角色</option><option value="director" ${member.kind === "director" ? "selected" : ""}>导演</option></select></label><label>角色卡 / 导演资料<textarea data-field="prompt" rows="6" maxlength="30000" placeholder="人物背景、说话方式、关系或导演分工">${escape(member.prompt)}</textarea></label>`}
      <div class="rp-cast-add"><button type="button" data-avatar-pick="${escape(member.id)}">从相册选择头像</button><button type="button" data-avatar-clear="${escape(member.id)}">移除头像</button><input type="file" accept="image/*" data-avatar-file="${escape(member.id)}" hidden></div>
      ${channelFields(member, index)}${lead ? "" : `<button type="button" class="rp-cast-remove" data-remove="${escape(member.id)}">移出本场共演</button>`}</div></details>`;
  }
  function renderMembers() {
    const lead = { id: "lead", name: draft.actorName || "舞台主角", kind: "actor", ...draft.leadChannel, avatar: draft.actorAvatar || "" };
    const expanded = new Set([...panel.querySelectorAll("[data-member][open]")].map(row => row.dataset.member));
    panel.querySelector("#rp-cast-list").innerHTML = [lead, ...draft.members].map(memberHtml).join("");
    panel.querySelectorAll("[data-member]").forEach(row => { if (expanded.has(row.dataset.member)) row.open = true; });
    panel.querySelector("#rp-cast-count").textContent = String(draft.members.length + 1);
  }
  function renderMemory() {
    const scene = bridge.inspectScene(sceneId);
    if (!scene) return;
    const p = scene.rpProject;
    panel.querySelector("#rp-scene-memory-count").textContent = `${scene.memoryCount} 条档案${scene.summary ? " · 已有较早剧情摘要" : ""}`;
    panel.querySelector("#rp-memory-manual").value = p.memory || "";
    panel.querySelector("#rp-memory-list").innerHTML = p.memories.length ? p.memories.map(entry => `<article class="rp-memory-entry" data-memory="${escape(entry.id)}"><small>${escape(new Date(entry.at).toLocaleString())} · ${entry.sourceMessageId ? "演出中保存" : "手动补充"}</small><textarea rows="3" maxlength="1200" aria-label="剧情记忆">${escape(entry.text)}</textarea><div><button type="button" data-memory-save="${escape(entry.id)}">保存修改</button><button type="button" data-memory-delete="${escape(entry.id)}">删除这条</button></div></article>`).join("") : '<p class="rp-group-note">这场戏还没有保存自动记忆。正文仍会按上下文范围发送；你也可以在下面补充重要事实。</p>';
    panel.querySelector("#rp-memory-summary").textContent = scene.summary || "尚未压缩较早剧情。生成摘要后会在这里显示，并随本窗口的后续请求带上。";
  }
  function open() {
    const current = bridge.current();
    if (!current) return;
    const scene = bridge.inspectScene(current.id);
    if (!scene) return;
    previousFocus = document.activeElement;
    sceneId = scene.id;
    draft = structuredClone(scene.rpProject);
    draftRevision++;
    avatarPending = 0;
    dirty = false;
    library = bridge.castLibrary();
    panel.innerHTML = `<aside class="rp-group-drawer" role="dialog" aria-modal="true" aria-labelledby="rp-group-title" tabindex="-1">
      <header><div><small>共演设置 · 仅本场剧本</small><h2 id="rp-group-title">${escape(scene.title)}</h2></div><button type="button" data-close aria-label="关闭共演设置">×</button></header>
      <div class="rp-group-scroll"><section class="rp-group-stats" aria-label="本次共演"><div><strong>${scene.turns}</strong><span>对话轮数</span></div><div><strong>${scene.replies}</strong><span>角色回复</span></div><div><strong>${scene.messageCount}</strong><span>消息总数</span></div></section>
      <section><div class="rp-group-section-head"><h3>成员（<span id="rp-cast-count"></span>）</h3><label class="rp-cast-check"><input id="rp-group-enabled" type="checkbox" ${draft.groupEnabled ? "checked" : ""}>开启群聊</label></div><label>发言方式<select id="rp-group-reply-mode"><option value="mention" ${draft.replyMode !== "round" ? "selected" : ""}>按 @ 指定；未指定时只由主角回复</option><option value="round" ${draft.replyMode === "round" ? "selected" : ""}>勾选的成员依次回复</option></select></label><p class="rp-group-note">输入 @ 后点选成员，本轮只让选中的人发言。只有选择“依次回复”时，下方的“参与每轮回复”勾选才会生效。</p><div id="rp-cast-list"></div><div class="rp-cast-add"><button type="button" data-add="actor">＋ 添加角色</button><button type="button" data-add="director">＋ 新建导演卡</button><button type="button" data-import>导入角色卡</button></div><label class="rp-cast-library">从角色库添加<select id="rp-cast-library"><option value="">选择已有角色…</option>${library.map((role, index) => `<option value="${index}">${escape(role.name)}</option>`).join("")}</select></label><input type="file" id="rp-cast-file" accept=".json,.txt,.md,application/json,text/plain" hidden></section>
      <section id="rp-scene-memory"><div class="rp-group-section-head"><h3>本窗口剧情记忆</h3><button type="button" data-refresh>刷新档案</button></div><p id="rp-scene-memory-count" class="rp-group-note"></p><p class="rp-group-note">以下手填档案、自动记忆和较早剧情摘要，会随本窗口的后续请求提供给所有共演成员。人物仍需遵守戏内知情范围。本体可回顾最近的共同演出，剧情档案保存在各自剧本里。</p><details open><summary>手填连续性档案</summary><textarea id="rp-memory-manual" rows="6" maxlength="120000" aria-label="手填连续性档案"></textarea><button type="button" data-save-manual>保存档案</button></details><details open><summary>演出中保存的记忆</summary><div id="rp-memory-list"></div><label>补充一条重要事实<textarea id="rp-memory-new" rows="3" maxlength="1200" placeholder="只记录已经发生的剧情"></textarea></label><button type="button" data-add-memory>添加记忆</button></details><details><summary>较早剧情摘要 · 只读</summary><pre id="rp-memory-summary"></pre></details></section>
      <section class="rp-group-links"><button type="button" data-detail>情景与角色资料 ›</button><button type="button" data-home>回到顾祁砚本体主页 ›</button></section></div>
      <footer><small id="rp-group-save-state">成员设置只属于当前窗口</small><button type="button" data-save>保存并返回对戏</button></footer></aside>`;
    panel.hidden = false;
    const apiButton = document.createElement("button");
    apiButton.type = "button";
    apiButton.dataset.api = "";
    apiButton.textContent = "添加 / 管理 API 接口 ›";
    panel.querySelector(".rp-group-links").prepend(apiButton);
    panel.querySelector("[data-home]").textContent = `回到${bridge.role().roleName}本体主页 ›`;
    renderMembers(); renderMemory();
    panel.querySelector(".rp-group-drawer").focus();
  }
  function addMember(kind, card = {}) {
    collect();
    if (draft.members.length >= 8) { bridge.toast("每场最多添加 8 位共演成员"); return; }
    const baseName = card.name || (kind === "director" ? "共演导演" : "新角色");
    const names = new Set([draft.actorName, ...draft.members.map(member => member.name)]);
    let name = baseName, suffix = 2;
    while (names.has(name)) name = `${baseName} ${suffix++}`;
    draft.members.push({ id: memberId(), name, kind, playedByOwner: false, prompt: card.prompt || (kind === "director" ? "负责环境、转场与未加入群聊的 NPC，承接现有剧情，不替用户或其他共演角色发言。" : ""), avatar: /^(https?:\/\/|data:image\/)/.test(card.avatar || "") ? card.avatar : "", enabled: true, providerId: "", model: "", newMember: true });
    draft.groupEnabled = true; panel.querySelector("#rp-group-enabled").checked = true;
    markDirty(); renderMembers();
  }
  function markDirty() { dirty = true; panel.querySelector("#rp-group-save-state").textContent = "成员设置有修改，关闭时也会保存"; }
  panel.addEventListener("input", event => { if (event.target.closest("[data-member]")) markDirty(); });
  panel.addEventListener("change", async event => {
    if (["rp-group-enabled", "rp-group-reply-mode"].includes(event.target.id) || event.target.closest("[data-member]")) markDirty();
    if (event.target.hasAttribute("data-avatar-file")) {
      const file = event.target.files[0], memberId = event.target.dataset.avatarFile;
      event.target.value = "";
      if (!file) return;
      collect();
      const revision = draftRevision;
      avatarPending++;
      try {
        const avatar = await readRoleplayAvatar(file);
        if (revision !== draftRevision) return;
        collect();
        if (memberId === "lead") draft.actorAvatar = avatar;
        else { const member = draft.members.find(item => item.id === memberId); if (!member) return; member.avatar = avatar; }
        markDirty(); renderMembers();
      } catch (error) { bridge.toast(error.message); }
      finally { if (revision === draftRevision) avatarPending--; }
    }
    if (event.target.id === "rp-cast-library" && event.target.value !== "") addMember("actor", library[Number(event.target.value)]);
    if (event.target.id === "rp-cast-file") {
      const file = event.target.files[0];
      if (!file) return;
      try {
        if (file.size > 4000000) throw new Error("角色卡过大，请使用 4MB 以内的文本文件");
        const text = await file.text();
        if (/\.json$/i.test(file.name)) {
          const raw = JSON.parse(text), card = raw.data || raw;
          const prompt = [card.description, card.personality, card.scenario, card.mes_example].filter(value => typeof value === "string").join("\n\n");
          if (!card.name || !prompt) throw new Error("文件中没有人物名字或角色资料");
          addMember("actor", { name: String(card.name), prompt, avatar: card.avatar });
        } else addMember("actor", { name: file.name.replace(/\.[^.]+$/, ""), prompt: text });
      } catch (error) { bridge.toast(error.message || "角色卡读取失败"); }
      event.target.value = "";
    }
  });
  panel.addEventListener("click", event => {
    const button = event.target.closest("button");
    if (!button) { if (event.target === panel) close(); return; }
    if (button.hasAttribute("data-close")) close();
    else if (button.hasAttribute("data-save")) { if (save()) { bridge.toast("共演设置已保存"); close(); } }
    else if (button.hasAttribute("data-add")) addMember(button.dataset.add);
    else if (button.hasAttribute("data-import")) panel.querySelector("#rp-cast-file").click();
    else if (button.hasAttribute("data-avatar-pick")) button.closest("[data-member]").querySelector("[data-avatar-file]").click();
    else if (button.hasAttribute("data-avatar-clear")) {
      collect(); const id = button.dataset.avatarClear;
      if (id === "lead") draft.actorAvatar = "";
      else { const member = draft.members.find(item => item.id === id); if (member) member.avatar = ""; }
      markDirty(); renderMembers();
    }
    else if (button.hasAttribute("data-remove")) { collect(); draft.members = draft.members.filter(member => member.id !== button.dataset.remove); markDirty(); renderMembers(); }
    else if (button.hasAttribute("data-refresh")) renderMemory();
    else if (button.hasAttribute("data-save-manual")) { if (bridge.saveSceneSettings(sceneId, { memory: panel.querySelector("#rp-memory-manual").value })) bridge.toast("剧情档案已保存，聊天位置保持不变"); }
    else if (button.hasAttribute("data-add-memory")) {
      const input = panel.querySelector("#rp-memory-new");
      if (input.value.trim() && bridge.editSceneMemory(sceneId, "", input.value)) { input.value = ""; renderMemory(); }
    } else if (button.hasAttribute("data-memory-save")) { if (bridge.editSceneMemory(sceneId, button.dataset.memorySave, button.closest("[data-memory]").querySelector("textarea").value)) renderMemory(); }
    else if (button.hasAttribute("data-memory-delete")) { if (bridge.editSceneMemory(sceneId, button.dataset.memoryDelete, "")) renderMemory(); }
    else if (button.hasAttribute("data-api")) { close(); if (panel.hidden) bridge.openApiSettings(); }
    else if (button.hasAttribute("data-detail")) { close(); if (panel.hidden) window.JYCRoleplay?.editCurrent(); }
    else if (button.hasAttribute("data-home")) { close(); if (panel.hidden) bridge.exitToHome(); }
  });
  panel.addEventListener("keydown", event => {
    if (event.key === "Escape") { event.stopPropagation(); close(); }
    if (event.key === "Tab") {
      const controls = [...panel.querySelectorAll("button,input,textarea,select,summary")].filter(el => !el.disabled && el.getClientRects().length);
      const first = controls[0], last = controls.at(-1);
      if (event.shiftKey && (document.activeElement === first || document.activeElement === panel.querySelector("aside"))) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    }
  });
  window.addEventListener("jyc:chat-opened", () => { if (bridge.current()?.id !== sceneId) panel.hidden = true; });
  window.addEventListener("jyc:role-changed", () => { panel.hidden = true; });
  window.JYCRoleplayGroup = { open, close };
}
