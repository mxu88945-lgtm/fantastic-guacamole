import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  GIFT_CATALOG,
  normalizeGiftPart,
  giftPromptText,
  extractAssistantGift,
  buildGiftSystemNote,
  renderGiftPartsHtml,
  normalizeCustomGift,
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
assert.match(sw, /role-chat-cache-v338/);

const made = extractAssistantGift("给你。\n[自制礼物:🐚|会发光的贝壳|海边捡的，留着等你|别弄丢]", { roleName: "顾祁砚", userName: "周惟惟" });
assert.equal(made.text, "给你。");
assert.equal(made.gift.name, "会发光的贝壳");
assert.equal(made.gift.custom, true);
assert.equal(made.gift.note, "别弄丢");
assert.equal(made.made.maker, "role");
assert.match(renderGiftPartsHtml([made.gift]), /HANDMADE/);
const mine = normalizeCustomGift({ name: "手织小玄凤", icon: "🐦", maker: "user" });
assert.equal(mine.category, "custom");
const fromShelf = extractAssistantGift("[送礼:手织小玄凤|回礼]", { roleName: "顾祁砚", userName: "周惟惟", customGifts: [mine] });
assert.equal(fromShelf.gift.name, "手织小玄凤");
assert.equal(fromShelf.made, null);
assert.match(buildGiftSystemNote([], "顾祁砚", "周惟惟", [mine]), /自制礼物架/);
assert.match(buildGiftSystemNote([], "顾祁砚", "周惟惟"), /\[自制礼物:/);
assert.match(html, /addCustomGift: addRoleCustomGift/);
assert.match(html, /if \(giftResult\?\.made\) addRoleCustomGift/);

console.log("gift system regression passed");
