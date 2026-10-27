import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  GIFT_CATALOG,
  normalizeGiftPart,
  giftPromptText,
  extractAssistantGift,
  buildGiftSystemNote,
  renderGiftPartsHtml,
} from "../src/gifts.js";

const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const dashboard = readFileSync(new URL("../src/dashboard.js", import.meta.url), "utf8");
const css = readFileSync(new URL("../src/gifts.css", import.meta.url), "utf8");
const sw = readFileSync(new URL("../sw.js", import.meta.url), "utf8");

assert.ok(GIFT_CATALOG.length >= 20, "gift catalog keeps a useful range");
assert.equal(new Set(GIFT_CATALOG.map(item => item.id)).size, GIFT_CATALOG.length, "gift ids stay unique");

const userGift = normalizeGiftPart({
  type: "gift", giftId: "coffee", direction: "user-to-role",
  senderName: "周惟惟", recipientName: "顾祁砚", note: "早点休息", ts: 123,
});
assert.equal(userGift.name, "手冲咖啡");
assert.match(giftPromptText(userGift), /周惟惟送给顾祁砚/);
assert.match(giftPromptText(userGift), /早点休息/);

const assistantGift = extractAssistantGift("拿好。\n[送礼:ring|不许摘。]", { roleName: "顾祁砚", userName: "周惟惟" });
assert.equal(assistantGift.text, "拿好。");
assert.equal(assistantGift.gift.direction, "role-to-user");
assert.equal(assistantGift.gift.name, "素圈戒指");
assert.equal(assistantGift.gift.senderName, "顾祁砚");

const note = buildGiftSystemNote([userGift, assistantGift.gift], "顾祁砚", "周惟惟");
assert.match(note, /\[送礼:礼物ID\|你的附言\]/);
assert.match(note, /周惟惟送给顾祁砚/);
assert.match(note, /顾祁砚送给周惟惟/);
assert.match(renderGiftPartsHtml([assistantGift.gift]), /chat-gift-card role-to-user/);

assert.match(html, /data-act="gift"/);
assert.match(html, /data-dashboard-action="gifts"/);
assert.match(html, /buildGiftSystemNote/);
assert.match(html, /extractAssistantGift/);
assert.match(html, /window\.JYCGiftBridge/);
assert.match(html, /src\/gifts\.js/);
assert.match(html, /src\/gifts\.css/);
assert.match(dashboard, /action === "gifts"/);
assert.match(css, /\.chat-gift-card/);
assert.match(sw, /role-chat-cache-v253/);

console.log("gift system regression passed");
