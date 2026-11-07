const bridge = window.JYCDashboardBridge;

if (!bridge) {
  console.error("Dashboard bridge is unavailable");
} else {
  const $ = (id) => document.getElementById(id);
  const panel = $("home-dashboard");
  let open = true;

  const avatarMarkup = (avatar, name) => {
    const value = String(avatar || name || "角");
    if (/^(data:image\/|blob:|https?:\/\/)/i.test(value)) {
      const image = document.createElement("img");
      image.src = value;
      image.alt = name || "角色头像";
      return image;
    }
    return document.createTextNode([...value][0] || "角");
  };

  const setAvatar = (id, avatar, name) => {
    const target = $(id);
    const content = avatarMarkup(avatar, name);
    target.classList.toggle("has-image", content.nodeType === Node.ELEMENT_NODE);
    target.replaceChildren(content);
  };

  const welcome = () => {
    const hour = new Date().getHours();
    if (hour < 5) return ["深夜了", "NIGHT"];
    if (hour < 12) return ["Good morning", "MORNING"];
    if (hour < 18) return ["Good afternoon", "AFTERNOON"];
    return ["Good evening", "EVENING"];
  };

  let dayRotateTimer = 0;
  // 重要日子卡片：主标题固定「已相伴 X 天」，小字轮播最近的生日/周年
  function renderDayCard(data, roleName) {
    const card = document.querySelector(".dashboard-day-card");
    const title = card?.querySelector(".dashboard-card-copy strong");
    const meta = $("dashboard-day-meta");
    if (!card || !title || !meta) return;
    clearInterval(dayRotateTimer);
    const together = Number(data.companionDays || 0);
    const upcoming = Array.isArray(data.upcomingSpecialDays) ? data.upcomingSpecialDays : [];
    const lines = upcoming.map(item => `${item.title} · ${item.status}`);
    const milestone = together && (together % 100 === 0 || together === 520 || together === 1314 || together % 365 === 0);
    card.classList.toggle("is-companion", !!together);
    card.classList.toggle("is-milestone", !!milestone || upcoming.some(item => item.today));
    title.textContent = together ? `和 ${roleName} 已相伴 ${together} 天` : "重要日子";
    if (!lines.length) {
      meta.textContent = together ? "把下一个生日或周年也记下来吧" : "把值得记住的日期放在这里";
      return;
    }
    let i = 0;
    meta.textContent = lines[0];
    if (lines.length > 1) dayRotateTimer = setInterval(() => {
      if (!document.body.contains(meta)) return clearInterval(dayRotateTimer);
      i = (i + 1) % lines.length;
      meta.classList.add("is-swapping");
      setTimeout(() => { meta.textContent = lines[i]; meta.classList.remove("is-swapping"); }, 220);
    }, 4200);
  }

  async function render() {
    const data = bridge.summary();
    const [greeting, timeLabel] = welcome();
    const roleName = data.roleName || "当前角色";
    const userName = data.userName && data.userName !== "你" ? data.userName : "你";

    $("dashboard-time-label").textContent = timeLabel;
    $("dashboard-greeting").textContent = `${userName}，今天想从哪里开始？`;
    $("dashboard-subtitle").textContent = `和 ${roleName} 的聊天、珍藏与创作，都在这里。`;
    $("dashboard-role-name").textContent = roleName;
    $("dashboard-welcome-line").textContent = greeting;
    $("dashboard-welcome-name").textContent = userName;
    setAvatar("dashboard-profile-avatar", data.roleAvatar, roleName);
    setAvatar("dashboard-chat-avatar", data.roleAvatar, roleName);

    $("dashboard-chat-title").textContent = data.conversationTitle
      ? `继续和 ${roleName} 聊天` : `和 ${roleName} 开始聊天`;
    $("dashboard-rp-meta").textContent = Number(data.roleplayCount || 0)
      ? `${data.roleplayCount} 部戏正在等你 · ${roleName} 本人出演`
      : `导入角色卡，让 ${roleName} 陪你入戏`;

    const unread = Number(data.unreadMail || 0);
    $("dashboard-mail-count").textContent = unread > 99 ? "99+" : String(unread);
    $("dashboard-mail-meta").textContent = unread
      ? `${unread} 封信等着 ${roleName} 阅读`
      : data.diaryCount ? `${data.diaryCount} 页私人日记` : "没有未读信";

    renderDayCard(data, roleName);
    $("dashboard-workbench-meta").textContent = data.workbenchCount
      ? `${data.workbenchCount} 个独立项目` : "独立创作空间";

    let album = { count: 0, latest: null };
    try {
      album = window.JYCAlbum?.summary?.(data.roleId) || album;
    } catch (error) {
      console.warn("Dashboard album summary failed", error);
    }
    const albumCard = document.querySelector(".dashboard-album-card");
    $("dashboard-album-meta").textContent = album.count ? `${album.count} 张照片` : album.loaded === false ? "点击查看相册" : "还没有照片";
    albumCard.classList.toggle("has-photo", !!album.latest?.dataUrl);
    albumCard.style.backgroundImage = album.latest?.dataUrl ? `url(${JSON.stringify(album.latest.dataUrl).slice(1, -1)})` : "";

    let reading = { count: 0, active: null };
    try {
      reading = window.JYCReadingRoom?.summary?.(data.roleId) || reading;
    } catch (error) {
      console.warn("Dashboard reading summary failed", error);
    }
    $("dashboard-reading-meta").textContent = reading.active
      ? `《${reading.active.title}》· ${reading.active.progress}%`
      : reading.count ? `${reading.count} 本书，选一本继续` : reading.loaded === false ? "点击进入书房" : "和 TA 打开一本书";

    const music = window.JYCMusic?.summary?.() || { connected: false, song: null, queueCount: 0 };
    $("dashboard-music-meta").textContent = music.song
      ? `正在听《${music.song.name}》`
      : music.connected ? "搜索一首歌，和 TA 一起听" : music.localCount ? `${music.localCount} 首本地歌，点开一起听` : "导入手机里的歌，和 TA 一起听";

    $("dashboard-gift-meta").textContent = Number(data.giftCount || 0)
      ? `已经交换了 ${data.giftCount} 份心意`
      : `挑一份只属于你和 ${roleName} 的心意`;

    const game = window.JYCGameRoom?.summary?.(data.roleId) || { rounds: 0, favorites: 0 };
    $("dashboard-game-meta").textContent = game.rounds
      ? `已经一起玩了 ${game.rounds} 局`
      : game.favorites ? `收藏了 ${game.favorites} 道题` : "抽一张只属于你们的题";
  }

  function show() {
    open = true;
    panel.hidden = false;
    document.body.classList.add("dashboard-open");
    bridge.syncConversationSurface?.();
    panel.querySelector(".dashboard-scroll").scrollTop = 0;
    render();
    if (bridge.isMobile()) bridge.closeSidebar();
  }

  function hide() {
    open = false;
    panel.hidden = true;
    document.body.classList.remove("dashboard-open");
    bridge.syncConversationSurface?.();
  }

  async function runAction(action) {
    if (action === "chat") { hide(); bridge.focusChat(); return; }
    if (action === "new") { hide(); bridge.newChat(); return; }
    if (action === "mail") { bridge.openMailbox(); return; }
    if (action === "album") { await window.JYCAlbum?.ready; window.JYCAlbum?.open(); return; }
    if (action === "reading") { await window.JYCReadingRoom?.ready; window.JYCReadingRoom?.open(); return; }
    if (action === "music") { await window.JYCMusic?.open?.(); return; }
    if (action === "game") { window.JYCGameRoom?.open?.(); return; }
    if (action === "gifts") { window.dispatchEvent(new CustomEvent("jyc:gifts-open")); return; }
    if (action === "roleplay") {
      // Use an event as the primary hand-off so the dashboard does not depend
      // on the RP module's global being attached before this click runs.
      window.dispatchEvent(new CustomEvent("jyc:roleplay-open"));
      return;
    }
    if (action === "days") { bridge.openSpecialDays(); return; }
    if (action === "workbench") { bridge.openWorkbench(); return; }
    if (action === "settings") bridge.openSettings();
  }

  panel.addEventListener("click", (event) => {
    const action = event.target.closest("[data-dashboard-action]")?.dataset.dashboardAction;
    if (action) runAction(action);
  });
  $("dashboard-profile").addEventListener("click", () => runAction("settings"));
  $("sidebar-home").addEventListener("click", () => {
    if (document.body.classList.contains("rp-chat-active")) {
      window.JYCRoleplayBridge?.exitToHome?.();
      return;
    }
    show();
  });
  window.addEventListener("jyc:dashboard-open", show);
  window.addEventListener("jyc:chat-opened", hide);
  window.addEventListener("jyc:role-changed", () => { if (open) render(); });
  window.addEventListener("jyc:album-updated", () => { if (open) render(); });
  window.addEventListener("jyc:reading-updated", () => { if (open) render(); });
  window.addEventListener("jyc:music-updated", () => { if (open) render(); });
  window.addEventListener("jyc:game-room-updated", () => { if (open) render(); });
  window.addEventListener("jyc:roleplay-updated", () => { if (open) render(); });
  window.addEventListener("jyc:dashboard-data-changed", () => { if (open) render(); });
  window.addEventListener("jyc:app-ready", () => { show(); });

  show();
  window.JYCDashboard = { show, hide, render, isOpen: () => open };
}
