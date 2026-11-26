import { readFileSync } from "node:fs";
import vm from "node:vm";

const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const js = readFileSync(new URL("../src/rp-evicted-recall.js", import.meta.url), "utf8");
let checks = 0;
const ok = (condition, message) => { checks++; if (!condition) throw new Error(message); };

const ctx = { globalThis: {} };
ctx.globalThis = ctx;
vm.createContext(ctx);
vm.runInContext(js, ctx);
const api = ctx.JYCEvictedRecall;
ok(api && typeof api.pool === "function" && typeof api.recall === "function", "evicted recall module must expose pool/recall");

// 一场长剧情：第 3 轮出现了「银怀表」和「钟楼」，之后几十轮是日常描写。
const filler = ["他低头看着她，声音放轻了些，指尖在桌沿敲了两下。", "窗外下着雨，屋里只剩壁炉的噼啪声，他把外套搭在椅背上。", "她端起茶杯，热气模糊了眼镜，他笑了一下没说话。"];
const messages = [];
let id = 1;
for (let turn = 0; turn < 40; turn++) {
  messages.push({ id: id++, role: "user", speaker: "林晚", text: turn === 3 ? "我把那块银怀表塞进他手里，让他今晚去钟楼等我。" : "（我坐在他对面）" + filler[turn % 3], createdAt: 1764000000000 + turn * 60000 });
  messages.push({ id: id++, role: "assistant", speaker: "陆屿", text: turn === 3 ? "陆屿攥紧那块银怀表，表盖上刻着她母亲的名字。他点头：「钟楼，午夜，我会到。」" + filler[0].repeat(8) : filler[(turn + 1) % 3].repeat(6), createdAt: 1764000000000 + turn * 60000 + 30000 });
}
const pool = api.pool(messages);
ok(pool.chunks.length >= 40, "pool must split exchanges into chunks");
ok(pool.chunks.every((c) => c.text.length <= 760), "chunks must stay small (≤600 body + header)");

const hit = api.recall(pool, { query: "你还留着那块银怀表吗", turn: 41, ledger: {} });
ok(hit.text.includes("银怀表") && hit.text.includes("钟楼"), "a rare item named by her must bring back the scene where it happened");
ok(hit.text.startsWith(api.HEADER), "recall must carry its read-only header");
ok(hit.chunks.length <= api.MAX_CHUNKS && hit.text.length <= api.BUDGET, "recall must respect chunk and character budget");

const ledger = {};
hit.keys.forEach((k) => { ledger[k] = 41; });
const again = api.recall(pool, { query: "银怀表呢", turn: 42, ledger });
ok(again.keys.filter((k) => hit.keys.includes(k)).length === 0, "same chunk must cool down for a few turns");
const explicit = api.recall(pool, { query: "还记得那块银怀表吗", turn: 42, ledger, explicit: true });
ok(explicit.keys.length > 0, "an explicit recall question must bypass cooldown");

const chatter = api.recall(pool, { query: "我端起茶杯看着窗外的雨", turn: 41, ledger: {} });
ok(chatter.chunks.length === 0, "ordinary filler words must not drag old prose back every turn");
const night = api.recall(pool, { query: "晚安啦", turn: 41, ledger: {} });
ok(night.chunks.length === 0, "short acknowledgements recall nothing");

const vec = new Map(pool.chunks.map((c) => [c.key, c.text.includes("钟楼") ? 0.72 : 0.2]));
const semantic = api.recall(pool, { query: "之前约好的那个地方", turn: 41, ledger: {}, semantic: vec });
ok(semantic.text.includes("钟楼"), "with vectors, a paraphrased question about the past must find the scene");

ok(html.includes('src="./src/rp-evicted-recall.js"'), "module must be loaded by index.html");
ok(html.includes("function retrieveRoleplayEvicted(") && html.includes("isRoleplayConversation() && retrieveRoleplayEvicted(historyWindow))"), "theater main path must use evicted recall");
ok(html.includes("const evicted = retrieveRoleplayEvicted(historyWindow, conv)"), "independent cast path must use evicted recall");
ok(html.includes("const prepacked = !!recall?.prepacked"), "bounded memory must keep prepacked evicted recall whole");

console.log(`rp evicted recall regression passed (${checks} checks)`);
