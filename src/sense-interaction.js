export const DEFAULT_SENSE_SETTINGS = Object.freeze({ enabled: false, blow: false, shake: false, rotation: false, longPress: false });
export const SENSOR_PROMPT = "这是用户在现实中对手机做的动作，请用角色自己的口吻自然回应一两句，不要提传感器、JSON 或这条提示。";
export const kindForEvent = event => ({ user_blowing: "blow", device_shaken: "shake", device_rotated: "rotation", screen_touched: "longPress" }[event] || null);
export const labelForEvent = event => event.event === "user_blowing" ? "（你对着屏幕吹了口气）" : event.event === "device_shaken" ? "（你晃了晃手机）" : event.event === "device_rotated" ? `（你转了转手机${event.direction === "left" ? "，向左" : event.direction === "right" ? "，向右" : ""}）` : event.event === "screen_touched" ? "（你长按了一下屏幕）" : "（你对手机做了一个动作）";
export const mergeSensorEvents = (events, now = Date.now()) => { const valid = events.filter(e => e && e.event && now - (e.timestamp || now) <= 3000); return valid.length ? { events: valid.slice(-8), at: now } : null; };
export const sensorEventPrompt = bundle => `<sensor_event>${JSON.stringify({ events: bundle.events, at: bundle.at })}</sensor_event>\n${SENSOR_PROMPT}`;
export const permissionMessage = error => /denied|permission/i.test(error instanceof Error ? error.message : String(error)) ? "权限没有打开：请在 iPhone 设置里允许动作或麦克风，再点一次开关。" : "这项感知在当前浏览器不可用，请换 HTTPS 的 iPhone 页面试试。";
export const isMainChatScope = (scope, conv) => scope === "main" && !conv?.rpProject && !conv?.rpBackstageNotes;
export const acceptSensorBundle = (bundle, state, now = Date.now()) => { if (!bundle || state.replyBusy || (state.lastReactionAt > 0 && now - state.lastReactionAt < 20000)) return false; state.lastReactionAt = now; return true; };
export class SenseInteractionRuntime {
  constructor(options) { this.options = options; this.bridge = null; this.enabled = new Set(); this.pending = []; this.timer = null; this.paused = false; }
  async set(kind, on) {
    if (!on) { this.disable(kind); return; }
    if (this.enabled.has(kind)) return;
    if (!this.bridge) { const mod = await import("./sense-bridge.js"); this.bridge = new mod.SenseBridge({ localOnly: true }); this.bridge.addEventListener("sense", event => this.receive(event.detail)); }
    try { if (kind === "blow") await this.bridge.enableBlow(); else if (kind === "shake") await this.bridge.enableShake(); else if (kind === "rotation") await this.bridge.enableRotation(); else this.bridge.enableTouch(this.options.getTouchElement?.() || document.documentElement); this.enabled.add(kind); }
    catch (error) { this.options.onPermissionError?.(kind, permissionMessage(error)); throw error; }
  }
  disable(kind) { this.enabled.delete(kind); this.bridge?.disable(kind); }
  pause() { this.paused = true; this.bridge?.disableAll(); }
  async resume() { if (!this.paused) return; this.paused = false; for (const kind of [...this.enabled]) await this.set(kind, true).catch(() => undefined); }
  dispose() { this.bridge?.disableAll(); this.enabled.clear(); if (this.timer) clearTimeout(this.timer); }
  receive(event) { if (this.paused || !kindForEvent(event.event)) return; this.pending.push(event); if (this.timer) clearTimeout(this.timer); this.timer = setTimeout(() => { const bundle = mergeSensorEvents(this.pending); this.pending = []; this.timer = null; if (bundle) this.options.onBundle(bundle); }, 3000); }
}
