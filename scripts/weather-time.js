// ---------- Weather + clock widget (ported from 惟境 phone status) ----------
const WX_CACHE_KEY = 'jyc_weather';
const WX_TTL = 30 * 60 * 1000;
const WX_MAX_AGE = 3 * 60 * 60 * 1000;
const WX_CSS = '.wx-widget{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:14px 18px;border-radius:22px;background:linear-gradient(135deg,#f4f1ff 0%,#e8e2ff 100%);margin:2px 0 12px;position:relative;z-index:5;box-shadow:0 2px 12px rgba(120,100,200,.08)}'
+ '.wx-time strong{display:block;font-size:30px;font-weight:700;line-height:1.1;font-variant-numeric:tabular-nums;color:#2b2b3a;letter-spacing:1px}'
+ '.wx-time small{color:#8a87a0;font-size:13px}'
+ '.wx-weather{display:flex;align-items:center;gap:10px;background:rgba(255,255,255,.75);border:none;border-radius:16px;padding:8px 14px;cursor:pointer;-webkit-tap-highlight-color:transparent}'
+ '.wx-weather:active{transform:scale(.97)}'
+ '.wx-icon{font-size:30px;line-height:1}'
+ '.wx-temp{font-size:20px;font-weight:700;color:#2b2b3a;font-variant-numeric:tabular-nums}'
+ '.wx-desc{display:block;font-size:12px;color:#8a87a0;font-weight:400}';

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
function wxTickClock() {
  const clock = document.getElementById('wx-clock');
  const date = document.getElementById('wx-date');
  if (!clock || !date) return;
  const now = new Date();
  const pad = function (n) { return String(n).padStart(2, '0'); };
  clock.textContent = pad(now.getHours()) + ':' + pad(now.getMinutes());
  const wk = ['日', '一', '二', '三', '四', '五', '六'][now.getDay()];
  date.textContent = (now.getMonth() + 1) + '月' + now.getDate() + '日 星期' + wk;
}

function wxPaint(w) {
  const icon = document.getElementById('wx-icon');
  const temp = document.getElementById('wx-temp');
  const desc = document.getElementById('wx-desc');
  if (!icon || !temp || !desc) return;
  if (!w) {
    icon.textContent = '📍';
    temp.textContent = '';
    desc.textContent = '连接天气';
    return;
  }
  const label = wxLabel(w.code);
  icon.textContent = label[1];
  temp.textContent = w.temp + '°';
  desc.textContent = label[0] + ' ' + w.low + '°/' + w.high + '°';
}

function wxEnsureWidget() {
  if (document.getElementById('wx-widget')) return;
  const style = document.createElement('style');
  style.textContent = WX_CSS;
  document.head.appendChild(style);
  const section = document.createElement('section');
  section.id = 'wx-widget';
  section.className = 'wx-widget';
  section.setAttribute('aria-label', '本地时间与天气');
  section.innerHTML = '<div class="wx-time"><strong id="wx-clock">--:--</strong><small id="wx-date"></small></div>'
    + '<button type="button" class="wx-weather" id="wx-weather-btn" aria-label="天气，点击刷新">'
    + '<span class="wx-icon" id="wx-icon">📍</span>'
    + '<span><span class="wx-temp" id="wx-temp"></span><span class="wx-desc" id="wx-desc">连接天气</span></span>'
    + '</button>';
  const shell = document.querySelector('#home-dashboard .dashboard-shell');
  if (shell && shell.firstChild) {
    shell.insertBefore(section, shell.firstChild);
  } else if (shell) {
    shell.appendChild(section);
  } else {
    return;
  }
  wxTickClock();
  setInterval(wxTickClock, 1000);
  document.getElementById('wx-weather-btn').addEventListener('click', function () { wxRefresh(true); });
}
async function wxFetch() {
  const pos = await new Promise(function (resolve, reject) {
    if (!navigator.geolocation) { reject(new Error('no-geo')); return; }
    navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: false, timeout: 15000, maximumAge: WX_TTL });
  });
  const latitude = pos.coords.latitude, longitude = pos.coords.longitude;
  const url = 'https://api.open-meteo.com/v1/forecast?latitude=' + latitude.toFixed(3)
    + '&longitude=' + longitude.toFixed(3)
    + '&current=temperature_2m,weather_code&daily=temperature_2m_max,temperature_2m_min,weather_code&timezone=auto&forecast_days=2';
  // Place name (BigDataCloud, 8s cap) runs alongside the weather and can never fail it.
  const placeP = (typeof jycReverseGeocode === 'function') ? jycReverseGeocode(latitude, longitude).catch(function () { return null; }) : Promise.resolve(null);
  const resp = await fetch(url);
  if (!resp.ok) throw new Error('wx ' + resp.status);
  const data = await resp.json();
  const geo = await placeP;
  const next = {
    temp: Math.round(data.current.temperature_2m),
    code: data.current.weather_code,
    high: Math.round(data.daily.temperature_2m_max[0]),
    low: Math.round(data.daily.temperature_2m_min[0]),
    at: Date.now()
  };
  // Keep the cache tiny: ~1 km rounded spot only to reuse the last place name when
  // reverse-geocoding fails at the same spot; never sent to the model.
  next.spot = latitude.toFixed(2) + ',' + longitude.toFixed(2);
  if (geo && geo.place) {
    next.place = geo.place;
    if (geo.street) next.street = geo.street;
  } else {
    const prev = wxReadCache();
    if (prev && prev.place && prev.spot === next.spot) {
      next.place = prev.place;
      if (prev.street) next.street = prev.street;
    }
  }
  if (data.daily.temperature_2m_max.length > 1) {
    next.tomorrow = {
      high: Math.round(data.daily.temperature_2m_max[1]),
      low: Math.round(data.daily.temperature_2m_min[1]),
      code: data.daily.weather_code ? data.daily.weather_code[1] : 0
    };
  }
  try { localStorage.setItem(WX_CACHE_KEY, JSON.stringify(next)); } catch (_) {}
  return next;
}

let wxRefreshing = false;
function wxToast(msg) {
  let el = document.getElementById('wx-toast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'wx-toast';
    el.style.cssText = 'position:fixed;left:50%;bottom:80px;transform:translateX(-50%);background:rgba(0,0,0,.8);color:#fff;padding:10px 16px;border-radius:10px;font-size:13px;z-index:99999;max-width:80%;text-align:center;';
    document.body.appendChild(el);
  }
  el.textContent = msg;
  el.style.display = 'block';
  clearTimeout(el._t);
  el._t = setTimeout(function () { el.style.display = 'none'; }, 4000);
}

async function wxRefresh(force) {
  if (wxRefreshing) return;
  const cached = wxReadCache();
  if (cached && Date.now() - cached.at < WX_TTL && !force) { wxPaint(cached); return; }
  if (!cached && !force) { wxPaint(null); return; }
  // 位置感知关掉时不在后台定位，只有她点天气卡片才刷新。
  if (!force && typeof settings !== 'undefined' && settings && settings.locationAware === false) { wxPaint(cached); return; }
  const icon = document.getElementById('wx-icon');
  if (icon) icon.textContent = '⏳';
  const desc = document.getElementById('wx-desc');
  if (desc) desc.textContent = '获取中';
  wxRefreshing = true;
  try {
    const w = await wxFetch();
    wxPaint(w);
  } catch (e) {
    const code = e && e.code;
    if (code === 1) {
      wxToast('定位被拒绝了：去 iPhone 设置 → 隐私与安全性 → 定位服务 → Safari（或你用的浏览器）打开定位');
    } else if (e && e.message === 'no-geo') {
      wxToast('这台设备/浏览器不支持定位，换 Safari 试试');
    } else {
      wxToast('天气获取失败，点一下卡片右侧重试');
    }
    wxPaint(cached);
  } finally {
    wxRefreshing = false;
  }
}
function wxElapsedNote() {
  let lastTs = 0;
  try {
    const list = (typeof messages !== 'undefined' && messages) || [];
    let end = list.length;
    const last = list[list.length - 1];
    if (last && last.role === 'user' && typeof last.ts === 'number' && Date.now() - last.ts < 5 * 60 * 1000) {
      end = list.length - 1;
    }
    for (let i = end - 1; i >= 0; i--) {
      const ts = list[i] && list[i].ts;
      if (typeof ts === 'number' && ts > 0) { lastTs = ts; break; }
    }
  } catch (_) {}
  if (!lastTs) return '';
  const mins = Math.floor((Date.now() - lastTs) / 60000);
  if (mins < 60) return '';
  const h = Math.floor(mins / 60), m = mins % 60;
  return '距离你们上次说话已经过去了' + h + '小时' + (m ? m + '分钟' : '') + '。可以按你的人设自然反应（比如问她刚才去哪了、撒娇抱怨她不理你），不用每条都提。';
}

function wxTomorrowNote(w) {
  if (!w || !w.tomorrow) return '';
  const label = wxLabel(w.tomorrow.code);
  let note = '明天天气：' + label[0] + '，' + w.tomorrow.low + '～' + w.tomorrow.high + '°C。';
  const tips = [];
  if (w.tomorrow.code >= 51 && w.tomorrow.code <= 82) tips.push('明天下雨，记得提醒她带伞');
  if (w.tomorrow.code >= 95) tips.push('明天有雷雨，提醒她注意安全');
  if ((w.tomorrow.code >= 71 && w.tomorrow.code <= 77) || w.tomorrow.code === 85 || w.tomorrow.code === 86) tips.push('明天下雪，提醒她注意保暖');
  if (w.tomorrow.high < w.high - 4) tips.push('明天降温' + (w.high - w.tomorrow.high) + '°C，提醒她加衣服');
  if (tips.length) note += tips.join('；') + '。';
  else note += '天气不错，不用特别提醒。';
  return note;
}

function wxLocalTimeText(now) {
  const pad = function (n) { return String(n).padStart(2, '0'); };
  const h = now.getHours();
  const period = h < 5 ? '深夜' : h < 9 ? '早上' : h < 11 ? '上午' : h < 13 ? '中午' : h < 18 ? '下午' : h < 23 ? '晚上' : '深夜';
  const wk = ['日', '一', '二', '三', '四', '五', '六'][now.getDay()];
  return (now.getMonth() + 1) + '月' + now.getDate() + '日 星期' + wk + ' ' + pad(h) + ':' + pad(now.getMinutes()) + '（' + period + '）';
}

function buildWxPromptNote() {
  const parts = [];
  const aware = !(typeof settings !== 'undefined' && settings && settings.locationAware === false);
  const w = aware ? wxReadCache() : null;
  if (w && Date.now() - w.at < WX_MAX_AGE) {
    const label = wxLabel(w.code);
    const place = (typeof simplifyPlace === 'function') ? simplifyPlace(w.place || '') : String(w.place || '');
    if (place) parts.push('她现在在：' + place + '。当地时间 ' + wxLocalTimeText(new Date()) + '。');
    parts.push('用户所在地天气：' + label[0] + '，' + w.temp + '°C，今天 ' + w.low + '～' + w.high + '°C。聊天时可以自然地顺着天气（比如很晚了催睡、下雨提醒带伞），不用每条都提。');
    const tomorrow = wxTomorrowNote(w);
    if (tomorrow) parts.push(tomorrow);
    parts.push('以上是她那边的真实情况，你心里知道就好：自然地用来关心和闲聊，不要复述坐标或精确地址，不要提“定位”“系统”“提示”这类字眼，也不要编造别的地点或天气。');
  }
  const elapsed = wxElapsedNote();
  if (elapsed) parts.push(elapsed);
  if (!parts.length) return '';
  const NL = String.fromCharCode(10);
  return '[天气与时间]' + NL + parts.join(NL);
}
