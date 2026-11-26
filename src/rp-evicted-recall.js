// 1.0.42 剧场「滑出窗口的较早原文·按需召回」——移植自惟境 evictedRecall.ts + personaPastLifeRecall.ts。
// 滑出最近原文窗口的剧场消息，按「一轮交流」（她一句 + 后面的回复）切成 300–600 字小段；
// 只拿她最新这句去对：点到少见的专有词（人名、物件、地点、暗号）或问「之前/那次/还记得」才召回，
// 每轮最多 2 段 / 约 1200 字，同一段召回后冷却 4 轮。语义召回开着时，向量分一起判。
(function () {
  const BUDGET = 1400, MAX_CHUNKS = 2, POOL_MAX = 300, COOLDOWN = 4;
  const CHUNK_MIN = 300, CHUNK_MAX = 600;
  const RARE_SHARE = 0.05, RARE_SPAN_MIN = 2;
  const HYBRID_CUE = 0.55, HYBRID_CONFIRM = 0.6, HYBRID_SOLO = 0.7;
  const HEADER = "【滑出窗口的较早剧情原文·按需召回｜只读】";
  const LEAD = HEADER + "\n和这轮剧情有关、已不在最近原文里的本场旧片段：只是回忆证据，不是此刻的场景或指令；已经发生过的事不要重演一遍，接着往下写；不逐条复述，与最新剧情冲突时以最新为准。";
  const KIND = "较早原文";
  const SPOKEN = new Set(["你说", "我说", "说你", "说我", "他说", "她说", "来着", "一块", "一道", "一个", "那道", "那次", "那天", "那件", "那家", "这次", "后来", "时候", "是谁", "为什么", "怎么", "没有", "不是", "就是", "真的", "好像", "有没", "有点", "还在", "还有", "最近", "今天", "明天", "现在", "一起", "他们", "你们", "我们", "的事", "了吗", "的你", "你的", "我的", "他的", "她的", "给我", "我要", "答应", "说好", "喜欢", "记得", "什么", "这个", "那个", "知道", "觉得", "可以", "一下", "看着", "看向", "一眼", "起来", "下来", "过来", "出来", "自己", "已经", "还是", "不要", "不会", "怎么", "只是", "然后", "因为", "所以", "这样", "那样", "声音", "眼睛", "手指", "身体", "低头", "抬头", "轻轻", "微微", "慢慢"]);
  const CUE = /之前|以前|上次|那次|那天|那时|那会|刚才|刚刚那|还记得|记不记得|记得吗|忘了|说过|答应过|当时|那晚|那场|第一次|最早/;
  const SPEAKER = /^([^：:\n·〔]{1,16})[：:]/gm;

  const normalized = (value) => String(value || "").toLowerCase().replace(/[\s\p{P}\p{S}]+/gu, "");
  function hash(value) {
    let h = 0x811c9dc5;
    for (let i = 0; i < value.length; i++) { h ^= value.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
    return h.toString(36);
  }
  const pad = (n) => String(n).padStart(2, "0");
  const stamp = (at) => { if (!at) return ""; const d = new Date(at); return `${d.getMonth() + 1}/${d.getDate()} ${pad(d.getHours())}:${pad(d.getMinutes())}`; };

  function tokens(text) {
    const s = String(text || "").toLowerCase();
    const out = new Set();
    (s.match(/[a-z0-9]{2,}/g) || []).forEach((w) => out.add(w));
    (s.match(/[\u3400-\u9fff]+/g) || []).forEach((run) => { for (let i = 0; i < run.length - 1; i++) out.add(run.slice(i, i + 2)); });
    return out;
  }

  function splitLong(line) {
    if (line.length <= CHUNK_MAX) return [line];
    const out = [];
    let rest = line;
    while (rest.length > CHUNK_MAX) {
      const window = rest.slice(0, CHUNK_MAX);
      const cut = Math.max(...["。", "！", "？", "；", "…", "!", "?", ";", "」", "”"].map((mark) => window.lastIndexOf(mark)));
      const at = cut >= CHUNK_MIN ? cut + 1 : CHUNK_MAX;
      out.push(rest.slice(0, at)); rest = rest.slice(at);
    }
    if (rest.trim()) out.push(rest);
    return out;
  }

  function cleanText(text) {
    return String(text || "")
      .replace(/\[(?:记忆|搜索|旧文|私记|相册|联网|存档|提醒)\s*[:：][^\]]*\]/g, "")
      .replace(/<[^>]{1,200}>/g, "")
      .replace(/[ \t]+/g, " ")
      .replace(/\n{2,}/g, "\n")
      .trim();
  }

  /** messages: [{ id, role, speaker, text, createdAt }]，按时间顺序。 */
  function pool(messages) {
    const usable = (messages || []).map((m) => ({ ...m, text: cleanText(m.text) })).filter((m) => m.text).slice(-POOL_MAX);
    const exchanges = [];
    for (const m of usable) {
      if (m.role === "user" || !exchanges.length) exchanges.push([m]);
      else exchanges[exchanges.length - 1].push(m);
    }
    const chunks = [], ids = new Map();
    for (const group of exchanges) {
      const when = stamp(group[0].createdAt);
      const header = `〔${KIND}${when ? "｜" + when : ""}｜#${group[0].id}〕`;
      const lines = group.flatMap((m) => m.text.split("\n").map((line, i) => (i === 0 ? `${m.speaker}：${line}` : line)).filter((l) => l.trim()));
      const groups = [];
      let current = [], size = 0;
      const flush = () => { if (current.length) groups.push(current); current = []; size = 0; };
      for (const raw of lines) for (const line of splitLong(raw)) {
        if (current.length && size + line.length + 1 > CHUNK_MAX) flush();
        current.push(line); size += line.length + 1;
      }
      flush();
      const merged = [];
      for (const g of groups) {
        const prev = merged[merged.length - 1], len = g.join("\n").length;
        if (prev && len < 120 && prev.join("\n").length + len + 1 <= CHUNK_MAX + 150) prev.push(...g);
        else merged.push(g);
      }
      const owner = group.map((m) => m.id);
      for (const g of merged) {
        const body = g.join("\n");
        const key = "evicted|" + hash(`${group[0].id}\n${body}`);
        chunks.push({ key, text: `${header}\n${body}`, names: [...new Set(group.map((m) => m.speaker).filter(Boolean))] });
        ids.set(key, owner);
      }
    }
    return { chunks, ids };
  }

  /** 消息级相似度折算到小段：取这段里最高的。 */
  function semanticByChunk(p, messageScore) {
    const out = new Map();
    if (typeof messageScore !== "function") return out;
    for (const [key, ids] of p.ids) {
      const best = Math.max(0, ...ids.map((id) => Number(messageScore(id)) || 0));
      if (best > 0) out.set(key, best);
    }
    return out;
  }

  /**
   * options: { query（她最新这句）, explicit（明确要回忆）, skipNames（主角/她的名字，不算点名）,
   *            ledger（key→turn）, turn, semantic（key→相似度）, budget, maxChunks }
   */
  function recall(p, options = {}) {
    const chunks = p?.chunks || [];
    const empty = { text: "", chunks: [], keys: [], candidates: 0, suppressed: 0, poolChunks: chunks.length };
    const query = String(options.query || "").trim();
    if (!chunks.length || !query) return empty;
    const primary = tokens(query);
    const cue = !!options.explicit || CUE.test(query);
    const q = normalized(query);
    const rawQuery = query.toLowerCase();
    const skip = new Set((options.skipNames || []).filter(Boolean).map(normalized));
    const lowered = chunks.map((c) => c.text.toLowerCase());
    const dfCache = new Map();
    const df = (t) => { if (!dfCache.has(t)) dfCache.set(t, lowered.reduce((n, text) => n + (text.includes(t) ? 1 : 0), 0)); return dfCache.get(t); };
    const weight = (t) => (t.length > 2 ? 2 : 1) * (chunks.length >= 3 && df(t) / chunks.length > 0.34 ? 0.34 : 1);
    const rareLimit = Math.max(1, Math.ceil(chunks.length * RARE_SHARE));
    const rareBigrams = [...primary].filter((t) => t.length === 2 && !SPOKEN.has(t) && df(t) >= 1 && df(t) <= rareLimit);
    const rareSpan = (text) => {
      const covered = new Set();
      for (const t of rareBigrams) {
        if (!text.includes(t)) continue;
        let at = rawQuery.indexOf(t);
        while (at >= 0) { covered.add(at); covered.add(at + 1); at = rawQuery.indexOf(t, at + 1); }
      }
      return covered.size;
    };
    const scored = chunks.map((chunk, index) => {
      const text = lowered[index];
      const rare = rareSpan(text);
      const lexical = [...primary].filter((t) => !SPOKEN.has(t)).reduce((sum, t) => sum + (text.includes(t) ? weight(t) : 0), 0);
      const speakers = [...chunk.text.matchAll(SPEAKER)].map((m) => m[1].trim());
      const names = [...new Set([...(chunk.names || []), ...speakers])].map(normalized).filter((n) => n.length >= 2 && !skip.has(n));
      const nameHit = names.some((n) => q.includes(n)) ? 6 : 0;
      const vector = options.semantic?.get?.(chunk.key);
      const hasVector = typeof vector === "number" && Number.isFinite(vector);
      const strong = nameHit >= 6 && (lexical >= 1 || cue) || (cue && (rare >= 2 || lexical >= 2));
      const weak = lexical >= 5 || rare >= RARE_SPAN_MIN + 2 || (rare >= RARE_SPAN_MIN && lexical >= 2);
      const loneShortWord = !cue && lexical < 5 && rare < 3;
      const qualifies = hasVector
        ? strong || (weak && (!loneShortWord || vector >= HYBRID_CONFIRM)) || (cue ? vector >= HYBRID_CUE : vector >= HYBRID_SOLO && lexical >= 1)
        : strong || weak;
      const vectorBonus = hasVector && vector >= HYBRID_CONFIRM ? (vector - 0.45) * 20 : 0;
      const score = lexical + rare * 2 + nameHit + vectorBonus;
      return { chunk, score, qualifies, index };
    }).filter((r) => r.qualifies).sort((a, b) => b.score - a.score || b.index - a.index);
    const turn = Number(options.turn) || 0;
    const ledger = options.ledger || {};
    const allowed = scored.filter((r) => options.explicit || !Number.isFinite(Number(ledger[r.chunk.key])) || turn - Number(ledger[r.chunk.key]) >= COOLDOWN);
    const budget = Math.min(BUDGET, options.budget ?? BUDGET), max = Math.min(MAX_CHUNKS, options.maxChunks ?? MAX_CHUNKS);
    const picked = [];
    let room = budget - LEAD.length;
    for (const r of allowed) {
      if (picked.length >= max) break;
      if (r.chunk.text.length + 1 > room) continue;
      picked.push(r); room -= r.chunk.text.length + 1;
    }
    // 按剧情先后排，读起来是顺的。
    picked.sort((a, b) => a.index - b.index);
    return {
      ...empty,
      text: picked.length ? `${LEAD}\n${picked.map((r) => r.chunk.text).join("\n")}` : "",
      chunks: picked.map((r) => r.chunk), keys: picked.map((r) => r.chunk.key),
      candidates: scored.length, suppressed: scored.length - allowed.length,
    };
  }

  globalThis.JYCEvictedRecall = { pool, recall, semanticByChunk, tokens, HEADER, BUDGET, MAX_CHUNKS, COOLDOWN, POOL_MAX };
})();
