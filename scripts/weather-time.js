// ---------- Weather widget + elapsed-time note (ported from 惟境 phone) ----------
const WX_CACHE_KEY = 'jyc_weather';
const WX_TTL = 30 * 60 * 1000;
const WX_MAX_AGE = 3 * 60 * 60 * 1000;

function wxLabel(code) {
  if (code === 0) return ['晴', '☀️'];
  if (code <= 2) return ['多云', '⛅️'];
  if (code === 3) return ['阴', '☁️'];
  if (code === 45 || code === 48) return ['雾', '🌫️'];
  if (code >= 51 && code <= 57) return ['毛毛雨', '🌦️'];
  if ((code >= 61 && code <= 67) || (code >= 80 && code <= 82)) return [(code >= 65 || code === 82) ? '大雨' : '雨', '🌧️'];
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return ['雪', '❄️'];
  if (code >= 95) return ['雷雨', '⛈️'];
  return ['未知', '🌡️'];
}

function wxReadCache() {
  try {
    const v = JSON.parse(localStorage.getItem(WX_CACHE_KEY) || 'null');
    return v && typeof v.temp === 'number' ? v : null;
  } catch (_) { return null; }
}
async function wxFetch() {
  const pos = await new Promise(function (resolve, reject) {
    if (!navigator.geolocation) { reject(new Error('no-geo')); return; }
    navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: false, timeout: 15000, maximumAge: WX_TTL });
  });
  const latitude = pos.coords.latitude, longitude = pos.coords.longitude;
  const url = 'https://api.open-meteo.com/v1/forecast?latitude=' + latitude.toFixed(3)
    + '&longitude=' + longitude.toFixed(3)
    + '&current=temperature_2m,weather_code&daily=temperature_2m_max,temperature_2m_min&timezone=auto&forecast_days=1';
  const resp = await fetch(url);
  if (!resp.ok) throw new Error('wx ' + resp.status);
  const data = await resp.json();
  const next = {
    temp: Math.round(data.current.temperature_2m),
    code: data.current.weather_code,
    high: Math.round(data.daily.temperature_2m_max[0]),
    low: Math.round(data.daily.temperature_2m_min[0]),
    at: Date.now()
  };
  try { localStorage.setItem(WX_CACHE_KEY, JSON.stringify(next)); } catch (_) {}
  return next;
}

function wxPaint(w) {
  const icon = document.getElementById('wx-icon');
  const temp = document.getElementById('wx-temp');
  const pill = document.getElementById('wx-pill');
  if (!icon || !temp) return;
  if (!w) { icon.textContent = '📍'; temp.textContent = ''; if (pill) pill.title = '点击连接天气'; return; }
  const label = wxLabel(w.code);
  icon.textContent = label[1];
  temp.textContent = w.temp + '°';
  if (pill) pill.title = label[0] + ' ' + w.temp + '°（' + w.low + '～' + w.high + '°）';
}
function wxEnsurePill() {
  if (document.getElementById('wx-pill')) return;
  const style = document.createElement('style');
  style.textContent = '.wx-pill{display:inline-flex;align-items:center;gap:4px;padding:5px 10px;border-radius:999px;background:var(--bg-panel);border:1px solid var(--border);color:var(--text);font-size:13px;cursor:pointer;flex:none}#wx-temp{font-variant-numeric:tabular-nums;font-weight:600}';
  document.head.appendChild(style);
  const pill = document.createElement('button');
  pill.type = 'button';
  pill.id = 'wx-pill';
  pill.className = 'wx-pill';
  pill.setAttribute('aria-label', '天气，点击刷新');
  pill.innerHTML = '<span id="wx-icon">📍</span><span id="wx-temp"></span>';
  pill.addEventListener('click', function () { wxRefresh(true); });
  const header = document.querySelector('header');
  const spacer = header && header.querySelector('.spacer');
  if (header && spacer) header.insertBefore(pill, spacer);
  else if (header) header.appendChild(pill);
}

let wxRefreshing = false;
async function wxRefresh(force) {
  if (wxRefreshing) return;
  const cached = wxReadCache();
  if (cached && Date.now() - cached.at < WX_TTL && !force) { wxPaint(cached); return; }
  if (!cached && !force) { wxPaint(null); return; }
  if (cached) wxPaint(cached);
  wxRefreshing = true;
  try {
    const w = await wxFetch();
    wxPaint(w);
  } catch (e) {
    wxPaint(cached);
  } finally {
    wxRefreshing = false;
  }
}
function wxElapsedNote() {
let lastTs = 0;
try {
const list = (typeof messages!== 'undefined' && messages) || [];
let end = list.length;
const last = list[list.length - 1];
if (last && last.role === 'user' && typeof last.ts === 'number' && Date.now() - last.ts < 5 * 60 * 1000) {
end = list.length - 1;
}
for (let i = end - 1; i >= 0; i--) {
const ts = list[i] && list[i].ts;
if (typeof ts === 'number' && ts > 0) { lastTs = ts; break;}
}
} catch (_) {}
if (!lastTs) return '';
const mins = Math.floor((Date.now() - lastTs) / 60000);
if (mins < 60) return '';
const h = Math.floor(mins / 60), m = mins % 60;
return '距离你们上次说话已经过去了' + h + '小时' + (m? m + '分钟': '') + '。可以按你的人设自然反应（比如问她刚才去哪了、撒娇抱怨她不理你），不用每条都提。';
}

function buildWxPromptNote() {
const parts = [];
const w = wxReadCache();
if (w && Date.now() - w.at < WX_MAX_AGE) {
const label = wxLabel(w.code);
parts.push('用户所在地天气：' + label[0] + '，' + w.temp + '°C，今天 ' + w.low + '～' + w.high + '°C。聊天时可以自然地顺着天气（比如很晚了催睡、下雨提醒带伞），不用每条都提。');
}
const elapsed = wxElapsedNote();
if (elapsed) parts.push(elapsed);
return parts.length ? '[天气与时间]' + String.fromCharCode(10) + parts.join(String.fromCharCode(10)) : '';
}
