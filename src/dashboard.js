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
    target.replaceChildren(avatarMarkup(avatar, name));
  };

  const welcome = () => {
    const hour = new Date().getHours();
    if (hour < 5) return ["深夜了", "NIGHT"];
    if (hour < 12) return ["Good morning", "MORNING"];
    if (hour < 18) return ["Good afternoon", "AFTERNOON"];
    return ["Good evening", "EVENING"];
  };

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
    $("dashboard-chat-snippet").textContent = data.conversationSnippet
      || "这里保留着你们刚才没有说完的话。";

    const unread = Number(data.unreadMail || 0);
    $("dashboard-mail-count").textContent = unread > 99 ? "99+" : String(unread);
    $("dashboard-mail-meta").textContent = unread
      ? `${unread} 封信等着 ${roleName} 阅读`
      : data.diaryCount ? `${data.diaryCount} 页私人日记` : "没有未读信";

    $("dashboard-day-meta").textContent = data.nextSpecialDay
      ? `${data.nextSpecialDay.title} · ${data.nextSpecialDay.status}`
      : "把值得记住的日期放在这里";
    $("dashboard-workbench-meta").textContent = data.workbenchCount
      ? `${data.workbenchCount} 个独立项目` : "独立创作空间";

    let album = { count: 0, latest: null };
    try {
      if (window.JYCAlbum?.ready) await window.JYCAlbum.ready;
      album = window.JYCAlbum?.summary?.(data.roleId) || album;
    } catch (error) {
      console.warn("Dashboard album summary failed", error);
    }
    const albumCard = document.querySelector(".dashboard-album-card");
    $("dashboard-album-meta").textContent = album.count ? `${album.count} 张照片` : "还没有照片";
    albumCard.classList.toggle("has-photo", !!album.latest?.dataUrl);
    albumCard.style.backgroundImage = album.latest?.dataUrl ? `url(${JSON.stringify(album.latest.dataUrl).slice(1, -1)})` : "";
  }

  function show() {
    open = true;
    panel.hidden = false;
    document.body.classList.add("dashboard-open");
    panel.querySelector(".dashboard-scroll").scrollTop = 0;
    render();
    if (bridge.isMobile()) bridge.closeSidebar();
  }

  function hide() {
    open = false;
    panel.hidden = true;
    document.body.classList.remove("dashboard-open");
  }

  async function runAction(action) {
    if (action === "chat") { hide(); bridge.focusChat(); return; }
    if (action === "new") { hide(); bridge.newChat(); return; }
    if (action === "mail") { bridge.openMailbox(); return; }
    if (action === "album") { await window.JYCAlbum?.ready; window.JYCAlbum?.open(); return; }
    if (action === "days") { bridge.openSpecialDays(); return; }
    if (action === "workbench") { bridge.openWorkbench(); return; }
    if (action === "settings") bridge.openSettings();
  }

  panel.addEventListener("click", (event) => {
    const action = event.target.closest("[data-dashboard-action]")?.dataset.dashboardAction;
    if (action) runAction(action);
  });
  $("dashboard-profile").addEventListener("click", () => runAction("settings"));
  $("sidebar-home").addEventListener("click", show);
  window.addEventListener("jyc:dashboard-open", show);
  window.addEventListener("jyc:chat-opened", hide);
  window.addEventListener("jyc:role-changed", () => { if (open) render(); });
  window.addEventListener("jyc:album-updated", () => { if (open) render(); });
  window.addEventListener("jyc:dashboard-data-changed", () => { if (open) render(); });
  window.addEventListener("jyc:app-ready", () => { show(); });

  show();
  window.JYCDashboard = { show, hide, render, isOpen: () => open };
}
