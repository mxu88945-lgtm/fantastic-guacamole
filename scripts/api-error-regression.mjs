import { readFileSync } from "node:fs";
import vm from "node:vm";
import assert from "node:assert/strict";

const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const helper = html.slice(html.indexOf("function chatRequestError("), html.indexOf("function completionContentText("));
const retryStart = html.indexOf("  const TRANSIENT =");
const retry = html.slice(retryStart, html.indexOf("  const reader = resp.body.getReader();", retryStart));
async function run(responses, body = {}) {
  const banners = [], toasts = [], calls = [];
  const context = vm.createContext({
    body, url: "https://relay.invalid/v1/chat/completions", headers: {},
    settings: { apiKey: "sk-private-key" }, requestRoute: "凌亦峥 / 成员专用接口 / model-x",
    abortController: new AbortController(), DOMException, performance, attempts: 0, headersAt: 0,
    isAnthropic: false, isGemini: false, base: "https://relay.invalid/v1", model: "model-x",
    responseErrorDetail: async response => response.detail || "",
    hasReasoningControl: request => !!request.reasoning,
    reasoningControlUnsupported: detail => /unsupported reasoning/.test(detail),
    removeReasoningControl: request => { delete request.reasoning; },
    temperatureIsDeprecated: () => false,
    showError: message => banners.push(message), showToast: message => toasts.push(message),
    clearError: () => banners.push("CLEARED"),
    setTimeout: callback => { callback(); return 1; }, clearTimeout() {},
    fetch: async (url, options) => { calls.push(JSON.parse(options.body)); return responses.shift(); },
  });
  vm.runInContext(helper, context);
  const result = vm.runInContext(`(async () => { ${retry} return resp; })()`, context);
  return { result, banners, toasts, calls, context };
}
const fail = { ok: false, status: 500, detail: JSON.stringify({ error: { message: "model route unavailable sk-private-key" } }) };
const failed = await run([fail, fail, fail]);
await assert.rejects(failed.result, /HTTP 500.*凌亦峥.*成员专用接口.*model-x.*model route unavailable/);
assert.equal(failed.calls.length, 3);
assert.equal(failed.banners.length, 2);
assert.ok(failed.banners.every(message => !message.includes("sk-private-key")));
assert.match(failed.banners[0], /服务端处理失败/);
const recovered = await run([fail, { ok: true }]);
assert.equal((await recovered.result).ok, true);
assert.equal(recovered.banners.at(-1), "CLEARED");
const exhausted = await run([fail, fail, { ok: false, status: 400, detail: "unsupported reasoning" }], { reasoning: { effort: "high" } });
await assert.rejects(exhausted.result, /HTTP 400.*unsupported reasoning/);
const empty = failed.context.chatRequestError(503, "", "当前接口 / model-y", "");
assert.match(empty, /接口未提供错误详情/);
const htmlError = failed.context.chatRequestError(502, "<html><body>Bad gateway Bearer secret-value</body></html>", "route", "");
assert.ok(!htmlError.includes("secret-value") && !htmlError.includes("<html>"));
console.log("API error regression: real retry loop, route identity, upstream detail, secret masking, recovery and retry exhaustion passed");
