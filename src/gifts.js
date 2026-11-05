export const GIFT_CATEGORIES = [
  { id: "all", label: "全部" },
  { id: "custom", label: "自制" },
  { id: "food", label: "吃的" },
  { id: "flowers", label: "花束" },
  { id: "daily", label: "日常" },
  { id: "keepsake", label: "珍藏" },
  { id: "date", label: "约会" },
  { id: "handmade", label: "手作" },
];

const gift = (id, name, subtitle, icon, category, colors) => ({ id, name, subtitle, icon, category, colors });

export const GIFT_CATALOG = [
  gift("warm-soup", "深夜热汤", "留一盏灯，也留一口热的", "🍲", "food", ["#fff2da", "#e2b36f"]),
  gift("coffee", "手冲咖啡", "给还不肯休息的人", "☕️", "food", ["#efe0d1", "#9c7055"]),
  gift("cake", "莓果小蛋糕", "奶油不多，偏心很多", "🍰", "food", ["#ffe4e8", "#dfa0aa"]),
  gift("dinner", "烛光晚餐", "今晚只留一张对面的椅子", "🍷", "food", ["#f3dfd5", "#9f665e"]),
  gift("daisy", "一把小雏菊", "像刚晒过太阳", "🌼", "flowers", ["#fff8cf", "#d7b84f"]),
  gift("tulip", "奶油郁金香", "十一枝，刚好抱满怀", "🌷", "flowers", ["#fff0df", "#e3a882"]),
  gift("rose", "深红玫瑰", "不是顺手，是特意", "🌹", "flowers", ["#f2d6dc", "#a94555"]),
  gift("scarf", "米色围巾", "绕两圈，别让风钻进去", "🧣", "daily", ["#f1e7d8", "#b79a73"]),
  gift("mug", "刻字马克杯", "杯底藏着只有你知道的话", "🥛", "daily", ["#edf3ee", "#8ea99c"]),
  gift("perfume", "木质香水", "尾调像雨后的旧书房", "🧴", "daily", ["#f1e2cf", "#9f7754"]),
  gift("bracelet", "双结手绳", "一边系你，一边系我", "🧶", "keepsake", ["#f6e3dc", "#bc796e"]),
  gift("watch", "银色腕表", "想占住你每一分钟", "⌚️", "keepsake", ["#e8edf0", "#87959f"]),
  gift("ring", "素圈戒指", "没有钻，也不是随便戴戴", "💍", "keepsake", ["#f0ede6", "#9e9385"]),
  gift("movie", "双人电影票", "最后一排，不许迟到", "🎞️", "date", ["#e7e9eb", "#7f8b98"]),
  gift("aquarium", "水族馆约会", "去看蓝光落在你脸上", "🐋", "date", ["#dff1f3", "#649cab"]),
  gift("night-drive", "夜间兜风", "不设目的地，开累了再回家", "🚘", "date", ["#dfe4e8", "#596b79"]),
  gift("note", "手写便签", "字不漂亮，心意是真的", "📝", "handmade", ["#fff4d9", "#c9a559"]),
  gift("origami", "折纸飞鸟", "折痕里藏了一句没说出口的话", "🕊️", "handmade", ["#e8f0f1", "#7ea1a8"]),
  gift("album", "手作相册", "把零碎时刻一本本留下", "📔", "handmade", ["#f0e3d9", "#a78069"]),
  gift("letter", "火漆长信", "不适合在聊天框里草草说完", "💌", "handmade", ["#f3dfdc", "#a75f5b"]),
];

export const GIFT_COLOR_PRESETS = [
  ["#ffe4e8", "#dfa0aa"], ["#fff2da", "#e2b36f"], ["#e8f0f1", "#7ea1a8"],
  ["#efe6f6", "#a58bc2"], ["#edf3ee", "#8ea99c"], ["#f2d6dc", "#a94555"], ["#e7e9eb", "#7f8b98"],
];
const HEX = /^#[0-9a-f]{6}$/i;
const safeColors = value => Array.isArray(value) && value.length === 2 && value.every(c => HEX.test(String(c))) ? [String(value[0]), String(value[1])] : null;
const hashPick = text => { let h = 0; for (const ch of String(text)) h = (h * 31 + ch.codePointAt(0)) >>> 0; return GIFT_COLOR_PRESETS[h % GIFT_COLOR_PRESETS.length]; };

const safe = (value, max = 240) => String(value == null ? "" : value).trim().slice(0, max);
const esc = value => safe(value, 1000).replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
const catalogById = id => GIFT_CATALOG.find(item => item.id === safe(id, 80));

// 自制礼物：她或角色亲手做的，存在当前角色档案里（role.customGifts）
export function normalizeCustomGift(raw) {
  if (!raw || typeof raw !== "object") return null;
  const name = safe(raw.name, 24);
  if (!name) return null;
  const maker = raw.maker === "role" ? "role" : "user";
  return {
    id: safe(raw.id, 80) || `made-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
    name,
    subtitle: safe(raw.subtitle, 60) || (maker === "role" ? "TA 亲手做的" : "我亲手做的"),
    icon: [...safe(raw.icon, 12)].slice(0, 2).join("") || "🎁",
    category: "custom",
    colors: safeColors(raw.colors) || hashPick(name),
    maker,
    custom: true,
    createdAt: Number.isFinite(Number(raw.createdAt)) ? Number(raw.createdAt) : Date.now(),
  };
}

export function normalizeGiftPart(value) {
  if (!value || value.type !== "gift") return null;
  const known = catalogById(value.giftId);
  const name = safe(value.name || known?.name, 40);
  if (!name) return null;
  const direction = value.direction === "role-to-user" ? "role-to-user" : "user-to-role";
  return {
    type: "gift",
    giftId: safe(value.giftId || known?.id || "custom", 80),
    name,
    icon: safe(value.icon || known?.icon || "🎁", 12),
    subtitle: safe(value.subtitle || known?.subtitle || "只此一份", 100),
    category: safe(value.category || known?.category || "handmade", 30),
    direction,
    senderName: safe(value.senderName, 60),
    recipientName: safe(value.recipientName, 60),
    note: safe(value.note, 240),
    ts: Number.isFinite(Number(value.ts)) ? Number(value.ts) : Date.now(),
    custom: Boolean(value.custom),
    ...(safeColors(value.colors) ? { colors: safeColors(value.colors) } : {}),
    ...(value.maker === "role" || value.maker === "user" ? { maker: value.maker } : {}),
  };
}

export function giftPromptText(value) {
  const item = normalizeGiftPart(value);
  if (!item) return "";
  const sender = item.senderName || (item.direction === "role-to-user" ? "TA" : "用户");
  const recipient = item.recipientName || (item.direction === "role-to-user" ? "用户" : "TA");
  return `🎁 礼物事件｜${sender}送给${recipient}「${item.name}」（${item.subtitle}）${item.note ? `\n附言：${item.note}` : ""}`;
}

export function extractAssistantGift(text, context = {}) {
  const source = String(text || "");
  let found = null;
  let made = null;
  const shelf = (Array.isArray(context.customGifts) ? context.customGifts : []).map(normalizeCustomGift).filter(Boolean);
  const senderName = safe(context.roleName, 60) || "TA";
  const recipientName = safe(context.userName, 60) || "你";
  const toPart = (item, note) => normalizeGiftPart({
    type: "gift", giftId: item.id, name: item.name, icon: item.icon, subtitle: item.subtitle,
    category: item.category, direction: "role-to-user", senderName, recipientName,
    note: safe(note, 240), ts: Date.now(), custom: Boolean(item.custom), colors: item.colors, maker: item.maker,
  });
  const afterMade = source.replace(/\[\s*自制礼物\s*[:：]\s*([^|\]\n]*)\|([^|\]\n]+)(?:\|([^|\]\n]*))?(?:\|([^\]\n]*))?\s*\]/g, (whole, icon, name, subtitle, note) => {
    if (found) return "";
    made = normalizeCustomGift({ icon, name, subtitle, maker: "role" });
    if (!made) return whole;
    found = toPart(made, note);
    return "";
  });
  const cleaned = afterMade.replace(/\[\s*(?:送礼|礼物)\s*[:：]\s*([^|\]\n]+)(?:\|([^\]\n]*))?\s*\]/gi, (whole, rawId, rawNote) => {
    if (found) return "";
    const raw = safe(rawId, 80);
    const item = catalogById(raw) || GIFT_CATALOG.find(entry => entry.name === raw)
      || shelf.find(entry => entry.id === raw || entry.name === raw);
    if (!item) return whole;
    found = toPart(item, rawNote);
    return "";
  }).replace(/\n{3,}/g, "\n\n").trim();
  return { text: cleaned, gift: found, made };
}

export function buildGiftSystemNote(parts, roleName = "TA", userName = "用户", customGifts = []) {
  const shelf = (Array.isArray(customGifts) ? customGifts : []).map(normalizeCustomGift).filter(Boolean).slice(-16);
  const history = (Array.isArray(parts) ? parts : []).map(normalizeGiftPart).filter(Boolean)
    .sort((a, b) => a.ts - b.ts).slice(-12);
  const catalog = GIFT_CATALOG.map(item => `${item.id}=${item.name}`).join("、");
  const rows = history.map(item => {
    const date = new Date(item.ts).toLocaleDateString("zh-CN");
    return `- ${date}：${giftPromptText(item).replace(/^🎁 礼物事件｜/, "")}`;
  });
  return [
    "【双向礼物·真实共同经历】",
    `${userName}可以把礼物卡送给你；礼物卡是已经真实发生的事件，按你的人设自然接住，不要像客服复述商品资料。`,
    `当你自己确实自然地想送${userName}一份礼物时，可以在正文末尾单独写一次 \`[送礼:礼物ID|你的附言]\`。应用会把它变成由${roleName}送出的礼物卡；每轮最多一份，不要为了展示功能硬送，也不要声称已经送出却不写标记。`,
    `可用礼物：${catalog}。`,
    shelf.length ? `你们的自制礼物架（也可用 [送礼:名称|附言] 送出）：${shelf.map(item => `${item.name}${item.maker === "role" ? "（你做的）" : `（${userName}做的）`}`).join("、")}。` : "",
    `如果图鉴里没有你想送的，你也可以亲手做一份：在正文末尾写 \`[自制礼物:一个emoji|礼物名|一句描述|你的附言]\`（礼物名 12 字内），同样每轮最多一份，它会被放进你们的自制礼物架。`,
    rows.length ? `你们最近的礼物往来：\n${rows.join("\n")}\n只在相关时自然记起，不要提“系统、注入、礼物账本”。` : "你们还没有送过礼物。",
  ].filter(Boolean).join("\n");
}

export function renderGiftPartsHtml(content) {
  if (!Array.isArray(content)) return "";
  return content.map(normalizeGiftPart).filter(Boolean).map(item => {
    const label = item.direction === "role-to-user" ? `${item.senderName || "TA"} 送给 ${item.recipientName || "你"}` : `${item.senderName || "你"} 送给 ${item.recipientName || "TA"}`;
    const vars = item.colors || catalogById(item.giftId)?.colors || ["#f4eadb", "#a98968"];
    return `<article class="chat-gift-card ${item.direction}" style="--gift-a:${esc(vars[0])};--gift-b:${esc(vars[1])}">
      <div class="chat-gift-icon" aria-hidden="true">${esc(item.icon)}</div>
      <div class="chat-gift-copy"><small>${esc(label)}</small><strong>${esc(item.name)}</strong><span>${esc(item.subtitle)}</span>${item.note ? `<em>“${esc(item.note)}”</em>` : ""}</div>
      <span class="chat-gift-seal" aria-hidden="true">${item.custom ? "HANDMADE" : "GIFT"}</span>
    </article>`;
  }).join("");
}

function createPanel() {
  if (document.getElementById("gift-panel")) return document.getElementById("gift-panel");
  const panel = document.createElement("section");
  panel.id = "gift-panel";
  panel.className = "gift-panel";
  panel.hidden = true;
  panel.innerHTML = `<div class="gift-shell" role="dialog" aria-modal="true" aria-labelledby="gift-title">
    <header class="gift-header"><div><small>BETWEEN US</small><h2 id="gift-title">礼物图鉴</h2><p id="gift-subtitle">挑一份心意，送进真实对话。</p></div><button type="button" data-gift-close aria-label="关闭">×</button></header>
    <nav class="gift-categories" aria-label="礼物分类"></nav>
    <div class="gift-grid"></div>
    <section class="gift-maker" hidden>
      <div class="gift-maker-head"><strong class="gift-maker-title">亲手做一份礼物</strong><button type="button" data-gift-maker-cancel aria-label="收起">×</button></div>
      <div class="gift-maker-preview"><span class="gift-maker-preview-icon">🎁</span><div><strong class="gift-maker-preview-name">礼物名</strong><em class="gift-maker-preview-sub">一句描述</em></div></div>
      <div class="gift-maker-row"><input class="gift-maker-icon" maxlength="8" placeholder="🎁" aria-label="图标（一个 emoji）" /><input class="gift-maker-name" maxlength="24" placeholder="礼物名，例如：会发光的贝壳" /></div>
      <input class="gift-maker-sub" maxlength="60" placeholder="一句描述，例如：海边捡的，留着等你" />
      <div class="gift-maker-colors" role="radiogroup" aria-label="颜色"></div>
      <div class="gift-maker-actions"><button type="button" data-gift-maker-save>放进礼物架</button><button type="button" class="primary" data-gift-maker-send>做好就送给 TA</button></div>
    </section>
    <section class="gift-history"><div><strong>礼物往来</strong><span class="gift-history-count">0 份</span></div><div class="gift-history-list"></div></section>
    <button type="button" class="gift-request">看看 TA 会送我什么</button>
  </div>`;
  document.body.appendChild(panel);
  return panel;
}

function initBrowser() {
  const bridge = window.JYCGiftBridge;
  if (!bridge) return;
  const panel = createPanel();
  let category = "all";
  const categories = panel.querySelector(".gift-categories");
  const grid = panel.querySelector(".gift-grid");
  const maker = panel.querySelector(".gift-maker");
  let makerColor = 0;
  const shelf = () => (bridge.customGifts?.() || []).map(normalizeCustomGift).filter(Boolean);
  const findAny = id => catalogById(id) || shelf().find(item => item.id === id);
  const tile = item => `<button type="button" class="gift-item${item.custom ? " is-custom" : ""}" data-gift-id="${esc(item.id)}" style="--gift-a:${esc(item.colors[0])};--gift-b:${esc(item.colors[1])}">${item.custom ? `<i class="gift-maker-tag">${item.maker === "role" ? "TA 做的" : "我做的"}</i><span class="gift-delete" role="button" data-gift-delete="${esc(item.id)}" aria-label="删除">×</span>` : ""}<span>${esc(item.icon)}</span><strong>${esc(item.name)}</strong><em>${esc(item.subtitle)}</em></button>`;
  function syncPreview() {
    const icon = [...(maker.querySelector(".gift-maker-icon").value.trim())].slice(0, 2).join("") || "🎁";
    maker.querySelector(".gift-maker-preview-icon").textContent = icon;
    maker.querySelector(".gift-maker-preview-name").textContent = maker.querySelector(".gift-maker-name").value.trim() || "礼物名";
    maker.querySelector(".gift-maker-preview-sub").textContent = maker.querySelector(".gift-maker-sub").value.trim() || "一句描述";
    const [a, b] = GIFT_COLOR_PRESETS[makerColor];
    maker.style.setProperty("--gift-a", a); maker.style.setProperty("--gift-b", b);
    maker.querySelector(".gift-maker-colors").innerHTML = GIFT_COLOR_PRESETS.map((c, i) => `<button type="button" role="radio" aria-checked="${i === makerColor}" class="${i === makerColor ? "active" : ""}" data-gift-color="${i}" style="background:linear-gradient(135deg,${c[0]},${c[1]})" aria-label="颜色 ${i + 1}"></button>`).join("");
  }
  function openMaker() {
    maker.hidden = false;
    ["icon", "name", "sub"].forEach(k => { maker.querySelector(`.gift-maker-${k}`).value = ""; });
    makerColor = 0; syncPreview();
    maker.scrollIntoView({ block: "center", behavior: "smooth" });
    setTimeout(() => maker.querySelector(".gift-maker-name").focus(), 250);
  }
  function makerItem() {
    return normalizeCustomGift({
      icon: maker.querySelector(".gift-maker-icon").value, name: maker.querySelector(".gift-maker-name").value,
      subtitle: maker.querySelector(".gift-maker-sub").value, colors: GIFT_COLOR_PRESETS[makerColor], maker: "user",
    });
  }
  maker.addEventListener("input", syncPreview);

  function render() {
    const info = bridge.context();
    panel.querySelector("#gift-subtitle").textContent = `挑一份心意，送给 ${info.roleName || "TA"}。`;
    categories.innerHTML = GIFT_CATEGORIES.map(item => `<button type="button" class="${item.id === category ? "active" : ""}" data-gift-category="${item.id}">${item.label}</button>`).join("");
    const mine = shelf().slice().reverse();
    const shown = category === "all" ? [...mine, ...GIFT_CATALOG] : category === "custom" ? mine : GIFT_CATALOG.filter(item => item.category === category);
    const addTile = category === "all" || category === "custom" ? `<button type="button" class="gift-item gift-add" data-gift-make><span>＋</span><strong>自制礼物</strong><em>图鉴里没有的，亲手做一份</em></button>` : "";
    grid.innerHTML = addTile + shown.map(tile).join("") + (category === "custom" && !mine.length ? `<p class="gift-history-empty">还没有自制礼物。TA 也可能亲手做一份送你。</p>` : "");
    const history = bridge.history().slice(-12).reverse();
    panel.querySelector(".gift-history-count").textContent = `${bridge.history().length} 份`;
    panel.querySelector(".gift-history-list").innerHTML = history.length ? history.map(raw => {
      const item = normalizeGiftPart(raw);
      const who = item.direction === "role-to-user" ? `${item.senderName} → ${item.recipientName}` : `${item.senderName} → ${item.recipientName}`;
      return `<div><span>${esc(item.icon)}</span><p><strong>${esc(item.name)}</strong><small>${esc(who)} · ${new Date(item.ts).toLocaleDateString("zh-CN")}</small></p></div>`;
    }).join("") : "<p class=\"gift-history-empty\">第一份礼物还在等你。</p>";
  }

  function open() { render(); panel.hidden = false; document.body.classList.add("gift-panel-open"); }
  function close() { panel.hidden = true; document.body.classList.remove("gift-panel-open"); }
  panel.addEventListener("click", event => {
    if (event.target === panel || event.target.closest("[data-gift-close]")) { close(); return; }
    const cat = event.target.closest("[data-gift-category]");
    if (cat) { category = cat.dataset.giftCategory; render(); return; }
    const del = event.target.closest("[data-gift-delete]");
    if (del) {
      event.stopPropagation();
      const item = shelf().find(x => x.id === del.dataset.giftDelete);
      if (item && window.confirm(`把「${item.name}」从礼物架拿走？（已经送出的礼物卡不受影响）`)) { bridge.removeCustomGift?.(item.id); render(); }
      return;
    }
    if (event.target.closest("[data-gift-make]")) { openMaker(); return; }
    if (event.target.closest("[data-gift-maker-cancel]")) { maker.hidden = true; return; }
    const color = event.target.closest("[data-gift-color]");
    if (color) { makerColor = Number(color.dataset.giftColor) || 0; syncPreview(); return; }
    const saveBtn = event.target.closest("[data-gift-maker-save], [data-gift-maker-send]");
    if (saveBtn) {
      const item = makerItem();
      if (!item) { maker.querySelector(".gift-maker-name").focus(); return; }
      bridge.addCustomGift?.(item);
      maker.hidden = true;
      if (saveBtn.matches("[data-gift-maker-send]")) {
        const note = window.prompt(`给「${item.name}」写一句附言（可以留空）`, "");
        if (note == null) { category = "custom"; render(); return; }
        close(); bridge.send(item, safe(note, 240)); return;
      }
      category = "custom"; render(); return;
    }
    const itemButton = event.target.closest("[data-gift-id]");
    if (itemButton) {
      const item = findAny(itemButton.dataset.giftId);
      if (!item) return;
      const note = window.prompt(`给「${item.name}」写一句附言（可以留空）`, "") ?? null;
      if (note == null) return;
      close(); bridge.send(item, safe(note, 240)); return;
    }
    if (event.target.closest(".gift-request")) { close(); bridge.requestFromRole(); }
  });
  window.addEventListener("jyc:gifts-open", open);
  window.addEventListener("jyc:gifts-updated", () => { if (!panel.hidden) render(); });
  window.JYCGifts = { GIFT_CATALOG, open, close, renderGiftPartsHtml, giftPromptText, extractAssistantGift, buildGiftSystemNote, normalizeCustomGift };
}

if (typeof window !== "undefined") {
  window.JYCGifts = { GIFT_CATALOG, renderGiftPartsHtml, giftPromptText, extractAssistantGift, buildGiftSystemNote, normalizeCustomGift };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", initBrowser, { once: true });
  else initBrowser();
}
