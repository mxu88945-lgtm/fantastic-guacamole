import { readFileSync } from "node:fs";
import vm from "node:vm";
import assert from "node:assert/strict";
import { mentionQuery } from "../src/rp-mentions.js";
import { readRoleplayAvatar } from "../src/rp-avatar.js";

assert.equal(mentionQuery("user@example.com"), null);
assert.equal(mentionQuery("你好 @江").query, "江");
assert.equal(mentionQuery("你好＠江").start, 2);
assert.equal(mentionQuery("你好 @江 后文", 5).query, "江");

// A small DOM adapter exercises the actual picker events without a browser.
class Element {
  constructor(tag) { this.tagName = tag; this.children = []; this.listeners = {}; this.attrs = {}; this.dataset = {}; this.hidden = false; this.value = ""; this.selectionStart = 0; }
  append(...nodes) { for (const node of nodes) { node.parent = this; this.children.push(node); } }
  before(node) { const i = this.parent.children.indexOf(this); node.parent = this.parent; this.parent.children.splice(i, 0, node); }
  replaceChildren(...nodes) { this.children = []; this.append(...nodes); }
  setAttribute(key, value) { this.attrs[key] = value; }
  removeAttribute(key) { delete this.attrs[key]; }
  addEventListener(type, listener) { (this.listeners[type] ||= []).push(listener); }
  dispatchEvent(event) { event.target ||= this; for (const listener of this.listeners[event.type] || []) listener(event); }
  focus() { document.activeElement = this; }
  setSelectionRange(start) { this.selectionStart = start; }
  contains(node) { return node === this || this.children.some(child => child.contains(node)); }
  closest(selector) { return this.matches(selector) ? this : this.parent?.closest(selector); }
  matches(selector) { return selector.startsWith(".") ? this.className === selector.slice(1) : selector === "[data-mention-id]" && !!this.dataset.mentionId; }
  query(selector) { if (this.matches(selector)) return this; for (const child of this.children) { const found = child.query(selector); if (found) return found; } return null; }
}
class TestEvent { constructor(type) { this.type = type; } preventDefault() {} stopImmediatePropagation() {} }
const root = new Element("div"), composer = new Element("div"), input = new Element("textarea");
composer.className = "composer"; root.append(composer); composer.append(input);
const document = { activeElement: input, createElement: tag => new Element(tag), getElementById: id => id === "input" ? input : null, addEventListener() {} };
const scene = { id: "scene", space: "roleplay", rpProject: { actorName: "周竞尧", groupEnabled: true, members: [{ id: "guest", name: "江屹琛", kind: "actor", enabled: true }, { id: "director", name: "导演", kind: "director", enabled: true }] } };
const window = { JYCRoleplayBridge: { current: () => scene }, events: {}, addEventListener(type, listener) { (this.events[type] ||= []).push(listener); } };
const context = vm.createContext({ document, window, Event: TestEvent, console });
const pickerSource = readFileSync(new URL("../src/rp-mentions.js", import.meta.url), "utf8").replace("export function mentionQuery", "function mentionQuery");
vm.runInContext(pickerSource, context);
const tools = root.query(".rp-mention-tools"), list = root.query(".rp-mention-options");
assert.equal(tools.hidden, true, "the picker must stay out of the layout until @ is typed");
input.value = "@"; input.selectionStart = 1; input.dispatchEvent(new TestEvent("input"));
assert.equal(list.hidden, false, "typing @ must actually open a member picker");
assert.equal(list.children.length, 3);
const guest = list.children.find(option => option.dataset.mentionId === "guest");
const click = new TestEvent("click"); click.target = guest.children[1]; list.dispatchEvent(click);
assert.equal(input.value, "@江屹琛 ", "the picker must insert the selected @ target back into the composer");
assert.equal(window.JYCRoleplayMentions.selectedIds().join(","), "guest");
assert.equal(list.hidden, true);
assert.equal(input.placeholder, "输入 @ 选择回答的角色……");

// Drive send() after selecting the guest: metadata must survive clearing the UI.
const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const source = (start, end) => html.slice(html.indexOf(start), html.indexOf(end, html.indexOf(start)));
assert.ok(html.includes('消息已发送，再点 @ 选择要回复的角色'), "群聊正文发送后必须允许稍后再选择回复角色");
assert.ok(html.includes('const mentionOnlyTurn = !!(rp?.groupEnabled'), "mention-only routing must be separated from the visible user turn");
assert.ok(html.includes('if (!silent && !mentionOnlyTurn && messages.length > 0'), "mention-only routing must not insert a fake visible no-reply assistant");
Object.assign(context, {
  uid: () => "sent-message", cloneChatData: structuredClone,
  isRoleplayConversation: (conv = scene) => conv.space === "roleplay", currentConv: () => scene,
  abortController: null, roleplayGroupRun: null, replyBooting: false,
  pendingAttachments: [], attachmentStaging: [], messages: [], settings: { apiKey: "test-key" },
  showToast: message => { context.toast = message; },
  $: id => id === "input" ? input : null,
});
for (const name of ["clearError", "renderAttachPreview", "autoResize", "dismissComposerKeyboard", "touchConversation", "pinToBottom", "markSeen"]) context[name] = () => {};
context.appendLastMessageFast = () => true;
context.renderMessages = () => { throw Error("unnecessary chat redraw"); };
context.generateReply = async () => { context.sentSelection = [...context.messages.at(-1).rpReplyMemberIds]; };
vm.runInContext(source("const ROLEPLAY_MEMORY_DEFAULT_SUMMARY_PROMPT", "function addRoleplayMemory("), context);
vm.runInContext(source("async function send(opts)", "// Show/hide a password input"), context);
input.value += "我在这里。";
await context.send();
assert.equal(context.messages[0].content, "我在这里。");
assert.equal(context.messages[0].rpReplyMemberIds.join(","), "guest");
assert.equal(context.sentSelection.join(","), "guest", "the API dispatcher must receive the selected member after the input is cleared");
assert.equal(window.JYCRoleplayMentions.selectedIds().length, 0, "@ targets are only for one user turn");
const project = context.normalizedRoleplayProject(scene.rpProject, scene);
assert.equal(context.roleplayReplyMembers(project, context.messages[0].content, context.messages[0].rpReplyMemberIds).map(member => member.name).join(","), "江屹琛");
input.value = context.messages[0].content;
window.JYCRoleplayMentions.restore(context.messages[0].rpReplyMemberIds);
assert.equal(window.JYCRoleplayMentions.selectedIds().join(","), "guest", "editing and resending must restore the original recipient");
assert.equal(input.value, "@江屹琛 我在这里。", "editing must restore the inline @ target too");
window.JYCRoleplayMentions.clear();

// A mention-only turn routes the reply without leaving a visible @ bubble in the chat.
context.messages.length = 0;
context.generateCalls = 0;
context.generateReply = async () => { context.generateCalls++; };
input.value = "先把这段话发出去";
await context.send();
assert.equal(context.messages[0].content, "先把这段话发出去");
assert.equal(context.generateCalls, 0, "群聊正文发送后不应自动触发角色回复");
assert.equal(context.messages.length, 1, "正文发送后不应插入无回复占位消息");
context.generateReply = async () => { context.sentSelection = [...context.messages.at(-1).rpReplyMemberIds]; };
context.messages.length = 0;
input.value = "@"; input.selectionStart = 1; input.dispatchEvent(new TestEvent("input"));
const guestAgain = list.children.find(option => option.dataset.mentionId === "guest");
const secondClick = new TestEvent("click"); secondClick.target = guestAgain.children[1]; list.dispatchEvent(secondClick);
await context.send();
assert.equal(context.messages[0].rpMentionOnly, true);
assert.equal(context.messages[0].content, "@江屹琛");
assert.equal(context.isHiddenRoleplayMentionMessage(context.messages[0]), true, "mention-only routing turns must stay out of the visible transcript");
assert.equal(context.sentSelection.join(","), "guest");
assert.ok(html.includes("if (isHiddenRoleplayMentionMessage(m)) continue;"), "full chat rendering does not hide mention-only routing turns");
assert.ok(html.includes("if (isHiddenRoleplayMentionMessage(m)) return true;"), "fast append still paints mention-only routing turns");

// Keyboard selection and window changes must not send or retain an old target.
input.value = "@导演"; input.selectionStart = input.value.length; input.dispatchEvent(new TestEvent("input"));
const enter = new TestEvent("keydown"); enter.key = "Enter"; input.dispatchEvent(enter);
assert.equal(window.JYCRoleplayMentions.selectedIds().join(","), "director");
scene.id = "another-scene"; window.events["jyc:chat-opened"].forEach(listener => listener());
assert.equal(window.JYCRoleplayMentions.selectedIds().length, 0);
scene.space = "private"; scene.rpProject.groupEnabled = false; window.events["jyc:chat-opened"].forEach(listener => listener());
assert.equal(tools.hidden, true);

// Image decoding/cropping is local; resource URLs must be released on failure too.
const saved = { Image: globalThis.Image, document: globalThis.document, create: URL.createObjectURL, revoke: URL.revokeObjectURL };
const revoked = [], draws = [];
let rejectDecode = false;
try {
  URL.createObjectURL = () => "blob:portrait";
  URL.revokeObjectURL = source => revoked.push(source);
  globalThis.Image = class { naturalWidth = 1200; naturalHeight = 800; set src(value) { queueMicrotask(() => rejectDecode ? this.onerror() : this.onload()); } };
  globalThis.document = { createElement: () => ({ getContext: () => ({ drawImage: (...args) => draws.push(args) }), toDataURL: () => "data:image/jpeg;base64,cG9ydHJhaXQ=" }) };
  const avatar = await readRoleplayAvatar({ type: "image/jpeg", size: 10000 });
  assert.equal(avatar, "data:image/jpeg;base64,cG9ydHJhaXQ=");
  assert.deepEqual(draws[0].slice(1), [200, 0, 800, 800, 0, 0, 256, 256]);
  assert.equal(revoked.length, 1);
  rejectDecode = true;
  await assert.rejects(readRoleplayAvatar({ type: "image/png", size: 10000 }), /无法读取/);
  assert.equal(revoked.length, 2);
  await assert.rejects(readRoleplayAvatar({ type: "text/plain", size: 100 }), /请选择一张图片/);
  const p = context.normalizedRoleplayProject({ actorName: "周竞尧", actorAvatar: avatar, members: [{ id: "guest", name: "江屹琛", avatar }] });
  assert.equal(context.roleplayMembers(p)[0].avatar, avatar);
  assert.equal(context.roleplayMembers(p)[1].avatar, avatar);
  vm.runInContext(source("function avatarFor(", "function nameFor("), context);
  context.settings.aiAvatar = "顾祁砚本体头像";
  scene.space = "roleplay"; scene.rpProject = p;
  assert.equal(context.avatarFor("assistant"), avatar);
  scene.space = "private";
  assert.equal(context.avatarFor("assistant"), "顾祁砚本体头像");
} finally {
  globalThis.Image = saved.Image; globalThis.document = saved.document;
  URL.createObjectURL = saved.create; URL.revokeObjectURL = saved.revoke;
}
console.log("RP mentions regression: picker click/keyboard → user metadata → targeted reply, scoped image portraits passed");
