import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
assert.ok(html.includes('<textarea id="input" rows="1" placeholder="发送消息" autocomplete="off"></textarea>'), "chat input opts out of iOS form-state restoration");
assert.ok(html.indexOf('setAttribute("autocomplete", "off")') < html.indexOf('<textarea id="input"'), "early guard turns off form restoration for every text field");
console.log("form restore regression: chat input and dynamic text fields opt out of Safari form-state restoration passed");
