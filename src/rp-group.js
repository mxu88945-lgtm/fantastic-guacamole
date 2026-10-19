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
  function cardRegexRules(card) {
    const raw = card?.extensions?.regex_scripts || card?.extensions?.regexScripts || card?.regex_scripts || card?.regexScripts || [];
    return (Array.isArray(raw) ? raw : []).filter(Boolean).slice(0, 100).map((rule, index) => ({
      id: String(rule.id || rule.script_name || `member-regex-${index}`).slice(0, 120),
      name: String(rule.name || rule.scriptName || rule.script_name || `规则 ${index + 1}`).slice(0, 120),
      findRegex: String(rule.findRegex || rule.find_regex || "").slice(0, 20000),
      replaceString: String(rule.replaceString || rule.replace_string || "").slice(0, 50000),
      placement: Array.isArray(rule.placement) ? rule.placement : [2],
      disabled: Boolean(rule.disabled), promptOnly: Boolean(rule.promptOnly || rule.prompt_only),
    })).filter(rule => rule.findRegex);
  }
  function collect() {
    if (!draft) return;
    draft.groupEnabled = panel.querySelector("#rp-group-enabled").checked;
    draft.replyMode = panel.querySelector("#rp-group-reply-mode").value;
    const userRole = panel.querySelector("#rp-user-role");
    const userIdentity = panel.querySelector("#rp-user-identity");
    const plotText = panel.querySelector("#rp-temporary-plot");
    const plotMode = panel.querySelector("#rp-temporary-mode");
    const plotUses = panel.querySelector("#rp-temporary-uses");
    if (userRole) draft.userRole = userRole.value;
    if (userIdentity) draft.userIdentity = userIdentity.value;
    if (plotText) draft.temporaryPlot = plotText.value;
    if (plotMode) draft.temporaryPlotMode = plotMode.value;
    if (plotUses) draft.temporaryPlotRemainingUses = Math.max(1, Math.min(100, Math.floor(Number(plotUses.value) || 1)));
    const anyMentioned = panel.querySelector("#rp-plot-any-mentioned");
    if (anyMentioned) draft.temporaryPlotRecipientIds = anyMentioned.checked
      ? null
      : [...panel.querySelectorAll("[data-plot-recipient]:checked")].map(input => input.dataset.plotRecipient);
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
    const result = bridge.saveSceneSettings(sceneId, {
      groupEnabled: draft.groupEnabled, replyMode: draft.replyMode, actorAvatar: draft.actorAvatar,
      leadChannel: draft.leadChannel, members: draft.members,
      userRole: draft.userRole, userIdentity: draft.userIdentity,
      temporaryPlot: draft.temporaryPlot, temporaryPlotMode: draft.temporaryPlotMode,
      temporaryPlotRemainingUses: draft.temporaryPlotRemainingUses,
      temporaryPlotRecipientIds: draft.temporaryPlotRecipientIds,
    });
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
    const effectiveId = member.providerId || bridge.currentChannelId?.() || "";
    const selected = profiles.find(profile => profile.id === effectiveId);
    const missing = member.providerId && !selected;
    const models = [...new Set(selected?.models || [])];
    const custom = member.model && !models.includes(member.model) ? `<option value="${escape(member.model)}" selected>${escape(member.model)}（当前）</option>` : "";
    return `<label>接口<select data-field="providerId"><option value="">沿用本窗口接口${selected ? ` · ${escape(selected.name)}` : ""}</option>${missing ? `<option selected value="${escape(member.providerId)}">原接口已移除，请重新选择</option>` : ""}${profiles.map(profile => `<option value="${escape(profile.id)}" ${profile.id === member.providerId ? "selected" : ""}>${escape(profile.name)}</option>`).join("")}</select></label>
      <label>模型<select data-field="model"><option value="">沿用所选接口模型${selected?.model ? ` · ${escape(selected.model)}` : ""}</option>${custom}${models.map(model => `<option value="${escape(model)}" ${model === member.model ? "selected" : ""}>${escape(model)}</option>`).join("")}</select></label>
      <div class="rp-model-tools"><button type="button" data-fetch-models="${escape(member.id)}">↻ 拉取 / 刷新模型</button><small data-model-status="${escape(member.id)}">${selected ? selected.hasModelList ? `已读取 ${models.length} 个模型` : "切换接口后会自动拉取" : "请先选择可用接口"}</small></div>`;
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
    renderTemporaryPlotRecipients();
  }
  function renderTemporaryPlotRecipients() {
    const box = panel.querySelector("#rp-plot-recipients");
    if (!box || !draft) return;
    const members = [{ id: "lead", name: draft.actorName || "舞台主角" }, ...draft.members];
    const allowed = Array.isArray(draft.temporaryPlotRecipientIds) ? draft.temporaryPlotRecipientIds : null;
    box.innerHTML = `<legend>私下接收范围</legend><label class="rp-cast-check"><input type="checkbox" id="rp-plot-any-mentioned" ${allowed === null ? "checked" : ""}>本次 @ 谁就给谁</label>${members.map(member => `<label class="rp-cast-check"><input type="checkbox" data-plot-recipient="${escape(member.id)}" ${allowed?.includes(member.id) ? "checked" : ""} ${allowed === null ? "disabled" : ""}>允许 ${escape(member.name)}（仍需 @）</label>`).join("")}<p class="rp-group-note" id="rp-plot-recipient-note">${allowed?.length === 0 ? "尚未选择接收者：这份安排不会发送给任何角色。" : "未被点名的成员不会看见这份幕后安排。"}</p>`;
  }
  function updateTemporaryPlotMode() {
    const mode = panel.querySelector("#rp-temporary-mode");
    const uses = panel.querySelector("#rp-temporary-uses-wrap");
    if (mode && uses) uses.hidden = mode.value !== "counted";
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
  function setMemoryStatus(message, state = "") {
    const status = panel.querySelector("#rp-memory-action-status");
    if (!status) return;
    status.textContent = message || "";
    if (state) status.dataset.state = state;
    else delete status.dataset.state;
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
      <section id="rp-user-profile"><div class="rp-group-section-head"><h3>用户身份</h3><span class="rp-group-note">仅本剧本</span></div><p class="rp-group-note">这份身份只发给本场共演角色，不会改动顾祁砚本体里的“周惟惟”，也不会串进其他剧本。</p><label>姓名 / 戏内身份<input id="rp-user-role" maxlength="240" value="${escape(draft.userRole || "")}" placeholder="例如：宁梦曦"></label><label>用户身份资料<textarea id="rp-user-identity" rows="8" maxlength="30000" placeholder="填写背景、经历、关系、外貌或这条剧情里需要角色知道的身份资料……">${escape(draft.userIdentity || "")}</textarea></label></section>
      <section id="rp-temporary-section"><div class="rp-group-section-head"><h3>临时剧情</h3><span class="rp-group-note">正文不显示</span></div><p class="rp-group-note">仅本对话生效。群聊只有本轮被你 @ 且符合接收范围的角色能看到；单人剧情直接发送或续演即可。</p><label>生效时长<select id="rp-temporary-mode"><option value="once" ${draft.temporaryPlotMode === "once" ? "selected" : ""}>仅下一次（默认）</option><option value="counted" ${draft.temporaryPlotMode === "counted" ? "selected" : ""}>持续指定次数</option><option value="persistent" ${draft.temporaryPlotMode === "persistent" ? "selected" : ""}>持续到手动结束</option></select></label><label id="rp-temporary-uses-wrap">剩余成功次数<input id="rp-temporary-uses" type="number" min="1" max="100" value="${Number(draft.temporaryPlotRemainingUses) || 3}"></label><fieldset id="rp-plot-recipients" class="rp-plot-recipients"></fieldset><label>幕后安排<textarea id="rp-temporary-plot" rows="12" maxlength="120000" placeholder="例如：让他接到一通紧急电话；或保持缓慢对峙，不急着和解……">${escape(draft.temporaryPlot || "")}</textarea></label><div class="rp-cast-add"><button type="button" data-clear-plot>清空 / 结束</button></div><p class="rp-group-note">成功回复后按次数消耗；失败或停止时保留。持续方向会沿最新进展推进，不要求重复已经发生的事件。</p></section>
      <section id="rp-scene-memory"><div class="rp-group-section-head"><h3>本窗口剧情记忆</h3><button type="button" data-refresh>提取新记忆</button></div><p id="rp-scene-memory-count" class="rp-group-note"></p><p class="rp-group-note">以下手填档案、自动记忆和较早剧情摘要，会随本窗口的后续请求提供给所有共演成员。人物仍需遵守戏内知情范围。本体可回顾最近的共同演出，剧情档案保存在各自剧本里。</p><p id="rp-memory-action-status" class="rp-group-note" role="status" aria-live="polite"></p><details open><summary>手填连续性档案</summary><textarea id="rp-memory-manual" rows="6" maxlength="120000" aria-label="手填连续性档案"></textarea><button type="button" data-save-manual>保存档案</button></details><details open><summary>演出中保存的记忆</summary><div id="rp-memory-list"></div><label>补充一条重要事实<textarea id="rp-memory-new" rows="3" maxlength="1200" placeholder="只记录已经发生的剧情"></textarea></label><button type="button" data-add-memory>添加记忆</button></details><details><summary>较早剧情摘要 · 只读</summary><pre id="rp-memory-summary"></pre></details></section>
      <section class="rp-group-links"><button type="button" data-detail>情景与角色资料 ›</button><button type="button" data-export-scene>导出当前对话 TXT ↓</button><button type="button" data-import-scene>导入对话 TXT · 新建副本 ↑</button><input type="file" id="rp-scene-import-file" accept=".txt,.json,text/plain,application/json" hidden><button type="button" data-home>回到顾祁砚本体主页 ›</button></section></div>
      <footer><small id="rp-group-save-state">成员设置只属于当前窗口</small><button type="button" data-save>保存并返回对戏</button></footer></aside>`;
    panel.hidden = false;
    const apiButton = document.createElement("button");
    apiButton.type = "button";
    apiButton.dataset.api = "";
    apiButton.textContent = "添加 / 管理 API 接口 ›";
    panel.querySelector(".rp-group-links").prepend(apiButton);
    panel.querySelector("[data-home]").textContent = `回到${bridge.role().roleName}本体主页 ›`;
    renderMembers(); renderMemory(); updateTemporaryPlotMode();
    panel.querySelector(".rp-group-drawer").focus();
    queueMicrotask(autoRefreshMissingModels);
  }
  function addMember(kind, card = {}) {
    collect();
    if (draft.members.length >= 8) { bridge.toast("每场最多添加 8 位共演成员"); return; }
    const baseName = card.name || (kind === "director" ? "共演导演" : "新角色");
    const names = new Set([draft.actorName, ...draft.members.map(member => member.name)]);
    let name = baseName, suffix = 2;
    while (names.has(name)) name = `${baseName} ${suffix++}`;
    draft.members.push({ id: memberId(), name, kind, playedByOwner: false, prompt: card.prompt || (kind === "director" ? "负责环境、转场与未加入群聊的 NPC，承接现有剧情，不替用户或其他共演角色发言。" : ""), greeting: card.greeting || "", beautificationProtocol: card.beautificationProtocol || "", regexRules: Array.isArray(card.regexRules) ? card.regexRules : [], avatar: /^(https?:\/\/|data:image\/)/.test(card.avatar || "") ? card.avatar : "", enabled: true, providerId: "", model: "", newMember: true });
    draft.groupEnabled = true; panel.querySelector("#rp-group-enabled").checked = true;
    markDirty(); renderMembers();
  }
  function markDirty() { dirty = true; panel.querySelector("#rp-group-save-state").textContent = "成员设置有修改，关闭时也会保存"; }
  async function refreshMemberModels(id, automatic = false) {
    collect();
    const member = id === "lead" ? draft.leadChannel : draft.members.find(item => item.id === id);
    if (!member) return;
    const profileId = member.providerId || bridge.currentChannelId?.() || "";
    const profile = channels().find(item => item.id === profileId);
    if (!profile) { if (!automatic) bridge.toast("先给这位成员选择一个接口"); return; }
    const revision = draftRevision;
    const button = panel.querySelector(`[data-fetch-models="${CSS.escape(id)}"]`);
    const status = panel.querySelector(`[data-model-status="${CSS.escape(id)}"]`);
    if (button) button.disabled = true;
    if (status) status.textContent = "正在读取模型…";
    try {
      const result = await bridge.pullChannelModels(profileId);
      if (revision !== draftRevision || panel.hidden) return;
      renderMembers();
      bridge.toast(`已从「${result.name}」读取 ${result.models.length} 个模型`);
    } catch (error) {
      if (revision !== draftRevision || panel.hidden) return;
      const nextStatus = panel.querySelector(`[data-model-status="${CSS.escape(id)}"]`);
      if (nextStatus) nextStatus.textContent = `拉取失败 · ${error.message || error}`;
      if (!automatic) bridge.toast(error.message || "模型拉取失败");
    } finally {
      const nextButton = panel.querySelector(`[data-fetch-models="${CSS.escape(id)}"]`);
      if (nextButton) nextButton.disabled = false;
    }
  }
  async function autoRefreshMissingModels() {
    const seen = new Set();
    const members = [{ id: "lead", ...draft.leadChannel }, ...draft.members];
    for (const member of members) {
      if (panel.hidden) return;
      const profileId = member.providerId || bridge.currentChannelId?.() || "";
      const profile = channels().find(item => item.id === profileId);
      if (!profile || profile.hasModelList || seen.has(profileId)) continue;
      seen.add(profileId);
      await refreshMemberModels(member.id, true);
    }
  }
  panel.addEventListener("input", event => {
    if (event.target.closest("[data-member]") || event.target.closest("#rp-user-profile") || event.target.closest("#rp-temporary-section")) markDirty();
  });
  panel.addEventListener("change", async event => {
    if (["rp-group-enabled", "rp-group-reply-mode"].includes(event.target.id) || event.target.closest("[data-member]") || event.target.closest("#rp-user-profile") || event.target.closest("#rp-temporary-section")) markDirty();
    if (event.target.matches('[data-field="providerId"]')) {
      const id = event.target.closest("[data-member]")?.dataset.member;
      collect(); renderMembers();
      const member = id === "lead" ? draft.leadChannel : draft.members.find(item => item.id === id);
      const profileId = member?.providerId || bridge.currentChannelId?.() || "";
      const profile = channels().find(item => item.id === profileId);
      if (id && profile && !profile.hasModelList) await refreshMemberModels(id, true);
      return;
    }
    if (event.target.id === "rp-temporary-mode") updateTemporaryPlotMode();
    if (event.target.id === "rp-plot-any-mentioned") {
      panel.querySelectorAll("[data-plot-recipient]").forEach(input => { input.disabled = event.target.checked; });
      if (event.target.checked) panel.querySelectorAll("[data-plot-recipient]").forEach(input => { input.checked = false; });
    }
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
          const beautificationProtocol = card.extensions?.beautification_protocol || card.beautificationProtocol || "";
          const prompt = [card.description, card.personality, card.scenario, card.mes_example, card.post_history_instructions, beautificationProtocol].filter(value => typeof value === "string").join("\n\n");
          if (!card.name || !prompt) throw new Error("文件中没有人物名字或角色资料");
          addMember("actor", { name: String(card.name), prompt, avatar: card.avatar, greeting: card.first_mes || card.greeting || "", beautificationProtocol, regexRules: cardRegexRules(card) });
        } else addMember("actor", { name: file.name.replace(/\.[^.]+$/, ""), prompt: text });
      } catch (error) { bridge.toast(error.message || "角色卡读取失败"); }
      event.target.value = "";
    }
    if (event.target.id === "rp-scene-import-file") {
      const file = event.target.files[0];
      event.target.value = "";
      if (!file) return;
      try {
        if (file.size > 64000000) throw new Error("剧情文件过大，请使用 64MB 以内的 TXT 或 JSON");
        if (dirty && !save()) return;
        const imported = await bridge.importSceneText(await file.text(), file.name);
        if (imported) { panel.hidden = true; bridge.toast("剧情已作为新副本导入"); bridge.openConversation(imported.id); }
      } catch (error) { bridge.toast(error.message || "剧情文件读取失败"); }
    }
  });
  panel.addEventListener("click", async event => {
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
    else if (button.hasAttribute("data-fetch-models")) refreshMemberModels(button.dataset.fetchModels);
    else if (button.hasAttribute("data-remove")) { collect(); draft.members = draft.members.filter(member => member.id !== button.dataset.remove); markDirty(); renderMembers(); }
    else if (button.hasAttribute("data-clear-plot")) {
      draft.temporaryPlot = ""; draft.temporaryPlotMode = "once"; draft.temporaryPlotRemainingUses = 3; draft.temporaryPlotRecipientIds = null;
      panel.querySelector("#rp-temporary-plot").value = "";
      panel.querySelector("#rp-temporary-mode").value = "once";
      panel.querySelector("#rp-temporary-uses").value = "3";
      markDirty(); renderTemporaryPlotRecipients(); updateTemporaryPlotMode();
    }
    else if (button.hasAttribute("data-refresh")) {
      button.disabled = true;
      const oldLabel = button.textContent;
      button.textContent = "正在提取…";
      setMemoryStatus("正在阅读本窗口最近剧情并提炼既成事实…");
      try {
        const result = await bridge.extractSceneMemories(sceneId);
        renderMemory();
        const message = result.added
          ? `已提取并保存 ${result.added} 条新记忆。`
          : "已检查最近剧情，没有需要新增的记忆。";
        setMemoryStatus(message, "success");
        bridge.toast(message);
      } catch (error) {
        const message = error?.message || "剧情记忆提取失败";
        setMemoryStatus(message, "error");
        bridge.toast(message);
      } finally {
        button.disabled = false;
        button.textContent = oldLabel;
      }
    }
    else if (button.hasAttribute("data-save-manual")) {
      const value = panel.querySelector("#rp-memory-manual").value;
      const saved = bridge.saveSceneSettings(sceneId, { memory: value });
      if (saved) {
        draft.memory = value;
        renderMemory();
        setMemoryStatus("手填连续性档案已保存，聊天位置保持不变。", "success");
        bridge.toast("剧情档案已保存，聊天位置保持不变");
      }
    }
    else if (button.hasAttribute("data-add-memory")) {
      const input = panel.querySelector("#rp-memory-new");
      if (!input.value.trim()) {
        setMemoryStatus("先填写一条已经发生的重要事实。", "error");
        bridge.toast("先填写一条已经发生的重要事实");
      } else if (bridge.editSceneMemory(sceneId, "", input.value)) {
        input.value = "";
        renderMemory();
        setMemoryStatus("这条剧情记忆已经保存。", "success");
        bridge.toast("已添加 1 条剧情记忆");
      }
    } else if (button.hasAttribute("data-memory-save")) {
      if (bridge.editSceneMemory(sceneId, button.dataset.memorySave, button.closest("[data-memory]").querySelector("textarea").value)) {
        renderMemory(); setMemoryStatus("记忆修改已保存。", "success"); bridge.toast("记忆修改已保存");
      }
    }
    else if (button.hasAttribute("data-memory-delete")) {
      if (bridge.editSceneMemory(sceneId, button.dataset.memoryDelete, "")) {
        renderMemory(); setMemoryStatus("这条剧情记忆已删除。", "success"); bridge.toast("剧情记忆已删除");
      }
    }
    else if (button.hasAttribute("data-api")) { close(); if (panel.hidden) bridge.openApiSettings(); }
    else if (button.hasAttribute("data-detail")) { close(); if (panel.hidden) window.JYCRoleplay?.editCurrent(); }
    else if (button.hasAttribute("data-export-scene")) { if (!dirty || save()) bridge.exportSceneTxt(sceneId); }
    else if (button.hasAttribute("data-import-scene")) panel.querySelector("#rp-scene-import-file").click();
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
