import { readFileSync } from "node:fs";
import vm from "node:vm";

const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const helperStart = html.indexOf("function readStoredText(");
const helperEnd = html.indexOf("async function loadState()", helperStart);
if (helperStart < 0 || helperEnd < 0) throw new Error("safe local-storage readers are missing");

const values = new Map([
  ["valid", JSON.stringify({ name: "顾祁砚" })],
  ["broken", '{"name":'],
]);
const warnings = [];
const context = {
  localStorage: { getItem: key => values.get(key) ?? null },
  console: { warn: (...args) => warnings.push(args) },
};
vm.runInNewContext(
  `${html.slice(helperStart, helperEnd)}\n` +
  "globalThis.persistenceHelpers = { readStoredText, readStoredJson };",
  context,
);

const { readStoredJson } = context.persistenceHelpers;
if (readStoredJson("valid")?.name !== "顾祁砚") throw new Error("valid stored JSON was not restored");
if (readStoredJson("broken") !== null) throw new Error("invalid stored JSON did not fail closed");
if (warnings.length !== 1) throw new Error("invalid stored JSON was not reported once");

if (!html.includes('const s = readStoredJson("jyc_settings");')) {
  throw new Error("settings still bypass the safe storage reader");
}
if (!html.includes('const cs = readStoredJson("jyc_conversations");')) {
  throw new Error("legacy conversations still bypass the safe storage reader");
}
if (!html.includes('const oldMsgs = readStoredJson("jyc_messages");')) {
  throw new Error("legacy messages can still abort startup when malformed");
}

console.log("persistence regression checks passed");
