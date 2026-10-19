const bridge = window.JYCRoleplayBridge;

if (!bridge) {
  console.error("RP theater bridge is unavailable");
} else {
  const $ = (id) => document.getElementById(id);
  const state = { editingId: "", files: [], greetings: [""], selectedGreeting: 0, repairTargetId: "", tags: [], worldEntries: [], regexRules: [] };
  const openingState = { projectId: "", index: 0, forceNew: true };

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
    const list = source.map((item) => safeText(item, 300000)).slice(0, 24);
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

// === 开场白美化：解析 [播放：] / SCENE CONTEXT / 对话气泡 ===
function parseOpeningMedia(text) {
  // [播放：歌名|歌手|URL|0] 或 [播放: 歌名 | 歌手 | URL | 0]
  const m = safeText(text).match(/\[播放[:：]\s*([^|\]]+)\|([^|\]]+)\|([^|\]]+)(?:\|[^\]]*)?\]/);
  if (!m) return null;
  return { title: m[1].trim(), artist: m[2].trim(), url: m[3].trim() };
}
function stripOpeningMedia(text) {
  return safeText(text).replace(/\[播放[:：][^\]]+\]/g, '').trim();
}
function parseSceneContext(text) {
  const lines = safeText(text).split(/\r?\n/);
  const scene = {};
  const rest = [];
  const keys = { '时间': 'time', '地点': 'place', '在场人物': 'cast', '氛围': 'mood' };
  for (const line of lines) {
    const m = line.match(/^\s*(时间|地点|在场人物|氛围)[:：]\s*(.+?)\s*$/);
    if (m && !scene[keys[m[1]]]) { scene[keys[m[1]]] = m[2]; }
    else rest.push(line);
  }
  return { scene, rest: rest.join('\n').trim() };
}
function parseRuleRegex(source) {
  const trimmed = String(source || "").trim();
  if (!trimmed) return null;
  if (trimmed.startsWith("/")) {
    const lastSlash = trimmed.lastIndexOf("/");
    if (lastSlash > 0) {
      try { return new RegExp(trimmed.slice(1, lastSlash), trimmed.slice(lastSlash + 1).includes("g") ? trimmed.slice(lastSlash + 1) : trimmed.slice(lastSlash + 1) + "g"); } catch (_) { return null; }
    }
  }
  try { return new RegExp(trimmed, "g"); } catch (_) { return null; }
}
function applyRegexRules(text, rules) {
  let output = String(text || "");
  for (const rule of rules || []) {
    if (rule.disabled || !rule.findRegex || rule.promptOnly) continue;
    if (Array.isArray(rule.placement) && rule.placement.length && !rule.placement.includes(2)) continue;
    try {
      const regex = parseRuleRegex(rule.findRegex);
      if (!regex) continue;
      output = output.replace(regex, String(rule.replaceString || "").replace(/\{\{match\}\}/gi, "$$&"));
    } catch (_) {}
  }
  return output;
}
function beautifyOpeningHTML(value) {
  const raw = safeText(value, 300000).trim();
  if (!raw) return '';
  // 标记为富文本，让 looksLikeRichGreeting 能识别
  const media = parseOpeningMedia(raw);
  let body = stripOpeningMedia(raw);
  const { scene, rest } = parseSceneContext(body);
  body = rest;
  let html = '';
  if (media) {
    html += `<div class="rp-beauty-music"><span class="rp-beauty-music-icon">♪</span><div><strong>${escapeHtml(media.title)}</strong><small>${escapeHtml(media.artist)}</small></div>${/^https?:\/\//.test(media.url) ? `<audio controls preload="none" src="${escapeHtml(media.url)}"></audio>` : ''}</div>`;
  }
  const sceneKeys = [['time', '时间'], ['place', '地点'], ['cast', '在场人物'], ['mood', '氛围']];
  if (sceneKeys.some(([k]) => scene[k])) {
    html += `<div class="rp-beauty-scene"><div class="rp-beauty-scene-title">SCENE CONTEXT</div>${sceneKeys.filter(([k]) => scene[k]).map(([k, label]) => `<p><b>${label}：</b>${escapeHtml(scene[k])}</p>`).join('')}</div>`;
  }
  // 按段落切分："…" 引号包裹的算对话气泡，其余算旁白
  const paras = body.split(/\n\s*\n/).map(s => s.trim()).filter(Boolean);
  for (const para of paras) {
    const dm = para.match(/^[“"「]([\s\S]+)[”"」]$/);
    if (dm) {
      html += `<div class="rp-beauty-dialogue">${escapeHtml(dm[1].trim())}</div>`;
    } else {
      // 段落内夹杂的引号对话也抽出来
      const parts = para.split(/([“"「][^”"」]+[”"」])/g).filter(s => s.trim());
      if (parts.length > 1) {
        for (const part of parts) {
          const qm = part.match(/^[“"「]([\s\S]+)[”"」]$/);
          if (qm) html += `<div class="rp-beauty-dialogue">${escapeHtml(qm[1].trim())}</div>`;
          else html += `<p class="rp-beauty-narr">${escapeHtml(part.trim()).replace(/\n/g, '<br>')}</p>`;
        }
      } else {
        html += `<p class="rp-beauty-narr">${escapeHtml(para).replace(/\n/g, '<br>')}</p>`;
      }
    }
  }
  return `<style>.rp-beauty{padding:20px;font-size:14px;line-height:1.8}.rp-beauty-music{display:flex;align-items:center;gap:12px;margin-bottom:18px;padding:12px 16px;border-radius:16px;background:#f0edf8}.rp-beauty-music-icon{width:38px;height:38px;display:grid;place-items:center;border-radius:50%;background:#7c6bd6;color:#fff;font-size:18px;flex-shrink:0}.rp-beauty-music strong,.rp-beauty-music small{display:block}.rp-beauty-music strong{font-size:13px}.rp-beauty-music small{color:#888;font-size:11px;margin-top:2px}.rp-beauty-music audio{margin-left:auto;max-width:200px;height:32px}.rp-beauty-scene{margin-bottom:18px;padding:16px 18px;border-left:4px solid #7c6bd6;border-radius:0 14px 14px 0;background:#f6f6f8}.rp-beauty-scene-title{font-size:10px;font-weight:800;letter-spacing:2px;color:#888;margin-bottom:10px}.rp-beauty-scene p{margin:6px 0;font-size:13px}.rp-beauty-narr{margin:0 0 14px}.rp-beauty-dialogue{display:inline-block;margin:6px 0 14px;padding:10px 16px;border-radius:16px;background:#e8e4f8;color:#5a4fc4;font-size:14px;line-height:1.7}</style><div class="rp-beauty">${html}</div>`;
}
function beautifyWorldHTML(value) {
  const raw = safeText(value, 100000).trim();
  if (!raw) return '';
  const paras = raw.split(/\n\s*\n/).map(s => s.trim()).filter(Boolean);
  let html = '';
  for (const para of paras) {
    // 以【】或「」开头的算小标题
    const hm = para.match(/^[【「]([^】」]+)[】」]\s*([\s\S]*)$/);
    if (hm) {
      html += `<h4 class="rp-beauty-world-h">${escapeHtml(hm[1].trim())}</h4>`;
      if (hm[2].trim()) html += `<p class="rp-beauty-narr">${escapeHtml(hm[2].trim()).replace(/\n/g, '<br>')}</p>`;
    } else {
      html += `<p class="rp-beauty-narr">${escapeHtml(para).replace(/\n/g, '<br>')}</p>`;
    }
  }
  return `<div class="rp-beauty">${html}</div>`;
}
function plainPreviewWithMedia(value) {
  const media = parseOpeningMedia(value);
  const text = plainPreview(stripOpeningMedia(value));
  return (media ? `♪ ${media.title} - ${media.artist} ` : '') + text;
}

  function richGreetingSource(value) {
    const source = safeText(value, 300000).trim();
    const fenced = source.match(/^```(?:html)?[^\S\r\n]*\r?\n([\s\S]*?)\r?\n```(?:\s|$)/i);
    return fenced ? fenced[1].trim() : source;
  }

  function looksLikeRichGreeting(value) {
    return /<!doctype\s+html|<html\b|<head\b|<body\b|<style\b|<script\b/i.test(richGreetingSource(value));
  }
  // 惟镜同款：存储里永远是原始开场白；显示时才跑角色卡正则。
  // 正则产出的是 HTML（音乐播放器、状态栏等）就直接整段渲染，绝不再拿去做引号气泡（会把 HTML 属性当对白）。
  function displayGreeting(value, rules) {
    const raw = safeText(value, 300000);
    if (!raw.trim() || looksLikeRichGreeting(raw)) return raw;
    const regexed = applyRegexRules(raw, rules);
    if (looksLikeRichGreeting(regexed)) return regexed.replace(/```(?:html)?[^\S\r\n]*\r?\n?/gi, "");
    if (/\[播放[:：]/.test(regexed) || /[“"「][^”"」]{2,}[”"」]/.test(regexed)) return beautifyOpeningHTML(regexed) || regexed;
    return regexed;
  }
  function isCorruptedGreeting(value) {
    return /class="rp-beauty"/.test(value || "") && /&lt;(?:!doctype|html|div|style)/i.test(value || "");
  }
  function isOpeningMenu(value) {
    return /\bLOCAL_SCENES\b|\bfunction\s+jumpToScene\b|选择你的剧本/.test(String(value || ""));
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

  function renderWorldPreview() {
    const holder = $("rp-world-preview-content");
    const value = $("rp-field-world") ? $("rp-field-world").value : "";
    holder.innerHTML = beautifyWorldHTML(value) || '<div class="rp-greeting-preview-empty">还没有写世界观。</div>';
  }
  function renderGreetingPreview() {
    commitGreetingDraft();
    const holder = $("rp-greeting-preview-content");
    const value = state.greetings[state.selectedGreeting] || "";
    if (!value.trim()) {
      holder.innerHTML = '<div class="rp-greeting-preview-empty">这里还没有内容。</div>';
    } else {
      const shown = displayGreeting(value, state.regexRules);
      if (looksLikeRichGreeting(shown)) {
        holder.innerHTML = '<iframe class="rp-greeting-preview-frame" title="开场白美化预览" sandbox="allow-scripts"></iframe>';
        holder.querySelector("iframe").srcdoc = greetingPreviewDocument(shown);
      } else {
        holder.innerHTML = `<div class="rp-greeting-preview-text">${escapeHtml(shown).replace(/\n/g, "<br>")}</div>`;
      }
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
      const preview = plainPreviewWithMedia(value) || "空白开场，可直接在下方编辑";
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

          <section id="rp-detail-view" hidden>
            <div class="rp-detail-head"><button type="button" id="rp-detail-back">‹ 返回剧场</button><div><strong id="rp-detail-title">角色详情</strong></div><button type="button" id="rp-detail-edit">编辑</button></div>
            <div class="rp-detail-card3">
              <div class="rp-detail-avatar" id="rp-detail-avatar">🎭</div>
              <div class="rp-detail-meta"><span class="rp-card30">CHARACTER CARD 3.0</span><strong id="rp-detail-name">—</strong><p id="rp-detail-desc-short">—</p></div>
            </div>
            <div class="rp-detail-card3 rp-detail-desc-full" id="rp-detail-desc-block" hidden>
              <div class="rp-card-block-head"><div><strong>角色简介</strong></div><button type="button" id="rp-detail-desc-toggle">展开</button></div>
              <div class="rp-card-desc" id="rp-detail-desc"></div>
              <div class="rp-tags" id="rp-detail-tags"></div>
            </div>
            <button type="button" class="rp-detail-link" id="rp-detail-goto-main"><div><strong>角色卡主体与开场白</strong><small id="rp-detail-greeting-count">—</small></div><i>›</i></button>
            <button type="button" class="rp-detail-link" id="rp-detail-goto-world"><div><strong>角色世界书</strong><small id="rp-detail-world-count">—</small></div><i>›</i></button>
            <button type="button" class="rp-detail-link" id="rp-detail-goto-regex"><div><strong>角色正则与美化</strong><small id="rp-detail-regex-count">—</small></div><i>›</i></button>
            <button type="button" class="rp-detail-link" id="rp-detail-goto-theater"><div><strong>剧本世界观</strong><small id="rp-detail-theater-count">—</small></div><i>›</i></button>
            <div class="rp-detail-card3"><div class="rp-card-block-head"><div><strong>开场白</strong></div></div><div id="rp-detail-openings"></div></div>
            <div class="rp-detail-actions"><button type="button" id="rp-detail-continue" class="rp-btn-primary">继续共演</button><button type="button" id="rp-detail-new" class="rp-btn-secondary">选择开场并新建对话</button></div>
          </section>
          <section id="rp-editor-view" hidden>
            <div class="rp-editor-heading"><button type="button" id="rp-editor-back">‹ 返回剧场</button><div><strong id="rp-editor-title">新建剧本</strong><small>所有内容自动保存在这个剧本里</small></div></div>
            <div class="rp-editor-grid">
              <label data-rp-sec="main"><span>剧目名称</span><input id="rp-field-title" maxlength="80" placeholder="例如：镜澜湾三号院" /></label>
              <label data-rp-sec="main"><span>TA 在戏里扮演谁</span><input id="rp-field-actor" maxlength="80" placeholder="例如：虞山行" /></label>
              <label class="rp-wide" data-rp-sec="main"><span>你在戏里的身份</span><input id="rp-field-user-role" maxlength="240" placeholder="例如：宁梦曦；留空也可以在开场时说明" /></label>
              <section class="rp-wide rp-card-block" id="rp-desc-block" data-rp-sec="main" hidden>
                <div class="rp-card-block-head"><div><strong>角色简介</strong><small id="rp-tags-count"></small></div><button type="button" id="rp-tags-toggle">展开</button></div>
                <p class="rp-card-desc" id="rp-field-description"></p>
                <div class="rp-tags" id="rp-tags-list"></div>
              </section>
              <label class="rp-wide" data-rp-sec="main"><span>角色卡 / 人物设定</span><textarea id="rp-field-character" rows="9" placeholder="身份、性格、经历、行为逻辑、关系边界、说话方式……"></textarea></label>
              <section class="rp-wide rp-card-block" id="rp-worldbook-block" data-rp-sec="world" hidden>
                <div class="rp-card-block-head"><div><strong>角色世界书</strong><small id="rp-worldbook-count"></small></div></div>
                <div class="rp-entry-list" id="rp-worldbook-list"></div>
              </section>
              <section class="rp-wide rp-card-block" id="rp-regex-block" data-rp-sec="regex" hidden>
                <div class="rp-card-block-head"><div><strong>角色正则与美化</strong><small id="rp-regex-count"></small></div></div>
                <div class="rp-entry-list" id="rp-regex-list"></div><p class="rp-files-empty" id="rp-regex-empty" hidden>这张角色卡没有正则与美化规则。</p>
              </section>
              <section class="rp-wide rp-card-block" id="rp-theater-world-block" data-rp-sec="theater">
                <div class="rp-card-block-head"><div><strong>剧本世界观</strong><small>本剧场所有角色与 NPC 共用 · 对标惟镜长剧情</small></div></div>
                <div class="rp-theater-world-desc">这份设定只属于这个剧本。开场后本剧场里的所有角色和 NPC 都会读取；切换到其他剧本时不会带过去。角色各自的人设、世界书与正则仍会叠加生效。</div>
                <textarea id="rp-field-world" rows="10" placeholder="填写本剧场的时代与地点、公共背景、人物关系、共同经历、势力结构和所有成员必须知道的事实……"></textarea>
                <details class="rp-greeting-preview" id="rp-world-preview"><summary>世界观呈现预览</summary><div id="rp-world-preview-content"></div></details>
              </section>
              <label class="rp-wide" data-rp-sec="main"><span>当前场景</span><textarea id="rp-field-scenario" rows="5" placeholder="现在的时间、地点、在场人物和关系阶段。这里是本场唯一有效的现在时锚点。"></textarea></label>
              <label class="rp-wide" data-rp-sec="main"><span>临时剧情推进</span><textarea id="rp-field-temporary" rows="4" placeholder="可随时修改或清空；只代表接下来想推进的方向，不算已经发生。"></textarea></label>
              <section class="rp-wide rp-greeting-editor" data-rp-sec="main">
                <div class="rp-greeting-head"><div><strong>开场白</strong><small id="rp-greeting-count">1 条开场白</small></div><div><button type="button" id="rp-add-greeting">＋ 添加开场</button><button type="button" id="rp-preview-greeting">预览当前</button></div></div>
                <div class="rp-greeting-list" id="rp-greeting-list"></div>
                <label><span>当前选中的完整内容</span><textarea id="rp-field-opening" rows="12" placeholder="可保存多条开场白；选择其中一条作为新场次的开头。支持完整 HTML 美化卡片。"></textarea></label>
                <details class="rp-greeting-preview" id="rp-greeting-preview"><summary>美化预览</summary><div id="rp-greeting-preview-content"></div></details>
              </section>
              <label class="rp-wide" data-rp-sec="main"><span>本剧本连续性记忆</span><textarea id="rp-field-memory" rows="5" placeholder="戏内专属档案。模型保存的剧情记忆会进入这里，不写进 TA 的本体记忆。"></textarea></label>
            </div>
            <section class="rp-files-card" data-rp-sec="main">
              <div><strong>补充资料</strong><small>TXT、Markdown、JSON 等，只绑定本剧本</small></div>
              <button type="button" id="rp-add-files">＋ 添加资料</button>
              <input id="rp-files-input" type="file" accept=".json,.txt,.md,.markdown,.csv,.log,.xml,.yml,.yaml,text/*,application/json" multiple hidden />
              <div id="rp-files-list" class="rp-files-list"></div>
            </section>
            <aside class="rp-identity-note" data-rp-sec="main"><strong>身份保护已锁定</strong><p id="rp-identity-copy">TA 始终知道自己是谁。入戏时完整扮演舞台角色；你说“暂停”“出戏”或“停止扮演”时，由 TA 本人接话。</p></aside>
            <div class="rp-editor-actions"><button type="button" id="rp-save-only">保存剧本</button><button type="button" class="primary" id="rp-save-enter">选择开场并开始对戏</button></div>
          </section>
        </main>
      </div>`;
    document.body.appendChild(section);
    const picker = document.createElement("section");
    picker.id = "rp-opening-picker";
    picker.className = "rp-opening-picker";
    picker.hidden = true;
    picker.setAttribute("role", "dialog");
    picker.setAttribute("aria-modal", "true");
    picker.setAttribute("aria-labelledby", "rp-opening-picker-title");
    picker.innerHTML = `<div class="rp-opening-shell"><header class="rp-opening-head"><button type="button" id="rp-opening-cancel">取消</button><h2 id="rp-opening-picker-title">选择开场白</h2><button type="button" id="rp-opening-confirm">确定</button></header><div class="rp-opening-scroll"><div class="rp-opening-actor" id="rp-opening-actor"></div><p class="rp-opening-note" id="rp-opening-note">选择后以角色的第一条消息开始新场次</p><button type="button" class="rp-head-action" id="rp-opening-repair">从原始 JSON 补全开场白</button><div id="rp-opening-options"></div><section class="rp-opening-full"><h3>完整开场预览</h3><div id="rp-opening-full-content"></div></section></div></div>`;
    document.body.appendChild(picker);
  }

  panelMarkup();

  function projectFiles(project) {
    return Array.isArray(project?.projectFiles) ? project.projectFiles.map((file) => ({ ...file })) : [];
  }

  function currentDraft() {
    commitGreetingDraft();
    // 角色世界书：启用的条目拼成 world
    const wbText = state.worldEntries.filter((e) => e.enabled && e.content).map((e) => e.content).join("\n\n");
    // 剧本世界观：独立字段，对标惟镜长剧情的 theaterWorldBackground
    const theaterWorld = $("rp-field-world") ? $("rp-field-world").value.trim() : "";
    return {
      title: $("rp-field-title").value.trim(),
      actorName: $("rp-field-actor").value.trim(),
      userRole: $("rp-field-user-role").value.trim(),
      characterPrompt: $("rp-field-character").value.trim(),
      world: wbText,
      theaterWorldBackground: theaterWorld,
      scenario: $("rp-field-scenario").value.trim(),
      temporaryPlot: $("rp-field-temporary").value.trim(),
      opening: (state.greetings[state.selectedGreeting] || "").trim(),
      greetings: state.greetings.map((item) => safeText(item, 300000)),
      openingIndex: state.selectedGreeting,
      alternateGreetings: state.greetings.filter((_, index) => index !== state.selectedGreeting),
      memory: $("rp-field-memory").value.trim(),
      projectFiles: state.files.map((file) => ({ ...file })),
      tags: [...state.tags],
      worldEntries: state.worldEntries.map(({ expanded, ...e }) => e),
      regexRules: state.regexRules.map((r) => ({ ...r })),
      description: safeText($("rp-field-description").dataset.full || "", 20000),
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
    $("rp-field-world").value = safeText(data.theaterWorldBackground || data.world);
    $("rp-field-scenario").value = safeText(data.scenario);
    $("rp-field-temporary").value = safeText(data.temporaryPlot);
    state.tags = Array.isArray(data.tags) ? data.tags.map((t) => safeText(t, 40)).filter(Boolean).slice(0, 24) : [];
    state.worldEntries = Array.isArray(data.worldEntries) ? data.worldEntries.map((e) => ({ id: safeText(e.id || "", 80), title: safeText(e.title || "条目", 80), keys: Array.isArray(e.keys) ? e.keys : [], secondaryKeys: Array.isArray(e.secondaryKeys) ? e.secondaryKeys : [], content: safeText(e.content || "", 50000), enabled: e.enabled !== false, constant: Boolean(e.constant), selective: Boolean(e.selective), useRegex: e.useRegex !== false, position: safeText(e.position || "before_char", 30), insertionOrder: Number(e.insertionOrder ?? 100) || 100, depth: Number(e.depth ?? 4) || 4, probability: Number(e.probability ?? 100) || 100, expanded: false })) : [];
    state.regexRules = Array.isArray(data.regexRules) ? data.regexRules.map((r) => ({ id: safeText(r.id || "", 80), name: safeText(r.name || "规则", 120), findRegex: safeText(r.findRegex || "", 20000), replaceString: safeText(r.replaceString || "", 50000), disabled: Boolean(r.disabled) })) : [];
    $("rp-field-description").dataset.full = safeText(data.description || "", 20000);
    renderCardBlocks();
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
    $("rp-detail-view").hidden = true;
    $("rp-theater-panel").dataset.view = "library";
    state.editingId = "";
    state.detailId = "";
    render();
  }
  function showDetail(projectId) {
    const project = bridge.get(projectId);
    if (!project) return;
    fillDetail(project);
    $("rp-library-view").hidden = true;
    $("rp-editor-view").hidden = true;
    $("rp-detail-view").hidden = false;
    $("rp-theater-panel").dataset.view = "detail";
    $("rp-theater-panel").querySelector(".rp-theater-body").scrollTop = 0;
  }

  function fillDetail(project) {
    const rp = project.rpProject || {};
    const data = { ...rp, ...project };
    $("rp-detail-title").textContent = data.title || "角色详情";
    $("rp-detail-name").textContent = data.actorName || data.title || "—";
    const desc = safeText(data.description || "", 20000);
    $("rp-detail-desc-short").textContent = desc ? desc.slice(0, 120) + (desc.length > 120 ? "…" : "") : "暂无简介";
    $("rp-detail-desc").innerHTML = escapeHtml(desc.length > 120 ? desc.slice(0, 120) + "…" : desc).replace(/\r?\n/g, "<br>");
    $("rp-detail-desc").dataset.expanded = "";
    $("rp-detail-desc-toggle").textContent = "展开";
    $("rp-detail-desc-toggle").hidden = desc.length <= 120;
    const avatarEl = $("rp-detail-avatar");
    const img = /^(https?:\/\/|data:image\/)/.test(data.avatar || "") ? data.avatar : "";
    avatarEl.innerHTML = img ? `<img src="${escapeHtml(img)}" alt="" />` : escapeHtml([...(data.actorName || data.title || "剧")][0]);
    $("rp-detail-desc-block").hidden = !desc;
    const tags = Array.isArray(data.tags) ? data.tags : [];
    $("rp-detail-tags").innerHTML = tags.map((t) => `<span class="rp-tag">${escapeHtml(t)}</span>`).join("");
    const greetings = greetingList(rp);
    $("rp-detail-greeting-count").textContent = `${greetings.length} 个开场 · Card 3.0`;
    const wb = Array.isArray(data.worldEntries) ? data.worldEntries : [];
    $("rp-detail-world-count").textContent = `${wb.length} 条 · 可编辑、启停和调整插入位置`;
    const rx = Array.isArray(data.regexRules) ? data.regexRules : [];
    const rxOn = rx.filter((r) => !r.disabled).length;
    $("rp-detail-regex-count").textContent = `${rx.length} 条 · ${rxOn} 条启用`;
    const tw = safeText(data.theaterWorldBackground || "", 50000);
    $("rp-detail-theater-count").textContent = tw ? "已填写" : "未填写";
    $("rp-detail-openings").innerHTML = greetings.map((g, i) => {
      const txt = plainPreviewWithMedia(g);
      const preview = txt.length > 200 ? txt.slice(0, 200) + "…" : txt;
      return `<div class="rp-detail-opening"><small>开场 ${i + 1}</small><p>${escapeHtml(preview).replace(/\n/g, "<br>")}</p></div>`;
    }).join("") || '<div class="rp-empty"><p>还没有开场白</p></div>';
    $("rp-detail-desc-toggle").onclick = () => {
      const el = $("rp-detail-desc");
      const exp = el.dataset.expanded === "1";
      el.innerHTML = exp ? escapeHtml(desc.slice(0, 120) + "…").replace(/\r?\n/g, "<br>") : escapeHtml(desc).replace(/\r?\n/g, "<br>");
      el.dataset.expanded = exp ? "" : "1";
      $("rp-detail-desc-toggle").textContent = exp ? "展开" : "收起";
    };
    $("rp-detail-edit").onclick = () => showEditor(project, "main");
    $("rp-detail-back").onclick = showLibrary;
    $("rp-detail-goto-main").onclick = () => showEditor(project, "main");
    $("rp-detail-goto-world").onclick = () => showEditor(project, "world");
    $("rp-detail-goto-regex").onclick = () => showEditor(project, "regex");
    $("rp-detail-goto-theater").onclick = () => showEditor(project, "theater");
    $("rp-detail-continue").onclick = () => { enter(project.id); };
    $("rp-detail-new").onclick = () => chooseOpening(project.id, true);
    state.detailId = project.id;
  }
  const SECTION_TITLES = { main: "角色卡主体与开场白", world: "角色世界书", regex: "角色正则与美化", theater: "剧本世界观" };
  function showEditor(project, section = "") {
    if (!project) { state.tags = []; state.worldEntries = []; state.regexRules = []; }
    fillEditor(project || null);
    const sec = project && SECTION_TITLES[section] ? section : "";
    const view = $("rp-editor-view");
    if (sec) view.dataset.section = sec; else delete view.dataset.section;
    if (sec) $("rp-editor-title").textContent = SECTION_TITLES[sec];
    $("rp-editor-back").textContent = project && state.detailId === project.id ? "‹ 返回角色" : "‹ 返回剧场";
    if (sec === "regex" || sec === "world") $(sec === "regex" ? "rp-regex-block" : "rp-worldbook-block").hidden = false;
    $("rp-library-view").hidden = true;
    $("rp-editor-view").hidden = false;
    $("rp-detail-view").hidden = true;
    $("rp-theater-panel").dataset.view = "editor";
    $("rp-theater-panel").querySelector(".rp-theater-body").scrollTop = 0;
    if (!sec || sec === "main") requestAnimationFrame(() => { if (!bridge.isMobile()) $("rp-field-title").focus(); });
  }
  function leaveEditor() {
    const id = state.editingId;
    if (id && state.detailId === id && bridge.get(id)) showDetail(id); else showLibrary();
  }

  function renderCardBlocks() {
    // 角色简介 + 标签
    const desc = safeText($("rp-field-description").dataset.full || "", 20000);
    const hasDesc = desc.length > 0;
    const hasTags = state.tags.length > 0;
    $("rp-desc-block").hidden = !(hasDesc || hasTags);
    if (hasDesc) {
      const short = desc.slice(0, 220);
      const html = (t) => escapeHtml(t).replace(/\r?\n/g, "<br>");
      $("rp-field-description").innerHTML = html(desc.length > 220 ? short + "…" : desc);
      $("rp-field-description").dataset.full = desc;
      $("rp-field-description").dataset.expanded = "";
    }
    $("rp-tags-count").textContent = hasTags ? `${state.tags.length} 个标签` : "";
    $("rp-tags-list").innerHTML = state.tags.map((t) => `<span class="rp-tag">${escapeHtml(t)}</span>`).join("");
    // 世界书（完整编辑器，对标惟镜）
    $("rp-worldbook-block").hidden = false;
    const enabledWb = state.worldEntries.filter((e) => e.enabled).length;
    $("rp-worldbook-count").textContent = `${state.worldEntries.length} 条 · ${enabledWb} 条启用`;
    const posName = (p) => ({ before_char: "角色定义之前", after_char: "角色定义之后", before_scenario: "场景之前", after_scenario: "场景之后" }[p] || p);
    $("rp-worldbook-list").innerHTML = state.worldEntries.map((entry, idx) => `
      <div class="rp-wb-card${entry.enabled ? "" : " off"}">
        <button type="button" class="rp-wb-head" data-wb-expand="${idx}">
          <span class="rp-wb-dot${entry.enabled ? " on" : ""}"></span>
          <span class="rp-wb-title">${escapeHtml(entry.title) || "未命名条目"}</span>
          <small>${[entry.constant ? "常驻" : "", entry.selective ? "选择性" : "", `深度 ${entry.depth}`].filter(Boolean).join(" · ")}</small>
          <i>${entry.expanded ? "︿" : "﹀"}</i>
        </button>
        ${entry.expanded ? `
        <div class="rp-wb-body">
          <label><span>标题</span><input data-wb-field="title" data-wb-idx="${idx}" value="${escapeHtml(entry.title)}" maxlength="80" /></label>
          <label><span>主关键词（逗号分隔）</span><input data-wb-field="keys" data-wb-idx="${idx}" value="${escapeHtml(entry.keys.join(", "))}" placeholder="关键词1, 关键词2" /></label>
          <label><span>辅助关键词（逗号分隔）</span><input data-wb-field="secondaryKeys" data-wb-idx="${idx}" value="${escapeHtml(entry.secondaryKeys.join(", "))}" /></label>
          <label><span>正文</span><textarea data-wb-field="content" data-wb-idx="${idx}" rows="6">${escapeHtml(entry.content)}</textarea></label>
          <div class="rp-wb-grid">
            <label><span>插入位置</span><select data-wb-field="position" data-wb-idx="${idx}">
              ${["before_char", "after_char", "before_scenario", "after_scenario"].map((p) => `<option value="${p}"${entry.position === p ? " selected" : ""}>${posName(p)}</option>`).join("")}
            </select></label>
            <label><span>插入顺序</span><input type="number" data-wb-field="insertionOrder" data-wb-idx="${idx}" value="${entry.insertionOrder}" /></label>
            <label><span>深度</span><input type="number" data-wb-field="depth" data-wb-idx="${idx}" value="${entry.depth}" min="0" max="99" /></label>
            <label><span>概率</span><input type="number" data-wb-field="probability" data-wb-idx="${idx}" value="${entry.probability}" min="0" max="100" /></label>
          </div>
          <div class="rp-wb-toggles">
            ${[["enabled", "启用"], ["constant", "常驻"], ["selective", "选择性触发"], ["useRegex", "关键词按正则"]].map(([f, label]) => `
              <button type="button" class="rp-wb-toggle${entry[f] ? " on" : ""}" data-wb-switch="${f}" data-wb-idx="${idx}" aria-pressed="${entry[f]}"><i></i>${label}</button>`).join("")}
          </div>
          <button type="button" class="rp-wb-delete" data-wb-delete="${idx}">删除这条世界书</button>
        </div>` : ""}
      </div>`).join("") + `<button type="button" class="rp-wb-add" id="rp-wb-add">＋ 添加世界书条目</button>`;
    $("rp-worldbook-list").querySelectorAll("[data-wb-expand]").forEach((btn) => btn.addEventListener("click", () => {
      const i = Number(btn.dataset.wbExpand);
      state.worldEntries[i].expanded = !state.worldEntries[i].expanded;
      renderCardBlocks();
    }));
    $("rp-worldbook-list").querySelectorAll("[data-wb-switch]").forEach((btn) => btn.addEventListener("click", () => {
      const i = Number(btn.dataset.wbIdx);
      state.worldEntries[i][btn.dataset.wbSwitch] = !state.worldEntries[i][btn.dataset.wbSwitch];
      renderCardBlocks();
    }));
    $("rp-worldbook-list").querySelectorAll("[data-wb-field]").forEach((input) => input.addEventListener("change", () => {
      const i = Number(input.dataset.wbIdx);
      const f = input.dataset.wbField;
      const entry = state.worldEntries[i];
      if (f === "keys" || f === "secondaryKeys") entry[f] = input.value.split(/[,，]/).map((s) => s.trim()).filter(Boolean).slice(0, 20);
      else if (f === "insertionOrder" || f === "depth" || f === "probability") entry[f] = Number(input.value) || 0;
      else entry[f] = input.value;
      if (f === "title") renderCardBlocks();
    }));
    $("rp-worldbook-list").querySelectorAll("[data-wb-delete]").forEach((btn) => btn.addEventListener("click", () => {
      if (!confirm("删除这条世界书？")) return;
      state.worldEntries.splice(Number(btn.dataset.wbDelete), 1);
      renderCardBlocks();
    }));
    const wbAdd = $("rp-wb-add");
    if (wbAdd) wbAdd.addEventListener("click", () => {
      state.worldEntries.push({ id: `wb-${Date.now()}`, title: "新条目", keys: [], secondaryKeys: [], content: "", enabled: true, constant: false, selective: false, useRegex: true, position: "before_char", insertionOrder: 100, depth: 4, probability: 100, expanded: true });
      renderCardBlocks();
    });
    // 正则与美化
    $("rp-regex-block").hidden = state.regexRules.length === 0 && $("rp-editor-view").dataset.section !== "regex";
    $("rp-regex-empty").hidden = state.regexRules.length > 0;
    const enabledRx = state.regexRules.filter((r) => !r.disabled).length;
    $("rp-regex-count").textContent = `${state.regexRules.length} 条 · ${enabledRx} 条启用`;
    $("rp-regex-list").innerHTML = state.regexRules.map((rule, idx) => `
      <div class="rp-entry${rule.disabled ? " off" : ""}">
        <button type="button" class="rp-entry-toggle" data-rx-toggle="${idx}" aria-pressed="${!rule.disabled}">${rule.disabled ? "○" : "✓"}</button>
        <div><strong>${escapeHtml(rule.name)}</strong><small>${escapeHtml(rule.findRegex.slice(0, 60))}${rule.findRegex.length > 60 ? "…" : ""}</small></div>
      </div>`).join("");
    $("rp-regex-list").querySelectorAll("[data-rx-toggle]").forEach((btn) => btn.addEventListener("click", () => {
      const i = Number(btn.dataset.rxToggle);
      state.regexRules[i].disabled = !state.regexRules[i].disabled;
      renderCardBlocks();
    }));
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
        <button type="button" class="rp-project-copy" data-rp-detail="${escapeHtml(project.id)}"><small>RP PROJECT · ${escapeHtml(formatTime(project.updatedAt))}</small><strong>${escapeHtml(project.title || "未命名剧本")}</strong><p>${escapeHtml(info.roleName || "TA")} 演 ${escapeHtml(actor)} · ${escapeHtml(userRole)}</p><em>${project.messageCount || 0} 条正文 · ${project.memoryCount || 0} 条剧情记忆</em></button>
        <button type="button" class="rp-continue" data-rp-open="${escapeHtml(project.id)}">继续对戏</button>
        <div class="rp-project-menu"><button type="button" data-rp-edit="${escapeHtml(project.id)}">角色卡与开场白</button><button type="button" data-rp-duplicate="${escapeHtml(project.id)}">选择开场并新建对话</button><button type="button" class="danger" data-rp-delete="${escapeHtml(project.id)}">删除</button></div>
      </article>`;
    }).join("");
    list.querySelectorAll("[data-rp-open]").forEach((button) => button.addEventListener("click", () => enter(button.dataset.rpOpen)));
    list.querySelectorAll("[data-rp-detail]").forEach((button) => button.addEventListener("click", () => showDetail(button.dataset.rpDetail)));
    list.querySelectorAll("[data-rp-edit]").forEach((button) => button.addEventListener("click", () => showEditor(bridge.get(button.dataset.rpEdit))));
    list.querySelectorAll("[data-rp-duplicate]").forEach((button) => button.addEventListener("click", () => {
      chooseOpening(button.dataset.rpDuplicate, true);
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

  function closeOpeningPicker() {
    $("rp-opening-picker").hidden = true;
    document.body.classList.remove("rp-opening-picker-open");
  }

  function renderOpeningPicker() {
    const project = bridge.get(openingState.projectId);
    if (!project) { closeOpeningPicker(); return; }
    const greetings = greetingList(project.rpProject);
    const hasMenu = isOpeningMenu(greetings[0]);
    const choices = greetings.map((value, index) => ({ value, index })).filter(item => !hasMenu || item.index > 0);
    const hasText = choices.some(item => item.value.trim());
    $("rp-opening-note").textContent = hasText ? "选择后以角色的第一条消息开始新场次" : "旧剧本只保存了封面，缺少文字开场。请从完整角色卡 JSON 补全。";
    const actor = project.rpProject?.actorName || "角色";
    const avatar = bridge.role().roleAvatar;
    const portrait = /^(https?:\/\/|data:image\/)/.test(avatar || "")
      ? `<img src="${escapeHtml(avatar)}" alt="" />` : `<span>${escapeHtml([...actor][0] || "剧")}</span>`;
    $("rp-opening-actor").innerHTML = `${portrait}<strong>${escapeHtml(actor)}</strong>`;
    $("rp-opening-options").innerHTML = choices.map(({ value, index }) => `<button type="button" class="rp-opening-option${index === openingState.index ? " selected" : ""}" data-opening-index="${index}" aria-pressed="${index === openingState.index}" ${value.trim() ? "" : "disabled"}>${portrait}<span><small>${escapeHtml(actor)} · 开场 ${hasMenu ? index : index + 1}</small><strong>${escapeHtml(plainPreviewWithMedia(value).slice(0, 160) || "原卡中的空白开场")}</strong></span><i>${index === openingState.index ? "✓" : "›"}</i></button>`).join("");
    $("rp-opening-options").querySelectorAll("[data-opening-index]").forEach(button => button.addEventListener("click", () => {
      openingState.index = Number(button.dataset.openingIndex);
      renderOpeningPicker();
    }));
    const value = greetings[openingState.index] || "";
    $("rp-opening-confirm").disabled = !value.trim() || (hasMenu && openingState.index === 0);
    const holder = $("rp-opening-full-content");
    const shown = displayGreeting(value, project.rpProject?.regexRules || []);
    if (looksLikeRichGreeting(shown)) {
      holder.innerHTML = '<iframe class="rp-greeting-preview-frame" title="所选开场白完整预览" sandbox="allow-scripts"></iframe>';
      holder.querySelector("iframe").srcdoc = greetingPreviewDocument(shown);
    } else {
      holder.innerHTML = `<div class="rp-greeting-preview-text">${escapeHtml(shown).replace(/\n/g, "<br>")}</div>`;
    }
    if (greetings.some(isCorruptedGreeting)) $("rp-opening-note").textContent = "旧版本把开场白存坏了：请点「从原始 JSON 补全开场白」重新选一次角色卡 JSON。";
  }

  function chooseOpening(projectId, forceNew = true) {
    const project = bridge.get(projectId);
    if (!project) return;
    openingState.projectId = projectId;
    openingState.index = Math.max(0, Number(project.rpProject?.openingIndex) || 0);
    const greetings = greetingList(project.rpProject);
    if (openingState.index === 0 && isOpeningMenu(greetings[0])) {
      const index = greetings.findIndex((value, i) => i > 0 && value.trim());
      if (index > 0) openingState.index = index;
    }
    openingState.forceNew = forceNew;
    $("rp-opening-picker").hidden = false;
    document.body.classList.add("rp-opening-picker-open");
    renderOpeningPicker();
    $("rp-opening-picker").querySelector(".rp-opening-scroll").scrollTop = 0;
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
    if (shouldEnter) chooseOpening(project.id, false); else leaveEditor();
  }

  function worldBookText(book) {
    const entries = book?.entries;
    if (!entries || typeof entries !== "object") return "";
    return Object.values(entries).map((entry) => entry?.content || "").filter(Boolean).join("\n\n");
  }

  function importCharacterCard(raw, filename) {
    if (state.repairTargetId) {
      const targetId = state.repairTargetId;
      state.repairTargetId = "";
      let repaired = bridge.repairGreetings(targetId, raw);
      if (repaired) {
        try {
          const parsedCard = JSON.parse(raw);
          const data = parsedCard?.data && typeof parsedCard.data === "object" ? parsedCard.data : parsedCard;
          const extra = cardStructure(parsedCard);
          const rp = repaired.rpProject || {};
          const patch = { ...rp, greetings: greetingList(rp) };
          if (extra.worldEntries.length && !(rp.worldEntries || []).length) patch.worldEntries = extra.worldEntries;
          if (extra.regexRules.length && !(rp.regexRules || []).length) patch.regexRules = extra.regexRules;
          if (!(rp.tags || []).length && Array.isArray(data?.tags)) patch.tags = data.tags.map((t) => safeText(t, 40)).filter(Boolean).slice(0, 24);
          if (!rp.description && data?.description) patch.description = safeText(data.description, 20000);
          repaired = bridge.update(targetId, patch) || repaired;
        } catch (_) {}
        if (state.editingId === targetId) fillEditor(repaired);
        chooseOpening(targetId, true);
      }
      return;
    }
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
      ...(parsed !== data && Array.isArray(parsed.alternate_greetings) ? parsed.alternate_greetings : []),
    ];
    const greetings = [firstGreeting, ...alternateGreetings].map((item) => safeText(item, 300000)).slice(0, 24);
    // 结构化：标签
    const tags = [...new Set([...(Array.isArray(data.tags) ? data.tags : []), ...(Array.isArray(parsed.tags) ? parsed.tags : [])].map((t) => safeText(t, 40)).filter(Boolean))].slice(0, 24);
    const { worldEntries, regexRules } = cardStructure(parsed);
    showEditor({ rpProject: {
      title: name ? `${name}的故事` : filename.replace(/\.[^.]+$/, ""),
      actorName: name,
      characterPrompt,
      world,
      worldEntries,
      tags,
      regexRules,
      description: safeText(data.description, 20000),
      scenario: safeText(data.scenario),
      opening: greetings[0] || "",
      greetings,
      openingIndex: 0,
      alternateGreetings: greetings.slice(1),
    }, projectFiles: [] });
    bridge.toast(`已读取角色卡：${name || filename} · ${greetings.length} 条开场白 · ${worldEntries.length} 条世界书 · ${regexRules.length} 条美化规则`);
  }

  function cardStructure(parsed) {
    const data = parsed?.data && typeof parsed.data === "object" ? parsed.data : parsed;
    // 结构化：世界书条目（保留 enabled 开关）
    const rawBook = data.character_book || parsed.character_book || {};
    const rawEntries = Array.isArray(rawBook.entries) ? rawBook.entries : Object.values(rawBook.entries || {});
    const worldEntries = rawEntries.map((entry, idx) => {
      const ext = entry.extensions && typeof entry.extensions === "object" ? entry.extensions : {};
      return {
        id: safeText(entry.id || `wb-${idx}`, 80),
        title: safeText(entry.comment || (entry.content || "").split("\n")[0].replace(/^[#\s]+/, "").slice(0, 40) || `条目 ${idx + 1}`, 80),
        keys: Array.isArray(entry.keys) ? entry.keys.map((k) => safeText(k, 60)).filter(Boolean) : [],
        secondaryKeys: Array.isArray(entry.secondary_keys) ? entry.secondary_keys.map((k) => safeText(k, 60)).filter(Boolean) : [],
        content: safeText(entry.content || "", 50000),
        enabled: entry.enabled !== false,
        constant: Boolean(entry.constant),
        selective: Boolean(entry.selective),
        useRegex: entry.use_regex !== false,
        position: safeText(entry.position || "before_char", 30),
        insertionOrder: Number(entry.insertion_order ?? 100) || 100,
        depth: Number(ext.depth ?? 4) || 4,
        probability: Number(ext.probability ?? 100) || 100,
        expanded: false,
      };
    }).filter((e) => e.content);
    // 结构化：正则与美化
    const rawRegex = data.extensions?.regex_scripts || parsed.extensions?.regex_scripts || data.extensions?.regexScripts || [];
    const regexRules = (Array.isArray(rawRegex) ? rawRegex : []).map((rule, idx) => ({
      id: safeText(rule.id || `rx-${idx}`, 80),
      name: safeText(rule.scriptName || rule.script_name || `规则 ${idx + 1}`, 120),
      findRegex: safeText(rule.findRegex || rule.find_regex || "", 20000),
      replaceString: safeText(rule.replaceString || rule.replace_string || "", 50000),
      disabled: Boolean(rule.disabled),
      promptOnly: Boolean(rule.promptOnly || rule.prompt_only),
      markdownOnly: Boolean(rule.markdownOnly || rule.markdown_only),
      placement: Array.isArray(rule.placement) ? rule.placement.map(Number) : [],
    })).filter((r) => r.findRegex);
    return { worldEntries, regexRules };
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
  $("rp-opening-cancel").addEventListener("click", closeOpeningPicker);
  $("rp-opening-repair").addEventListener("click", () => {
    state.repairTargetId = openingState.projectId;
    $("rp-import-file").click();
  });
  $("rp-opening-confirm").addEventListener("click", () => {
    const project = bridge.get(openingState.projectId);
    if (project && !openingState.forceNew && (project.messageCount || 0) > 0) {
      closeOpeningPicker();
      enter(project.id);
      return;
    }
    let needRestore = null;
    if (project) {
      const rp = project.rpProject || {};
      const greetings = greetingList(rp);
      const raw = greetings[openingState.index] || "";
      const rules = Array.isArray(rp.regexRules) ? rp.regexRules : [];
      if (raw && !looksLikeRichGreeting(raw)) {
        const html = displayGreeting(raw, rules);
        if (html && html !== raw) {
          needRestore = { rp, greetings };
          const updated = greetings.slice();
          updated[openingState.index] = html;
          bridge.update(openingState.projectId, { ...rp, greetings: updated });
        }
      }
    }
    const started = bridge.startWithGreeting(openingState.projectId, openingState.index, openingState.forceNew);
    if (needRestore) bridge.update(openingState.projectId, { ...needRestore.rp, greetings: needRestore.greetings });
    if (!started) return;
    closeOpeningPicker();
    enter(started.id);
  });
  $("rp-home-exit").addEventListener("click", () => bridge.exitToHome());
  $("rp-new-project").addEventListener("click", () => showEditor());
  $("rp-empty-create").addEventListener("click", () => showEditor());
  $("rp-tags-toggle").addEventListener("click", () => {
    const el = $("rp-field-description");
    const expanded = el.dataset.expanded === "1";
    const full = el.dataset.full || "";
    const html = (t) => escapeHtml(t).replace(/\r?\n/g, "<br>");
    if (expanded) { el.innerHTML = html(full.length > 220 ? full.slice(0, 220) + "…" : full); el.dataset.expanded = ""; $("rp-tags-toggle").textContent = "展开"; }
    else { el.innerHTML = html(full); el.dataset.expanded = "1"; $("rp-tags-toggle").textContent = "收起"; }
  });
  $("rp-editor-back").addEventListener("click", leaveEditor);
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
  $("rp-world-preview").addEventListener("toggle", () => {
    if ($("rp-world-preview").open) renderWorldPreview();
  });
  $("rp-field-opening").addEventListener("input", () => {
    state.greetings[state.selectedGreeting] = safeText($("rp-field-opening").value, 300000);
  });
  $("rp-import-project").addEventListener("click", () => { state.repairTargetId = ""; $("rp-import-file").click(); });
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
    chooseOpening,
    editCurrent() {
      // 惟镜同款「情景与角色资料」：先进角色详情（角色卡/世界书/正则/世界观四个入口），点哪项编辑哪项
      const current = bridge.current();
      if (!current?.id || !bridge.get(current.id)) { open(""); return; }
      open("");
      state.detailId = current.id;
      showDetail(current.id);
    },
    summary: () => ({ count: bridge.list().length }),
  };
}
