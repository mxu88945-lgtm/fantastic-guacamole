// v370 天气时间卡注入回归：
// 1. 提交的 index.html 必须是未注入版本（没有天气卡函数定义 / 钩子 / 接线 / 注入标记）。
// 2. 注入后含最新 weather-time.js 全文，三块各一次，带成对标记；再跑一次是替换不是叠加。
// 3. 标记块里是旧内容 -> 再注入后变成最新；无标记旧式残留 -> 非零退出；--strip 精确还原。
// 4. 角色锁屏已并入源码：检查脚本对当前 index.html 通过、不改文件；缺部分时非零退出。
import { readFileSync, writeFileSync, mkdtempSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const injector = fileURLToPath(new URL("./inject-weather-time.py", import.meta.url));
const charLock = fileURLToPath(new URL("./inject-char-lock.py", import.meta.url));
const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const wx = readFileSync(new URL("./weather-time.js", import.meta.url), "utf8").replace(/\n+$/, "");

const fails = [];
const ok = (cond, msg) => { if (!cond) fails.push(msg); };
const count = (s, sub) => s.split(sub).length - 1;
const FN = "function " + "wx" + "EnsureWidget";

// 1. committed index.html is clean
ok(!html.includes(FN), "committed index.html contains the injected weather widget function");
ok(!html.includes("WX-INJECT-BEGIN") && !html.includes("WX-INJECT-END"), "committed index.html contains WX-INJECT markers (built file was committed)");
ok(!html.includes("wxNote = " + "buildWxPromptNote()"), "committed index.html contains the weather prompt hook");
ok(!html.includes("wx" + "EnsureWidget(); wxRefresh(false);"), "committed index.html contains the weather init wiring");
ok(!html.includes("const WX_CSS"), "committed index.html contains a copy of weather-time.js");
ok(!wx.includes("WX-INJECT-"), "weather-time.js must not contain inject markers");

const dir = mkdtempSync(join(tmpdir(), "wx-inject-"));
const run = (script, ...args) => spawnSync("python3", [script, ...args], { cwd: root, encoding: "utf8" });

// 2. inject → latest content, each block once
const target = join(dir, "index.html");
writeFileSync(target, html);
let r = run(injector, target);
ok(r.status === 0, "injector failed on clean index.html: " + r.stderr);
let built = readFileSync(target, "utf8");
ok(count(built, wx) === 1, "injected file does not contain the latest weather-time.js exactly once");
for (const name of ["js", "hook", "wiring"]) {
  ok(count(built, "/* WX-INJECT-BEGIN " + name + " */") === 1, "BEGIN marker " + name + " not exactly once");
  ok(count(built, "/* WX-INJECT-END " + name + " */") === 1, "END marker " + name + " not exactly once");
}
ok(count(built, "wxNote = " + "buildWxPromptNote()") === 1, "hook not injected once");
ok(count(built, "wx" + "EnsureWidget(); wxRefresh(false);") === 1, "wiring not injected once");
ok(built.indexOf("WX-INJECT-BEGIN hook") < built.indexOf('  let musicNote = "";'), "hook must sit before the music note");
ok(built.indexOf("WX-INJECT-BEGIN js") < built.indexOf("function autoResize() {"), "js must sit before autoResize");
ok(built.indexOf("  lockApp();") < built.indexOf("WX-INJECT-BEGIN wiring"), "wiring must follow lockApp()");

// re-run = replace, not stack
r = run(injector, target);
ok(r.status === 0, "second injection failed: " + r.stderr);
ok(readFileSync(target, "utf8") === built, "second injection changed the file (should be idempotent)");

// 3a. stale content inside markers gets replaced with the latest
writeFileSync(target, built.replace(wx, "// stale weather code\n" + FN + "() {}"));
r = run(injector, target);
ok(r.status === 0, "injector failed to replace a stale marked block: " + r.stderr);
ok(readFileSync(target, "utf8") === built, "stale marked block was not replaced with latest weather-time.js");

// 3b. unmarked legacy leftovers → hard fail, file untouched
const legacy = built.replace(/\/\* WX-INJECT-(BEGIN|END) \w+ \*\/\n/g, "");
writeFileSync(target, legacy);
r = run(injector, target);
ok(r.status !== 0, "injector silently accepted unmarked legacy weather code");
ok(readFileSync(target, "utf8") === legacy, "injector modified a file it rejected");

// 3c. --strip restores the committed source exactly
writeFileSync(target, built);
r = run(injector, "--strip", target);
ok(r.status === 0, "--strip failed: " + r.stderr);
ok(readFileSync(target, "utf8") === html, "--strip did not restore the un-injected index.html exactly");

// 4. char-lock is source now; the script only checks
writeFileSync(target, html);
r = run(charLock, target);
ok(r.status === 0, "char-lock check failed on committed index.html: " + r.stderr);
ok(readFileSync(target, "utf8") === html, "char-lock script modified index.html");
writeFileSync(target, html.replace("function renderCharLockScreen() {", "function renderCharLockScreenGone() {"));
r = run(charLock, target);
ok(r.status !== 0, "char-lock check did not fail when part of the feature is missing");

// prebuild still runs both scripts
const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
ok(/inject-char-lock\.py/.test(pkg.scripts.prebuild) && /inject-weather-time\.py/.test(pkg.scripts.prebuild), "prebuild must run both inject scripts");

if (fails.length) {
  console.error("weather-inject regression failed:\n- " + fails.join("\n- "));
  process.exit(1);
}
console.log("weather-inject regression passed");
