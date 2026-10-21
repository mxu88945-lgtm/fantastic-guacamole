import { readFileSync } from "node:fs";
import vm from "node:vm";

const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const css = readFileSync(new URL("../src/rp-theater.css", import.meta.url), "utf8");
const groupCss = readFileSync(new URL("../src/rp-group.css", import.meta.url), "utf8");
const js = readFileSync(new URL("../src/rp-theater.js", import.meta.url), "utf8");
const dashboard = readFileSync(new URL("../src/dashboard.js", import.meta.url), "utf8");

let checks = 0;
const ok = (condition, message) => {
  checks++;
  if (!condition) throw new Error(message);
};

ok(html.includes('href="./src/rp-theater.css"'), "RP theater stylesheet is not loaded");
ok(html.includes('src="./src/rp-theater.js"'), "RP theater module is not loaded");
ok(html.includes('data-dashboard-action="roleplay"'), "dashboard has no RP theater entry");
ok(html.includes("window.JYCRoleplayBridge"), "RP bridge is missing");
ok(html.includes('newConversation("roleplay")'), "RP projects do not create isolated conversations");
ok(html.includes("function privateRoleConvs()"), "private chats are not separated from RP projects");
ok(html.includes("function sidebarRoleConvs()") && html.includes("roleConvs().filter(isRoleplayConversation)"), "RP and private sidebars are not separated by conversation space");
ok(html.includes("sidebarRoleConvs().filter(c => c.messages.length > 0)"), "sidebar does not use the active conversation space");
ok(html.includes("return privateRoleConvs().filter(c => Array.isArray(c.messages)"), "main-chat continuation can still select RP");
ok(html.includes("【RP 剧场·双层身份协议】"), "RP identity-layer prompt is missing");
ok(html.includes("戏内事件、感情和人物关系只属于本剧本档案"), "fiction memory isolation rule is missing");
ok(html.includes("不代替用户说话、行动、作决定、下心理结论或预设同意"), "user agency rule is missing");
ok(html.includes("addRoleplayMemory(t, sourceMessageId)"), "RP memory tokens are not routed to project memory");
ok(html.includes("RP 剧本的戏内连续性档案整理器"), "RP rolling-summary prompt is missing");
ok(html.includes("RP 剧情档案"), "cross-window RP source labeling is missing");
ok(js.includes("importCharacterCard") && js.includes("character_book"), "character-card import is incomplete");
ok(js.includes("alternate_greetings") && js.includes("rp-greeting-list"), "alternate greeting import or picker is missing");
ok(js.includes("rp-preview-greeting") && js.includes("greetingPreviewDocument"), "opening preview is missing");
ok(js.includes("bridge.startWithGreeting") && js.includes("选择开场白"), "new scenes must start through the opening picker");
ok(css.includes(".rp-theater-panel") && css.includes("@media (max-width: 680px)"), "RP theater responsive layout is missing");
ok(js.includes('data-rp-space="main"') && js.includes('data-rp-space="projects"') && js.includes('data-rp-space="roles"'), "RP theater home is missing categorized entrances");
ok(js.includes('id="rp-role-list"') && js.includes("detailCast(project).map"), "RP role library does not include the cast from every script");
ok(css.includes("body.rp-chat-active #model-config-btn { display: none; }"), "RP composer still shows the redundant model pill");
ok(css.includes("#rp-field-opening") && css.includes(".rp-greeting-card.selected"), "mobile-friendly opening editor is missing");
ok(html.includes("roleplayRichFrameHtml") && html.includes('sandbox="allow-scripts"'), "rich HTML openings are not sandbox-rendered");
ok(html.includes("jyc-rp-frame-height") && html.includes("Content-Security-Policy"), "rich opening isolation or auto-sizing is missing");
ok(html.includes("jyc-rp-card-action") && html.includes("enterRoleplayCardAction"), "rich opening choices cannot enter the RP conversation");
ok(html.includes("roleplay-rich-message") && css.includes(".roleplay-rich-message"), "rich opening cards do not use the wide RP layout");
ok(html.includes('currentConv()?.rpProject?.actorName || settings.aiName'), "RP messages still use the backstage identity as their author label");
ok(css.includes('.roleplay-rich-message > .msg-head'), "flat-layout rich openings still show a duplicate backstage author header");
ok(html.includes("greetings, openingIndex, alternateGreetings"), "opening selection is not persisted");
ok(html.includes('worldEntries: Array.isArray(raw.worldEntries)') && html.includes('regexRules: Array.isArray(raw.regexRules)') && html.includes('theaterWorldBackground: text("theaterWorldBackground")'), "saving an RP project drops worldbook, regex, tags or theater world");
ok(html.includes("function activeRoleplayWorldText(") && html.includes("entry?.enabled !== false"), "live RP requests do not honor the current worldbook enable switch");
ok(js.includes("function autosaveExistingDraft()") && js.includes("autosaveExistingDraft();"), "worldbook switches must persist immediately for existing scenes");
ok(html.includes("【本剧本世界观（本剧场所有角色与 NPC 共用）】"), "theater world background never reaches the prompt");
ok(js.includes("function displayGreeting(") && !js.includes("bridge.update(projectId, { ...rp, greetings: processed })"), "openings must be beautified only for display, never rewritten in storage");
ok(js.includes("if (looksLikeRichGreeting(regexed)) return regexed"), "regex-produced HTML openings must render as HTML, not be re-bubbled");
ok(js.includes("function cardStructure(") && js.includes("patch.regexRules = extra.regexRules"), "JSON repair must restore lost regex/worldbook");
ok(html.includes("function roleplayRegexDisplay(") && html.includes("answer = roleplayRegexDisplay(answer)"), "card regex must beautify RP chat messages at display time");
ok(html.includes("async function continueRoleplayStory()") && html.includes("rp-continue-act") && html.includes("const hideStats = isRoleplayConversation()"), "RP chat needs a ▶ continue button and hides token/latency stats");
ok(js.includes("showDetail(current.id)") && html.includes("情景与角色资料</button>"), "chat menu 情景与角色资料 opens the 惟镜-style character hub");
ok(js.includes('id="rp-detail-cast-list"') && js.includes("data-detail-member") && js.includes("rp.groupEnabled && cast.length > 1"), "group role details need an 惟镜-style cast selector");
ok(js.includes("window.JYCRoleplayGroup?.openMember?.(selected.id)"), "supporting cast details must open the selected member editor");
ok(!js.includes("closePanel("), "detail continue button calls an undefined closePanel");
ok(js.includes('showEditor(project, "world")') && js.includes('showEditor(project, "regex")'), "detail rows must open their own section page like 惟镜");
ok(css.includes('#rp-editor-view[data-section="world"] [data-rp-sec]:not([data-rp-sec="world"])'), "section pages must hide other editor parts");
ok(css.includes(".rp-entry-list > * { flex-shrink: 0; }"), "worldbook/regex rows can be squashed by the scrolling list");
ok(css.includes("grid-template-columns: minmax(0, 1fr) minmax(0, 1fr)"), "editor grid can overflow the phone width");
ok(dashboard.includes('action === "roleplay"') && dashboard.includes("jyc:roleplay-updated"), "dashboard does not open or refresh RP theater");

const context = { settings: { userName: "周惟惟", aiName: "顾祁砚" }, current: { space: "roleplay", rpProject: { userRole: "顾里", actorName: "周竞尧" } } };
context.currentConv = () => context.current;
context.isRoleplayConversation = (conv = context.current) => conv?.space === "roleplay";
vm.createContext(context);
vm.runInContext(html.slice(html.indexOf('function nameFor(role)'), html.indexOf('function isImageRef(')), context);
ok(context.nameFor('user') === '顾里' && context.nameFor('assistant') === '周竞尧', 'RP participants must use their scoped stage names');
context.current = { space: 'private' };
ok(context.nameFor('user') === '周惟惟' && context.nameFor('assistant') === '顾祁砚', 'RP names must not overwrite private identities');
context.roleConvs = () => [{ space: 'roleplay', title: '测试剧本', rpProject: { actorName: '周竞尧', userRole: '顾里', memory: '戏内已经离婚', memories: [] }, messages: [{ role: 'user', content: '归还信物' }] }];
context.normalizedRoleplayProject = p => p;
context.messageText = m => m.content;
context.looksLikeRoleplayRichHtml = () => false;
vm.runInContext(html.slice(html.indexOf('function buildSharedRoleplayExperienceText()'), html.indexOf('function buildConversationProjectText(')), context);
const shared = context.buildSharedRoleplayExperienceText();
ok(shared.includes('戏内已经离婚') && shared.includes('顾里：归还信物') && shared.includes('不是本体真实经历'), 'private prompts must include real RP archives with fiction boundaries');
context.current = { space: 'roleplay' };
ok(context.buildSharedRoleplayExperienceText() === '', 'other RP projects must not leak into the active stage');
ok(dashboard.includes('JYCRoleplayBridge?.exitToHome?.()') && js.includes('rp-home-exit'), 'RP must have a working backstage-home exit');
ok(html.includes('box.dataset.conversationId === currentId') && html.includes('scroller.scrollTop = oldTop'), 'RP redraws must retain the current scroll position');
ok(html.includes('window.getChatMessages=async') && html.includes('jyc-rp-select-greeting') && html.includes('重看原始开场'), 'original opening and Tavern swipe navigation must be recoverable');
ok(html.includes('function splitRoleplayHtmlFences(') && html.includes('class="roleplay-html-stack"'), 'multi-page card openings must render as separate Weijing-style blocks');
ok(html.includes('if (splitRoleplayHtmlFences(out)) return out'), 'display regex must preserve HTML fence layout boundaries');
ok(css.includes('.roleplay-html-stack') && css.includes('.roleplay-opening-text'), 'opening HTML cards and story text must use a full-width single-column flow');
const sceneContext = {
  conversations: [], currentId: 'other', messages: [],
  normalizedRoleplayProject: (p, conv) => ({ ...p, opening: p.greetings[p.openingIndex || 0], title: p.title || conv.title }),
  isRoleplayConversation: conv => conv?.space === 'roleplay',
  newConversation: () => ({ id: 'new-scene', space: 'roleplay', messages: [], providerId: 'default', model: 'default' }),
  cloneChatData: value => JSON.parse(JSON.stringify(value)),
  conversationProjectFiles: conv => conv.projectFiles || [],
  uid: () => 'opening-message', saveConversations: () => {},
  roleplayPublicProject: conv => conv, window: { dispatchEvent() {} },
  CustomEvent: class { constructor(type) { this.type = type; } },
};
vm.createContext(sceneContext);
vm.runInContext(html.slice(html.indexOf('function roleplaySceneFromGreeting('), html.indexOf('window.JYCRoleplayBridge =')), sceneContext);
const source = { id: 'old-scene', space: 'roleplay', title: '测试故事', providerId: 'chosen-provider', model: 'chosen-model', messages: [{ role: 'assistant', content: '旧开场' }, { role: 'user', content: '旧剧情' }], rpProject: { greetings: ['角色卡首页', '完整的第二开场正文'], openingIndex: 0, memory: '旧场次摘要', memories: [{ text: '旧剧情事实' }] } };
const fresh = sceneContext.roleplaySceneFromGreeting(source, 1, true);
ok(fresh.messages.length === 1 && fresh.messages[0].role === 'assistant' && fresh.messages[0].content === '完整的第二开场正文', 'selected opening must be the assistant first message without a user selection turn');
ok(source.messages.length === 2 && source.rpProject.memory === '旧场次摘要', 'choosing a new opening must preserve the previous scene');
ok(fresh.rpProject.memory === '' && fresh.rpProject.memories.length === 0 && fresh.model === 'chosen-model', 'a fresh opening must reset scene memory while retaining its channel');
ok(sceneContext.roleplaySceneFromGreeting(source, 99, true) === null, 'invalid greeting indexes must not create conversations');
const pristine = { id: 'pristine', space: 'roleplay', title: '刚导入', messages: [{ role: 'assistant', content: '首页' }], rpProject: { greetings: ['首页', '正文开场'], memory: '', memories: [] } };
ok(sceneContext.roleplaySceneFromGreeting(pristine, 1).id === 'pristine' && pristine.messages[0].content === '正文开场', 'selecting an untouched opening should replace its assistant turn in place');
const clickAction = html.slice(html.indexOf('function enterRoleplayCardAction('), html.indexOf('if (typeof window !== "undefined") window.addEventListener("message"', html.indexOf('function enterRoleplayCardAction(')));
ok(!clickAction.includes('send()') && !clickAction.includes('input.value'), 'card choices must never send a user-authored message or call the model');
const sourceContext = { uid: () => 'test-id', escapeHtml: value => String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'), renderMarkdown: value => `<p>${value}</p>` };
vm.createContext(sourceContext);
vm.runInContext(html.slice(html.indexOf('function roleplayRichSource('), html.indexOf('function looksLikeRoleplayRichHtml(')), sourceContext);
ok(sourceContext.roleplayRichSource('```html\r\n<html><body>cover</body></html>\r\n```\r\n\r\n[播放: test]') === '<html><body>cover</body></html>', 'a card fence followed by an audio tag must still unwrap to its HTML document');
const semantic = sourceContext.roleplaySemanticDisplay('<scene>深夜｜休息室</scene>正文<director_status>【当前场景】休息室\n【待回应钩子】等她回应</director_status>');
ok(semantic.includes('rp-scene-strip') && semantic.includes('rp-status-card') && semantic.includes('待回应钩子') && !semantic.includes('&lt;scene&gt;'), 'unmatched scene/status tags must render as native cards');
ok(groupCss.includes('height: auto !important; min-height: 0 !important;') && groupCss.includes('.rp-status-card > header') && groupCss.includes('padding: 0 !important;') && groupCss.includes('background: transparent !important;'), 'native RP status must isolate the global safe-area header and render as a transparent content-height tail');
ok(css.includes('.rp-detail-actions { display: flex;') && css.includes('position: static;') && !css.includes('position: sticky; bottom: 0'), 'role detail actions must stay at the true end of the page instead of covering scrolled content');
vm.runInContext(html.slice(html.indexOf('const ROLEPLAY_MEMORY_DEFAULT_SUMMARY_PROMPT'), html.indexOf('function addRoleplayMemory(')), sourceContext);
const normalized = sourceContext.normalizedRoleplayProject({ greetings: ['cover', 'first opening', '', 'third opening'], openingIndex: 3 }, {title:'test'});
ok(normalized.greetings.length === 4 && normalized.opening === 'third opening', 'blank swipe slots must not shift card button indexes');
console.log(`RP theater regression checks passed (${checks})`);
