/* =========================================================
   Infectious Life 150 (main.js) - Full Rewrite
   (BALANCE PATCH v2 + GHOST PATCH + RESULT/LOG PATCH)
   + 115 CHOICE PATCH + MEDICAL COLLAPSE PATCH + TRIAGE PATCH + WAVE PATCH

   ✅ RESULT/LOG PATCH
   - リザルトに以下を表示＆保存（localStorage）
     保険（初期→最終／変更履歴）
     最初のワクチン接種の有無
     infectマスに止まった回数（ワクチンで防いだ場合以外）
     未治療回数（sev加算の回数）
     最終資金
     累計投資額（個人）
     アイテム獲得数
     最終CP
     最終の生存状態（生存／後遺症／死亡／途中死亡）
     最終政府基金
     エボラ・狂犬病イベント発生の有無
   - 直近30件を保存、最新1件は IL150_LATEST に保存
   - 結果JSONコピー機能
 ========================================================= */

(() => {
  "use strict";

  /* =========================
     CONFIG
  ========================= */
  const CONFIG = {
    BOARD_IMG: "./board150.png",
    DICE_IMG: "./dice.png",
    COLS: 15,
    ROWS: 10,
    MAX_TILE: 150,

    PLAYER_MIN: 1,
    PLAYER_MAX: 5,

    START_MONEY: 50000,
    GOV_FUND_START: 100000,

    // Infect danger base by class
    SEV_BY_CLASS: { blue: 1, yellow: 2, red: 3 },
    SEV_MIN: 1,
    SEV_MAX: 3,

    // Untreated death on-board (NOT final TG death)
    UNTREATED_DEATH_THRESHOLD: 3,

    // Board distribution
    INFECT_COUNT: 60,
    ITEM_COUNT: 18,
    WORK_COUNT: 45,

    // STOP tiles
    STOP_TILES: new Set([35, 75, 115, 143, 144, 145, 146, 147, 148, 149]),

    // Insurance
    INSURANCE: {
      A: { name: "A(無保険)", treatPlayerPay: 10000, treatGovPay: 0 },
      B: { name: "B(一部)", treatPlayerPay: 5000, treatGovPay: 5000 },
      C: { name: "C(全額)", treatPlayerPay: 0, treatGovPay: 10000 },
    },

    // WORK payout & gov fund gain by insurance
    WORK_NET: { A: 20000, B: 12000, C: 8000 },
    WORK_GOV: { A: 0, B: 8000, C: 12000 },

    // CP changes (confirmed)
    WORK_CP: { A: -1, B: 0, C: 1 },
    TREAT_CP: { A: 1, B: 0, C: -1 },
    REFUSE_TREAT_CP: -1,

    // Vaccine pack (optional start)
    VACCINE_PACK: {
      cost: 25000,
      protects: ["ポリオ", "百日咳", "麻しん", "風しん", "水痘", "日本脳炎"],
    },

    // Items: base success rates
    // (Lv2 investment adds +10%, capped 100)
    ITEMS: [
      { key: "mask", name: "マスク", targets: ["飛沫"], base: 50 },
      { key: "n95", name: "N95", targets: ["空気", "飛沫"], base: 60 },
      { key: "suit", name: "防護服", targets: ["接触", "空気", "飛沫"], base: 70 },
      { key: "alcohol", name: "アルコール消毒", targets: ["接触"], base: 55 },
      { key: "mosquito", name: "蚊帳", targets: ["蚊媒介"], base: 60 },
      { key: "tick", name: "ダニよけ", targets: ["ダニ媒介"], base: 60 },
      // rabiesVax is special: always 100%
      { key: "rabiesVax", name: "狂犬病ワクチン", targets: ["狂犬病"], base: 100 },
    ],

    // Investment (only at 35 & 75)
    INVEST_TILES: new Set([35, 75]),
    INVEST_STEP: 10000,
    INVEST_CAP_PER_TIME: 30000,
    INVEST_FRICTION_PROB: 0.30, // 30% chance CP-1 when investing
    INVEST_FRICTION_CP: -1,

    // 投資Lv（割合方式）
    INVEST_LEVEL_RATIOS: {
      lv1: 0.30,
      lv2: 0.50,
      lv3: 0.75,
    },

    // 投資が政府基金に反映される割合（二重取り抑制）
    INVEST_TO_GOVFUND_RATIO: 0.50,

    // Investment effects (公共財効果)
    INVEST_EFFECTS: {
      infectDangerMinusAtLv1: 1,
      itemSuccessPlusAtLv2: 10,
    },

    // TG FINAL (CONFIRMED)
    TG_FINAL: {
      CP_CLAMP_MIN: -10,
      CP_CLAMP_MAX: 10,
      CP_WEIGHT: 2,
      INVEST_PERSONAL_DIV: 10000, // 個人累計投資額 ÷ 10000
      TRIAL_SUCCESS_BONUS: 3,
      UNTREATED_PENALTY: 2,
      // 世界投資Lvボーナス（調整）
      WORLD_INVEST_LV2_BONUS: 1, // Lv2到達で +1
      WORLD_INVEST_LV3_BONUS: 8, // Lv3到達で +8
      TH_ASYMPTOMATIC: 15,
      TH_SEQUELAE: 8,
    },

    // Ebola: round-end check, one-time, 2-4 rounds duration
    EBOLA: {
      ENABLE: true,
      MIN_TILE_GATE: 50,
      DURATION_TURNS_MIN: 2,
      DURATION_TURNS_MAX: 4,

      // OR条件成立時の発生確率（抑える）
      TRIGGER_PROB: 0.28,

      // 「基金がこの基準未満」条件は人数スケール（4人基準）
      GOVFUND_LT_BASE_4P: 300000,

      HIGH_SEV_STREAK_NEED: 2,
      AVG_CP_MAX: 6,

      INFECT_DANGER_PLUS: 1,

      // WORK減少（人数別）
      WORK_PENALTY_BY_PLAYERS: {
        1: 10,
        2: 12,
        3: 15,
        4: 18,
        5: 20,
      },
    },

    // 145 collapse: weaken items (NOT disable), vaccines still active
    COLLAPSE_TILE: 145,
    COLLAPSE: {
      ITEM_SUCCESS_MINUS: 20, // -20%
      ITEM_SUCCESS_MIN: 10, // 下限10%
    },

    // Trial at 146
    TRIAL_TILE: 146,
    TRIAL: {
      BASE_NEED: 2,
      BONUS_PER_INVEST_UNIT: 50000, // 全体投資で成功範囲が拡大
      MAX_BONUS: 2,
      CP_SUCCESS: 2,
      CP_FAIL: -3,
      REFUSE_MONEY_PENALTY: 50000,
    },

    // 149 money penalties
    FINAL_MONEY: {
      SEQUELAE_PCT: 30,
      DEATH_PCT: 70,
    },

    // ✅ 115 global event (one-time / per-player choice)
    EVENT115: {
      ENABLE: true,
      GOVFUND_DELTA_PER_PLAYER: 15000,
      CP_DELTA: 1,
      MONEY_DELTA_PER_PLAYER: 10000,
      LOG_TEXT: "【115】国際緊急会議：政策決定が行われた",
    },

    // ✅ Ghost mode
    GHOST: {
      ENABLE: true,
      DEAD_INFECT_PLUS: 1, // 死者が1人でもいれば infect危険度 +1（上限SEV_MAX）
      ENABLE_ON_147: true, // 147で幽霊も介入できる
    },

    // ✅ 感染波（Wave）
    WAVE: {
      ENABLE: true,
      LV_MAX: 3,
      // ラウンド内「感染成立（ワクチン/アイテムで防げなかった）」回数で上下
      UP_IF_INFECT_HITS_AT_LEAST: 3,  // =UNTREATED_DEATH_THRESHOLD
      DOWN_IF_INFECT_HITS_AT_MOST: 1, // =SEV_MIN
      // 影響
      INFECT_PLUS_LV1: 1,
      INFECT_PLUS_LV2: 1,
      INFECT_PLUS_LV3: 2,
      // WORK罰
      WORK_MINUS_LV2: 2000,
      WORK_MINUS_LV3: 5000,
      GOV_MINUS_LV3: 10000,
    },

    // ✅ 医療崩壊（システムイベント：145とは別）
    MEDICAL_COLLAPSE: {
      ENABLE: true,
      TRIGGER_UNTREATED_TOTAL_AT_LEAST: 3,
      TRIGGER_PROB: 0.28,
      DURATION_MIN: 2,
      DURATION_MAX: 4,
      EXTRA_TREAT_PLAYER_PAY: 5000,
      LOG_TEXT: "【医療崩壊】病床・人員不足。治療コスト上昇＆トリアージが発生しうる。",
    },

    // ✅ トリアージ（医療崩壊中のみ）
    TRIAGE: {
      ENABLE: true,
      UNTREATED_TOTAL_AT_LEAST: 3,
      TRIGGER_PROB: 0.28,
      GOV_PAY: 5000,
      CP_PENALTY_NOT_CHOSEN: -1,
      LOG_TEXT: "【トリアージ】政府は1人だけ治療を提供できる。投票で対象決定。",
    },

    MONEY_UNIT: "ハマノ",
  };

  /* =========================
     DOM
  ========================= */
  const el = {
    btnStart: document.getElementById("btnStart"),
    btnRoll: document.getElementById("btnRoll"),
    btnReset: document.getElementById("btnReset"),
    diceImg: document.getElementById("diceImg"),
    msgBox: document.getElementById("msgBox"),
    log: document.getElementById("log"),
    turnPill: document.getElementById("turnPill"),
    envPill: document.getElementById("envPill"),
    roundPill: document.getElementById("roundPill"),
    ebolaPill: document.getElementById("ebolaPill"),
    worldLv: document.getElementById("worldLv"),
    playerTbody: document.getElementById("playerTbody"),
    tokensLayer: document.getElementById("tokensLayer"),
    deadRack: document.getElementById("deadRack"),
    govFund: document.getElementById("govFund"),
    modalBack: document.getElementById("modalBack"),
    modalTitle: document.getElementById("modalTitle"),
    modalBody: document.getElementById("modalBody"),
    modalFoot: document.getElementById("modalFoot"),
    resultWrap: document.getElementById("resultWrap"),
    pod1: document.getElementById("pod1"),
    pod2: document.getElementById("pod2"),
    pod3: document.getElementById("pod3"),
    deadList: document.getElementById("deadList"),
    boardBox: document.getElementById("boardBox"),
    gridLayer: document.getElementById("gridLayer"),
    boardImg: document.getElementById("boardImg"),
    playerCount: document.getElementById("playerCount"),
    playerCountPill: document.getElementById("playerCountPill"),
  };

  function logLine(tag, s) {
    if (!el.log) return;
    el.log.textContent += `[${tag}] ${s}\n`;
    el.log.scrollTop = el.log.scrollHeight;
  }
  function setMsg(s) {
    if (el.msgBox) el.msgBox.textContent = s;
  }

  /* =========================
     Random
  ========================= */
  function rand01() {
    if (typeof crypto !== "undefined" && crypto.getRandomValues) {
      const a = new Uint32Array(1);
      crypto.getRandomValues(a);
      return a[0] / 4294967296;
    }
    return Math.random();
  }
  function randInt(min, maxInclusive) {
    return min + Math.floor(rand01() * (maxInclusive - min + 1));
  }
  function pick(arr) {
    return arr[Math.floor(rand01() * arr.length)];
  }
  function shuffle(a) {
    for (let i = a.length - 1; i > 0; i--) {
      const j = randInt(0, i);
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  /* =========================
     UI: modal
  ========================= */
  function showModal(title, bodyHTML, buttons) {
    if (!el.modalBack) return;
    el.modalTitle.textContent = title;
    el.modalBody.innerHTML = bodyHTML;
    el.modalFoot.innerHTML = "";
    for (const b of buttons) {
      const btn = document.createElement("button");
      btn.textContent = b.text;
      btn.className = b.className || "";
      btn.onclick = () => b.onClick && b.onClick();
      el.modalFoot.appendChild(btn);
    }
    el.modalBack.style.display = "flex";
  }
  function closeModal() {
    if (!el.modalBack) return;
    el.modalBack.style.display = "none";
    el.modalTitle.textContent = "";
    el.modalBody.innerHTML = "";
    el.modalFoot.innerHTML = "";
  }
  function showOkPopup(title, lines = [], _tone = "info", color = "") {
    const cls = color ? ` pop-${String(color).toLowerCase().trim()}` : "";
    const body = `
      <div class="popMsg${cls}">
        <div class="popTitle">${title}</div>
        ${lines.map((s) => `<div class="popLine">${s}</div>`).join("")}
      </div>
    `;
    return new Promise((resolve) => {
      showModal(title, body, [{ text: "OK", className: "btnPrimary", onClick: () => (closeModal(), resolve()) }]);
    });
  }

  /* =========================
     Dice image (3x2 sprite)
  ========================= */
  function setDiceFace(n) {
    if (!el.diceImg) return;
    const idx = Math.max(1, Math.min(6, n)) - 1;
    const col = idx % 3;
    const row = Math.floor(idx / 3);
    const x = col * 50;
    const y = row * 100;
    el.diceImg.style.backgroundImage = `url("${CONFIG.DICE_IMG}")`;
    el.diceImg.style.backgroundPosition = `${x}% ${y}%`;
  }
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  async function rollDiceAnimated() {
    setMsg("サイコロ中…");
    let ticks = 0;
    return await new Promise((resolve) => {
      const timer = setInterval(() => {
        const face = randInt(1, 6);
        setDiceFace(face);
        ticks++;
        if (ticks >= 14) {
          clearInterval(timer);
          const final = randInt(1, 6);
          setDiceFace(final);
          resolve(final);
        }
      }, 60);
    });
  }

  /* =========================
     Board / env
  ========================= */
  function envOf(pos) {
    if (pos <= 27) return "urban";
    if (pos <= 55) return "tropical";
    if (pos <= 80) return "polluted";
    return "urban";
  }
  function envTag(env) {
    if (env === "urban") return `<span class="tag u">都市</span>`;
    if (env === "tropical") return `<span class="tag t">熱帯</span>`;
    return `<span class="tag p">汚染</span>`;
  }

  // Board types
  const board = new Array(CONFIG.MAX_TILE + 1).fill(null);
  const GOV_TILES = new Set([35, 75, 115, 149]);
  const SPECIAL_TILES = new Map([
    [143, { type: "event", key: "warn143", text: "【警告】不穏な噂が広がる…（順位を記録）" }],
    [144, { type: "event", key: "lockdown144", text: "【ロックダウン】止まった人の所持金が一定%減少" }],
    [145, { type: "event", key: "collapse145", text: "【医療逼迫】アイテム成功率低下（ワクチンは有効）" }],
    [146, { type: "event", key: "trial146", text: "【ワクチン治験】参加する？" }],
    [147, { type: "event", key: "chaos147", text: "【情報錯綜】貢献度が変動" }],
    [148, { type: "event", key: "omen148", text: "【前兆】未知のウイルスが…" }],
    [149, { type: "pandemic", key: "pandemic149", text: "未知のウイルス・パンデミック（全員停止）" }],
    [150, { type: "goal", key: "goal150", text: "ゴール！" }],
  ]);

  function buildBoard() {
    for (let i = 1; i <= CONFIG.MAX_TILE; i++) board[i] = { type: "safe", text: "安全" };

    // GOV fixed
    for (const g of GOV_TILES) {
      if (g === 149) board[g] = { ...SPECIAL_TILES.get(149) };
      else board[g] = { type: "gov", text: `中央政府マス(${g})` };
    }

    // 143-150 fixed
    for (const [pos, t] of SPECIAL_TILES) board[pos] = { ...t };

    const candidates = [];
    for (let i = 1; i <= CONFIG.MAX_TILE; i++) {
      if (GOV_TILES.has(i)) continue;
      if (SPECIAL_TILES.has(i)) continue;
      candidates.push(i);
    }

    let eventCount = candidates.length - (CONFIG.INFECT_COUNT + CONFIG.WORK_COUNT + CONFIG.ITEM_COUNT);
    if (eventCount < 0) eventCount = 0;

    shuffle(candidates);
    const infectTiles = candidates.splice(0, CONFIG.INFECT_COUNT);
    const workTiles = candidates.splice(0, CONFIG.WORK_COUNT);
    const itemTiles = candidates.splice(0, CONFIG.ITEM_COUNT);
    const eventTiles = candidates.splice(0, eventCount);

    for (const pos of infectTiles) board[pos] = { type: "infect", text: "感染イベント" };
    for (const pos of workTiles) board[pos] = { type: "work", text: "働いた！" };
    for (const pos of itemTiles) board[pos] = { type: "item", text: "アイテム入手" };

    for (const pos of eventTiles) {
      const negative = rand01() < 0.70;
      const mag = 5000 + randInt(0, 6) * 2000;
      const v = negative ? -mag : mag;
      board[pos] = { type: "event", delta: v, text: v >= 0 ? `臨時収入 +${v}` : `出費 ${v}` };
    }

    board[149] = { ...SPECIAL_TILES.get(149) };
    board[150] = { ...SPECIAL_TILES.get(150) };

    return eventCount;
  }

  function buildGridOverlay() {
    if (!el.gridLayer) return;
    el.gridLayer.innerHTML = "";
    const labelOf = (type) =>
      ({
        infect: "INFECT",
        work: "WORK",
        item: "ITEM",
        event: "EVENT",
        gov: "GOV",
        pandemic: "PANDEMIC",
        goal: "GOAL",
        safe: "SAFE",
      }[type] ?? "SAFE");

    for (let tile = 1; tile <= CONFIG.MAX_TILE; tile++) {
      const cell = document.createElement("div");
      const t = board[tile] || { type: "safe" };
      let type = t.type || "safe";
      if (tile >= 143 && tile <= 148) type = "event";
      if (tile === 149) type = "pandemic";
      if (tile === 150) type = "goal";
      if (tile === 35 || tile === 75 || tile === 115) type = "gov";
      cell.className = `gridCell ${type}`;
      cell.dataset.tile = String(tile);
      cell.dataset.type = labelOf(type);
      el.gridLayer.appendChild(cell);
    }
  }

  /* =========================
     Geometry (tokens)
  ========================= */
  function tileToRowCol(tile) {
    const idx = tile - 1;
    const row = Math.floor(idx / CONFIG.COLS);
    const col = idx % CONFIG.COLS;
    return { row, col };
  }
  function tileCenterPx(tile) {
    if (!el.boardBox) return { x: 0, y: 0 };
    const w = el.boardBox.clientWidth;
    const h = el.boardBox.clientHeight;
    const { row, col } = tileToRowCol(tile);
    const x = (col + 0.5) * (w / CONFIG.COLS);
    const y = (row + 0.5) * (h / CONFIG.ROWS);
    return { x, y };
  }

  /* =========================
     Game state
  ========================= */
  let playerCount = 4;
  let players = [];
  let turn = 0;
  let busy = false;
  let gameStarted = false;

  let govFund = CONFIG.GOV_FUND_START;

  // Investment
  let investTotal = 0; // 全体投資（公共財）
  let investedAt35 = new Set();
  let investedAt75 = new Set();

  // Collapse(145): weaken items only
  let collapseActive = false;

  // End phase
  let finalPhaseStarted = false;
  let rankSnapshotAt143 = null;
  let pandemicResolved = false;

  // Ebola
  let ebolaTriggered = false;
  let ebolaRemainTurns = 0; // “ラウンド”単位
  let highSevInfectStreak = 0;
  let roundCounter = 0;

  // ✅ Rabies (for result)
  let rabiesOccurred = false;

  // ✅ 115: choice system
  let event115Activated = false;      // 115を誰かが踏んだ（世界会議開始）
  let event115ChoicesDone = new Set(); // player.id を記録（生存者のみ／1回だけ）

  // ✅ Wave
  let waveLv = 0;
  let infectHitsThisRound = 0; // 「ワクチン/アイテムで防げず、感染成立した」回数

  // ✅ Medical collapse / triage
  let medicalCollapseActive = false;
  let medicalCollapseRemainTurns = 0; // ラウンド単位

  function insuranceText(code) {
    return CONFIG.INSURANCE[code]?.name ?? String(code);
  }

  function makePlayer(i) {
    return {
      id: i,
      name: `P${i + 1}`,
      pos: 1,
      money: CONFIG.START_MONEY,
      insurance: "B",
      untreated: 0,
      items: {},
      alive: true,
      finished: false,
      cp: 0,

      vaccinated: false,
      vaccinatedSet: new Set(),

      trialJoined: false,
      trialSuccess: false,

      // TG: 個人累計投資額
      personalInvest: 0,

      // ✅ Ghost
      ghost: false,
      moneyFrozen: false,

      // ✅ 115 option: infect shield
      infectShield115: 0, // 次のinfectを1回だけ無効化

      /* =========================
         ✅ RESULT / LOG TRACKING
      ========================= */
      insuranceInit: "B",
      insuranceHistory: [], // {from,to,atTile,round}
      vaccinatedInit: false,

      infectLanded: 0,      // infectに止まって「ワクチンで防いだ以外」の回数
      untreatedCount: 0,    // 未治療“回数”（sev加算の回数）
      itemGained: 0,        // アイテム獲得数

      diedMidgame: false,   // untreated>=3 の盤上死亡
      finalOutcome: null,   // "asymptomatic" | "sequelae" | "death"
    };
  }

  function addCP(p, delta, reason = "") {
    const before = p.cp;
    p.cp = p.cp + delta;
    const sign = delta >= 0 ? "+" : "";
    logLine("CP", `${p.name}: ${before} → ${p.cp} (${sign}${delta}) ${reason}`.trim());
  }

  /* =========================
     Render
  ========================= */
  function rebuildTokens() {
    if (!el.tokensLayer) return;
    el.tokensLayer.innerHTML = "";
    for (const p of players) {
      const d = document.createElement("div");
      d.className = `token t${p.id + 1}`;
      d.id = `token_${p.id}`;
      el.tokensLayer.appendChild(d);
    }
  }
  function updateDeadRack() {
    if (!el.deadRack) return;
    el.deadRack.querySelectorAll(".deadToken").forEach((x) => x.remove());
    for (const p of players) {
      if (!p.alive) {
        const d = document.createElement("div");
        d.className = `deadToken t${p.id + 1}`;
        el.deadRack.appendChild(d);
      }
    }
  }
  function placeToken(p) {
    const t = document.getElementById(`token_${p.id}`);
    if (!t) return;
    const { x, y } = tileCenterPx(p.pos);
    t.style.left = `${x}px`;
    t.style.top = `${y}px`;
    t.style.opacity = p.alive ? "1" : "0.25";
  }
  function renderTokens() {
    for (const p of players) placeToken(p);
    updateDeadRack();
  }

  function itemsToText(items) {
    const entries = Object.entries(items || {}).filter(([, v]) => v > 0);
    if (entries.length === 0) return "—";
    return entries
      .map(([k, v]) => {
        const it = CONFIG.ITEMS.find((x) => x.key === k);
        return `${it ? it.name : k}×${v}`;
      })
      .join(", ");
  }

  function statusText(p) {
    if (p.diedMidgame) return "途中死亡";
    if (p.finalOutcome === "sequelae") return "後遺症";
    if (p.finalOutcome === "asymptomatic") return "生存";
    if (p.finalOutcome === "death") return "死亡";
    if (!p.alive && p.ghost) return "死亡(👻)";
    return p.alive ? "生存" : "死亡";
  }

  function renderTable() {
    if (!el.playerTbody) return;
    el.playerTbody.innerHTML = "";
    for (const p of players) {
      const env = envOf(p.pos);
      const collapseTag = collapseActive ? `<span class="tag p">逼迫</span>` : "";
      const vaxTag = p.vaccinated ? `<span class="tag">💉済</span>` : "";
      const ghostTag = !p.alive && p.ghost ? `<span class="tag">👻</span>` : "";
      const deadMark = p.alive ? "" : " 💀";

      const waveTag = CONFIG.WAVE.ENABLE ? `<span class="tag t">WaveLv${waveLv}</span>` : "";
      const medTag = medicalCollapseActive ? `<span class="tag p">医療崩壊${medicalCollapseRemainTurns}</span>` : "";

      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td><b>${p.name}</b> ${ghostTag}${deadMark}<div class="small">${insuranceText(p.insurance)}</div></td>
        <td>${p.pos}</td>
        <td>${p.money.toLocaleString()} ${CONFIG.MONEY_UNIT}</td>
        <td>${p.untreated}</td>
        <td>${itemsToText(p.items)} ${collapseTag}</td>
        <td>${(p.personalInvest || 0).toLocaleString()}</td>
        <td>${envTag(env)} ${vaxTag} ${waveTag} ${medTag}</td>
        <td><b>${p.cp}</b></td>
        <td>${statusText(p)}</td>
      `;
      el.playerTbody.appendChild(tr);
    }

    if (el.govFund) el.govFund.textContent = govFund.toLocaleString();
    if (el.worldLv) el.worldLv.textContent = String(currentInvestLv());
    if (el.ebolaPill) el.ebolaPill.textContent = ebolaTriggered ? `継続${ebolaRemainTurns}` : "なし";
    if (el.roundPill) el.roundPill.textContent = `Round: ${roundCounter}`;
  }

  function renderTurn() {
    const p = players[turn];
    if (el.turnPill) el.turnPill.textContent = `Turn: ${p ? p.name : "-"}`;
    if (el.envPill) el.envPill.textContent = `Env: ${p ? envOf(p.pos) : "-"}`;
    if (el.worldLv) el.worldLv.textContent = String(currentInvestLv());
    if (el.ebolaPill) el.ebolaPill.textContent = ebolaTriggered ? `継続${ebolaRemainTurns}` : "なし";
    if (el.roundPill) el.roundPill.textContent = `Round: ${roundCounter}`;
  }

  function syncPlayerCountUI() {
    if (el.playerCount) {
      el.playerCount.value = String(playerCount);
      el.playerCount.disabled = gameStarted;
    }
    if (el.playerCountPill) el.playerCountPill.textContent = `Players: ${playerCount}`;
  }

  /* =========================
     Movement with STOP tiles
  ========================= */
  function findNextStopInRange(from, to) {
    for (let t = from + 1; t <= to; t++) if (CONFIG.STOP_TILES.has(t)) return t;
    return null;
  }

  async function moveStepByStep(p, steps) {
    if (!p.alive || p.finished) return;
    if (p.pos === 149 && !pandemicResolved) return;

    const target = Math.min(p.pos + steps, CONFIG.MAX_TILE);
    const stopTile = findNextStopInRange(p.pos, target);
    const finalTarget = stopTile ?? target;

    while (p.pos < finalTarget) {
      p.pos += 1;
      renderTokens();
      renderTable();
      renderTurn();
      await sleep(160);
    }
  }

  /* =========================
     Investment thresholds (割合方式)
  ========================= */
  function maxTotalInvestment(nPlayers) {
    // 人数 × 2回 × 30,000
    return Math.max(0, nPlayers) * 2 * CONFIG.INVEST_CAP_PER_TIME;
  }

  function roundToStep(amount, step) {
    if (step <= 0) return amount;
    return Math.floor(amount / step) * step;
  }

  function investThresholdsByPlayers(nPlayers) {
    const max = maxTotalInvestment(nPlayers);
    const r = CONFIG.INVEST_LEVEL_RATIOS;
    const lv1 = roundToStep(Math.round(max * r.lv1), CONFIG.INVEST_STEP);
    const lv2 = roundToStep(Math.round(max * r.lv2), CONFIG.INVEST_STEP);
    const lv3 = roundToStep(Math.round(max * r.lv3), CONFIG.INVEST_STEP);
    return { max, lv1, lv2, lv3 };
  }

  function investLevel(total, nPlayers) {
    const th = investThresholdsByPlayers(nPlayers);
    if (total >= th.lv3) return 3;
    if (total >= th.lv2) return 2;
    if (total >= th.lv1) return 1;
    return 0;
  }
  function currentInvestLv() {
    return investLevel(investTotal, playerCount);
  }

  function investEffectsSummary(lv) {
    const eff = CONFIG.INVEST_EFFECTS;
    const T = CONFIG.TG_FINAL;
    const out = [];
    if (lv >= 1) out.push(`Lv1: infect危険度 -${eff.infectDangerMinusAtLv1}`);
    if (lv >= 2) out.push(`Lv2: アイテム成功率 +${eff.itemSuccessPlusAtLv2}%`);
    if (lv >= 2) out.push(`Lv2: TGボーナス +${T.WORLD_INVEST_LV2_BONUS}`);
    if (lv >= 3) out.push(`Lv3: TGボーナス +${T.WORLD_INVEST_LV3_BONUS}`);
    if (!out.length) out.push("Lv0: 効果なし");
    return out;
  }

  function worldInvestTGBonus() {
    const lv = currentInvestLv();
    const T = CONFIG.TG_FINAL;
    if (lv >= 3) return T.WORLD_INVEST_LV3_BONUS;
    if (lv >= 2) return T.WORLD_INVEST_LV2_BONUS;
    return 0;
  }

  /* =========================
     GovFund stage bonus (-2..+2)
     ※人数別基準（4人基準をスケール）
  ========================= */
  function ebolaGovThreshold(nPlayers) {
    const scale = (Number(nPlayers) || 4) / 4;
    return Math.max(1, Math.round(CONFIG.EBOLA.GOVFUND_LT_BASE_4P * scale));
  }

  function govFundStageBonus(playersArr, world) {
    const base = ebolaGovThreshold(playersArr.length);
    const r = world.govFund / base;

    if (r < 0.60) return -2;
    if (r < 0.80) return -1;
    if (r <= 1.20) return 0;
    if (r <= 1.40) return +1;
    return +2;
  }

  /* =========================
     Ebola control (round-end)
  ========================= */
  function avgCPAlive() {
    const alive = players.filter((p) => p.alive);
    if (!alive.length) return 0;
    return alive.reduce((s, p) => s + p.cp, 0) / alive.length;
  }
  function ebolaGateOK() {
    return players.some((p) => p.alive && p.pos >= CONFIG.EBOLA.MIN_TILE_GATE);
  }

  // OR条件
  function ebolaConditionsMetOR() {
    const c1 = govFund < ebolaGovThreshold(playerCount);
    const c2 = highSevInfectStreak >= CONFIG.EBOLA.HIGH_SEV_STREAK_NEED;
    const c3 = avgCPAlive() <= CONFIG.EBOLA.AVG_CP_MAX;
    return { c1, c2, c3, any: c1 || c2 || c3 };
  }

  async function maybeTriggerEbolaAtRoundEnd() {
    if (!CONFIG.EBOLA.ENABLE) return false;
    if (ebolaTriggered) return false;
    if (!gameStarted) return false;
    if (!ebolaGateOK()) return false;

    const cond = ebolaConditionsMetOR();
    if (!cond.any) return false;

    if (rand01() > CONFIG.EBOLA.TRIGGER_PROB) {
      logLine("EBOLA", `条件(OR)成立だが今回は発生せず（c1=${cond.c1} c2=${cond.c2} c3=${cond.c3} / p=${CONFIG.EBOLA.TRIGGER_PROB}）`);
      return false;
    }

    ebolaTriggered = true;
    ebolaRemainTurns = randInt(CONFIG.EBOLA.DURATION_TURNS_MIN, CONFIG.EBOLA.DURATION_TURNS_MAX);

    logLine("EBOLA", `発生：${ebolaRemainTurns}ラウンド継続（c1=${cond.c1} c2=${cond.c2} c3=${cond.c3}）`);

    const pct = CONFIG.EBOLA.WORK_PENALTY_BY_PLAYERS[playerCount] ?? 20;

    await showOkPopup(
      "⚠️ エボライベント発生",
      [
        `エボラの脅威が拡大…（<b>${ebolaRemainTurns}</b>ラウンド継続）`,
        `期間中：infect危険度 +${CONFIG.EBOLA.INFECT_DANGER_PLUS}（上限${CONFIG.SEV_MAX}）`,
        `期間中：WORK 手取り & 政府増加 -${pct}%（人数別）`,
        "※1ゲーム1回 / 終了後ボーナスなし",
      ],
      "special",
      "red"
    );
    return true;
  }

  async function tickEbolaAtRoundEnd() {
    if (!ebolaTriggered) return;
    if (ebolaRemainTurns <= 0) return;

    ebolaRemainTurns -= 1;
    if (ebolaRemainTurns === 0) {
      logLine("EBOLA", "終了");
      await showOkPopup("エボラ終了", ["エボラの脅威は去ったようだ、、、"], "info", "blue");
    } else {
      logLine("EBOLA", `残り ${ebolaRemainTurns} ラウンド`);
    }
  }

  function ebolaWorkPenaltyPct() {
    return CONFIG.EBOLA.WORK_PENALTY_BY_PLAYERS[playerCount] ?? 20;
  }

  /* =========================
     ✅ Wave (round-end + infect/work effects)
  ========================= */
  function applyWaveInfectPlus(sev) {
    if (!CONFIG.WAVE.ENABLE) return sev;
    if (waveLv <= 0) return sev;

    let plus = 0;
    if (waveLv === 1) plus = CONFIG.WAVE.INFECT_PLUS_LV1;
    else if (waveLv === 2) plus = CONFIG.WAVE.INFECT_PLUS_LV2;
    else plus = CONFIG.WAVE.INFECT_PLUS_LV3;

    return Math.min(CONFIG.SEV_MAX, sev + plus);
  }

  function waveWorkPenalty() {
    if (!CONFIG.WAVE.ENABLE) return { moneyMinus: 0, govMinus: 0 };
    if (waveLv <= 1) return { moneyMinus: 0, govMinus: 0 };
    if (waveLv === 2) return { moneyMinus: CONFIG.WAVE.WORK_MINUS_LV2, govMinus: 0 };
    return { moneyMinus: CONFIG.WAVE.WORK_MINUS_LV3, govMinus: CONFIG.WAVE.GOV_MINUS_LV3 };
  }

  async function waveTickAtRoundEnd() {
    if (!CONFIG.WAVE.ENABLE) {
      infectHitsThisRound = 0;
      return;
    }

    const up = infectHitsThisRound >= CONFIG.WAVE.UP_IF_INFECT_HITS_AT_LEAST;
    const down = infectHitsThisRound <= CONFIG.WAVE.DOWN_IF_INFECT_HITS_AT_MOST;

    const before = waveLv;
    if (up) waveLv = Math.min(CONFIG.WAVE.LV_MAX, waveLv + 1);
    else if (down) waveLv = Math.max(0, waveLv - 1);

    if (before !== waveLv) {
      logLine("WAVE", `WaveLv ${before} → ${waveLv}（感染成立=${infectHitsThisRound}）`);
      await showOkPopup(
        "感染波（Wave）更新",
        [
          `このラウンドの感染成立：<b>${infectHitsThisRound}</b>`,
          `WaveLv：<b>${before} → ${waveLv}</b>`,
          waveLv >= 2 ? `WORK罰：所持金-${waveWorkPenalty().moneyMinus.toLocaleString()}` : "WORK罰：なし",
          waveLv >= 3 ? `政府罰：基金-${waveWorkPenalty().govMinus.toLocaleString()}` : "政府罰：なし",
          "※Waveはラウンド末にだけ変動する",
        ],
        "event",
        waveLv >= 2 ? "yellow" : "blue"
      );
    } else {
      logLine("WAVE", `WaveLv維持=${waveLv}（感染成立=${infectHitsThisRound}）`);
    }

    infectHitsThisRound = 0;
  }

  /* =========================
     ✅ Medical collapse + triage (round-end)
  ========================= */
  function untreatedTotalAlive() {
    return players.filter((p) => p.alive).reduce((s, p) => s + (p.untreated || 0), 0);
  }

  async function maybeTriggerMedicalCollapseAtRoundEnd() {
    if (!CONFIG.MEDICAL_COLLAPSE.ENABLE) return false;
    if (medicalCollapseActive) return false;
    if (!gameStarted) return false;

    const total = untreatedTotalAlive();
    if (total < CONFIG.MEDICAL_COLLAPSE.TRIGGER_UNTREATED_TOTAL_AT_LEAST) return false;

    if (rand01() > CONFIG.MEDICAL_COLLAPSE.TRIGGER_PROB) {
      logLine("MED", `医療崩壊条件成立だが今回は発生せず（未治療合計=${total} / p=${CONFIG.MEDICAL_COLLAPSE.TRIGGER_PROB}）`);
      return false;
    }

    medicalCollapseActive = true;
    medicalCollapseRemainTurns = randInt(CONFIG.MEDICAL_COLLAPSE.DURATION_MIN, CONFIG.MEDICAL_COLLAPSE.DURATION_MAX);

    logLine("MED", `医療崩壊 発生：${medicalCollapseRemainTurns}ラウンド（未治療合計=${total}）`);

    await showOkPopup(
      "🏥 医療崩壊",
      [
        CONFIG.MEDICAL_COLLAPSE.LOG_TEXT,
        `継続：<b>${medicalCollapseRemainTurns}</b>ラウンド`,
        `影響：治療に追加自己負担 <b>+${CONFIG.MEDICAL_COLLAPSE.EXTRA_TREAT_PLAYER_PAY.toLocaleString()}</b>`,
        "影響：トリアージが発生しうる（ラウンド末）",
      ],
      "event",
      "red"
    );

    return true;
  }

  async function tickMedicalCollapseAtRoundEnd() {
    if (!medicalCollapseActive) return;

    medicalCollapseRemainTurns -= 1;
    if (medicalCollapseRemainTurns <= 0) {
      medicalCollapseActive = false;
      medicalCollapseRemainTurns = 0;
      logLine("MED", "医療崩壊 終了");
      await showOkPopup("医療崩壊 終了", ["病床が少し戻った…（たぶん）"], "info", "blue");
    } else {
      logLine("MED", `医療崩壊 継続：残り${medicalCollapseRemainTurns}`);
    }
  }

  async function maybeTriageAtRoundEnd() {
    if (!CONFIG.TRIAGE.ENABLE) return;
    if (!medicalCollapseActive) return;

    const total = untreatedTotalAlive();
    if (total < CONFIG.TRIAGE.UNTREATED_TOTAL_AT_LEAST) return;

    if (rand01() > CONFIG.TRIAGE.TRIGGER_PROB) {
      logLine("TRIAGE", `条件成立だが今回は発生せず（未治療合計=${total} / p=${CONFIG.TRIAGE.TRIGGER_PROB}）`);
      return;
    }

    const candidates = players.filter((p) => p.alive && (p.untreated || 0) > 0);
    if (!candidates.length) {
      logLine("TRIAGE", "発生したが対象なし（全員未治療0）");
      return;
    }

    logLine("TRIAGE", `${CONFIG.TRIAGE.LOG_TEXT}（候補=${candidates.map((x) => x.name).join(",")}）`);

    await showOkPopup(
      "医療トリアージ発生",
      [
        CONFIG.TRIAGE.LOG_TEXT,
        `政府負担：<b>-${CONFIG.TRIAGE.GOV_PAY.toLocaleString()}</b>（基金）`,
        "全員投票で対象を決める（最多票）",
      ],
      "event",
      "yellow"
    );

    const votes = new Map();
    for (const voter of players.filter((p) => p.alive)) {
      await new Promise((resolve) => {
        const opts = candidates
          .map((t) => `<option value="${t.id}">${t.name}（未治療=${t.untreated}）</option>`)
          .join("");

        showModal(
          `🗳️ トリアージ投票：${voter.name}`,
          `<div class="popMsg">
            <div class="popTitle">投票</div>
            <div class="popLine">治療対象を1人選ぶ</div>
            <select id="triagePick_${voter.id}">${opts}</select>
          </div>`,
          [
            {
              text: "投票する",
              className: "btnPrimary",
              onClick: () => {
                const id = Number(document.getElementById(`triagePick_${voter.id}`)?.value);
                closeModal();
                votes.set(id, (votes.get(id) || 0) + 1);
                resolve();
              },
            },
          ]
        );
      });
    }

    let bestIds = [];
    let best = -1;
    for (const [id, c] of votes.entries()) {
      if (c > best) {
        best = c;
        bestIds = [id];
      } else if (c === best) {
        bestIds.push(id);
      }
    }

    const chosenId = bestIds.length === 1 ? bestIds[0] : pick(bestIds);
    const chosen = players[chosenId];

    if (chosen && chosen.alive && chosen.untreated > 0) {
      chosen.untreated = Math.max(0, chosen.untreated - 1);
      govFund -= CONFIG.TRIAGE.GOV_PAY;

      logLine("TRIAGE", `対象=${chosen.name}（票=${best}）→ 未治療-1 / 基金-${CONFIG.TRIAGE.GOV_PAY}`);

      for (const p of candidates) {
        if (p.id === chosen.id) continue;
        addCP(p, CONFIG.TRIAGE.CP_PENALTY_NOT_CHOSEN, "（トリアージ落選）");
      }

      await showOkPopup(
        "トリアージ結果",
        [
          `治療対象：<b>${chosen.name}</b>（票=${best}${bestIds.length > 1 ? "・同票ランダム" : ""}）`,
          `${chosen.name}：未治療 <b>-1</b>`,
          `政府基金：<b>-${CONFIG.TRIAGE.GOV_PAY.toLocaleString()}</b>`,
          `その他未治療者：CP ${CONFIG.TRIAGE.CP_PENALTY_NOT_CHOSEN}`,
        ],
        "event",
        "yellow"
      );
    }

    renderTable();
  }

  /* =========================
     Ghost helpers
  ========================= */
  function deadGhostCount() {
    return players.filter((x) => !x.alive && x.ghost).length;
  }
  function applyDeadInfectPlus(sev) {
    if (!CONFIG.GHOST.ENABLE) return sev;
    if (deadGhostCount() <= 0) return sev;
    return Math.min(CONFIG.SEV_MAX, sev + (CONFIG.GHOST.DEAD_INFECT_PLUS || 0));
  }

  /* =========================
     Items
  ========================= */
  function hasItem(p, key) {
    return (p.items[key] || 0) > 0;
  }
  function addItem(p, key, n = 1) {
    p.items[key] = (p.items[key] || 0) + n;
  }
  function useItem(p, key) {
    if (!hasItem(p, key)) return false;
    p.items[key] -= 1;
    if (p.items[key] <= 0) delete p.items[key];
    return true;
  }

  async function gainRandomItemAtItemTile(p) {
    const it = pick(CONFIG.ITEMS);
    addItem(p, it.key, 1);
    p.itemGained = (p.itemGained || 0) + 1;
    logLine("ITEM", `${p.name}: ランダム入手 → ${it.name}（消耗）`);
    await showOkPopup("ITEM入手（ランダム）", [`${p.name} は <b>${it.name}</b> を手に入れた！`], "item", "blue");
  }

  /* =========================================================
     Disease data
  ========================================================= */
  const DISEASES = [
    { 分類: "red", 疾病候補: "エボラ出血熱", アイテム効果: "なし", 内容: "洞窟に入ってコウモリと接触、エボラウィルスに感染！", 発生場所: "ラスボス" },

    { 分類: "yellow", 疾病候補: "ジフテリア", アイテム効果: "飛沫", 内容: "突然の発熱と喉の腫れに始まり、声がかれて犬の鳴き声のような咳が出てきた！ジフテリア", 発生場所: "都市" },
    { 分類: "yellow", 疾病候補: "SARS", アイテム効果: "アルコール消毒", 内容: "SARSが流行、発熱と悪寒がする…咳がとまらず、息がしづらい", 発生場所: "都市" },
    { 分類: "yellow", 疾病候補: "結核", アイテム効果: "N95", 内容: "免疫が落ちた…結核に感染…", 発生場所: "都市" },
    { 分類: "yellow", 疾病候補: "腸管出血性大腸菌感染症", アイテム効果: "アルコール消毒", 内容: "現地の料理でO-157感染！下痢がとまらない！！", 発生場所: "汚染" },
    { 分類: "yellow", 疾病候補: "コレラ", アイテム効果: "なし", 内容: "汚染された水を飲んでしまった…コレラを発症", 発生場所: "汚染" },
    { 分類: "yellow", 疾病候補: "細菌性赤痢", アイテム効果: "なし", 内容: "突然の発熱と下痢が！トイレに行ってもスッキリしない…", 発生場所: "汚染" },
    { 分類: "yellow", 疾病候補: "腸チフス", アイテム効果: "なし", 内容: "屋台に売っている氷の入ったソーダを飲んで、高熱にうなされる。上半身にピンクの発疹が出現！", 発生場所: "汚染" },
    { 分類: "yellow", 疾病候補: "日本脳炎", アイテム効果: "蚊帳", 内容: "養豚場近くで友達と蚊に刺された！発熱と光が凄くまぶしく感じる…友達は何もないみたい", 発生場所: "熱帯" },
    { 分類: "yellow", 疾病候補: "エムポックス（Mpox / 旧称サル痘）", アイテム効果: "なし", 内容: "リスに噛まれた！サル痘！？", 発生場所: "都市" },
    { 分類: "yellow", 疾病候補: "マラリア", アイテム効果: "蚊帳", 内容: "ハマダラカに刺された！マラリアに感染！？", 発生場所: "熱帯" },
    { 分類: "yellow", 疾病候補: "レジオネラ症", アイテム効果: "なし", 内容: "激混みの温泉施設を訪れた、", 発生場所: "都市" },
    { 分類: "yellow", 疾病候補: "アメーバ赤痢", アイテム効果: "なし", 内容: "イチゴゼリーみたいな、血が混じった粘り気のある便が出た！良くなったり悪くなったり…赤痢アメーバ", 発生場所: "汚染" },
    { 分類: "yellow", 疾病候補: "破傷風", アイテム効果: "なし", 内容: "沼にはまった(汗)　釘が足に刺さって破傷風に感染", 発生場所: "汚染" },
    { 分類: "yellow", 疾病候補: "細菌性髄膜炎菌", アイテム効果: "マスク/N95/アルコール消毒", 内容: "学校で流行した風邪の症状を放置していた結果、細菌性髄膜炎に感染", 発生場所: "都市" },
    { 分類: "yellow", 疾病候補: "梅毒", アイテム効果: "なし", 内容: "繁華街で梅毒に感染", 発生場所: "都市" },
    { 分類: "yellow", 疾病候補: "住血吸虫症", アイテム効果: "なし", 内容: "衛生管理が行き届いていない地域で汚染されている水を飲んで住血吸虫に感染", 発生場所: "汚染" },
    { 分類: "yellow", 疾病候補: "シャーガス", アイテム効果: "なし", 内容: "サシガメに噛まれた…シャーガス病に", 発生場所: "熱帯" },
    { 分類: "yellow", 疾病候補: "アフリカトリパノソーマ", アイテム効果: "なし", 内容: "ツェツェバエに吸血された、アフリカトリパノソーマに感染、目が見えないよー", 発生場所: "熱帯" },
    { 分類: "yellow", 疾病候補: "フィラリア症", アイテム効果: "蚊帳", 内容: "イエカに刺された…フィラリアに感染、足が浮腫んできた", 発生場所: "熱帯" },

    { 分類: "red", 疾病候補: "クリミア・コンゴ出血熱", アイテム効果: "ダニ除け", 内容: "流行地域で家畜作業をしていたらマダニに噛まれた！その後、突然の発熱と悪寒…クリミア・コンゴ熱と診断", 発生場所: "熱帯" },
    { 分類: "red", 疾病候補: "痘そう", アイテム効果: "なし", 内容: "100年前にタイムスリップ！発熱後に同一の発疹が出現…天然痘", 発生場所: "都市" },
    { 分類: "red", 疾病候補: "南米出血熱", アイテム効果: "防護服", 内容: "野ネズミが大量発生している地域の下水に接触した。発熱と筋肉痛、頭痛が…南米出血熱", 発生場所: "汚染" },
    { 分類: "red", 疾病候補: "ペスト", アイテム効果: "なし", 内容: "ホテルのベットにノミが！！ペストに感染", 発生場所: "汚染" },
    { 分類: "red", 疾病候補: "マールブルグ病", アイテム効果: "防護服", 内容: "マールブルグ病の流行。発熱と激しい嘔吐、下痢が出現。", 発生場所: "熱帯" },
    { 分類: "red", 疾病候補: "ラッサ熱", アイテム効果: "防護服", 内容: "任務中にラッサ熱が発生した地域を無防備に通過して、数日後に急激な高熱に見舞われる", 発生場所: "熱帯" },
    { 分類: "red", 疾病候補: "MERS（中東呼吸器症候群）", アイテム効果: "アルコール消毒", 内容: "ヒトコブラクダに触れあって、MERSに感染", 発生場所: "熱帯" },
    { 分類: "red", 疾病候補: "黄熱", アイテム効果: "蚊帳", 内容: "蚊にさされた３日後、頭痛と高熱が出現！目が黄色くなってきた…", 発生場所: "熱帯" },
    { 分類: "red", 疾病候補: "狂犬病", アイテム効果: "狂犬病ワクチン", 内容: "乱暴な犬に噛まれた！！狂犬病かもしれない…", 発生場所: "熱帯" },
    { 分類: "red", 疾病候補: "重症熱性血小板減少症候群（SFTS）", アイテム効果: "ダニ除け", 内容: "マダニに刺されて発熱！？食欲が沸かない、吐いてしまう…", 発生場所: "熱帯" },
    { 分類: "red", 疾病候補: "劇症型溶血性レンサ球菌感染症", アイテム効果: "なし", 内容: "突然、腕に激しい痛みと赤い発疹が出た。ひどく腫れていてどんどん広がっていく…後の検査でA群溶血性レンサ球菌が検出された。", 発生場所: "都市" },
    { 分類: "red", 疾病候補: "HIV（後天性免疫不全症候群）", アイテム効果: "なし", 内容: "２週間前に風邪のような症状があった。パートナーがエイズを発症し、検査をしたらHIV陽性", 発生場所: "都市" },
    { 分類: "red", 疾病候補: "クリプトコックス症", アイテム効果: "なし", 内容: "鳩がたくさん飛んでいる公園でピクニックをしたら、クリプトコッカスに感染", 発生場所: "汚染" },

    { 分類: "blue", 疾病候補: "ポリオ", アイテム効果: "なし", 内容: "下水処理がおいつかない…ポリオに感染", 発生場所: "汚染" },
    { 分類: "blue", 疾病候補: "A型肝炎", アイテム効果: "なし", 内容: "手を良く洗わずに食事した、食欲がなくなり全身が黄色くなってきた…", 発生場所: "汚染" },
    { 分類: "blue", 疾病候補: "トキソプラズマ症（Toxoplasmosis）", アイテム効果: "なし", 内容: "妊娠中の友達に代わって馬刺しを沢山食べた！", 発生場所: "都市" },
    { 分類: "blue", 疾病候補: "エキノコックス症", アイテム効果: "なし", 内容: "キツネに遭遇！？糞を踏んでエキノコックスに感染", 発生場所: "汚染" },
    { 分類: "blue", 疾病候補: "デング熱", アイテム効果: "蚊帳", 内容: "ヒトスジシマカに刺されてデング熱に感染", 発生場所: "熱帯" },
    { 分類: "blue", 疾病候補: "日本紅斑熱（リケッチア）", アイテム効果: "ダニ除け", 内容: "森の中で腕をダニに刺された！熱と発疹が出てきた…", 発生場所: "熱帯" },
    { 分類: "blue", 疾病候補: "インフルエンザ", アイテム効果: "マスク/N95/アルコール消毒", 内容: "医療施設を訪れて、消毒を怠ったため、インフルエンザに感染した", 発生場所: "都市" },
    { 分類: "blue", 疾病候補: "感染性胃腸炎", アイテム効果: "アルコール消毒", 内容: "家族からノロウィルスをうつされる…", 発生場所: "都市" },
    { 分類: "blue", 疾病候補: "COVID-19", アイテム効果: "マスク/N95/アルコール消毒", 内容: "コロナのクラスターが発生！PCR検査の結果、陽性！", 発生場所: "都市" },
    { 分類: "blue", 疾病候補: "手足口病", アイテム効果: "なし", 内容: "手足口病にかかって、蕁麻疹が…", 発生場所: "都市" },
    { 分類: "blue", 疾病候補: "流行性耳下腺炎", アイテム効果: "マスク/N95", 内容: "喉が腫れて病院受診。おたふく風邪と診断", 発生場所: "都市" },
    { 分類: "blue", 疾病候補: "流行性角結膜炎（流行り目）", アイテム効果: "なし", 内容: "急に目が赤くなって涙が止まらない…かゆくてしょぼしょぼする。流行性角結膜炎", 発生場所: "都市" },
    { 分類: "blue", 疾病候補: "アニサキス", アイテム効果: "なし", 内容: "魚を食べた結果、アニサキスに感染した", 発生場所: "都市" },
    { 分類: "blue", 疾病候補: "マイコプラズマ肺炎", アイテム効果: "マスク/N95", 内容: "寒い季節、、乾いた咳がとまらない、、マイコプラズマに感染", 発生場所: "都市" },
    { 分類: "blue", 疾病候補: "ウイルス性肝炎( B型)", アイテム効果: "なし", 内容: "刺青を入れ、B型肝炎に感染した。", 発生場所: "都市" },
    { 分類: "blue", 疾病候補: "肺炎球菌", アイテム効果: "マスク/N95/アルコール消毒", 内容: "保育園に通い始めたら発熱した！先生たちは痰が絡んだ咳が出てるみたい…", 発生場所: "都市" },
    { 分類: "blue", 疾病候補: "水痘", アイテム効果: "N95", 内容: "お兄ちゃんの水疱瘡が移った", 発生場所: "都市" },
    { 分類: "blue", 疾病候補: "百日咳", アイテム効果: "マスク/N95/アルコール消毒", 内容: "咳がとまらない…百日咳に", 発生場所: "都市" },
    { 分類: "blue", 疾病候補: "風しん", アイテム効果: "マスク/N95/アルコール消毒", 内容: "テーマパークでの人混みで風疹に感染", 発生場所: "都市" },
    { 分類: "blue", 疾病候補: "麻しん", アイテム効果: "マスク/N95/アルコール消毒", 内容: "学校で麻疹に感染…", 発生場所: "都市" },
    { 分類: "blue", 疾病候補: "回虫症（Ascaris infection）", アイテム効果: "なし", 内容: "環境活動の一環で汚染された土壌を調査中、回虫の卵に接触感染", 発生場所: "汚染" },
  ];

  function normalizeColor(cls) {
    const c = String(cls ?? "").toLowerCase().trim();
    if (c === "red" || c === "yellow" || c === "blue") return c;
    return "blue";
  }
  function severityOfClass(cls) {
    const c = normalizeColor(cls);
    return CONFIG.SEV_BY_CLASS[c] ?? 1;
  }
  function envOfDiseasePlace(place) {
    if (place === "熱帯") return "tropical";
    if (place === "汚染") return "polluted";
    if (place === "都市") return "urban";
    return "boss";
  }
  function buildPools() {
    const src = Array.isArray(DISEASES) ? DISEASES : [];
    const urban = src.filter((d) => envOfDiseasePlace(d.発生場所) === "urban");
    const tropical = src.filter((d) => envOfDiseasePlace(d.発生場所) === "tropical");
    const polluted = src.filter((d) => envOfDiseasePlace(d.発生場所) === "polluted");
    const any = src.filter((d) => envOfDiseasePlace(d.発生場所) !== "boss");
    return { urban, tropical, polluted, any };
  }
  let pool = null;

  function drawDiseaseForEnv(env) {
    const list = pool?.[env] ?? [];
    const fallback = pool?.any ?? [];
    const arr = list.length ? list : fallback;
    return pick(arr);
  }

  function parseItemHint(hint) {
    const s = String(hint || "").trim();
    if (!s || s === "なし") return [];
    return s
      .split("/")
      .map((x) => x.trim())
      .filter(Boolean);
  }

  function usableItemsForDisease(p, d) {
    const hintNames = parseItemHint(d.アイテム効果);
    if (!hintNames.length) return [];

    const usableKeys = new Set();
    const pushIfHas = (k) => hasItem(p, k) && usableKeys.add(k);

    for (const nm of hintNames) {
      if (nm === "飛沫") {
        for (const it of CONFIG.ITEMS) if (it.targets.includes("飛沫")) pushIfHas(it.key);
        continue;
      }
      if (nm === "N95") { pushIfHas("n95"); continue; }
      if (nm === "防護服") { pushIfHas("suit"); continue; }
      if (nm === "アルコール消毒") { pushIfHas("alcohol"); continue; }
      if (nm === "蚊帳") { pushIfHas("mosquito"); continue; }
      if (nm === "ダニ除け" || nm === "ダニよけ") { pushIfHas("tick"); continue; }
      if (nm === "狂犬病ワクチン") { pushIfHas("rabiesVax"); continue; }
      if (nm === "マスク") { pushIfHas("mask"); continue; }
      if (nm === "マスク/N95/アルコール消毒") { ["mask","n95","alcohol"].forEach(pushIfHas); continue; }
      if (nm === "マスク/N95") { ["mask","n95"].forEach(pushIfHas); continue; }
    }

    return Array.from(usableKeys)
      .map((k) => CONFIG.ITEMS.find((x) => x.key === k))
      .filter(Boolean);
  }

  function itemSuccessRate(it) {
    const lv = currentInvestLv();
    const plus = lv >= 2 ? CONFIG.INVEST_EFFECTS.itemSuccessPlusAtLv2 : 0;
    let rate = Math.max(0, Math.min(100, (it.base ?? 0) + plus));
    if (collapseActive) {
      rate = Math.max(CONFIG.COLLAPSE.ITEM_SUCCESS_MIN, rate - CONFIG.COLLAPSE.ITEM_SUCCESS_MINUS);
    }
    return rate;
  }

  async function chooseAndUseItem(p, usableList) {
    if (!usableList.length) return { used: false, success: false, item: null, rate: 0 };

    const opts = usableList
      .map((it) => {
        const r = itemSuccessRate(it);
        const debuff = collapseActive ? `（逼迫で-${CONFIG.COLLAPSE.ITEM_SUCCESS_MINUS}%）` : "";
        return `<option value="${it.key}">${it.name}（成功率 ${r}%）${debuff}</option>`;
      })
      .join("");

    const lv = currentInvestLv();
    const lines = [];
    lines.push(lv >= 2 ? `投資Lv2効果：成功率 +${CONFIG.INVEST_EFFECTS.itemSuccessPlusAtLv2}% 適用中` : "投資Lv2未満：成功率ボーナスなし");
    if (collapseActive) lines.push(`医療逼迫：成功率 -${CONFIG.COLLAPSE.ITEM_SUCCESS_MINUS}%（下限${CONFIG.COLLAPSE.ITEM_SUCCESS_MIN}%）`);

    return await new Promise((resolve) => {
      showModal(
        `${p.name}：アイテムを使う？`,
        `<div class="popMsg">
          <div class="popTitle">🎒 アイテム選択</div>
          ${lines.map((s) => `<div class="popLine">${s}</div>`).join("")}
          <hr class="popHr"/>
          <div class="popLine">対象アイテム（どれか1つ）</div>
          <select id="itemPick">${opts}</select>
          <div class="small">※成功/失敗に関わらず消費される</div>
        </div>`,
        [
          {
            text: "使う",
            className: "btnPrimary",
            onClick: () => {
              const key = String(document.getElementById("itemPick")?.value || "");
              closeModal();

              const it = CONFIG.ITEMS.find((x) => x.key === key);
              if (!it || !hasItem(p, key)) {
                resolve({ used: false, success: false, item: null, rate: 0 });
                return;
              }

              useItem(p, key);

              const rate = itemSuccessRate(it);
              const roll = randInt(1, 100);
              const success = roll <= rate;

              logLine("ITEM", `${p.name}: ${it.name} 使用（成功率${rate}% / 出目${roll}）=> ${success ? "成功" : "失敗"}（消費）`);
              resolve({ used: true, success, item: it, rate });
            },
          },
          { text: "使わない", onClick: () => { closeModal(); resolve({ used: false, success: false, item: null, rate: 0 }); } },
        ]
      );
    });
  }

  /* =========================
     Treatment
  ========================= */
  async function doTreatment(p) {
    const ins = CONFIG.INSURANCE[p.insurance];
    const playerPayBase = ins.treatPlayerPay;
    const govPay = ins.treatGovPay;

    const extra = medicalCollapseActive ? CONFIG.MEDICAL_COLLAPSE.EXTRA_TREAT_PLAYER_PAY : 0;
    const playerPay = playerPayBase + extra;

    if (p.money < playerPay) {
      logLine("TREAT", `${p.name}: 所持金不足で治療できない（必要 ${playerPay}）`);
      return false;
    }

    p.money -= playerPay;
    govFund -= govPay;

    const cpDelta = CONFIG.TREAT_CP[p.insurance] ?? 0;
    if (cpDelta !== 0) addCP(p, cpDelta, "（治療）");

    logLine("TREAT", `${p.name}: 治療 -${playerPay} (base=${playerPayBase},extra=${extra}) / 政府負担 ${govPay}（基金=${govFund}）`);
    return true;
  }

  /* =========================
     infect resolver
  ========================= */
  function applyEbolaInfectPlus(baseSev) {
    if (!ebolaTriggered || ebolaRemainTurns <= 0) return baseSev;
    return Math.min(CONFIG.SEV_MAX, baseSev + CONFIG.EBOLA.INFECT_DANGER_PLUS);
  }
  function applyInvestDangerMinus(baseSev) {
    const lv = currentInvestLv();
    if (lv < 1) return baseSev;
    return Math.max(CONFIG.SEV_MIN, baseSev - CONFIG.INVEST_EFFECTS.infectDangerMinusAtLv1);
  }

  async function resolveInfect(p) {
    if (p.alive && (p.infectShield115 || 0) > 0) {
      p.infectShield115 = Math.max(0, (p.infectShield115 || 0) - 1);
      logLine("115", `${p.name}: 115の医療現場優先で infect を1回無効化`);
      await showOkPopup("115効果：感染無効", [`${p.name} は「次のinfect無効化」を消費して感染を回避した！`], "infect", "blue");
      return;
    }

    const env = envOf(p.pos);
    const d = drawDiseaseForEnv(env);
    const disease = d.疾病候補;
    const color = normalizeColor(d.分類);

    const baseSev = severityOfClass(d.分類);

    let sev = baseSev;
    sev = applyInvestDangerMinus(sev);
    sev = applyEbolaInfectPlus(sev);
    sev = applyWaveInfectPlus(sev);
    sev = applyDeadInfectPlus(sev);

    if (sev >= 2) highSevInfectStreak += 1;
    else highSevInfectStreak = 0;

    const vaxActive = true;
    if (vaxActive && p.vaccinated && p.vaccinatedSet.has(disease)) {
      logLine("VAX", `${p.name}: ワクチンで ${disease} を防いだ`);
      await showOkPopup("ワクチンで防いだ", [d.内容, `対象：<b>${disease}</b> → 100%回避`], "infect", "blue");
      return;
    }

    const usable = usableItemsForDisease(p, d);
    const useRes = await chooseAndUseItem(p, usable);
    if (useRes.used && useRes.success) {
      await showOkPopup("ギリ回避！", [d.内容, `アイテム <b>${useRes.item.name}</b>（成功率${useRes.rate}%）で回避！`], "infect", "blue");
      renderTable();
      return;
    }

    p.infectLanded = (p.infectLanded || 0) + 1;
    infectHitsThisRound += 1;

    if (disease === "狂犬病") rabiesOccurred = true;

    logLine("INFECT", `${p.name}: 感染【${disease}】危険度${sev}（base${baseSev} / WaveLv${waveLv}）`);
    logLine("INFECT", `  ${d.内容}`);

    await showOkPopup(
      `${disease} 発生`,
      [
        d.内容,
        `<b>危険度：</b>${sev}（未治療合計${CONFIG.UNTREATED_DEATH_THRESHOLD}で死亡）`,
        `Wave：Lv${waveLv}（感染波で危険度上昇の可能性）`,
        deadGhostCount() > 0 ? `👻 死者の影響：危険度 +${CONFIG.GHOST.DEAD_INFECT_PLUS}` : "（死者の影響なし）",
        collapseActive ? `⚠️ 医療逼迫：アイテム成功率が低下中（-20%）` : `アイテム：運が良ければ防げる（今は${useRes.used ? "使ったが失敗" : "未使用/不可"}）`,
        medicalCollapseActive ? `🏥 医療崩壊中：治療に追加自己負担 +${CONFIG.MEDICAL_COLLAPSE.EXTRA_TREAT_PLAYER_PAY.toLocaleString()}` : "医療崩壊：なし",
        `ワクチン：対象なら100%防ぐ（145でも有効）`,
      ],
      "infect",
      color
    );

    await new Promise((resolve) => {
      const ins = CONFIG.INSURANCE[p.insurance];
      const extra = medicalCollapseActive ? CONFIG.MEDICAL_COLLAPSE.EXTRA_TREAT_PLAYER_PAY : 0;
      const pay = ins.treatPlayerPay + extra;

      showModal(
        "治療する？",
        `<div class="popMsg">
          <div class="popTitle">🧪 治療の選択</div>
          <div class="popLine"><b>病気：</b>${disease}</div>
          <div class="popLine"><b>危険度：</b>${sev}（未治療合計${CONFIG.UNTREATED_DEATH_THRESHOLD}で死亡）</div>
          <div class="popLine"><b>保険：</b>${insuranceText(p.insurance)}</div>
          ${medicalCollapseActive ? `<div class="popLine"><b>医療崩壊：</b>追加自己負担 +${extra.toLocaleString()}</div>` : ""}
          <hr class="popHr"/>
          <div class="popLine">自己負担：<b>${pay.toLocaleString()}</b></div>
          <div class="popLine">政府負担：<b>${ins.treatGovPay.toLocaleString()}</b></div>
          <div class="small">治療CP：A +1 / B 0 / C -1</div>
        </div>`,
        [
          {
            text: "治療する",
            className: "btnPrimary",
            onClick: async () => {
              closeModal();
              const ok = await doTreatment(p);
              if (!ok) {
                p.untreated += sev;
                p.untreatedCount = (p.untreatedCount || 0) + 1;
                logLine("UNTREAT", `${p.name}: 未治療 +${sev}（合計 ${p.untreated}）`);
              } else {
                logLine("TREAT", `${p.name}: 治療済み（未治療増加なし）`);
              }
              resolve();
            },
          },
          {
            text: "治療しない",
            className: "btnDanger",
            onClick: () => {
              closeModal();
              p.untreated += sev;
              p.untreatedCount = (p.untreatedCount || 0) + 1;
              addCP(p, CONFIG.REFUSE_TREAT_CP, "（治療拒否）");
              logLine("UNTREAT", `${p.name}: 未治療 +${sev}（合計 ${p.untreated}）`);
              resolve();
            },
          },
        ]
      );
    });

    if (p.untreated >= CONFIG.UNTREATED_DEATH_THRESHOLD) {
      p.alive = false;
      p.diedMidgame = true;

      if (CONFIG.GHOST.ENABLE) {
        p.ghost = true;
        p.moneyFrozen = true;
      }

      logLine("DEAD", `${p.name}: 未治療 ${p.untreated} で死亡（ghost=${p.ghost ? "ON" : "OFF"}）`);
      await showOkPopup(
        "アウト…（幽霊モード）",
        [
          `${p.name} は未治療が積み重なって倒れた…`,
          "ただし盤上には残る（サイコロ不可 / money凍結）",
          "以後：147（情報錯綜）で政治介入できる",
          `死者がいる間：infect危険度 +${CONFIG.GHOST.DEAD_INFECT_PLUS}（上限${CONFIG.SEV_MAX}）`,
        ],
        "infect",
        "red"
      );
    }
  }

  /* =========================
     GOV resolve (35/75 insurance + invest, 115 special)
  ========================= */
  async function resolveInsuranceChange(p) {
    await new Promise((resolve) => {
      showModal(
        `中央政府（${p.pos}）：保険を変更する？`,
        `
          <div class="grid">
            <div class="radioLine">
              <label><input type="radio" name="ins" value="A" ${p.insurance === "A" ? "checked" : ""}/> ${CONFIG.INSURANCE.A.name}</label>
              <div class="desc">治療：自己負担 10,000 / 政府 0</div>
              <div class="desc">WORK：手取り 20,000 / 政府 +0 / CP -1</div>
              <div class="desc">治療CP：+1</div>
            </div>
            <div class="radioLine">
              <label><input type="radio" name="ins" value="B" ${p.insurance === "B" ? "checked" : ""}/> ${CONFIG.INSURANCE.B.name}</label>
              <div class="desc">治療：自己負担 5,000 / 政府 5,000</div>
              <div class="desc">WORK：手取り 12,000 / 政府 +8,000 / CP 0</div>
              <div class="desc">治療CP：0</div>
            </div>
            <div class="radioLine" style="grid-column:1 / span 2;">
              <label><input type="radio" name="ins" value="C" ${p.insurance === "C" ? "checked" : ""}/> ${CONFIG.INSURANCE.C.name}</label>
              <div class="desc">治療：自己負担 0 / 政府 10,000（基金マイナスでも払う）</div>
              <div class="desc">WORK：手取り 8,000 / 政府 +12,000 / CP +1</div>
              <div class="desc">治療CP：-1</div>
            </div>
          </div>
          <div class="small" style="padding-top:8px;">※35マスに止まった時だけ変更可能</div>
        `,
        [
          {
            text: "決定",
            className: "btnPrimary",
            onClick: () => {
              const sel = document.querySelector('input[name="ins"]:checked');
              const before = p.insurance;
              if (sel) p.insurance = sel.value;

              if (before !== p.insurance) {
                p.insuranceHistory = p.insuranceHistory || [];
                p.insuranceHistory.push({
                  from: before,
                  to: p.insurance,
                  atTile: p.pos,
                  round: roundCounter,
                });
              }

              closeModal();
              logLine("GOV", `${p.name}: 保険を ${insuranceText(p.insurance)} に設定`);
              renderTable();
              resolve();
            },
          },
        ]
      );
    });
  }

  async function resolveInvest(p, atTile) {
    const already = atTile === 35 ? investedAt35.has(p.id) : investedAt75.has(p.id);
    if (already) {
      logLine("INVEST", `${p.name}: 既にこのマスで投資済み`);
      return;
    }

    const step = CONFIG.INVEST_STEP;
    const cap = CONFIG.INVEST_CAP_PER_TIME;

    const lv = currentInvestLv();
    const th = investThresholdsByPlayers(playerCount);
    const lines = [
      `投資は「全員の総投資額」で効果が決まる（公共財）`,
      `投資額：0〜${cap.toLocaleString()}（${step.toLocaleString()}刻み）`,
      `現在の総投資：${investTotal.toLocaleString()}（Lv${lv}） / MAX=${th.max.toLocaleString()}`,
      `Lv閾値（人数${playerCount}）：Lv1=${th.lv1.toLocaleString()} / Lv2=${th.lv2.toLocaleString()} / Lv3=${th.lv3.toLocaleString()}`,
      ...investEffectsSummary(lv),
      `デメリット：投資した瞬間、${Math.floor(CONFIG.INVEST_FRICTION_PROB * 100)}%でCP${CONFIG.INVEST_FRICTION_CP}`,
      `※TGの投資点は「個人累計投資額÷10000」`,
      `※投資は政府基金に ${Math.floor(CONFIG.INVEST_TO_GOVFUND_RATIO * 100)}% だけ反映（調整済み）`,
    ];

    await new Promise((resolve) => {
      showModal(
        `中央政府（${atTile}）：投資する？（任意）`,
        `
          <div class="popMsg">
            <div class="popTitle">🏛️ 投資（公共財）</div>
            ${lines.map((s) => `<div class="popLine">${s}</div>`).join("")}
            <hr class="popHr"/>
            <div class="small">所持金：${p.money.toLocaleString()}</div>
            <input id="investAmt" type="number" min="0" max="${cap}" step="${step}" value="0"/>
          </div>
        `,
        [
          {
            text: "投資する",
            className: "btnPrimary",
            onClick: async () => {
              const v = Number(document.getElementById("investAmt")?.value || 0);
              const amt = Math.max(0, Math.min(cap, Math.floor(v / step) * step));

              closeModal();

              if (amt > p.money) {
                logLine("INVEST", `${p.name}: 所持金不足で投資できない`);
                resolve();
                return;
              }

              p.money -= amt;

              const addToGov = Math.floor(amt * CONFIG.INVEST_TO_GOVFUND_RATIO);
              govFund += addToGov;

              investTotal += amt;
              p.personalInvest += amt;

              if (amt > 0 && rand01() < CONFIG.INVEST_FRICTION_PROB) {
                addCP(p, CONFIG.INVEST_FRICTION_CP, "（投資の摩擦）");
              }

              if (atTile === 35) investedAt35.add(p.id);
              if (atTile === 75) investedAt75.add(p.id);

              const newLv = currentInvestLv();
              logLine(
                "INVEST",
                `${p.name}: 投資 +${amt.toLocaleString()}（基金+${addToGov.toLocaleString()} / 基金=${govFund.toLocaleString()} / 総投資=${investTotal.toLocaleString()} / 個人累計=${p.personalInvest.toLocaleString()} / Lv${newLv}）`
              );

              await showOkPopup(
                "投資完了",
                [
                  `${p.name} は投資した：+${amt.toLocaleString()}`,
                  `政府基金への反映：+${addToGov.toLocaleString()}（${Math.floor(CONFIG.INVEST_TO_GOVFUND_RATIO * 100)}%）`,
                  `個人累計：${p.personalInvest.toLocaleString()}（TG用）`,
                  `総投資：${investTotal.toLocaleString()} → Lv${newLv}（公共財効果）`,
                  ...investEffectsSummary(newLv),
                ],
                "gov",
                "blue"
              );

              renderTable();
              resolve();
            },
          },
          {
            text: "投資しない",
            onClick: () => {
              closeModal();
              if (atTile === 35) investedAt35.add(p.id);
              if (atTile === 75) investedAt75.add(p.id);
              logLine("INVEST", `${p.name}: 投資しない（このマスの投資権は消滅）`);
              resolve();
            },
          },
        ]
      );
    });
  }

  async function resolveEvent115Choice(p) {
    if (!CONFIG.EVENT115.ENABLE) return;
    if (!p.alive) return;

    if (!event115Activated) event115Activated = true;

    if (event115ChoicesDone.has(p.id)) {
      logLine("115", `${p.name}: 115（選択済み）`);
      return;
    }

    await new Promise((resolve) => {
      showModal(
        "【115】国際緊急会議：政策を選べ（生存者のみ）",
        `<div class="popMsg">
          <div class="popTitle">政策を1つ選択</div>
          <div class="popLine">※選んだ瞬間に効果が発動（他人待ちなし）</div>
          <div class="popLine">※あなたはこのイベントを<b>1回だけ</b>選べる</div>
          <hr class="popHr"/>
          <div class="popLine"><b>① 個人救済</b>：所持金 +${CONFIG.EVENT115.MONEY_DELTA_PER_PLAYER.toLocaleString()}</div>
          <div class="popLine"><b>② 公衆衛生</b>：政府基金 +${CONFIG.EVENT115.GOVFUND_DELTA_PER_PLAYER.toLocaleString()} ＋ CP +${CONFIG.EVENT115.CP_DELTA}</div>
          <div class="popLine"><b>③ 医療現場優先</b>：次のinfectを1回無効化 ＋ CP +${CONFIG.EVENT115.CP_DELTA}</div>
        </div>`,
        [
          {
            text: "① 個人救済",
            className: "btnPrimary",
            onClick: async () => {
              closeModal();
              event115ChoicesDone.add(p.id);
              p.money += CONFIG.EVENT115.MONEY_DELTA_PER_PLAYER;
              logLine("115", `${p.name}: ①個人救済 money +${CONFIG.EVENT115.MONEY_DELTA_PER_PLAYER}`);
              await showOkPopup("115：個人救済", [`${p.name} 所持金 +${CONFIG.EVENT115.MONEY_DELTA_PER_PLAYER.toLocaleString()}`], "event", "blue");
              renderTable();
              resolve();
            },
          },
          {
            text: "② 公衆衛生",
            className: "btnPrimary",
            onClick: async () => {
              closeModal();
              event115ChoicesDone.add(p.id);
              govFund += CONFIG.EVENT115.GOVFUND_DELTA_PER_PLAYER;
              addCP(p, CONFIG.EVENT115.CP_DELTA, "（115：公衆衛生）");
              logLine("115", `${p.name}: ②公衆衛生 fund +${CONFIG.EVENT115.GOVFUND_DELTA_PER_PLAYER} / CP +${CONFIG.EVENT115.CP_DELTA}`);
              await showOkPopup(
                "115：公衆衛生",
                [
                  `${p.name} CP +${CONFIG.EVENT115.CP_DELTA}`,
                  `政府基金 +${CONFIG.EVENT115.GOVFUND_DELTA_PER_PLAYER.toLocaleString()}`,
                ],
                "event",
                "yellow"
              );
              renderTable();
              resolve();
            },
          },
          {
            text: "③ 医療現場優先",
            className: "btnPrimary",
            onClick: async () => {
              closeModal();
              event115ChoicesDone.add(p.id);
              p.infectShield115 = (p.infectShield115 || 0) + 1;
              addCP(p, CONFIG.EVENT115.CP_DELTA, "（115：医療現場優先）");
              logLine("115", `${p.name}: ③医療現場優先 infect無効+1 / CP +${CONFIG.EVENT115.CP_DELTA}`);
              await showOkPopup(
                "115：医療現場優先",
                [
                  `${p.name} CP +${CONFIG.EVENT115.CP_DELTA}`,
                  "次のinfectを <b>1回</b> 無効化",
                ],
                "event",
                "yellow"
              );
              renderTable();
              resolve();
            },
          },
        ]
      );
    });
  }

  async function resolveGov(p) {
    const pos = p.pos;

    if (pos === 35) {
      await resolveInsuranceChange(p);
      await resolveInvest(p, 35);
      return;
    }
    if (pos === 75) {
      await resolveInvest(p, 75);
      return;
    }
    if (pos === 115) {
      await resolveEvent115Choice(p);
      return;
    }
  }

  /* =========================================================
     Endgame (143-150), TG, Turn loop, Start/Reset
  ========================================================= */
  function getRankOrderByMoneyThenCP() {
    const arr = players.slice();
    arr.sort((a, b) => {
      if (a.alive !== b.alive) return (b.alive ? 1 : 0) - (a.alive ? 1 : 0);
      if (b.money !== a.money) return b.money - a.money;
      if (b.cp !== a.cp) return b.cp - a.cp;
      return b.pos - a.pos;
    });
    return arr.map((p) => p.id);
  }

  function snapshotRankAt143() {
    const order = getRankOrderByMoneyThenCP();
    rankSnapshotAt143 = { order };
    const lines = order
      .map((id, i) => {
        const p = players[id];
        return `${i + 1}位: ${p.name}（money=${p.money} CP=${p.cp}）`;
      })
      .join("\n");

    showModal(
      "【143】順位スナップショット（確定）",
      `<div class="popMsg"><div class="popTitle">順位（143到達時点）</div><pre class="popPre">${lines}</pre></div>`,
      [{ text: "OK", className: "btnPrimary", onClick: () => closeModal() }]
    );
    logLine("143", `順位確定: ${lines.replaceAll("\n", " / ")}`);
  }

  function startFinalPhaseAt143() {
    if (finalPhaseStarted) return;
    finalPhaseStarted = true;

    for (const p of players) {
      if (p.alive || (CONFIG.GHOST.ENABLE && p.ghost)) {
        if (p.pos < 143) p.pos = 143;
      }
    }
    renderTokens();
    renderTable();
    renderTurn();

    logLine("FINAL", "143到達：終盤フェーズ開始（生存者は143に集合 / 幽霊も盤上で合流）");
    if (!rankSnapshotAt143) snapshotRankAt143();
  }

  async function resolveLockdown144(p) {
    const pct = playerCount;
    const loss = Math.floor(p.money * (pct / 100));
    p.money -= loss;
    logLine("144", `${p.name}: ロックダウン -${pct}%（-${loss}）`);
    await showOkPopup(
      "ロックダウン発動",
      [`止まった人：所持金 <b>-${pct}%</b>（<b>-${loss.toLocaleString()}</b>）`, "（※全員必ず止まる）"],
      "event",
      "yellow"
    );
  }

  async function resolveCollapse145() {
    collapseActive = true;
    logLine("145", `医療逼迫 → アイテム成功率低下（ワクチンは有効のまま）`);
    await showOkPopup(
      "医療逼迫",
      [
        `アイテム成功率：-${CONFIG.COLLAPSE.ITEM_SUCCESS_MINUS}%（下限${CONFIG.COLLAPSE.ITEM_SUCCESS_MIN}%）`,
        "ワクチン：有効（努力が無駄にならない設計）",
        "現場は地獄だ…",
      ],
      "event",
      "red"
    );
  }

  function trialNeed() {
    const bonus = Math.min(CONFIG.TRIAL.MAX_BONUS, Math.floor(investTotal / CONFIG.TRIAL.BONUS_PER_INVEST_UNIT));
    return CONFIG.TRIAL.BASE_NEED + bonus;
  }

  async function resolveTrial146(p) {
    const need = trialNeed();
    logLine("146", `${p.name}: 治験（成功条件 出目1〜${need}）`);

    await new Promise((resolve) => {
      showModal(
        `【146】${p.name}：ワクチン治験に参加する？`,
        `<div class="popMsg">
          <div class="popTitle">🧪 VACCINE TRIAL</div>
          <div class="popLine">成功条件：出目 <b>1〜${need}</b></div>
          <hr class="popHr"/>
          <div class="popLine">成功：<b>CP ${CONFIG.TRIAL.CP_SUCCESS >= 0 ? "+" : ""}${CONFIG.TRIAL.CP_SUCCESS}</b> / TG加点：<b>+${CONFIG.TG_FINAL.TRIAL_SUCCESS_BONUS}</b></div>
          <div class="popLine">失敗：<b>CP ${CONFIG.TRIAL.CP_FAIL}</b></div>
          <div class="popLine">拒否：<b>所持金 -${CONFIG.TRIAL.REFUSE_MONEY_PENALTY.toLocaleString()}</b></div>
        </div>`,
        [
          {
            text: "参加する",
            className: "btnPrimary",
            onClick: async () => {
              closeModal();
              p.trialJoined = true;

              setMsg(`${p.name} 治験判定…`);
              const d = await rollDiceAnimated();
              await sleep(120);

              if (d <= need) {
                p.trialSuccess = true;
                addCP(p, CONFIG.TRIAL.CP_SUCCESS, "（治験成功）");
                logLine("146", `${p.name}: 成功 ✅（出目${d}）`);
              } else {
                p.trialSuccess = false;
                addCP(p, CONFIG.TRIAL.CP_FAIL, "（治験失敗）");
                logLine("146", `${p.name}: 失敗 ❌（出目${d}）`);
              }

              renderTable();
              resolve();
            },
          },
          {
            text: "拒否する",
            className: "btnDanger",
            onClick: async () => {
              closeModal();
              p.money -= CONFIG.TRIAL.REFUSE_MONEY_PENALTY;
              p.trialJoined = false;
              p.trialSuccess = false;
              logLine("146", `${p.name}: 拒否 → 所持金 -${CONFIG.TRIAL.REFUSE_MONEY_PENALTY.toLocaleString()}`);
              renderTable();
              await showOkPopup(
                "拒否った",
                ["倫理・安全…いろいろ考えた結果、拒否。", `でも財布が死んだ（-${CONFIG.TRIAL.REFUSE_MONEY_PENALTY.toLocaleString()}）`],
                "event",
                "yellow"
              );
              resolve();
            },
          },
        ]
      );
    });
  }

  async function ghostInterveneAt147() {
    if (!CONFIG.GHOST.ENABLE || !CONFIG.GHOST.ENABLE_ON_147) return;

    const ghosts = players.filter((x) => !x.alive && x.ghost);
    if (!ghosts.length) return;

    const aliveTargets = players.filter((x) => x.alive);
    if (!aliveTargets.length) return;

    for (const g of ghosts) {
      await new Promise((resolve) => {
        const opts = aliveTargets
          .filter((t) => t.id !== g.id)
          .map((t) => `<option value="${t.id}">${t.name}（CP=${t.cp} / money=${t.money}）</option>`)
          .join("");

        showModal(
          `👻 ${g.name}：147に介入する？`,
          `<div class="popMsg">
            <div class="popTitle">👻 幽霊の政治介入（情報錯綜）</div>
            <div class="popLine">死者はサイコロを振れない代わりに、ここで世界に干渉できる。</div>
            <hr class="popHr"/>
            <div class="popLine">① 生存者のCPを <b>-1</b></div>
            <div class="popLine">② 自分のCPを <b>+1</b></div>
            <hr class="popHr"/>
            <div class="small">①の対象</div>
            <select id="ghostTarget_${g.id}">${opts}</select>
          </div>`,
          [
            {
              text: "生存者CP -1",
              className: "btnDanger",
              onClick: async () => {
                const id = Number(document.getElementById(`ghostTarget_${g.id}`)?.value);
                const t = players[id];
                closeModal();
                if (t && t.alive) {
                  addCP(t, -1, `（👻${g.name}の介入）`);
                  logLine("GHOST147", `${g.name} -> ${t.name}: CP -1`);
                  renderTable();
                  await showOkPopup("👻 介入成功", [`${t.name} のCPを -1 した`], "event", "red");
                }
                resolve();
              },
            },
            {
              text: "自分CP +1",
              className: "btnPrimary",
              onClick: async () => {
                closeModal();
                addCP(g, +1, "（👻幽霊介入）");
                logLine("GHOST147", `${g.name}: CP +1`);
                renderTable();
                await showOkPopup("👻 自己強化", [`${g.name} のCPを +1 した`], "event", "blue");
                resolve();
              },
            },
            {
              text: "今回は介入しない",
              onClick: () => {
                closeModal();
                logLine("GHOST147", `${g.name}: 介入しない`);
                resolve();
              },
            },
          ]
        );
      });
    }
  }

  async function resolveChaos147(p) {
    const order = getRankOrderByMoneyThenCP();
    const rank = order.indexOf(p.id) + 1;

    let tier = "middle";
    if (playerCount === 1) tier = "middle";
    else if (playerCount === 2) tier = rank === 1 ? "upper" : "lower";
    else if (playerCount === 3) tier = rank === 1 ? "upper" : rank === 2 ? "middle" : "lower";
    else if (playerCount === 4) tier = rank === 1 ? "upper" : rank === 4 ? "lower" : "middle";
    else tier = rank === 1 ? "upper" : rank >= 4 ? "lower" : "middle";

    logLine("147", `${p.name}: 情報錯綜（tier=${tier}）`);

    if (tier === "upper") {
      await showOkPopup("情報錯綜", ["上位は冷静。ノーダメで通過。"], "event", "blue");
      await ghostInterveneAt147();
      return;
    }

    if (tier === "middle") {
      setMsg(`${p.name}（中位）情報錯綜判定…`);
      const d = await rollDiceAnimated();
      await sleep(80);
      let delta = 0;
      if (d <= 2) delta = 1;
      else if (d <= 4) delta = 0;
      else delta = -1;
      if (delta !== 0) addCP(p, delta, "（情報錯綜：中位）");
      renderTable();
      await showOkPopup("情報錯綜（中位）", [`出目${d} → CP ${delta >= 0 ? "+" : ""}${delta}`], "event", delta >= 0 ? "blue" : "yellow");
      await ghostInterveneAt147();
      return;
    }

    await new Promise((resolve) => {
      const candidates = players.filter((x) => x.alive && x.id !== p.id);
      const opts = candidates.map((x) => `<option value="${x.id}">${x.name}（CP=${x.cp}）</option>`).join("");

      showModal(
        `【147】${p.name}（下位）：情報錯綜の選択`,
        `<div class="popMsg">
          <div class="popTitle">🎭 情報錯綜（下位）</div>
          <div class="popLine">① 他人のCPを <b>-1</b></div>
          <div class="popLine">② 自分のCPを <b>+1</b></div>
          <hr class="popHr"/>
          <div class="small">①を選ぶ場合：対象</div>
          <select id="chaosTarget">${opts}</select>
        </div>`,
        [
          {
            text: "他人のCP -1",
            className: "btnDanger",
            onClick: async () => {
              const id = Number(document.getElementById("chaosTarget")?.value);
              const t = players[id];
              closeModal();
              if (t && t.alive) addCP(t, -1, `（情報錯綜：${p.name}の操作）`);
              renderTable();
              await showOkPopup("情報操作", ["ターゲットに陰謀が刺さった。"], "event", "red");
              resolve();
            },
          },
          {
            text: "自分のCP +1",
            className: "btnPrimary",
            onClick: async () => {
              closeModal();
              addCP(p, 1, "（情報錯綜：下位）");
              renderTable();
              await showOkPopup("自己強化", ["自分のCPを底上げ！ +1"], "event", "blue");
              resolve();
            },
          },
        ]
      );
    });

    await ghostInterveneAt147();
  }

  async function resolveOmen148() {
    await showOkPopup("前兆", ["検査も治療も追いつかない…", "次は 149：全員集合でTG判定"], "event", "yellow");
  }

  function clamp(n, lo, hi) {
    return Math.max(lo, Math.min(hi, n));
  }

  function govFundBonus() {
    return govFundStageBonus(players, { govFund });
  }

  function calcTG(p) {
    const T = CONFIG.TG_FINAL;
    const cpClip = clamp(p.cp, T.CP_CLAMP_MIN, T.CP_CLAMP_MAX);

    const investPoint = Math.floor((p.personalInvest || 0) / T.INVEST_PERSONAL_DIV);
    const trialPoint = p.trialSuccess ? T.TRIAL_SUCCESS_BONUS : 0;
    const govPoint = govFundBonus();
    const worldBonus = worldInvestTGBonus();

    const tg =
      cpClip * T.CP_WEIGHT +
      investPoint +
      trialPoint +
      govPoint -
      p.untreated * T.UNTREATED_PENALTY +
      worldBonus;

    return tg;
  }

  function outcomeByTG(tg) {
    const T = CONFIG.TG_FINAL;
    if (tg >= T.TH_ASYMPTOMATIC) return "asymptomatic";
    if (tg >= T.TH_SEQUELAE) return "sequelae";
    return "death";
  }

  function applyFinalMoneyPenalty(p, outcome) {
    if (outcome === "asymptomatic") return { pct: 0, loss: 0 };
    if (outcome === "sequelae") {
      const loss = Math.floor(p.money * (CONFIG.FINAL_MONEY.SEQUELAE_PCT / 100));
      p.money -= loss;
      return { pct: CONFIG.FINAL_MONEY.SEQUELAE_PCT, loss };
    }
    const loss = Math.floor(p.money * (CONFIG.FINAL_MONEY.DEATH_PCT / 100));
    p.money -= loss;
    p.alive = false;
    return { pct: CONFIG.FINAL_MONEY.DEATH_PCT, loss };
  }

  async function resolvePandemicIfReady() {
    if (pandemicResolved) return;

    const alivePlayers = players.filter((p) => p.alive);
    const allAt149 = alivePlayers.length > 0 && alivePlayers.every((p) => p.pos === 149);
    if (!allAt149) {
      setMsg("149に全員集合するとTG判定！");
      return;
    }

    pandemicResolved = true;
    logLine("149", "全員集合 → TG判定開始（ダイスなし）");

    const T = CONFIG.TG_FINAL;

    await showOkPopup(
      "パンデミック最終判定",
      [
        "ここはダイスではなく TG（治療グレード）で決まる（確定版）。",
        `TG ≥ ${T.TH_ASYMPTOMATIC}：無症状生存（所持金変動なし）`,
        `TG ${T.TH_SEQUELAE}〜${T.TH_ASYMPTOMATIC - 1}：後遺症（所持金 -${CONFIG.FINAL_MONEY.SEQUELAE_PCT}%）`,
        `TG ≤ ${T.TH_SEQUELAE - 1}：死亡（所持金 -${CONFIG.FINAL_MONEY.DEATH_PCT}%）`,
        "順位：所持金（同額ならCPが高い方）",
      ],
      "pandemic",
      "red"
    );

    for (const p of alivePlayers) {
      const tg = calcTG(p);
      const out = outcomeByTG(tg);
      p.finalOutcome = out;

      const cpClip = clamp(p.cp, T.CP_CLAMP_MIN, T.CP_CLAMP_MAX);
      const investPoint = Math.floor((p.personalInvest || 0) / T.INVEST_PERSONAL_DIV);
      const trialPoint = p.trialSuccess ? T.TRIAL_SUCCESS_BONUS : 0;
      const govPoint = govFundBonus();
      const worldBonus = worldInvestTGBonus();

      logLine(
        "TG",
        `${p.name}: TG=${tg} / CP=${p.cp}(clip=${cpClip}) / personalInvest=${p.personalInvest}(${investPoint}) / trial=${p.trialSuccess ? "success" : "no"}(${trialPoint}) / govBonus=${govPoint} / untreated=${p.untreated}(-${p.untreated * T.UNTREATED_PENALTY}) / worldBonus=${worldBonus}`
      );

      if (out === "asymptomatic") {
        await showOkPopup(`${p.name}：無症状生存`, [`TG=${tg}（>=${T.TH_ASYMPTOMATIC}）`, "所持金：変動なし"], "pandemic", "blue");
      } else if (out === "sequelae") {
        const { pct, loss } = applyFinalMoneyPenalty(p, out);
        await showOkPopup(
          `${p.name}：後遺症つきで生存`,
          [`TG=${tg}（${T.TH_SEQUELAE}〜${T.TH_ASYMPTOMATIC - 1}）`, `所持金：-${pct}%（-${loss.toLocaleString()}）`],
          "pandemic",
          "yellow"
        );
      } else {
        const { pct, loss } = applyFinalMoneyPenalty(p, out);
        await showOkPopup(
          `${p.name}：死亡`,
          [`TG=${tg}（<=${T.TH_SEQUELAE - 1}）`, `所持金：-${pct}%（-${loss.toLocaleString()}）`, "💀 退場"],
          "pandemic",
          "red"
        );
      }

      renderTokens();
      renderTable();
      renderTurn();
      await sleep(120);
    }

    for (const p of players) {
      if (p.alive) {
        p.pos = 150;
        p.finished = true;
      } else {
        p.finished = true;
      }
    }

    renderTokens();
    renderTable();
    renderTurn();

    showResult();

    const entry = buildResultEntry();
    saveEntry(entry);
    renderDetailedResult(entry);
  }

  /* =========================
     Tile resolvers
  ========================= */
  async function resolveWork(p) {
    const ins = p.insurance;
    const baseNet = CONFIG.WORK_NET[ins] ?? 0;
    const baseGov = CONFIG.WORK_GOV[ins] ?? 0;

    let gain = baseNet;
    let gdelta = baseGov;

    if (ebolaTriggered && ebolaRemainTurns > 0) {
      const pct = ebolaWorkPenaltyPct();
      gain = baseNet - Math.floor(baseNet * (pct / 100));
      gdelta = baseGov - Math.floor(baseGov * (pct / 100));
    }

    const wp = waveWorkPenalty();
    gain = Math.max(0, gain - wp.moneyMinus);
    gdelta = Math.max(0, gdelta - wp.govMinus);

    p.money += gain;
    govFund += gdelta;

    const cpDelta = CONFIG.WORK_CP[ins] ?? 0;
    if (cpDelta !== 0) addCP(p, cpDelta, "（WORK）");

    logLine("WORK", `${p.name}: 手取り +${gain.toLocaleString()}（保険${ins}）/ 政府 +${gdelta.toLocaleString()}（基金=${govFund.toLocaleString()}）`);
  }

  async function resolveEvent(p, tile) {
    if (typeof tile.delta === "number") {
      p.money += tile.delta;
      logLine("EVENT", `${p.name}: ${tile.delta >= 0 ? "+" : ""}${tile.delta}`);
      await showOkPopup(
        "イベント",
        [tile.delta >= 0 ? `臨時収入 +${tile.delta.toLocaleString()}` : `出費 ${tile.delta.toLocaleString()}`],
        "event",
        tile.delta >= 0 ? "blue" : "yellow"
      );
    }
  }

  async function resolveItem(p) {
    await gainRandomItemAtItemTile(p);
    renderTable();
  }

  async function resolveSpecialEvent(p, tile) {
    const key = tile.key;
    if (key === "warn143") { startFinalPhaseAt143(); return; }
    if (key === "lockdown144") { await resolveLockdown144(p); return; }
    if (key === "collapse145") { await resolveCollapse145(); return; }
    if (key === "trial146") { await resolveTrial146(p); return; }
    if (key === "chaos147") { await resolveChaos147(p); return; }
    if (key === "omen148") { await resolveOmen148(); return; }
  }

  async function resolveTile(p) {
    const tile = board[p.pos];
    if (!tile || !p.alive) return;

    if (p.pos === 149) {
      logLine("149", `${p.name}: 149に到達（全員停止）`);
      await resolvePandemicIfReady();
      return;
    }

    if (p.pos >= 143 && p.pos <= 148) {
      logLine("EVENT", `${p.name}: ${p.pos} ${tile.text}`);
      await resolveSpecialEvent(p, tile);
      return;
    }

    switch (tile.type) {
      case "work": await resolveWork(p); break;
      case "item": await resolveItem(p); break;
      case "event": await resolveEvent(p, tile); break;
      case "infect": await resolveInfect(p); break;
      case "gov": await resolveGov(p); break;
      case "goal":
        p.finished = true;
        logLine("GOAL", `${p.name}: ゴール！`);
        break;
      default:
        break;
    }
  }

  /* =========================
     Turn loop
  ========================= */
  function nextLivingTurn() {
    for (let k = 0; k < playerCount; k++) {
      turn = (turn + 1) % playerCount;
      if (players[turn]?.alive && !players[turn]?.finished) return;
    }
  }
  function allDone() {
    return players.filter((p) => p.alive && !p.finished).length === 0;
  }

  async function doTurn() {
    if (busy) return;
    busy = true;
    if (el.btnRoll) el.btnRoll.disabled = true;

    const p = players[turn];
    if (!p || !p.alive || p.finished) {
      nextLivingTurn();
      busy = false;
      if (el.btnRoll) el.btnRoll.disabled = false;
      return;
    }

    if (p.pos === 149 && !pandemicResolved) {
      logLine("149", `${p.name}: 149で待機中（全員集合待ち）`);
      await resolvePandemicIfReady();
      renderTokens();
      renderTable();
      renderTurn();
      nextLivingTurn();
      busy = false;
      if (el.btnRoll) el.btnRoll.disabled = false;
      return;
    }

    renderTurn();

    const dice = await rollDiceAnimated();
    setMsg(`${p.name} の出目：${dice}（STOPマスは通過しても停止）`);

    await moveStepByStep(p, dice);
    await resolveTile(p);

    if (p.pos === 149) await resolvePandemicIfReady();

    renderTokens();
    renderTable();
    renderTurn();

    const prevTurn = turn;
    nextLivingTurn();

    if ((prevTurn + 1) % playerCount === 0) {
      roundCounter += 1;

      const medTriggeredNow = await maybeTriggerMedicalCollapseAtRoundEnd();
      await maybeTriageAtRoundEnd();

      const ebolaTriggeredNow = await maybeTriggerEbolaAtRoundEnd();
      if (!ebolaTriggeredNow) {
        await tickEbolaAtRoundEnd();
      }

      if (!medTriggeredNow) {
        await tickMedicalCollapseAtRoundEnd();
      }

      await waveTickAtRoundEnd();
    }

    renderTurn();

    if (allDone() && pandemicResolved) {
      if (el.btnRoll) el.btnRoll.disabled = true;
      busy = false;
      return;
    }

    busy = false;
    if (el.btnRoll) el.btnRoll.disabled = false;
  }

  /* =========================
     Result display (Podium + deadlist)
  ========================= */
  function showResult() {
    const arr = players.slice();
    arr.sort((a, b) => {
      if (b.money !== a.money) return b.money - a.money;
      return b.cp - a.cp;
    });

    if (el.pod1) el.pod1.textContent = arr[0] ? `${arr[0].name}` : "-";
    if (el.pod2) el.pod2.textContent = arr[1] ? `${arr[1].name}` : "-";
    if (el.pod3) el.pod3.textContent = arr[2] ? `${arr[2].name}` : "-";

    if (el.deadList) {
      el.deadList.innerHTML = "";
      for (const p of arr.filter((x) => !x.alive)) {
        const d = document.createElement("div");
        d.className = "deadChip";
        d.textContent = p.ghost ? `${p.name}👻` : p.name;
        el.deadList.appendChild(d);
      }
    }

    if (el.resultWrap) el.resultWrap.style.display = "block";
    logLine("RESULT", `順位確定: ${arr.map((p, i) => `${i + 1}位:${p.name}(money=${p.money},CP=${p.cp})`).join(" / ")}`);
  }

  /* =========================
     ✅ Result detail + Save
  ========================= */
  function ensureDetailedResultUI() {
    if (!el.resultWrap) return;
    if (document.getElementById("detailResultTbody")) return;

    const root = el.resultWrap.querySelector(".bd") || el.resultWrap;
    if (!root) return;

    const box = document.createElement("div");
    box.style.marginTop = "12px";
    box.innerHTML = `
      <div class="hd" style="margin-top:12px;border-radius:10px;">Detailed Result</div>
      <div class="bd">
        <div class="bigMsg" id="metaResult" style="margin-bottom:10px;">-</div>
        <table>
          <thead>
            <tr>
              <th>Player</th>
              <th>保険(初期→最終/履歴)</th>
              <th>初期ワクチン</th>
              <th>infect回数</th>
              <th>未治療回数</th>
              <th>最終資金</th>
              <th>累計投資</th>
              <th>アイテム獲得</th>
              <th>最終CP</th>
              <th>最終状態</th>
            </tr>
          </thead>
          <tbody id="detailResultTbody"></tbody>
        </table>
        <div style="margin-top:10px;display:flex;gap:8px;flex-wrap:wrap;">
          <button id="btnCopyResult">結果JSONコピー</button>
        </div>
      </div>
    `;
    root.appendChild(box);
  }

  function statusFinalOf(p) {
    if (p.diedMidgame) return "途中死亡";
    if (p.finalOutcome === "sequelae") return "後遺症";
    if (p.finalOutcome === "asymptomatic") return "生存";
    if (p.finalOutcome === "death") return "死亡";
    return p.alive ? "生存" : "死亡";
  }

  function buildResultEntry() {
    const now = new Date();
    return {
      id: now.toISOString(),
      playedAt: now.toLocaleString("ja-JP"),
      playerCount,
      govFundFinal: govFund,
      investTotal,
      worldInvestLv: currentInvestLv(),
      ebolaOccurred: !!ebolaTriggered,
      rabiesOccurred: !!rabiesOccurred,
      waveLvFinal: waveLv,
      medicalCollapseOccurred: !!medicalCollapseActive || (medicalCollapseRemainTurns > 0),
      players: players.map((p) => ({
        name: p.name,
        insuranceInit: p.insuranceInit,
        insuranceFinal: p.insurance,
        insuranceHistory: p.insuranceHistory || [],
        vaccinatedInit: !!p.vaccinatedInit,
        infectLanded: p.infectLanded || 0,
        untreatedCount: p.untreatedCount || 0,
        moneyFinal: p.money,
        personalInvest: p.personalInvest || 0,
        itemGained: p.itemGained || 0,
        cpFinal: p.cp,
        statusFinal: statusFinalOf(p),
      })),
    };
  }

  function saveEntry(entry) {
    const key = "IL150_HISTORY";
    const raw = localStorage.getItem(key);
    const arr = raw ? JSON.parse(raw) : [];
    arr.unshift(entry);
    arr.splice(30);
    localStorage.setItem(key, JSON.stringify(arr));
    localStorage.setItem("IL150_LATEST", JSON.stringify(entry));
  }

  function renderDetailedResult(entry) {
    ensureDetailedResultUI();

    const meta = document.getElementById("metaResult");
    const tb = document.getElementById("detailResultTbody");
    if (!meta || !tb) return;

    meta.innerHTML =
      `人数：<b>${entry.playerCount}</b> / ` +
      `最終政府基金：<b>${Number(entry.govFundFinal).toLocaleString()}</b> / ` +
      `総投資：<b>${Number(entry.investTotal).toLocaleString()}</b> / ` +
      `世界投資Lv：<b>${entry.worldInvestLv}</b> / ` +
      `Wave：<b>${entry.waveLvFinal}</b> / ` +
      `エボラ：<b>${entry.ebolaOccurred ? "発生" : "なし"}</b> / ` +
      `狂犬病：<b>${entry.rabiesOccurred ? "発生" : "なし"}</b>`;

    tb.innerHTML = "";

    for (const p of entry.players) {
      const histText = p.insuranceHistory?.length
        ? p.insuranceHistory.map((h) => `${h.from}→${h.to}@${h.atTile}`).join(", ")
        : "なし";

      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td><b>${p.name}</b></td>
        <td>${p.insuranceInit}→${p.insuranceFinal} / ${histText}</td>
        <td>${p.vaccinatedInit ? "あり" : "なし"}</td>
        <td>${p.infectLanded}</td>
        <td>${p.untreatedCount}</td>
        <td>${Number(p.moneyFinal).toLocaleString()}</td>
        <td>${Number(p.personalInvest).toLocaleString()}</td>
        <td>${p.itemGained}</td>
        <td><b>${p.cpFinal}</b></td>
        <td>${p.statusFinal}</td>
      `;
      tb.appendChild(tr);
    }

    const btn = document.getElementById("btnCopyResult");
    if (btn) {
      btn.onclick = async () => {
        const txt = JSON.stringify(entry, null, 2);
        try {
          await navigator.clipboard.writeText(txt);
          alert("コピーしたで！");
        } catch {
          prompt("コピーしてな", txt);
        }
      };
    }
  }

  /* =========================
     Start flow
  ========================= */
  async function askInitialInsurancePerPlayer() {
    for (const p of players) {
      await new Promise((resolve) => {
        showModal(
          `開始時：${p.name} の保険を選んで`,
          `
            <div class="bigMsg">
※保険が関与するのは「infectで治療」＋「WORK手取り/政府基金/CP」<br/>
※35マス目で後から変更も可能（その後、投資も可能）
            </div>
            <div class="grid">
              <div class="radioLine">
                <label><input type="radio" name="ins_init" value="A" ${p.insurance === "A" ? "checked" : ""}/> ${CONFIG.INSURANCE.A.name}</label>
                <div class="desc">治療：自己負担 10,000 / 政府 0</div>
                <div class="desc">WORK：手取り <b>20,000</b> / 政府基金に <b>+0</b> / CP -1</div>
                <div class="desc">治療CP：+1</div>
              </div>
              <div class="radioLine">
                <label><input type="radio" name="ins_init" value="B" ${p.insurance === "B" ? "checked" : ""}/> ${CONFIG.INSURANCE.B.name}</label>
                <div class="desc">治療：自己負担 5,000 / 政府 5,000</div>
                <div class="desc">WORK：手取り <b>12,000</b> / 政府基金に <b>+8,000</b> / CP 0</div>
                <div class="desc">治療CP：0</div>
              </div>
              <div class="radioLine" style="grid-column:1 / span 2;">
                <label><input type="radio" name="ins_init" value="C" ${p.insurance === "C" ? "checked" : ""}/> ${CONFIG.INSURANCE.C.name}</label>
                <div class="desc">治療：自己負担 0 / 政府 10,000（基金マイナスでも払う）</div>
                <div class="desc">WORK：手取り <b>8,000</b> / 政府基金に <b>+12,000</b> / CP +1</div>
                <div class="desc">治療CP：-1</div>
              </div>
            </div>
          `,
          [
            {
              text: "決定",
              className: "btnPrimary",
              onClick: () => {
                const sel = document.querySelector('input[name="ins_init"]:checked');
                if (sel) p.insurance = sel.value;

                p.insuranceInit = p.insurance;

                closeModal();
                logLine("INIT", `${p.name}: 初期保険=${insuranceText(p.insurance)}`);
                renderTable();
                resolve();
              },
            },
          ]
        );
      });
    }
  }

  async function askVaccinePack() {
    logLine("INIT", `開始時ワクチン：${CONFIG.VACCINE_PACK.cost}で任意接種（6疾患）`);

    for (const p of players) {
      if (!p.alive) continue;

      await new Promise((resolve) => {
        showModal(
          `${p.name}：ワクチンセットを打つ？（任意）`,
          `
            <div class="bigMsg">
対象：${CONFIG.VACCINE_PACK.protects.join(" / ")}<br/>
費用：<b>${CONFIG.VACCINE_PACK.cost.toLocaleString()}</b><br/>
効果：対象疾患の infect を <b>100%で防ぐ</b><br/>
※145「医療逼迫」でもワクチンは有効
            </div>
            <div class="small">所持金：${p.money.toLocaleString()}</div>
          `,
          [
            {
              text: `打つ（-${CONFIG.VACCINE_PACK.cost.toLocaleString()}）`,
              className: "btnPrimary",
              onClick: () => {
                closeModal();
                if (p.money >= CONFIG.VACCINE_PACK.cost) {
                  p.money -= CONFIG.VACCINE_PACK.cost;
                  p.vaccinated = true;
                  p.vaccinatedSet = new Set(CONFIG.VACCINE_PACK.protects);
                  p.vaccinatedInit = true;
                  logLine("VAX", `${p.name}: 接種（-${CONFIG.VACCINE_PACK.cost.toLocaleString()}）`);
                } else {
                  p.vaccinated = false;
                  p.vaccinatedSet = new Set();
                  p.vaccinatedInit = false;
                  logLine("VAX", `${p.name}: 所持金不足で接種不可`);
                }
                renderTable();
                resolve();
              },
            },
            {
              text: "打たない",
              onClick: () => {
                closeModal();
                p.vaccinated = false;
                p.vaccinatedSet = new Set();
                p.vaccinatedInit = false;
                logLine("VAX", `${p.name}: 接種しない`);
                renderTable();
                resolve();
              },
            },
          ]
        );
      });
    }
  }

  /* =========================
     Reset / start / player count
  ========================= */
  function hardReset() {
    busy = false;
    pandemicResolved = false;

    govFund = CONFIG.GOV_FUND_START;
    investTotal = 0;
    investedAt35 = new Set();
    investedAt75 = new Set();

    collapseActive = false;

    finalPhaseStarted = false;
    rankSnapshotAt143 = null;

    ebolaTriggered = false;
    ebolaRemainTurns = 0;
    highSevInfectStreak = 0;
    roundCounter = 0;

    rabiesOccurred = false;

    event115Activated = false;
    event115ChoicesDone = new Set();

    waveLv = 0;
    infectHitsThisRound = 0;

    medicalCollapseActive = false;
    medicalCollapseRemainTurns = 0;

    turn = 0;
    gameStarted = false;

    if (el.boardImg) el.boardImg.src = CONFIG.BOARD_IMG;

    pool = buildPools();

    players = [];
    for (let i = 0; i < playerCount; i++) players.push(makePlayer(i));

    buildBoard();
    buildGridOverlay();
    rebuildTokens();

    renderTokens();
    renderTable();
    renderTurn();

    if (el.resultWrap) el.resultWrap.style.display = "none";
    if (el.log) el.log.textContent = "";
    setMsg("「ゲーム開始」でスタート");
    setDiceFace(1);
    closeModal();

    if (el.btnRoll) el.btnRoll.disabled = true;
    if (el.btnStart) el.btnStart.disabled = false;

    syncPlayerCountUI();
  }

  async function startGame() {
    if (busy) return;
    busy = true;

    if (el.btnStart) el.btnStart.disabled = true;
    if (el.btnReset) el.btnReset.disabled = false;

    gameStarted = true;
    syncPlayerCountUI();

    await askInitialInsurancePerPlayer();
    await askVaccinePack();

    setMsg("サイコロを振って開始！");
    if (el.btnRoll) el.btnRoll.disabled = false;

    renderTokens();
    renderTable();
    renderTurn();

    busy = false;
  }

  function safeClampPlayers(n) {
    const x = Number(n);
    if (!Number.isFinite(x)) return 4;
    return Math.max(CONFIG.PLAYER_MIN, Math.min(CONFIG.PLAYER_MAX, Math.floor(x)));
  }

  /* =========================
     Wire events
  ========================= */
  function bindUI() {
    if (el.btnStart) el.btnStart.onclick = () => startGame();
    if (el.btnRoll) el.btnRoll.onclick = () => doTurn();
    if (el.btnReset) el.btnReset.onclick = () => hardReset();

    if (el.playerCount) {
      el.playerCount.onchange = () => {
        if (gameStarted) return;
        playerCount = safeClampPlayers(el.playerCount.value);
        syncPlayerCountUI();
        hardReset();
      };
    }

    // 画面リサイズでコマ位置がズレるのを防ぐ
    let resizeTimer = null;
    window.addEventListener("resize", () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        renderTokens();
      }, 120);
    });

    // モーダル背景クリックで閉じない（誤操作防止）
  }

  /* =========================
     Boot
  ========================= */
  (function boot() {
    // 初期人数はUIがあればそこを優先
    if (el.playerCount) {
      playerCount = safeClampPlayers(el.playerCount.value);
    } else {
      playerCount = 4;
    }

    bindUI();
    hardReset();
  })();

})(); // IIFE END
