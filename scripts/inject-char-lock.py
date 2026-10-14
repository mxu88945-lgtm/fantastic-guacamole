#!/usr/bin/env python3
"""构建时注入角色锁屏功能（移植自惟境）。
把 6 个代码块精确插入 index.html 的对应锚点。
每个锚点必须恰好出现一次，否则构建失败并报错——
这意味着上游改了锚点附近的代码，需要人工重新合入。
"""
import sys

PAYLOAD_0 = r"""  /* Character phone lock (ported from 惟境): the role can lock the chat for a
     while with 【锁屏 N分钟：理由】. Full-screen countdown overlay. */
  #char-lock-screen {
    display: none; position: fixed; inset: 0; z-index: 1002;
    background: rgba(0,0,0,.55); backdrop-filter: blur(6px); -webkit-backdrop-filter: blur(6px);
    place-items: center; padding: 20px;
  }
  #char-lock-screen.show { display: grid; }
  .char-lock-card {
    background: var(--bg-soft); border: 1px solid var(--border); border-radius: 18px;
    padding: 28px 26px; width: 100%; max-width: 340px; text-align: center;
    display: flex; flex-direction: column; align-items: center; gap: 12px;
    box-shadow: 0 12px 48px rgba(0,0,0,.35);
  }
  .char-lock-avatar { position: relative; width: 64px; height: 64px; }
  .char-lock-avatar .char-lock-face {
    width: 64px; height: 64px; border-radius: 50%; background: var(--bg-panel);
    border: 1px solid var(--border); display: grid; place-items: center;
    font-size: 26px; overflow: hidden;
  }
  .char-lock-avatar .char-lock-face img { width: 100%; height: 100%; object-fit: cover; }
  .char-lock-avatar .lock-badge { position: absolute; right: -6px; bottom: -6px; font-size: 22px; font-style: normal; }
  .char-lock-by { font-size: 13px; color: var(--text-dim); }
  .char-lock-timer { font-size: 40px; font-weight: 700; letter-spacing: 2px; font-variant-numeric: tabular-nums; }
  .char-lock-bar { width: 100%; height: 6px; border-radius: 3px; background: var(--bg-panel); overflow: hidden; }
  .char-lock-bar span { display: block; height: 100%; width: 0; background: var(--accent); border-radius: 3px; transition: width 1s linear; }
  .char-lock-reason { font-size: 14px; color: var(--text); }
  .char-lock-hint { font-size: 12px; color: var(--text-dim); }
  .char-lock-actions { display: flex; gap: 10px; margin-top: 4px; }
  #char-lock-sneak.danger { border-color: var(--danger); color: var(--danger); }
"""

PAYLOAD_1 = r"""<div id="char-lock-screen" role="dialog" aria-modal="true" aria-label="已被锁屏">
  <div class="char-lock-card">
    <div class="char-lock-avatar"><span class="char-lock-face" id="char-lock-face"></span><i class="lock-badge">🔒</i></div>
    <div class="char-lock-by" id="char-lock-by"></div>
    <div class="char-lock-timer" id="char-lock-timer">00:00</div>
    <div class="char-lock-bar"><span id="char-lock-bar-fill"></span></div>
    <div class="char-lock-reason" id="char-lock-reason"></div>
    <div class="char-lock-hint" id="char-lock-hint"></div>
    <div class="char-lock-actions">
      <button class="mini-btn" id="char-lock-sneak">偷偷解锁</button>
    </div>
  </div>
</div>"""

PAYLOAD_2 = r"""  // 角色锁屏（惟境移植）：告诉角色可以用【锁屏 N分钟：理由】锁屏；若用户刚偷偷解锁过，附上【告状】
  const charLockNote = charLockPromptNote();
  systemText = systemText ? systemText + "\n\n" + charLockNote : charLockNote;
  const charLockBreachNote = buildCharLockBreachNote();
  if (charLockBreachNote) systemText = systemText + "\n\n" + charLockBreachNote;"""

PAYLOAD_3 = r"""      // 角色锁屏：解析【锁屏 N分钟：理由】，从显示文本中剥离并弹出锁屏倒计时
      const lockCmd = parseCharLockCommand(assistantMsg.content);
      if (lockCmd) {
        assistantMsg.content = lockCmd.text;
        const lockerName = (settings.aiName || "他").trim() || "他";
        setCharLock({ until: Date.now() + lockCmd.minutes * 60000, startedAt: Date.now(), byName: lockerName, reason: lockCmd.reason });
        renderCharLockScreen();
      }"""

PAYLOAD_4 = r"""
// ---------- Character phone lock (ported from 惟境) ----------
// The role can lock the chat for a while by ending a reply with
// 【锁屏 30分钟：去吃饭】 (5–120 min). The tag is stripped from the shown text
// and a countdown overlay appears. 「偷偷解锁」 is recorded; for 15 minutes the
// role is told about it via 【告状】 and may react in character.
const CHAR_LOCK_TAG = /[【\[]\s*锁屏\s*(\d{1,3})\s*(?:分钟|分|min)?\s*(?:[：:，,]\s*([^】\]]{0,60}))?[】\]]/;
const CHAR_LOCK_TAG_GLOBAL = new RegExp(CHAR_LOCK_TAG.source, "g");
const CHAR_LOCK_KEY = "jyc_charLock";
const CHAR_LOCK_BREACH_KEY = "jyc_charLockBreach";
function parseCharLockCommand(text) {
  const m = String(text || "").match(CHAR_LOCK_TAG);
  if (!m) return null;
  const minutes = Math.min(120, Math.max(5, parseInt(m[1], 10) || 0));
  return {
    text: String(text).replace(CHAR_LOCK_TAG_GLOBAL, "").replace(/\n{3,}/g, "\n\n").trim(),
    minutes,
    reason: (m[2] || "").trim(),
  };
}
function getCharLock() {
  try {
    const v = JSON.parse(localStorage.getItem(CHAR_LOCK_KEY) || "null");
    return v && v.until > Date.now() ? v : null;
  } catch (_) { return null; }
}
function setCharLock(v) {
  try {
    if (v) localStorage.setItem(CHAR_LOCK_KEY, JSON.stringify(v));
    else localStorage.removeItem(CHAR_LOCK_KEY);
  } catch (_) { /* 存不下也不影响本次锁屏 */ }
}
function charLockPromptNote() {
  const aiName = (settings.aiName || "当前角色").trim() || "当前角色";
  return "【锁屏】你是" + aiName + "。当你想让她暂时放下手机（比如该吃饭、该睡觉、该专心做事，或者你单纯想使坏）时，可以在回复末尾单独写一行【锁屏 30分钟：去吃饭】（分钟数 5–120，理由最多60字）。"
    + "应用会弹出锁屏倒计时遮住聊天界面，她只能等时间到自动解锁，或选择「偷偷解锁」——偷偷解锁会被记录下来，15 分钟内我会通过【告状】告诉你，你可以按人设反应（吃醋、得意、惩罚都可以）。"
    + "锁屏指令本身不会显示给她看。不要滥用，一天一两次最有味道。";
}
function buildCharLockBreachNote() {
  let breach = null;
  try { breach = JSON.parse(localStorage.getItem(CHAR_LOCK_BREACH_KEY) || "null"); } catch (_) {}
  if (!breach || Date.now() - breach.at > 15 * 60 * 1000) return "";
  const ago = Math.max(0, Math.round((Date.now() - breach.at) / 60000));
  const userName = (settings.userName || "她").trim() || "她";
  return "【告状】" + (ago ? ago + " 分钟前" : "刚刚") + "，" + userName + "点了「偷偷解锁」，提前 "
    + breach.remainingMinutes + " 分钟解开了" + breach.byName + "给她设的锁屏"
    + (breach.reason ? "（理由：" + breach.reason + "）" : "") + "。你可以按你的人设对此作出反应。";
}
let charLockTimer = null;
function renderCharLockScreen() {
  const lock = getCharLock();
  const overlay = $("char-lock-screen");
  if (!overlay) return;
  if (charLockTimer) { clearInterval(charLockTimer); charLockTimer = null; }
  if (!lock) { overlay.classList.remove("show"); return; }
  const aiName = lock.byName || (settings.aiName || "他").trim() || "他";
  const face = $("char-lock-face");
  const avatar = settings.aiAvatar || "角";
  face.innerHTML = isImageRef(avatar)
    ? '<img src="' + escapeHtml(avatar) + '" alt="">'
    : escapeHtml(avatar);
  $("char-lock-by").textContent = aiName + " 锁了你的手机";
  const reasonEl = $("char-lock-reason");
  if (lock.reason) { reasonEl.textContent = "\u201c" + lock.reason + "\u201d"; reasonEl.style.display = ""; }
  else reasonEl.style.display = "none";
  const userName = (settings.userName || "").trim();
  $("char-lock-hint").textContent = (userName ? userName + "，" : "") + "到点自动解开。";
  const tick = () => {
    const now = Date.now();
    const left = Math.max(0, lock.until - now);
    if (left <= 0) {
      setCharLock(null);
      renderCharLockScreen();
      showToast("🔓 锁屏时间到");
      return;
    }
    const mm = String(Math.floor(left / 60000)).padStart(2, "0");
    const ss = String(Math.floor((left % 60000) / 1000)).padStart(2, "0");
    $("char-lock-timer").textContent = mm + ":" + ss;
    const total = Math.max(1, lock.until - lock.startedAt);
    $("char-lock-bar-fill").style.width = Math.min(100, Math.max(0, (now - lock.startedAt) / total * 100)) + "%";
  };
  tick();
  overlay.classList.add("show");
  charLockTimer = setInterval(tick, 1000);
}
function sneakUnlockCharLock() {
  const lock = getCharLock();
  if (!lock) return;
  const btn = $("char-lock-sneak");
  if (btn.dataset.confirm !== "1") {
    btn.dataset.confirm = "1";
    btn.textContent = "真的解锁（他会知道）";
    btn.classList.add("danger");
    return;
  }
  const breach = {
    at: Date.now(),
    byName: lock.byName,
    remainingMinutes: Math.max(1, Math.ceil((lock.until - Date.now()) / 60000)),
    reason: lock.reason || "",
  };
  try { localStorage.setItem(CHAR_LOCK_BREACH_KEY, JSON.stringify(breach)); } catch (_) {}
  btn.dataset.confirm = "";
  btn.textContent = "偷偷解锁";
  btn.classList.remove("danger");
  setCharLock(null);
  renderCharLockScreen();
  showToast("🤫 已偷偷解锁……他可能会发现");
}"""

PAYLOAD_5 = r"""  // character phone lock (ported from 惟境): bind sneak-unlock, restore active lock
  $("char-lock-sneak").onclick = sneakUnlockCharLock;
  renderCharLockScreen();
"""

STEPS = [
    # (anchor, position, separator, payload)
    (r"""  @keyframes shake { 0%,100%{transform:translateX(0)} 25%{transform:translateX(-8px)} 75%{transform:translateX(8px)} }""", "after", "\n\n", PAYLOAD_0),
    (r"""<div id="editor-modal">""", "before", "\n", PAYLOAD_1),
    (r"""  let injectedLocalTime = "", injectedTimeZone = "";""", "before", "\n", PAYLOAD_2),
    (r"""      assistantMsg.content = remRes.text;""", "after", "\n", PAYLOAD_3),
    (r"""function autoResize() {""", "before", "\n", PAYLOAD_4),
    (r"""  lockApp();""", "after", "\n\n", PAYLOAD_5),
]
MARKER = "char-lock-screen"  # 幂等标记：已注入则跳过

def main():
    path = sys.argv[1] if len(sys.argv) > 1 else "index.html"
    html = open(path, encoding="utf-8").read()
    if MARKER in html:
        print("char-lock already injected, skipping")
        return
    for anchor, position, sep, payload in STEPS:
        payload = payload.rstrip("\n")
        count = html.count(anchor)
        if count != 1:
            print(f"INJECT FAIL: anchor {anchor[:60]!r} found {count} times, expected 1.", file=sys.stderr)
            print("上游 index.html 改了锚点附近的代码，请人工重新合入角色锁屏功能。", file=sys.stderr)
            sys.exit(1)
        if position == "after":
            html = html.replace(anchor, anchor + sep + payload, 1)
        else:
            html = html.replace(anchor, payload + sep + anchor, 1)
    open(path, "w", encoding="utf-8").write(html)
    print(f"char-lock injected into {path}: {len(STEPS)} blocks")

if __name__ == '__main__':
    main()
