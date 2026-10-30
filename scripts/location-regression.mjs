import { readFileSync } from "node:fs";
import vm from "node:vm";

const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const sw = readFileSync(new URL("../sw.js", import.meta.url), "utf8");
const wx = readFileSync(new URL("./weather-time.js", import.meta.url), "utf8");
const inject = readFileSync(new URL("./inject-weather-time.py", import.meta.url), "utf8");

let checks = 0;
const ok = (condition, message) => {
  checks++;
  if (!condition) throw new Error(message);
};

ok(sw.includes('const CACHE = "role-chat-cache-v265";'), "service worker cache was not bumped for location sharing");

// --- 位置 card in the composer "+" menu ---
ok(html.includes('<button data-act="location" type="button">'), "位置 button missing from the + menu");
ok(html.includes('else if (act === "location") shareLocation();'), "位置 button is not wired");
ok(html.includes('#plus-menu button[data-act=\\"location\\"]'), "位置 button is not in the iOS one-tap pointerup selector");
ok(!/<label[^>]*>[^<]*<button data-act="location"/.test(html), "位置 button must not sit inside a label");
ok(html.includes("async function send(opts)"), "send() cannot send direct parts");
ok(html.includes("const directParts = opts && Array.isArray(opts.parts)"), "send() direct parts guard missing (click events must not count)");
ok(html.includes("locationPartsHtml(content)"), "location card is not rendered in messages");
ok(html.includes("!isLocationPart(p)"), "location text would render twice (card + bubble)");
ok(html.includes(".loc-card-map"), "location card map visual missing");
ok(html.includes("https://uri.amap.com/marker?position="), "location card does not link to Amap");
ok(html.includes("reverse-geocode-client?latitude="), "BigDataCloud reverse geocode missing");
ok(html.includes("}, 8000);"), "reverse geocode needs an 8s timeout");

// --- background awareness setting ---
ok(html.includes('id="locationAware"'), "location awareness toggle missing");
ok(html.includes("locationAware: true,"), "location awareness should default on");
ok(html.includes('"timeAware","locationAware"'), "locationAware is not synced");
ok(wx.includes("jycReverseGeocode(latitude, longitude)"), "weather refresh does not fetch the place name");
ok(wx.includes("settings.locationAware === false"), "weather/location note ignores the toggle");
ok(inject.includes("try { wxNote = buildWxPromptNote(); } catch (_)"), "prompt note can break a reply");

// --- functional: extract helpers from index.html and run them ---
const grab = (start, end) => {
  const i = html.indexOf(start);
  const j = html.indexOf(end, i);
  ok(i >= 0 && j > i, "could not extract " + start);
  return html.slice(i, j);
};
const helpers = grab("const PLACE_SIMPLIFY", "let locationSharing = false;");
const fakeGeo = {
  principalSubdivision: "广东省", city: "潮州市", locality: "湘橋區",
  localityInfo: { administrative: [
    { name: "中华人民共和国", adminLevel: 2 }, { name: "广东省", adminLevel: 4 },
    { name: "潮州市", adminLevel: 5 }, { name: "湘橋區", adminLevel: 6 },
  ] },
};
const store = {};
const ctx = {
  settings: { userName: "周惟惟", locationAware: true },
  escapeHtml: (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])),
  fetch: async () => ({ ok: true, json: async () => fakeGeo }),
  AbortController, setTimeout, clearTimeout, console,
  localStorage: { getItem: (k) => store[k] ?? null, setItem: (k, v) => { store[k] = String(v); } },
  navigator: {},
};
vm.createContext(ctx);
vm.runInContext(helpers + "\n" + wx + "\nthis.__t = { simplifyPlace, jycReverseGeocode, buildLocationPart, locationPartsHtml, isLocationPart, buildWxPromptNote };", ctx);
const t = ctx.__t;
ok(t.simplifyPlace("湘橋區") === "湘桥区", "traditional place names are not simplified");
const geo = await t.jycReverseGeocode(23.658, 116.623);
ok(geo && geo.place === "广东省潮州市湘桥区", "reverse geocode place wrong: " + JSON.stringify(geo));
const part = t.buildLocationPart(23.658, 116.623, geo);
ok(part.type === "text" && part.text === "【位置】周惟惟分享了位置：广东省潮州市湘桥区", "model-visible location text wrong: " + part.text);
ok(t.isLocationPart(part), "location part not recognised");
const card = t.locationPartsHtml([part]);
ok(card.includes('class="loc-card"') && card.includes("湘桥区") && card.includes("position=116.623000,23.658000"), "location card html wrong");
ctx.fetch = async () => { throw new Error("offline"); };
ok((await t.jycReverseGeocode(1, 2)) === null, "reverse geocode must swallow failures");
ok(t.buildLocationPart(1, 2, null).text.includes("地名没取到"), "location without place name not handled");

store.jyc_weather = JSON.stringify({ temp: 26, code: 2, high: 29, low: 22, place: "广东省潮州市湘橋區", at: Date.now() });
const note = t.buildWxPromptNote();
ok(note.includes("她现在在：广东省潮州市湘桥区") && note.includes("26°C") && note.includes("当地时间"), "prompt note lacks place/weather/time: " + note);
ok(!/\d+\.\d{3}/.test(note), "prompt note must not include coordinates");
ok(note.includes("不要提“定位”“系统”"), "prompt note does not tell him to keep it natural");
ctx.settings.locationAware = false;
ok(!t.buildWxPromptNote().includes("她现在在"), "toggle off still injects the place");
ok(html.includes("剧情里的时间仍以剧本和场景为准") && html.includes("不要把现实时间当成剧情时间"), "roleplay time note must separate the user's real local time from scene time");

console.log(`location regression passed (${checks} checks)`);
