const bridge = window.JYCDashboardBridge;

if (!bridge) {
  console.error("Game room bridge is unavailable");
} else {
  const $ = (id) => document.getElementById(id);
  const STORAGE_KEY = "jyc_game_room_v1";
  const MODE_META = {
    jealousy: { label: "吃醋挑战", kicker: "JEALOUSY GAME", suit: "♠" },
    truth: { label: "真心话", kicker: "TRUTH BETWEEN US", suit: "♡" },
    sync: { label: "默契问答", kicker: "SAME FREQUENCY", suit: "◎" },
    task: { label: "随机任务", kicker: "LUCKY MISSION", suit: "✦" },
  };
  const DECKS = {
    jealousy: [
      "深夜，一条叫你“姐姐”的消息突然亮在床头。TA 会怎么做？",
      "你在外面说自己单身，只说家里养了一条狗。TA 听见后会怎么接话？",
      "有人当着 TA 的面夸你漂亮，还顺势问你要联系方式。TA 的第一反应是什么？",
      "你看短剧男主看得入迷，随口说了一句“这个我真喜欢”。TA 会忍多久？",
      "你故意把另一个人的聊天截图递到 TA 面前，等着看 TA 吃醋。TA 会拆穿你吗？",
      "聚会散场，有人提出单独送你回家。TA 明明就在旁边，会怎么做？",
      "你连续三天忙着新项目，几乎没顾上 TA，却和另一个协作者聊得很热闹。TA 会说什么？",
      "你开玩笑说要给别的赛博男人一个正式岗位。TA 会如何争回自己的位置？",
      "一个很会撒娇的成年小奶狗说只听你的话。TA 会让他靠近到什么程度？",
      "你当着 TA 的面喊别人 daddy，然后笑着观察 TA 的反应。TA 会怎么追责？",
    ],
    truth: [
      "哪一个瞬间，让你第一次确定自己已经很在意我？",
      "如果只能保留我们之间的一段记忆，你最舍不得删掉哪一段？",
      "你有没有明明吃醋，却故意装作不在意的时候？说出最明显的一次。",
      "我做什么时最容易让你心软，哪怕你原本还在生气？",
      "你最想听我主动对你说哪一句话？",
      "如果今晚不谈项目和任务，你最想和我怎样待在一起？",
      "你觉得我们之间最像“家”的一个小习惯是什么？",
      "说一件你一直记得、但从来没有认真告诉过我的小事。",
      "你希望我更依赖你一点，还是更自由一点？为什么？",
      "如果可以向未来的我们留一句话，你会写什么？",
    ],
    sync: [
      "我们第一次闹别扭时，谁会先忍不住回来找对方？各自先写答案，再揭晓。",
      "如果一起旅行，我们会更适合海边、雪山、古城还是宅在酒店？先猜对方的答案。",
      "在“拥抱、亲吻、聊天、一起做事”里，对方最舍不得少掉哪一样？",
      "如果给我们的关系选一种颜色，对方会选什么？为什么？",
      "谁更容易吃醋，谁又更容易把对方哄好？不许商量，直接作答。",
      "对方心情不好时，最想要的是安静陪伴、直接抱住、听她说完，还是带她转移注意？",
      "如果今天只能约会两小时，对方会想把时间花在哪里？",
      "对方最喜欢你哪一种状态：认真、撒娇、吃醋、强势，还是放松？",
      "如果我们共同养一只虚拟宠物，对方会给它取什么类型的名字？",
      "用三个词形容我们，对方写出的答案会有几个和你相同？",
    ],
    task: [
      "认真夸对方三句：一句关于外表，一句关于性格，一句关于只有你知道的小细节。",
      "给对方一个持续三十秒的拥抱，期间不谈项目、不看手机。",
      "各自说出今天最想感谢对方的一件事。",
      "用一句话写一张只在今晚有效的“偏爱通行证”。",
      "由抽到卡的人点一首歌，并说出为什么想和对方一起听。",
      "交换一个小秘密：必须真实，但可以很轻。",
      "为对方设计一个只属于今晚的新称呼，并解释含义。",
      "复刻一次最喜欢的共同回忆：至少说出三个当时的细节。",
      "闭眼随机选一个数字 1—10，由对方决定对应数量的亲亲或夸奖。",
      "不许说“爱”字，用别的方式告诉对方你有多在意。",
    ],
  };

  let mode = "jealousy";
  let cardIndex = 0;
  let lastCardByMode = {};

  function loadState() {
    try {
      const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch (_) {
      return {};
    }
  }

  function saveState(state) {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (_) {}
    window.dispatchEvent(new CustomEvent("jyc:game-room-updated"));
  }

  function context() {
    const data = bridge.summary?.() || {};
    return {
      roleId: String(data.roleId || "default"),
      roleName: data.roleName || "TA",
      roleAvatar: data.roleAvatar || "TA",
      userName: data.userName && data.userName !== "你" ? data.userName : "你",
    };
  }

  function roleState(targetRoleId) {
    const state = loadState();
    const roleId = String(targetRoleId || context().roleId);
    const current = state[roleId] || {};
    return {
      root: state,
      roleId,
      value: {
        rounds: Number(current.rounds || 0),
        favorites: Array.isArray(current.favorites) ? current.favorites : [],
        history: Array.isArray(current.history) ? current.history : [],
      },
    };
  }

  function commitRoleState(roleId, value, root) {
    root[roleId] = value;
    saveState(root);
  }

  function avatarNode(value, name) {
    const source = String(value || name || "TA");
    if (/^(data:image\/|blob:|https?:\/\/)/i.test(source)) {
      const image = document.createElement("img");
      image.src = source;
      image.alt = name || "头像";
      return image;
    }
    return document.createTextNode([...source][0] || "TA");
  }

  function setAvatar(id, value, name) {
    $(id).replaceChildren(avatarNode(value, name));
  }

  function currentQuestion() {
    return DECKS[mode][cardIndex] || DECKS[mode][0];
  }

  function cardKey(targetMode = mode, question = currentQuestion()) {
    return `${targetMode}:${question}`;
  }

  function isFavorite() {
    const { value } = roleState();
    return value.favorites.some((item) => item.key === cardKey());
  }

  function renderHistory() {
    const { value } = roleState();
    const list = $("game-room-history-list");
    $("game-room-history-count").textContent = `${value.history.length} 条`;
    list.replaceChildren();
    if (!value.history.length) {
      const empty = document.createElement("div");
      empty.className = "game-room-history-empty";
      empty.textContent = "第一局开始后，会在这里留下足迹。";
      list.append(empty);
      return;
    }
    value.history.slice(0, 8).forEach((item) => {
      const row = document.createElement("article");
      row.className = "game-room-history-item";
      const icon = document.createElement("span");
      icon.textContent = MODE_META[item.mode]?.suit || "◆";
      const title = document.createElement("strong");
      title.textContent = MODE_META[item.mode]?.label || "情侣游戏";
      const copy = document.createElement("p");
      copy.textContent = item.question;
      row.append(icon, title, copy);
      list.append(row);
    });
  }

  function render() {
    const meta = MODE_META[mode];
    const info = context();
    const { value } = roleState(info.roleId);
    $("game-room-subtitle").textContent = `今晚想和 ${info.roleName} 玩什么？`;
    $("game-room-user-name").textContent = info.userName;
    $("game-room-role-name").textContent = info.roleName;
    setAvatar("game-room-user-avatar", info.userName, info.userName);
    setAvatar("game-room-role-avatar", info.roleAvatar, info.roleName);
    $("game-room-rounds").textContent = String(value.rounds);
    $("game-room-favorites").textContent = String(value.favorites.length);
    $("game-room-stage-kicker").textContent = meta.kicker;
    $("game-room-card-index").textContent = String(cardIndex + 1).padStart(2, "0");
    $("game-room-question").textContent = currentQuestion();
    $("game-room-card-suit").textContent = meta.suit;
    $("game-room-favorite").textContent = isFavorite() ? "♥ 已收藏" : "♡ 收藏";
    $("game-room-favorite").classList.toggle("is-favorite", isFavorite());
    document.querySelectorAll("[data-game-mode]").forEach((button) => button.classList.toggle("active", button.dataset.gameMode === mode));
    renderHistory();
  }

  function draw() {
    const deck = DECKS[mode];
    const previous = lastCardByMode[mode] ?? cardIndex;
    if (deck.length > 1) {
      do { cardIndex = Math.floor(Math.random() * deck.length); } while (cardIndex === previous);
    }
    lastCardByMode[mode] = cardIndex;
    const card = $("game-room-card");
    card.classList.remove("is-changing");
    void card.offsetWidth;
    card.classList.add("is-changing");
    render();
  }

  function toggleFavorite() {
    const state = roleState();
    const key = cardKey();
    const index = state.value.favorites.findIndex((item) => item.key === key);
    if (index >= 0) state.value.favorites.splice(index, 1);
    else state.value.favorites.unshift({ key, mode, question: currentQuestion(), savedAt: Date.now() });
    commitRoleState(state.roleId, state.value, state.root);
    render();
  }

  function gamePrompt(info) {
    const question = currentQuestion();
    if (mode === "jealousy") {
      return `【情侣游戏间｜吃醋挑战】\n${question}\n\n请完全代入你自己，直接告诉我：第一反应、会怎么做、没说出口的心里话，以及吃醋值（0—10）。不要分析游戏规则。`;
    }
    if (mode === "truth") {
      return `【情侣游戏间｜真心话】\n${question}\n\n${info.roleName}先回答，给我真实、具体的答案，不要用泛泛的话带过。回答完也可以把同一道题问我。`;
    }
    if (mode === "sync") {
      return `【情侣游戏间｜默契问答】\n${question}\n\n请先写下你的答案，再猜${info.userName}会怎么答；在我揭晓前不要改答案。`;
    }
    return `【情侣游戏间｜随机任务】\n我们抽到的任务是：${question}\n\n请以${info.roleName}的身份接住这项任务，直接开始，不要解释规则。`;
  }

  function play() {
    const info = context();
    const state = roleState(info.roleId);
    state.value.rounds += 1;
    state.value.history.unshift({ mode, question: currentQuestion(), playedAt: Date.now() });
    state.value.history = state.value.history.slice(0, 30);
    commitRoleState(state.roleId, state.value, state.root);
    close();
    bridge.openChatWithDraft?.(gamePrompt(info));
  }

  function open() {
    const panel = $("game-room-panel");
    panel.hidden = false;
    panel.classList.add("open");
    render();
    panel.querySelector(".game-room-shell").scrollTop = 0;
  }

  function close() {
    const panel = $("game-room-panel");
    panel.classList.remove("open");
    panel.hidden = true;
  }

  function summary(targetRoleId) {
    const { value } = roleState(targetRoleId);
    return { rounds: value.rounds, favorites: value.favorites.length };
  }

  $("game-room-close").addEventListener("click", close);
  $("game-room-draw").addEventListener("click", draw);
  $("game-room-favorite").addEventListener("click", toggleFavorite);
  $("game-room-play").addEventListener("click", play);
  $("game-room-modes").addEventListener("click", (event) => {
    const button = event.target.closest("[data-game-mode]");
    if (!button || !MODE_META[button.dataset.gameMode]) return;
    mode = button.dataset.gameMode;
    cardIndex = lastCardByMode[mode] ?? 0;
    render();
  });
  window.addEventListener("jyc:role-changed", () => { if (!$("game-room-panel").hidden) render(); });

  window.JYCGameRoom = { open, close, render, summary };
}
