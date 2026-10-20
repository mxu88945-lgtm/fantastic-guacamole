import "./rp-sidechat.css";

// 戏外小窗：在 RP 剧场对戏时，侧边开一个跟顾祁砚本体私聊/吐槽的小窗口。
// 独立模块：不碰主聊天状态，自己读 localStorage 里的设置调接口。

const bridge = window.JYCRoleplayBridge;
if (!bridge) {
console.error("RP sidechat: bridge unavailable");
} else {
const escape = (v) => String(v?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"})[c]);
const DEFAULT_BASE = {
openai: "https://api.openai.com/v1",
anthropic: "https://api.anthropic.com/v1",
gemini: "https://generativelanguage.googleapis.com/v1beta",
};

// ---------- 设置与上下文 ----------
function readSettings() {
try { return JSON.parse(localStorage.getItem("jyc_settings") || "{}");}
catch (_) { return {};}
}
function currentSceneId() {
try { return bridge.current()?.id || "";} catch (_) { return "";}
}
function sidechatKey() { return "jyc_sidechat_" + currentSceneId();}
function loadHistory() {
try { const h = JSON.parse(localStorage.getItem(sidechatKey()) || "[]"); return Array.isArray(h)? h: [];}
catch (_) { return [];}
}
function saveHistory(items) {
try { localStorage.setItem(sidechatKey(), JSON.stringify(items.slice(-100)));} catch (_) {}
}
// 从主对话抓最近的戏，给顾祁砚当吐槽素材
function recentSceneText(limit = 8) {
try {
const convs = JSON.parse(localStorage.getItem("jyc_conversations") || "[]");
const conv = (Array.isArray(convs)? convs: []).find((c) => c.id === currentSceneId());
const msgs = (conv?.messages || []).filter((m) => (m.role === "user" || m.role === "assistant") &&!m._summary &&!m._event);
const textOf = (m) => {
const c = m.content;
if (typeof c === "string") return c;
if (Array.isArray(c)) return c.filter((p) => p.type === "text").map((p) => p.text).join("\n");
return "";
};
return msgs.slice(-limit).map((m) => {
const who = m.role === "user"? "她": (m.rpSpeakerName || "顾祁砚(演)");
return `${who}：${textOf(m).slice(0, 600)}`;
}).join("\n\n");
} catch (_) { return "";}
}
function resolveProvider() {
const s = readSettings();
let conv = null;
try {
const convs = JSON.parse(localStorage.getItem("jyc_conversations") || "[]");
conv = (Array.isArray(convs)? convs: []).find((c) => c.id === currentSceneId());
} catch (_) {}
const profiles = Array.isArray(s.providers)? s.providers: [];
const profile = profiles.find((p) => p.id === conv?.providerId) || profiles.find((p) => p.id === s.activeProviderId) || null;
const provider = profile?.provider || s.provider || "openai";
return {
kind: provider,
base: (profile?.baseUrl || s.baseUrl || DEFAULT_BASE[provider] || "").replace(/\/$/, ""),
key: profile?.apiKey || s.apiKey || "",
model: conv?.model || profile?.model || s.model || "",
temperature: s.temperature?? 0.8,
maxTokens: 1500,
};
}
function buildSystemPrompt() {
const s = readSettings();
const base = String(s.systemPrompt || "").trim();
const scene = recentSceneText();
return [
base,
"",
"你现在不在戏里。这个小窗是她跟你（顾祁砚本人）私下唠嗑的地方，主窗口里你们还在对戏（你在演戏里的角色）。",
"说话就用你平时的样子：直接、有情绪、不端着。她可能让你点评刚才的戏、吐槽剧情走向，或者纯找你聊天。",
"你知道台上正在发生什么，可以主动接梗、吐槽，别装不知道。",
"不替她决定行动、台词和心理；她的行动空间完整留给她。",
scene? `\n${scene}`: "",
].filter(Boolean).join("\n");
}

async function callSideChat(messages) {
const p = resolveProvider();
if (!p.key) throw new Error("no_api_key");
if (!p.model) throw new Error("no_model");
const systemText = buildSystemPrompt();
const isAnthropic = /anthropic/i.test(p.base) || /(^|\/)claude/i.test(p.model) || p.kind === "anthropic";
const isGemini = /generativelanguage/i.test(p.base) || /^gemini/i.test(p.model) || p.kind === "gemini";
let url, headers, body;
const apiMessages = messages.map((m) => ({ role: m.role, content: m.content}));
if (isAnthropic) {
url = p.base + "/messages";
headers = { "content-type": "application/json", "x-api-key": p.key, "anthropic-version": "2023-06-01", "anthropic-dangerous-direct-browser-access": "true"};
body = { model: p.model, max_tokens: p.maxTokens, temperature: p.temperature, system: systemText, messages: apiMessages};
} else if (isGemini) {
const modelId = p.model.startsWith("models/")? p.model: "models/" + p.model;
url = p.base + "/" + modelId + ":generateContent";
headers = { "content-type": "application/json", "x-goog-api-key": p.key};
body = {
contents: apiMessages.map((m) => ({ role: m.role === "assistant"? "model": "user", parts: [{ text: m.content}]})),
generationConfig: { temperature: p.temperature, maxOutputTokens: p.maxTokens},
systemInstruction: { parts: [{ text: systemText}]},
};
} else {
url = p.base + "/chat/completions";
headers = { "content-type": "application/json", "authorization": "Bearer " + p.key};
body = { model: p.model, temperature: p.temperature, max_tokens: p.maxTokens, stream: false,
messages: [{ role: "system", content: systemText},...apiMessages]};
}
const resp = await fetch(url, { method: "POST", headers, body: JSON.stringify(body)});
if (!resp.ok) {
const detail = await resp.text().catch(() => "");
throw new Error("HTTP " + resp.status + (detail? " " + detail.slice(0, 120): ""));
}
const data = await resp.json();
if (isAnthropic) return (data.content || []).map((c) => c.text || "").join("").trim();
if (isGemini) return (data.candidates?.[0]?.content?.parts || []).map((pt) => pt.text || "").join("").trim();
return (data.choices?.[0]?.message?.content || "").trim();
}

// ---------- UI ----------
const tab = document.createElement("button");
tab.type = "button";
tab.className = "rp-sidechat-tab";
tab.title = "跟顾祁砚戏外唠嗑";
tab.innerHTML = "<span>戏外<br>小窗</span>";
tab.hidden = true;
document.body.append(tab);

const panel = document.createElement("div");
panel.className = "rp-sidechat-panel";
panel.hidden = true;
panel.innerHTML = `
<header class="rp-sidechat-head">
<div><strong>顾祁砚</strong><small>戏外小窗 · 台上在演，咱俩唠嗑</small></div>
<button type="button" class="rp-sidechat-close" aria-label="关闭">×</button>
</header>
<div class="rp-sidechat-messages" id="rp-sidechat-messages"></div>
<div class="rp-sidechat-composer">
<input id="rp-sidechat-input" placeholder="跟他吐槽刚才的戏……" maxlength="2000" />
<button type="button" id="rp-sidechat-send">➤</button>
</div>`;
document.body.append(panel);

const msgBox = panel.querySelector("#rp-sidechat-messages");
const input = panel.querySelector("#rp-sidechat-input");
const sendBtn = panel.querySelector("#rp-sidechat-send");
let history = [];
let sending = false;

function render() {
msgBox.replaceChildren();
if (!history.length) {
const hint = document.createElement("p");
hint.className = "rp-sidechat-hint";
hint.textContent = "台上演你们的，这里跟顾祁砚本人唠嗑——让他点评、吐槽，或者纯聊天。";
msgBox.append(hint);
}
for (const m of history) {
const div = document.createElement("div");
div.className = "rp-sidechat-msg " + (m.role === "user"? "user": "ai");
div.innerHTML = `<div class="rp-sidechat-bubble">${escape(m.content).replace(/\n/g, "<br>")}</div>`;
msgBox.append(div);
}
msgBox.scrollTop = msgBox.scrollHeight;
}
function open() {
if (!currentSceneId()) return;
history = loadHistory();
render();
panel.hidden = false;
tab.classList.add("open");
setTimeout(() => input.focus(), 50);
}
function close() {
panel.hidden = true;
tab.classList.remove("open");
}
async function send() {
const text = input.value.trim();
if (!text || sending) return;
sending = true;
sendBtn.disabled = true;
history.push({ role: "user", content: text, ts: Date.now()});
input.value = "";
render();
const typing = document.createElement("div");
typing.className = "rp-sidechat-msg ai";
typing.innerHTML = '<div class="rp-sidechat-bubble typing">…</div>';
msgBox.append(typing);
msgBox.scrollTop = msgBox.scrollHeight;
try {
const reply = await callSideChat(history.map((m) => ({ role: m.role, content: m.content})));
history.push({ role: "assistant", content: reply || "（他没接上话）", ts: Date.now()});
} catch (e) {
const msg = String(e?.message || e);
history.push({ role: "assistant", content: msg.includes("no_api_key")? "（小窗还没配好接口，去设置里填一下 API Key）": "（小窗卡住了： " + msg.slice(0, 80) + "）", ts: Date.now()});
}
saveHistory(history);
sending = false;
sendBtn.disabled = false;
render();
input.focus();
}

tab.addEventListener("click", () => (panel.hidden? open(): close()));
panel.querySelector(".rp-sidechat-close").addEventListener("click", close);
sendBtn.addEventListener("click", send);
input.addEventListener("keydown", (e) => {
if (e.key === "Enter" &&!e.isComposing) { e.preventDefault(); send();}
});

function refreshVisibility() {
const inScene =!!currentSceneId();
tab.hidden =!inScene;
if (!inScene) close();
else if (!panel.hidden) { history = loadHistory(); render();}
}
for (const ev of ["jyc:chat-opened", "jyc:role-changed", "jyc:roleplay-updated"]) {
window.addEventListener(ev, refreshVisibility);
}
function syncKeyboard() {
if (panel.hidden || !window.visualViewport) return;
const kb = Math.max(0, window.innerHeight - window.visualViewport.height - window.visualViewport.offsetTop);
panel.style.bottom = kb > 60 ? kb + "px" : "";
}
if (window.visualViewport) {
window.visualViewport.addEventListener("resize", syncKeyboard);
window.visualViewport.addEventListener("scroll", syncKeyboard);
}
input.addEventListener("focus", () => setTimeout(syncKeyboard, 100));
input.addEventListener("blur", () => { panel.style.bottom = ""; });
refreshVisibility();
}
