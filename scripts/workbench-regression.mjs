import fs from "node:fs";
import vm from "node:vm";

const html = fs.readFileSync(new URL("../index.html", import.meta.url), "utf8");
const sw = fs.readFileSync(new URL("../sw.js", import.meta.url), "utf8");
let passed = 0;

function ok(condition, message) {
  if (!condition) throw new Error(message);
  passed++;
}

ok(html.includes('id="sidebar-workbench"'), "sidebar workbench entry is missing");
ok(html.includes('id="workbench-panel"'), "workbench panel is missing");
ok(html.includes('sandbox="allow-scripts"'), "preview iframe is not script-sandboxed");
ok(!html.includes('sandbox="allow-scripts allow-same-origin"'), "sandbox must keep an opaque origin");
ok(html.includes("connect-src \\'none\\'"), "sandbox CSP must block network access");
ok(html.includes('const WORKBENCH_DB_KEY = "workbench_v1"'), "IndexedDB workbench key is missing");
ok(html.includes("workbenchState.roles[roleId]"), "projects are not isolated per role");
ok(html.includes("workbench: workbenchBackupSnapshot()"), "normal backup omits workbench projects");
ok(html.includes("restoreWorkbenchBackup(data.workbench)"), "backup restore omits workbench projects");
ok(html.includes("workbenchSystemNote()"), "model workbench protocol is not injected");
ok(html.includes("consumeWorkbenchDirective(assistantMsg.content)"), "assistant run directive is not consumed");
ok(html.includes("workbenchHasRunnableCode(text)"), "chat code does not expose a workbench action");
ok(html.includes('id="workbench-ask-role"'), "manual handoff to the role is missing");
ok(html.includes("runId:runId"), "sandbox messages are not scoped to a single run");
ok(html.includes("_workbenchEvent: true"), "runtime results are not returned as a hidden event");
ok(html.includes("workbenchRunSession.logs.push"), "console output is not collected for the role");
ok(html.includes("attempt < 3"), "automatic repair is not capped at three rounds");
ok(html.includes("不要否认这项能力"), "the role is not told that its workbench exists");
ok(html.includes("workbenchPromptSource(session.project)"), "the role cannot inspect the current project source");
ok(sw.includes('const CACHE = "role-chat-cache-v146";'), "service worker cache was not bumped to v146");

const mainScript = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)]
  .map(match => match[1]).find(code => code.includes("WORKBENCH_DB_KEY"));
ok(!!mainScript, "main script could not be found");

const start = mainScript.indexOf('const WORKBENCH_DB_KEY = "workbench_v1"');
const end = mainScript.indexOf("// ---------- State ----------", start);
const workbenchSource = mainScript.slice(start, end);
const context = {
  console, setTimeout, clearTimeout, Date, structuredClone, Blob, URL,
  uid: () => "test-id", settings: {}, activeRole: () => ({ id: "role-1", name: "测试角色" }),
  $: () => null, escapeHtml: value => value, currentId: "conversation-1",
};
vm.createContext(context);
vm.runInContext(workbenchSource, context);

context.sampleDirective = '[工作台运行:按钮实验]\n\n```html\n<button>好</button>\n```\n```css\nbutton{color:red}\n```\n```javascript\nconsole.log("ok")\n```';
const directive = vm.runInContext("workbenchDirective(sampleDirective)", context);
ok(directive.requested && directive.name === "按钮实验", "run directive name was not parsed");
ok(directive.code.blocks === 3, "HTML/CSS/JavaScript blocks were not all parsed");
ok(!directive.cleanText.includes("工作台运行"), "run marker leaked into visible chat text");

const documentText = vm.runInContext(`workbenchDocument({html:'<h1>x</h1>',css:'h1{color:red}',js:'console.log("ok")'}, 'run-9')`, context);
ok(documentText.includes("</script></head><body><h1>x</h1><script>console.log"), "generated sandbox document has broken script boundaries");
ok(documentText.includes("connect-src 'none'"), "generated sandbox document allows network connections");
ok(documentText.includes('var runId="run-9"'), "generated sandbox document lost its run id");

const attempts = vm.runInContext("[nextWorkbenchRepairAttempt('same'), nextWorkbenchRepairAttempt('same'), nextWorkbenchRepairAttempt('same')]", context);
ok(attempts.join(",") === "1,2,3", "same-project repair attempts are not counted consistently");

console.log(`workbench regression checks passed: ${passed}`);
