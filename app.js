/* 天龙人 · 个人工作台 v3
 * 整合：营养师（碳循环/宏量/饮食/体重体脂趋势）/ 天龙人（健身卡/日历/训练/饮水）/ 小金库（净资产/记账/资产）
 * 本地优先，数据存 localStorage
 */
(function () {
  "use strict";

  /* ============ 工具 ============ */
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const STORE = "tianlongren_v3";
  let SYNC_URL = "";
  try { SYNC_URL = localStorage.getItem("tlr_sync_url") || ""; } catch (e) {}
  const SEED_VERSION = 3;
  const deepClone = (o) => (o == null ? null : JSON.parse(JSON.stringify(o)));
  const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
  const esc = (s) => { const d = document.createElement("div"); d.textContent = s == null ? "" : String(s); return d.innerHTML; };
  const fmt = (n) => (Number(n) || 0).toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const fmt2 = (n) => (Number(n) || 0).toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const fm = (v) => { const a = Math.abs(v); return a >= 10000 ? (v / 10000).toFixed(2) + "万" : fmt2(v); };

  /* ============ CountUp 数字滚动动画 ============ */
  function countUp(el, target, options = {}) {
    if (!el) return;
    const {
      duration = 800,
      decimals = 0,
      formatter = (n) => n.toLocaleString("zh-CN", { minimumFractionDigits: decimals, maximumFractionDigits: decimals }),
      prefix = "",
      suffix = ""
    } = options;

    const start = performance.now();
    const startVal = 0;
    const endVal = parseFloat(target) || 0;

    // 如果浏览器不可见，直接显示目标值
    if (document.hidden) { el.textContent = prefix + formatter(endVal) + suffix; return; }

    function update(now) {
      const elapsed = now - start;
      const progress = Math.min(elapsed / duration, 1);

      // easeOutExpo 缓动函数
      const eased = progress === 1 ? 1 : 1 - Math.pow(2, -10 * progress);
      const current = startVal + (endVal - startVal) * eased;

      el.textContent = prefix + formatter(current) + suffix;

      if (progress < 1) requestAnimationFrame(update);
    }

    requestAnimationFrame(update);
  }

  /* 批量动画化容器内的数字 */
  function animateNumbers(container) {
    if (!container) return;
    // 匹配 .stat-value, .card-value, .hi-v, .ms-v, .fs-v, .acct-amt, .friv-total .num
    const selectors = [".stat-value", ".card-value", ".hi-v", ".ms-v", ".fs-v", ".acct-amt"];
    selectors.forEach(sel => {
      container.querySelectorAll(sel).forEach(el => {
        const text = el.textContent;
        // 提取数字（支持负数、小数）
        const match = text.match(/-?[\d,.]+/);
        if (!match) return;
        const num = parseFloat(match[0].replace(/,/g, ""));
        if (isNaN(num) || num === 0) return;
        
        // 保留原始前缀后缀（如 ¥、kg、% 等）
        const prefix = text.substring(0, text.indexOf(match[0]));
        const suffix = text.substring(text.indexOf(match[0]) + match[0].length);
        
        countUp(el, num, {
          decimals: (match[0].split(".").length > 1 ? match[0].split(".")[1].length : 0),
          prefix,
          suffix
        });
      });
    });
  }

  /* ============ 财务加密锁（独立于 D，单独持久化） ============ */
  let FIN = (function () { try { return JSON.parse(localStorage.getItem("tlr_finlock")) || { on: false, pin: "" }; } catch (e) { return { on: false, pin: "" }; } })();
  function saveFinLock() { try { localStorage.setItem("tlr_finlock", JSON.stringify(FIN)); } catch (e) {} }
  function finHash(s) { let h = 0; s = String(s); for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return "h" + (h >>> 0).toString(36); }
  // 金额遮罩：上锁后全部以 ¥•••• 呈现
  function MM(n) { return FIN.on ? "¥••••" : "¥" + fmt(n); }
  function MM2(n) { return FIN.on ? "¥••••" : "¥" + fmt2(n); }
  function finLockBar() {
    return FIN.on
      ? `<div class="fin-lockbar locked"><span>🔒 财务已加密 · 需输入密码查看金额</span><button class="btn btn-sm btn-primary" id="finToggle">解锁</button></div>`
      : `<div class="fin-lockbar"><span>🔓 财务可见</span><button class="btn btn-sm btn-ghost" id="finToggle">上锁保护</button></div>`;
  }
  function finApplyClass() { try { document.body.classList.toggle("fin-locked", !!FIN.on); } catch (e) {} }
  function finToggle() { if (FIN.on) finLockUnlock(); else finLockEngage(); }
  function finLockEngage() {
    if (!FIN.pin) {
      openModal("设置财务密码", `<div class="form"><div class="card-sub mb-2">设置一个 4-6 位数字密码。上锁后，净资产 / 记账金额等内容将以 🔒 遮挡，需输入密码才能查看。密码仅保存在你本机浏览器。</div><input id="finPin" type="password" inputmode="numeric" maxlength="6" placeholder="4-6 位数字" style="padding:10px 12px;border-radius:8px;border:1px solid var(--border);width:100%;font-size:16px;"></div><button class="btn btn-primary w-full mt-2" id="finPinOk">确定并上锁</button>`);
      $("#finPinOk").onclick = () => { const v = $("#finPin").value.trim(); if (!/^\d{4,6}$/.test(v)) { toast("请输入 4-6 位数字", "warn"); return; } FIN.pin = finHash(v); FIN.on = true; saveFinLock(); closeModal(); renderFinance(); renderOverview(); renderSettings(); refreshFinCharts(); toast("已上锁 🔒"); };
    } else { FIN.on = true; saveFinLock(); renderFinance(); renderOverview(); renderSettings(); refreshFinCharts(); toast("已上锁 🔒"); }
  }
  function finLockUnlock() {
    if (!FIN.pin) { FIN.on = false; saveFinLock(); renderFinance(); renderOverview(); renderSettings(); refreshFinCharts(); return; }
    openModal("输入财务密码", `<div class="form"><input id="finPin" type="password" inputmode="numeric" maxlength="6" placeholder="密码" style="padding:10px 12px;border-radius:8px;border:1px solid var(--border);width:100%;font-size:16px;"></div><button class="btn btn-primary w-full mt-2" id="finPinOk">解锁</button><button class="btn btn-sm btn-ghost w-full mt-1" id="finForget">忘记密码</button>`);
    $("#finPinOk").onclick = () => { const v = $("#finPin").value.trim(); if (finHash(v) === FIN.pin) { FIN.on = false; saveFinLock(); closeModal(); renderFinance(); renderOverview(); renderSettings(); refreshFinCharts(); toast("已解锁 🔓"); } else { toast("密码错误", "warn"); } };
    $("#finForget").onclick = () => { if (confirm("重置财务密码并解锁？此操作会清除原密码（仅限本机）。")) { FIN.pin = ""; FIN.on = false; saveFinLock(); closeModal(); renderFinance(); renderOverview(); renderSettings(); refreshFinCharts(); toast("已重置并解锁"); } };
  }
  function finChangePin() {
    const cur = FIN.pin ? `<div class="fld"><label>当前密码</label><input id="op" type="password" inputmode="numeric" maxlength="6" placeholder="当前密码"></div>` : "";
    openModal("财务密码", `<div class="form">${cur}<div class="fld"><label>新密码（4-6 位数字）</label><input id="np" type="password" inputmode="numeric" maxlength="6" placeholder="新密码"></div></div><button class="btn btn-primary w-full mt-2" id="ok">保存</button>`);
    $("#ok").onclick = () => {
      if (FIN.pin) { const o = $("#op").value.trim(); if (finHash(o) !== FIN.pin) { toast("当前密码错误", "warn"); return; } }
      const n = $("#np").value.trim(); if (!/^\d{4,6}$/.test(n)) { toast("请输入 4-6 位数字", "warn"); return; }
      FIN.pin = finHash(n); FIN.on = true; saveFinLock(); closeModal(); renderFinance(); renderOverview(); renderSettings(); refreshFinCharts(); toast("密码已保存 🔒");
    };
  }

  /* ============ 本月非必要性开支（独立记账体系，每月1日清空） ============ */
  function frivItems() { if (!D.frivolous) D.frivolous = { month: cmk(), items: [] }; return D.frivolous.items || (D.frivolous.items = []); }
  function frivTotal() { return frivItems().reduce((s, i) => s + (Number(i.amt) || 0), 0); }
  // 跨月自动清空：当前月与记录月不一致时，清空上月记录并归入新月
  function rolloverFriv() {
    if (!D.frivolous) D.frivolous = { month: cmk(), items: [] };
    const mk = cmk();
    if (D.frivolous.month !== mk) {
      D.frivolous = { month: mk, items: [] };
      try { save(); } catch (e) {}
      return true;
    }
    return false;
  }
  function renderFrivList() {
    const el = $("#frivList"); if (!el) return;
    const items = frivItems().slice().sort((a, b) => b.date.localeCompare(a.date) || String(b.id).localeCompare(String(a.id)));
    el.innerHTML = items.length
      ? items.map((t) => `<div class="row"><div class="row-main"><div class="row-title">${esc(t.note)}</div><div class="row-meta">${t.date.slice(5)}</div></div><span class="num" style="color:#be123c;font-weight:800;">-${MM2(t.amt)}</span><button class="mi-del" data-delfriv="${t.id}">×</button></div>`).join("")
      : emptyState('🎉', '本月还没乱花', '控制得很好！有非必要支出时可以记在这里', null, null);
    $$("#frivList [data-delfriv]").forEach((b) => (b.onclick = () => { frivItems().splice(frivItems().indexOf(frivItems().find((x) => x.id === b.dataset.delfriv)), 1); save(); renderFrivList(); renderFinance(); toast("已删除"); }));
  }
  function addFriv() {
    const amt = Number($("#frAmt").value) || 0;
    const note = $("#frNote").value.trim();
    const date = $("#frDate").value || todayStr();
    if (amt <= 0) { toast("请输入金额", "warn"); return; }
    if (!note) { toast("写点买啥吧", "warn"); return; }
    rolloverFriv();
    frivItems().push({ id: "f" + Date.now(), date, note, amt });
    save();
    $("#frNote").value = ""; $("#frAmt").value = "";
    renderFrivList(); renderFinance();
    toast("已记一笔乱花 💸");
  }
  /* ============ 每日数据自动重置（凌晨 3 点生效） ============ */
  // 记录上次重置的日期（格式：YYYY-MM-DD），用于检测跨天
  let _lastRolloverDate = null;

  /**
   * 获取"有效的今天"——如果当前时间 < 3:00，则视为"昨天"还在继续
   * 这样可以确保凌晨 0-3 点之间打开页面时，仍然显示"昨天"的数据
   * 只有过了 3:00 才算真正进入新的一天
   */
  function effectiveToday() {
    const d = new Date();
    if (d.getHours() < 3) {
      d.setDate(d.getDate() - 1);
    }
    return dstr(d);
  }

  /**
   * 每日数据重置函数
   * 检测是否跨过凌晨 3 点，如果是则：
   * 1. 清空饮水记录
   * 2. 重置待办事项（未完成的保留，已完成的清除）
   *
   * @returns {boolean} 是否发生了重置
   */
  function dailyRollover() {
    const effToday = effectiveToday();

    // 如果已经重置过今天的，跳过
    if (_lastRolloverDate === effToday) return false;

    const prevDate = _lastRolloverDate;
    _lastRolloverDate = effToday;

    // 首次加载时不重置（除非检测到日期确实变了）
    if (!prevDate) return false;

    // 检测是否真的跨天了
    if (prevDate === effToday) return false;

    console.log(`[DailyRollover] 检测到新的一天：${prevDate} → ${effToday}，执行数据重置...`);

    let changed = false;

    // 1. 清空饮水记录（只清空"旧今天"的，保留历史）
    if (D.nutrition && D.nutrition.water && D.nutrition.water[prevDate]) {
      delete D.nutrition.water[prevDate];
      changed = true;
      console.log('[DailyRollover] ✓ 已清空昨日饮水记录');
    }

    // 2. 处理待办事项：清除已完成的，未完成的保留
    if (D.profile && D.profile.todos && D.profile.todos.length > 0) {
      const prevLen = D.profile.todos.length;
      D.profile.todos = D.profile.todos.filter(t => !t.done);
      if (D.profile.todos.length < prevLen) {
        changed = true;
        console.log(`[DailyRollover] ✓ 已清除已完成待办：${prevLen} → ${D.profile.todos.length} 条`);
      }
    }

    // 3. 保存并提示
    if (changed) {
      try { save(); } catch (e) { console.error('[DailyRollover] 保存失败:', e); }
      toast('🌅 新的一天开始了！数据已更新');
    }

    return changed;
  }

  const todayStr = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
  const dateFromStr = (s) => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); };
  const dstr = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const WK = ["日", "一", "二", "三", "四", "五", "六"];

  /* ============ 常量 ============ */
  const CARB_MAP = { 1: "low", 2: "high", 3: "mid", 4: "low", 5: "high", 6: "mid", 0: "low" };
  const CARB_LABEL = { low: "低碳日", high: "高碳日", mid: "中碳日" };
  const CARB_TRAIN = { low: "休息日 / 小肌群训练", high: "腿 / 背 大肌群训练", mid: "胸肩常规训练" };
  const MEALS = [
    { k: "breakfast", name: "早餐", color: "#f59e0b" },
    { k: "lunch", name: "午餐", color: "#10b981" },
    { k: "dinner", name: "晚餐", color: "#3b82f6" },
    { k: "snack", name: "加餐", color: "#8b5cf6" },
  ];
  const TRAIN_PARTS = ["胸", "肩", "背", "臂", "腿", "臀", "有氧"];
  const CAL_PARTS = ["胸", "肩", "背", "臂", "腿", "臀", "腹", "有氧", "休息"];

  /* ============ 图标库（统一线性矢量风格） ============ */
  function icBox(p, cls) { return `<span class="ic ${cls || ''}">${ICON[p] || '•'}</span>`; }
  const ICON = {
    creatine: '💊', fishOil: '🐟',
    chest: '🙌', shoulder: '🤾', back: '🧗', arms: '💪', legs: '🦵', glutes: '🍑', core: '🤸', rest: '😴', cardio: '🏃',
    breakfast: '🍳', lunch: '🍱', dinner: '🍲', snack: '🥨',
    water: '💧', coffee: '☕', green: '🍵',
    carbHigh: '🍚', carbMid: '🍞', carbLow: '🥦',
    salary: '💰', food: '🍽️', transport: '🚗', shopping: '🛒', fun: '🎉', medical: '🏥', house: '🏠',
    dot: '⚪',
  };
  function ic(name, cls) { return icBox(name, cls); }
  const PART_ICON = { '胸': 'chest', '肩': 'shoulder', '背': 'back', '臂': 'arms', '腿': 'legs', '臀': 'glutes', '腹': 'core', '有氧': 'cardio', '休息': 'rest' };
  const DRINK_ICON = { '水': 'water', '茶': 'green', '咖啡': 'coffee' };
  const CAT_ICON = { '工资': 'salary', '餐饮': 'food', '交通': 'transport', '购物': 'shopping', '娱乐': 'fun', '医疗': 'medical', '居住': 'house' };
  function partIcon(p) { return ic(PART_ICON[p] || 'dot'); }
  function drinkIcon(n) { return ic(DRINK_ICON[n] || 'dot'); }
  function catIcon(c) { return ic(CAT_ICON[c] || 'dot'); }
  function carbIcon(type) { return ic('carb' + (type || '')[0].toUpperCase() + (type || '').slice(1)); }

  /* ============ 工作区工厂（种子 / 空白共用） ============ */
  function _createBaseWorkspace() {
    return {
      profile: {
        name: "我", avatar: "我",
        body: { gender: "male", age: 27, height: 171.5, weight: 0, activity: 1.725, gap: 300 },
        level: { lv: 1, xp: 0, max: 100 },
        todos: [],
      },
      nutrition: {
        daily: {},
        weight: [],
        water: {},
        drinks: [
          { id: "d1", name: "水", water: 200, caffeine: 0, chlorogenic: 0, theophylline: 0 },
          { id: "d2", name: "茶", water: 200, caffeine: 6.67, chlorogenic: 0, theophylline: 4.17 },
          { id: "d3", name: "咖啡", water: 250, caffeine: 60, chlorogenic: 60, theophylline: 0 },
        ],
        trendDays: 7,
      },
      fitness: {
        expiry: "",
        calendar: {},
        actions: {},
      },
      finance: {
        txns: [],
        msets: {},
        ecats: ["餐饮", "交通", "购物", "住房", "娱乐", "医疗", "数码", "日用", "其他"],
        icats: ["工资", "兼职", "父母资助", "投资收益", "礼金", "退款", "其他"],
        bals: {},
        invs: [],
        debts: [],
        hfund: {}, sfund: {},
        frivolous: { month: cmk(), items: [] },
      },
    };
  }
  // 种子数据：优先使用外部注入的 SEED，否则返回空白工作区
  function demo() {
    const SEED = window.__SEED__;
    if (SEED && SEED.__v === SEED_VERSION) return deepClone(SEED);
    return _createBaseWorkspace();
  }
  // 真正清空：保留可运行的配置结构，清空所有记录
  function emptyWorkspace() {
    return _createBaseWorkspace();
  }

  // ---- 存档读取 / 兼容性层 ----
  // 深合并：以 demo() 为骨架，用旧档覆盖；缺的字段自动补齐，数组直接替换。
  function isObj(x) { return x && typeof x === "object" && !Array.isArray(x); }
  function mergeDefaults(base, over) {
    if (!isObj(base) || !isObj(over)) return over === undefined ? base : over;
    const out = {};
    for (const k in base) {
      if (k === "daily") { out[k] = isObj(over[k]) ? over[k] : base[k]; continue; } // 每日饮食整块采用旧档
      out[k] = (k in over) ? mergeDefaults(base[k], over[k]) : base[k];
    }
    for (const k in over) if (!(k in base)) out[k] = over[k];
    return out;
  }
  // 把任意来源的对象规范成可运行的 D；不是存档则返回 null
  function normalize(d) {
    if (!isObj(d) || !isObj(d.profile)) return null;
    const m = mergeDefaults(demo(), d);
    m.__v = SEED_VERSION;
    if (!m.profile.todos) m.profile.todos = [];
    if (!m.finance) m.finance = {};
    if (!m.finance.sfund) m.finance.sfund = {};
    if (!m.finance.hfund) m.finance.hfund = {};
    if (!m.finance.msets) m.finance.msets = {};
    if (!m.finance.txns) m.finance.txns = [];
    if (!m.frivolous) m.frivolous = { month: cmk(), items: [] };
    if (!m.nutrition) m.nutrition = {};
    if (!m.nutrition.daily) m.nutrition.daily = {};
    if (!m.nutrition.drinks) m.nutrition.drinks = [];
    if (!m.nutrition.weight) m.nutrition.weight = [];
    if (!m.fitness) m.fitness = {};
    if (!m.fitness.actions) m.fitness.actions = {};
    if (!m.fitness.calendar) m.fitness.calendar = {};
    return m;
  }
  // 兼容多种导出包裹格式：{data:..} / {state:..} / {save:..} 或直接是 D
  function unwrapSave(j) {
    if (isObj(j) && isObj(j.profile)) return j;
    for (const key of ["data", "state", "save", "archive"]) {
      if (isObj(j) && isObj(j[key])) { const r = unwrapSave(j[key]); if (r) return r; }
    }
    if (isObj(j)) for (const k in j) if (isObj(j[k]) && isObj(j[k].profile)) return j[k];
    return null;
  }

  let D = load();
  function load() {
    try {
      const r = localStorage.getItem(STORE);
      if (r) {
        const d = JSON.parse(r);
        const n = normalize(d);          // 不再硬卡 __v，旧版本档也能读
        if (n) return n;
      }
    } catch (e) {}
    const s = demo();
    try { localStorage.setItem(STORE, JSON.stringify(s)); } catch (e) {}
    return s;
  }
  function save() {
    try { localStorage.setItem(STORE, JSON.stringify(D)); } catch (e) {}
    if (SYNC_URL) {
      clearTimeout(save._t);
      save._t = setTimeout(() => { try { syncPush(true); } catch (e) {} }, 800);
    }
  }
  /* ============ 云端同步（手机 ↔ 电脑） ============ */
  function syncPush(silent) {
    if (!SYNC_URL) { if (!silent) toast("未配置同步地址", "warn"); return; }
    fetch(SYNC_URL, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(D) })
      .then((r) => { if (!r.ok) throw new Error("bad status"); if (!silent) toast("已同步到云端"); const s = $("#syncStatus"); if (s) s.textContent = "已同步 · " + new Date().toLocaleTimeString("zh-CN"); })
      .catch(() => { if (!silent) toast("同步失败（检查地址/CORS）", "warn"); });
  }
  function syncPull(cb) {
    if (!SYNC_URL) { cb && cb(); return; }
    fetch(SYNC_URL).then((r) => { if (!r.ok) throw new Error("bad"); return r.json(); }).then((j) => {
      const n = normalize(j);
      if (!n) { toast("云端数据不是有效存档", "warn"); cb && cb(); return; }
      D = n; save();
      const s = $("#syncStatus"); if (s) s.textContent = "已从云端拉取 · " + new Date().toLocaleTimeString("zh-CN");
      toast("已从云端拉取最新数据"); cb && cb();
    }).catch(() => { toast("拉取失败（检查地址/CORS）", "warn"); cb && cb(); });
  }

  /* ============ 营养目标计算（兼顾减脂保肌 + 增肌） ============ */
  // 融合三个 skill 知识（麦当劳营养查询 / 腾讯医典 / 运动康复）+
  // 运动营养共识（ISSN 2017, ACSM）：减脂期保肌蛋白 1.6-2.4 g/kg；增肌 1.6-2.2 g/kg → 取 2.0 g/kg 两者兼顾
  // 脂肪占总能量 25-35%（低碳日偏高、高碳日偏低）；训练者高蛋白饮食胆固醇上限收紧
  // 每周训练次数 → 活动系数（不用自己算系数）
  const ACT_DESC = { 1.2: "久坐 · 几乎不练", 1.375: "轻度 · 每周1-2练", 1.55: "中度 · 每周3-4练", 1.725: "高度 · 每周5-6练", 1.9: "极高 · 天天练" };
  function freqToAct(n) { n = +n || 0; if (n <= 0) return 1.2; if (n <= 2) return 1.375; if (n <= 4) return 1.55; if (n <= 6) return 1.725; return 1.9; }
  function actToFreq(a) { a = +a || 1.725; const bands = [[1.2, 0], [1.375, 2], [1.55, 4], [1.725, 6], [1.9, 7]]; let best = 6, diff = 1e9; for (const [act, f] of bands) { const d = Math.abs(a - act); if (d < diff) { diff = d; best = f; } } return best; }
  function computeTargetsFromParams(p) {
    const g = p.gender || "male", age = p.age || 27, h = p.height || 171.5, w = p.weight || 66.4, act = p.activity || 1.725;
    // 每日平均热量缺口（kcal）：正=减脂缺口，0=维持，负=增肌盈余；默认 300 减脂
    const dailyGap = +p.gap || 0;
    const bmr = g === "male" ? 10 * w + 6.25 * h - 5 * age + 5 : 10 * w + 6.25 * h - 5 * age - 161;
    const tdee = Math.round(bmr * act);
    const weeklyDeficit = dailyGap * 7; // 周总缺口（kcal）

    /* 周缺口在 7 天分配（每周固定：2高碳训练日 + 2中碳 + 3低碳休息日）：
       训练日缺口小（甚至略盈余保住增肌信号），休息日缺口大（脂肪氧化） */
    const gapHigh = Math.round(-Math.min(80, Math.abs(dailyGap) * 0.25));  // 训练日可少量盈余 / 小缺口
    const gapMid = Math.round(dailyGap * 0.65);
    const gapLow = Math.round((weeklyDeficit - 2 * gapHigh - 2 * gapMid) / 3);

    const calHigh = tdee - gapHigh, calMid = tdee - gapMid, calLow = tdee - gapLow;

    /* 宏量营养素（按体重 g/kg，兼顾增肌与减脂保肌）：
       蛋白质 2.0 g/kg：ISSN 共识上限内，训练日肌蛋白合成最大化
       脂肪 高碳日 0.8 / 中碳 0.9 / 低碳 1.0 g/kg：训练日碳水更多 → 脂肪偏低 */
    const protein = Math.round(w * 2.0);
    const fatHigh = Math.round(w * 0.8);
    const fatMid = Math.round(w * 0.9);
    const fatLow = Math.round(w * 1.0);

    const carbs = (cal, fat) => Math.max(0, Math.round((cal - protein * 4 - fat * 9) / 4));

    /* 胆固醇 + 嘌呤：训练者高蛋白饮食（蛋黄/海鲜/动物内脏）实际摄入偏高，
       胆固醇上限收紧至 300 mg/天（中国营养学会推荐），嘌呤 600 mg/天留余地 */
    return {
      high: { calories: calHigh, carbs: carbs(calHigh, fatHigh), protein, fat: fatHigh, cholesterol: 300, purine: 600 },
      mid: { calories: calMid, carbs: carbs(calMid, fatMid), protein, fat: fatMid, cholesterol: 300, purine: 600 },
      low: { calories: calLow, carbs: carbs(calLow, fatLow), protein, fat: fatLow, cholesterol: 300, purine: 600 },
      tdee, bmr,
      dailyGap, weeklyDeficit,
      gapHigh, gapMid, gapLow,
      avgGap: Math.round((gapLow * 3 + gapHigh * 2 + gapMid * 2) / 7),
      proteinPerKg: 2.0,
      fatHigh, fatMid, fatLow,
    };
  }
  function targets() { return computeTargetsFromParams(D.profile.body); }
  function carbTypeOf(ds) { return CARB_MAP[dateFromStr(ds).getDay()] || "mid"; }
  function dayTarget(ds) { const ty = carbTypeOf(ds); return Object.assign({ type: ty, label: CARB_LABEL[ty], train: CARB_TRAIN[ty] }, targets()[ty]); }

  /* ============ 营养记录聚合 ============ */
  function dayMeals(ds) { if (!D.nutrition.daily[ds]) D.nutrition.daily[ds] = { breakfast: [], lunch: [], dinner: [], snack: [] }; return D.nutrition.daily[ds]; }
  function intakeOf(ds) {
    const d = dayMeals(ds); let t = { calories: 0, carbs: 0, protein: 0, fat: 0, cholesterol: 0, purine: 0, count: 0 };
    MEALS.forEach((m) => (d[m.k] || []).forEach((it) => {
      t.calories += +it.calories || 0; t.carbs += +it.carbs || 0; t.protein += +it.protein || 0;
      t.fat += +it.fat || 0; t.cholesterol += +it.cholesterol || 0; t.purine += +it.purine || 0; t.count++;
    }));
    t.calories = Math.round(t.calories); t.carbs = Math.round(t.carbs * 10) / 10; t.protein = Math.round(t.protein * 10) / 10; t.fat = Math.round(t.fat * 10) / 10;
    return t;
  }
  function mealIntake(ds, mk) { return (dayMeals(ds)[mk] || []).reduce((s, it) => { s.calories += +it.calories || 0; return s; }, { calories: 0 }); }
  function latestWeight() { const w = (D.nutrition.weight || []).slice().sort((a, b) => a.date.localeCompare(b.date)); return w.length ? w[w.length - 1] : null; }

  /* ============ 财务聚合 ============ */
  function cmk(d) { const x = d || new Date(); return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}`; }
  function aTot() { return Object.values(D.finance.bals).reduce((s, v) => s + (+v || 0), 0); }
  function iTot() { return D.finance.invs.reduce((s, i) => s + (+i.cv || 0), 0); }
  function dTot() { return D.finance.debts.reduce((s, d) => s + (+d.amt || 0), 0); }
  function hTot() { return Object.values(D.finance.hfund).reduce((s, v) => s + (+v || 0), 0); }
  function sTot() { return Object.values(D.finance.sfund).reduce((s, v) => s + (+v || 0), 0); }
  /* 工资 / 公积金 / 社保 逐月发放·缴存记录列表 */
  function fundRow(listSel, entries, fmtFn, onDel) {
    const el = $(listSel); if (!el) return;
    el.innerHTML = entries.length
      ? entries.map(([m, v]) => `<div class="row"><div class="row-main"><div class="row-title">${m.replace("-", "年")}月</div></div><span class="num" style="font-weight:800;">${fmtFn(v)}</span><button class="mi-del" data-m="${m}">×</button></div>`).join("")
      : emptyState('📭', '暂无记录', '开始记录你的第一笔数据吧', null, null);
    $$(listSel + " [data-m]").forEach((b) => (b.onclick = () => onDel(b.dataset.m)));
  }
  function renderFundLists() {
    const desc = (a, b) => b[0].localeCompare(a[0]);
    const sal = Object.entries(D.finance.msets || {}).filter(([, v]) => (v && +v.salary || 0) > 0).map(([m, v]) => [m, +v.salary]).sort(desc);
    const hf = Object.entries(D.finance.hfund || {}).filter(([, v]) => (+v || 0) > 0).sort(desc);
    const sf = Object.entries(D.finance.sfund || {}).filter(([, v]) => (+v || 0) > 0).sort(desc);
    fundRow("#salList", sal, MM, (m) => { delete D.finance.msets[m]; save(); renderFinance(); refreshFinCharts(); toast("已删除"); });
    fundRow("#houList", hf, MM, (m) => { delete D.finance.hfund[m]; save(); renderFinance(); toast("已删除"); });
    fundRow("#sfList", sf, MM2, (m) => { delete D.finance.sfund[m]; save(); renderFinance(); toast("已删除"); });
  }
  function flexOf(mk) { return +(D.finance.msets[mk] && D.finance.msets[mk].flexible) || 0; }
  function netWorth() { return aTot() + flexOf(cmk()) + iTot() + hTot() + sTot() - dTot(); }
  function gms(mk) { return D.finance.msets[mk] || { salary: 0, flexible: 0 }; }
  function txnsOf(mk) { return D.finance.txns.filter((t) => t.date && t.date.startsWith(mk)); }
  function allMonths() { const s = new Set(Object.keys(D.finance.msets)); D.finance.txns.forEach((t) => { if (t.date && t.date.length >= 7) s.add(t.date.slice(0, 7)); }); s.add(cmk()); return Array.from(s).sort(); }
  function monthSummary(mk) {
    const st = gms(mk); const tx = txnsOf(mk); let ti = 0, te = 0; const ec = {}, ic = {};
    tx.forEach((t) => { const a = +t.amt || 0; if (t.type === "income") { ti += a; ic[t.cat] = (ic[t.cat] || 0) + a; } else { te += a; ec[t.cat] = (ec[t.cat] || 0) + a; } });
    const sal = +st.salary || 0; if (sal > 0) ic["月薪"] = (ic["月薪"] || 0) + sal;
    return { sal, inc: sal + ti, exp: te, bal: sal + ti - te, ec, ic };
  }

  /* ============ Toast ============ */
  let toastT;
  function toast(msg, type = "ok") { const el = $("#toast"); el.textContent = msg; el.className = "toast on toast-" + type; clearTimeout(toastT); toastT = setTimeout(() => (el.className = "toast"), 1800); }

  /* ============ 空状态工厂（增强版） ============ */
  function emptyState(icon, title, desc, actionText, actionOnClick) {
    const actionHtml = actionText
      ? `<button class="empty-action" data-empty-action="1">${actionText}</button>`
      : '';
    return `<div class="empty-state">
      <div class="empty-icon">${icon}</div>
      <div class="empty-title">${title}</div>
      <div class="empty-desc">${desc}</div>
      ${actionHtml}
    </div>`;
  }

  /* ============ Modal ============ */
  function openModal(title, html, onConfirm) {
    $("#modalTitle").innerHTML = title; $("#modalBody").innerHTML = html; $("#overlay").classList.add("on");
    const f = $("#modalBody form");
    if (f && onConfirm) f.onsubmit = (e) => { e.preventDefault(); if (onConfirm(new FormData(f)) !== false) closeModal(); };
  }
  function closeModal() { $("#overlay").classList.remove("on"); }

  /* ============ 图表 ============ */
  function setupCanvas(cv, h) {
    const dpr = window.devicePixelRatio || 1;
    const w = cv.clientWidth || cv.parentElement.clientWidth || 320;
    cv.style.height = h + "px"; cv.width = w * dpr; cv.height = h * dpr;
    const ctx = cv.getContext("2d"); ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, w, h);
    return { ctx, w, h };
  }
  function chartTheme() {
    const cs = getComputedStyle(document.documentElement);
    const g = (n, d) => (cs.getPropertyValue(n).trim() || d);
    return { grid: g('--chart-grid', '#eef0f4'), text: g('--chart-text', '#64748b'), donut: g('--chart-donut', '#fff') };
  }
  function drawLine(cv, series, opt = {}) {
    const { ctx, w, h } = setupCanvas(cv, opt.h || 220);
    const pad = { l: 44, r: 14, t: 18, b: 28 }; const cw = w - pad.l - pad.r, ch = h - pad.t - pad.b;
    const all = series.flatMap((s) => s.data.filter((v) => v != null));
    const min = opt.min != null ? opt.min : Math.min(...all, 0);
    const max = opt.max != null ? opt.max : Math.max(...all);
    const span = max - min || 1;
    const xAt = (i, n) => pad.l + (n <= 1 ? cw / 2 : (cw * i) / (n - 1));
    const yAt = (v) => pad.t + ch - ((v - min) / span) * ch;
    const ct = chartTheme();
    ctx.font = "11px sans-serif"; ctx.strokeStyle = ct.grid; ctx.lineWidth = 1;
    for (let g = 0; g <= 3; g++) { const yy = pad.t + (ch * g) / 3; const val = min + (span * (3 - g)) / 3; ctx.beginPath(); ctx.moveTo(pad.l, yy); ctx.lineTo(w - pad.r, yy); ctx.stroke(); ctx.fillStyle = ct.text; ctx.textAlign = "right"; ctx.fillText(opt.fmtY ? opt.fmtY(val) : Math.round(val), pad.l - 6, yy + 4); }
    series.forEach((s) => {
      const pts = s.data.map((v, i) => ({ x: xAt(i, s.data.length), y: v == null ? null : yAt(v), v }));
      if (s.fill) { ctx.beginPath(); let started = false; pts.forEach((p) => { if (p.y == null) return; started ? ctx.lineTo(p.x, p.y) : (ctx.moveTo(p.x, p.y), started = true); }); if (started) { ctx.lineTo(pts[pts.length - 1].x, pad.t + ch); ctx.lineTo(pts[0].x, pad.t + ch); ctx.closePath(); ctx.fillStyle = s.fill; ctx.fill(); } }
      ctx.beginPath(); let pen = false; pts.forEach((p) => { if (p.y == null) { pen = false; return; } pen ? ctx.lineTo(p.x, p.y) : (ctx.moveTo(p.x, p.y), pen = true); });
      ctx.strokeStyle = s.color; ctx.lineWidth = 2.4; ctx.lineJoin = "round"; ctx.stroke();
      pts.forEach((p) => { if (p.y == null) return; ctx.beginPath(); ctx.arc(p.x, p.y, 3, 0, Math.PI * 2); ctx.fillStyle = s.color; ctx.fill(); ctx.beginPath(); ctx.arc(p.x, p.y, 1.4, 0, Math.PI * 2); ctx.fillStyle = "#fff"; ctx.fill(); });
    });
    const labels = series[0].labels || [];
    ctx.fillStyle = ct.text; ctx.textAlign = "center"; labels.forEach((lb, i) => { if (labels.length <= 8 || i % Math.ceil(labels.length / 7) === 0 || i === labels.length - 1) ctx.fillText(lb, xAt(i, labels.length), h - 10); });

    // 返回数据点位置信息（用于 Tooltip）
    return { pts: series[0].data.map((v, i) => ({ x: xAt(i, series[0].data.length), y: v == null ? null : yAt(v), v, label: labels[i] })), pad, cw, ch };
  }

  /* 带 Tooltip 的折线图（增强版） */
  function drawLineWithTooltip(cv, series, opt = {}) {
    const info = drawLine(cv, series, opt);
    if (!info || !info.pts) return;

    const tooltip = new ChartTooltip(cv);
    const rect = cv.getBoundingClientRect();

    cv.onmousemove = (e) => {
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      // 找最近的数据点
      let nearest = null;
      let minDist = Infinity;
      info.pts.forEach((p) => {
        if (p.y == null) return;
        const dist = Math.sqrt(Math.pow(p.x - mx, 2) + Math.pow(p.y - my, 2));
        if (dist < minDist && dist < 30) { minDist = dist; nearest = p; }
      });
      if (nearest) {
        tooltip.show(nearest.x, nearest.y, `${nearest.label}: ${opt.tooltipFmt ? opt.tooltipFmt(nearest.v) : nearest.v}`);
        cv.style.cursor = 'pointer';
      } else {
        tooltip.hide();
        cv.style.cursor = 'default';
      }
    };
    cv.onmouseleave = () => { tooltip.hide(); cv.style.cursor = 'default'; };
  }
  function drawDoughnut(cv, items, opt = {}) {
    const { ctx, w, h } = setupCanvas(cv, opt.h || 230);
    const hasLabels = !(items.length === 1 && items[0].label === "无");
    const sidePad = hasLabels ? 64 : 14;
    const cx = w / 2, cy = h / 2, R = Math.max(30, Math.min(w / 2 - sidePad, h / 2 - 14)), r = R * 0.58;
    const total = items.reduce((s, i) => s + i.value, 0) || 1;
    const ct = chartTheme();
    let a = -Math.PI / 2;
    const segs = [];
    items.forEach((it) => {
      const ang = (it.value / total) * Math.PI * 2;
      ctx.beginPath(); ctx.moveTo(cx, cy); ctx.arc(cx, cy, R, a, a + ang); ctx.closePath(); ctx.fillStyle = it.color; ctx.fill();
      segs.push({ it, mid: a + ang / 2, pct: it.value / total });
      a += ang;
    });
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fillStyle = ct.donut; ctx.fill();
    ctx.fillStyle = ct.text; ctx.font = "800 16px sans-serif"; ctx.textAlign = "center"; ctx.fillText(opt.center || fmt(total), cx, cy - 4);
    ctx.fillStyle = ct.text; ctx.font = "11px sans-serif"; ctx.fillText(opt.centerSub || "合计", cx, cy + 13);
    /* 外部引线标注：名称 + 百分比，左右分列、纵向防重叠 */
    if (hasLabels) {
      const labeled = segs.filter((s) => s.pct >= 0.02);
      const Re = R + 8, elbow = R + 20;
      const sides = { left: [], right: [] };
      labeled.forEach((s) => {
        const cos = Math.cos(s.mid), sin = Math.sin(s.mid);
        const side = cos >= 0 ? "right" : "left";
        sides[side].push({ s, x0: cx + R * cos, y0: cy + R * sin, x1: cx + Re * cos, y1: cy + Re * sin, y: cy + elbow * sin });
      });
      ctx.font = "11px sans-serif"; ctx.lineWidth = 1;
      [["left", 6, "left"], ["right", w - 6, "right"]].forEach(([side, lx, align]) => {
        const arr = sides[side].sort((p, q) => p.y - q.y);
        const gap = 15;
        for (let i = 1; i < arr.length; i++) if (arr[i].y < arr[i - 1].y + gap) arr[i].y = arr[i - 1].y + gap;
        for (let i = arr.length - 1; i >= 0; i--) { const maxY = h - 10 - (arr.length - 1 - i) * gap; if (arr[i].y > maxY) arr[i].y = maxY; }
        arr.forEach((p) => {
          const dir = side === "right" ? 1 : -1;
          const xLine = lx + dir * -4;
          ctx.strokeStyle = ct.text; ctx.globalAlpha = 0.45;
          ctx.beginPath(); ctx.moveTo(p.x0, p.y0); ctx.lineTo(p.x1, p.y1); ctx.lineTo(xLine, p.y); ctx.stroke();
          ctx.globalAlpha = 1;
          ctx.beginPath(); ctx.arc(p.x0, p.y0, 2, 0, Math.PI * 2); ctx.fillStyle = p.s.it.color; ctx.fill();
          let name = String(p.s.it.label); if (name.length > 6) name = name.slice(0, 6) + "…";
          ctx.fillStyle = ct.text; ctx.textAlign = align;
          ctx.fillText(`${name} ${FIN.on ? "¥••••" : "¥" + fmt(p.s.it.value)}`, lx, p.y + 4);
        });
      });
      ctx.textAlign = "left";
    }
  }
  function drawBar(cv, labels, datasets, opt = {}) {
    const { ctx, w, h } = setupCanvas(cv, opt.h || 270);
    const pad = { l: 48, r: 14, t: 18, b: 28 }; const cw = w - pad.l - pad.r, ch = h - pad.t - pad.b;
    const all = datasets.flatMap((d) => d.data); const max = Math.max(...all, 1) * 1.1;
    const ct = chartTheme();
    ctx.font = "11px sans-serif"; ctx.textAlign = "right";
    for (let g = 0; g <= 3; g++) { const v = (max / 3) * (3 - g); const yy = pad.t + (ch * g) / 3; ctx.strokeStyle = ct.grid; ctx.beginPath(); ctx.moveTo(pad.l, yy); ctx.lineTo(w - pad.r, yy); ctx.stroke(); ctx.fillStyle = ct.text; ctx.fillText(v >= 10000 ? (v / 10000).toFixed(1) + "万" : Math.round(v), pad.l - 6, yy + 4); }
    const n = labels.length, gp = cw / n, bw = Math.min(22, gp * 0.45);
    labels.forEach((lb, i) => {
      const x = pad.l + gp * i + gp / 2;
      datasets.forEach((ds, di) => {
        const v = ds.data[i] || 0; const bh = (v / max) * ch; const bx = x - bw / 2 + (di - (datasets.length - 1) / 2) * (bw + 3);
        ctx.fillStyle = ds.color; ctx.fillRect(bx, pad.t + ch - bh, bw, bh);
      });
      ctx.fillStyle = ct.text; ctx.textAlign = "center"; ctx.fillText(lb, x, h - 10);
    });
    ctx.textAlign = "left";
  }

  /* ============ 进度环 ============ */
  function ring(pct, color, unit) {
    const r = 56, c = 2 * Math.PI * r, off = c * (1 - clamp(pct, 0, 1));
    return `<div class="ring-wrap"><svg viewBox="0 0 132 132"><circle class="ring-bg" cx="66" cy="66" r="${r}"></circle><circle class="ring-prog" cx="66" cy="66" r="${r}" stroke="${color}" stroke-dasharray="${c}" stroke-dashoffset="${off}"></circle></svg><div class="ring-center"><div class="ring-pct" style="color:${pct > 1 ? "#f43f5e" : color}">${Math.round(pct * 100)}%</div><div class="ring-unit">${unit}</div></div></div>`;
  }

  /* ============ 身体趋势数据 ============ */
  function sortedWeight() { return (D.nutrition.weight || []).slice().sort((a, b) => a.date.localeCompare(b.date)); }
  function bodyTrendData(days) {
    const all = sortedWeight();
    if (!all.length) return { labels: [], weight: [], fat: [], muscle: [] };
    const end = new Date();
    const series = [];
    if (days === 365) {
      const now = new Date(); const months = [];
      for (let i = 11; i >= 0; i--) { const d = new Date(now.getFullYear(), now.getMonth() - i, 1); months.push(d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0")); }
      const byMonth = {};
      all.forEach((r) => { const m = r.date.slice(0, 7); (byMonth[m] = byMonth[m] || []).push(r); });
      const avg = (m, f) => { const a = byMonth[m]; if (!a) return null; return +((a.reduce((s, r) => s + f(r), 0) / a.length)).toFixed(1); };
      return {
        labels: months.map((m) => +m.split("-")[1] + "月"),
        weight: months.map((m) => avg(m, (r) => r.weight)),
        fat: months.map((m) => avg(m, (r) => r.weight * r.fatRate / 100)),
        muscle: months.map((m) => avg(m, (r) => r.weight * r.muscleRate / 100)),
      };
    }
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(); d.setDate(d.getDate() - i); const ds = dstr(d);
      const rec = all.slice().reverse().find((r) => r.date <= ds);
      series.push({ label: ds.slice(5).replace("-", "/"), date: ds, rec });
    }
    return {
      labels: series.map((x) => x.label),
      weight: series.map((x) => x.rec ? x.rec.weight : null),
      fat: series.map((x) => x.rec ? +(x.rec.weight * x.rec.fatRate / 100).toFixed(1) : null),
      muscle: series.map((x) => x.rec ? +(x.rec.weight * x.rec.muscleRate / 100).toFixed(1) : null),
    };
  }

  /* ============ 渲染：总览 ============ */
  function renderOverview() {
    finApplyClass();
    const t = effectiveToday();  // 使用"有效今天"（凌晨 3 点前算昨天）
    const tg = dayTarget(t); const inT = intakeOf(t);
    const wToday = (D.nutrition.weight || []).some((x) => x.date === t);
    const water = (D.nutrition.water[t] || {}).water || 0;
    const nw = netWorth(); const ms = monthSummary(cmk());

    const wArr = (D.nutrition.weight || []).slice().sort((a, b) => a.date.localeCompare(b.date));
    const lw = wArr.length ? wArr[wArr.length - 1] : null;
    const wPrev = wArr.length > 1 ? wArr[wArr.length - 2] : null;
    const fatMass = (r) => (r && r.weight && r.fatRate != null) ? +(r.weight * r.fatRate / 100).toFixed(1) : null;
    const musMass = (r) => (r && r.weight && r.muscleRate != null) ? +(r.weight * r.muscleRate / 100).toFixed(1) : null;
    const ud = (c, p) => {
      if (c == null || p == null) return `<span class="card-sub">—</span>`;
      const d = +(c - p).toFixed(1);
      if (d > 0) return `<span style="color:#f43f5e;font-weight:800;">↑ +${d}</span>`;
      if (d < 0) return `<span style="color:#10b981;font-weight:800;">↓ ${d}</span>`;
      return `<span style="color:#64748b;">→ 0</span>`;
    };
    const calPct = clamp(inT.calories / tg.calories, 0, 1);
    const ctype = carbTypeOf(t);

    $("#body-overview").innerHTML = `
      <div class="demo-badge">本地优先 · 数据存浏览器</div>

      <!-- 大号日期 -->
      <div class="ov-date">
        <div class="ov-date-d">${new Date().getDate()}</div>
        <div class="ov-date-m">${new Date().getFullYear()}年${new Date().getMonth() + 1}月 · 周${WK[new Date().getDay()]}</div>
        <div class="ov-date-hi">${esc(D.profile.name)}，今天也要掌控好</div>
      </div>

      <!-- 一键直达：置顶 -->
      <div class="card">
        <div class="card-head"><div class="card-title">今日动线 · 一键直达</div><span class="card-sub">按你的日常顺序</span></div>
        <div class="flow-bar">
          <button class="flow-btn" data-q="weight">🐖 体重</button>
          <button class="flow-btn" data-q="calendar">📅 日历</button>
          <button class="flow-btn" data-q="meal">🍣 餐食</button>
          <button class="flow-btn" data-q="finance">💎 记账</button>
          <button class="flow-btn" data-q="punchIn">🕗 打卡</button>
          <button class="flow-btn" data-q="water">🥃 喝水</button>
        </div>
      </div>

      <!-- 体重看板（提前到营养之前） -->
      <div class="card mt-3" data-nav="weight" style="cursor:pointer;">
        <div class="card-head"><div class="card-title">⚖️ 身体指标</div><span class="card-sub">${lw ? "更新于 " + lw.date.slice(5) : "还没有记录"}</span></div>
        <div class="ov-body-row">
          <div class="stat"><div class="stat-label">体重</div><div class="stat-value">${lw ? lw.weight : "--"}<span class="unit">kg</span></div><div class="stat-foot">${ud(lw && lw.weight, wPrev && wPrev.weight)}</div></div>
          <div class="stat"><div class="stat-label">脂肪量</div><div class="stat-value">${lw && fatMass(lw) != null ? fatMass(lw) : "--"}<span class="unit">kg</span></div><div class="stat-foot">体脂 ${lw ? lw.fatRate : "--"}% · ${ud(lw && fatMass(lw), wPrev && fatMass(wPrev))}</div></div>
          <div class="stat"><div class="stat-label">肌肉量</div><div class="stat-value">${lw && musMass(lw) != null ? musMass(lw) : "--"}<span class="unit">kg</span></div><div class="stat-foot">肌肉 ${lw ? lw.muscleRate : "--"}% · ${ud(lw && musMass(lw), wPrev && musMass(wPrev))}</div></div>
        </div>
      </div>

      <!-- 今日营养 -->
      <div class="card mt-3" data-nav="nutrition" style="cursor:pointer;">
        <div class="card-head"><div class="card-title">🔥 今日营养</div><span class="tag carb-${ctype}">${carbIcon(ctype)} ${CARB_LABEL[ctype]}</span></div>
        <div class="ovnc">
          <div class="ovnc-row">
            <div class="card-value" style="font-size:18px;">${Math.round(calPct * 100)}% <span class="unit" style="font-size:13px;font-weight:600;">已摄入</span></div>
            <div class="card-sub">剩 <b style="color:#10b981;font-size:15px;">${Math.max(0, tg.calories - inT.calories)}</b> kcal</div>
          </div>
          <div class="bar mt-2"><div class="bar-fill" style="width:${Math.round(clamp(calPct, 0, 1) * 100)}%;background:${inT.calories > tg.calories ? "linear-gradient(90deg,#fb7185,#f43f5e)" : "linear-gradient(90deg,#34d399,#10b981)"};"></div></div>
          <div class="ovnc-foot">目标 ${tg.calories} · 已吃 ${inT.calories} kcal · ${CARB_TRAIN[ctype]}</div>
        </div>
      </div>

      <!-- 今日饮水（独立看板） -->
      <div class="card mt-3" data-nav="water" style="cursor:pointer;">
        <div class="card-head"><div class="card-title">🥃 今日饮水</div><span class="card-sub">目标 2000 ml</span></div>
        <div style="display:flex;align-items:baseline;gap:8px;">
          <span class="card-value" style="color:var(--blue);font-size:26px;">${fmt(water)}</span>
          <span class="card-sub">/ 2000 ml · ${Math.round(clamp(water / 2000, 0, 1) * 100)}%</span>
        </div>
        <div class="bar mt-2"><div class="bar-fill" style="width:${Math.round(clamp(water / 2000, 0, 1) * 100)}%;background:linear-gradient(90deg,#38bdf8,#2563eb);"></div></div>
      </div>

      <!-- 今日待办 -->
      <div class="card mt-3">
        <div class="card-head"><div class="card-title">📋 今日待办</div><span class="card-sub" id="ovTodoCount"></span></div>
        <div id="ovTodo"></div>
        <div style="display:flex;gap:8px;margin-top:10px;">
          <input id="todoInput" placeholder="添加一条待办…" style="flex:1;padding:8px 10px;border-radius:8px;border:1px solid var(--border);">
          <button class="btn btn-sm btn-primary" id="todoAdd">添加</button>
        </div>
      </div>

      <!-- 账户余额卡片化看板（点标题跳财务页） -->
      <div class="card mt-3" data-nav="finance" style="cursor:pointer;">
        <div class="card-head"><div class="card-title">账户余额</div><span class="card-sub" style="font-weight:700;color:var(--accent);">${MM(aTot())}</span></div>
        <div class="acct-grid" id="ovAcctGrid"></div>
      </div>`;

    $$("#body-overview [data-nav]").forEach((b) => (b.onclick = () => navigate(b.dataset.nav)));
    $$("#body-overview [data-finlock]").forEach((b) => (b.onclick = (e) => { e.stopPropagation(); finToggle(); }));

    $$("#body-overview [data-q]").forEach((b) => (b.onclick = () => {
      const q = b.dataset.q;
      if (q === "weight") quickWeightModal();
      else if (q === "calendar") navigate("calendar");
      else if (q === "meal") { curMealDate = todayStr(); openModal("添加餐食", `<div class="meal-pick"><button class="flow-btn" data-mk="breakfast">🍳 早餐</button><button class="flow-btn" data-mk="lunch">🍱 午餐</button><button class="flow-btn" data-mk="dinner">🍲 晚餐</button><button class="flow-btn" data-mk="snack">🍎 加餐</button></div>`); $$("#modalBody [data-mk]").forEach((b) => b.onclick = () => { const k = b.dataset.mk; closeModal(); addMealModal(k); }); }
      else if (q === "punchIn") punchModal();
      else if (q === "finance") quickTxnModal();
      else if (q === "water") quickWaterModal();
    }));

    const todos = D.profile.todos || [];
    const doneN = todos.filter((x) => x.done).length;
    $("#ovTodoCount").textContent = `${doneN}/${todos.length}`;
    $("#ovTodo").innerHTML = todos.length ? todos.map((x) => `<div class="todo-row ${x.done ? "done" : ""}">
      <button class="todo-check" data-todook="${x.id}">${x.done ? "✓" : ""}</button>
      <div class="todo-text">${esc(x.text)}</div>
      <button class="mi-del" data-tododel="${x.id}" title="删除">×</button>
    </div>`).join("") : `<div class="card-sub">还没有待办，下面加一条吧</div>`;
    // 事件委托：待办勾选/删除
    $("#ovTodo").onclick = (e) => {
      const tgt = e.target;
      if (tgt.dataset.todook) {
        const it = (D.profile.todos || []).find((x) => x.id === tgt.dataset.todook); if (!it) return;
        it.done = !it.done; save(); renderOverview();
      } else if (tgt.dataset.tododel) {
        D.profile.todos = (D.profile.todos || []).filter((x) => x.id !== tgt.dataset.tododel); save(); renderOverview();
      }
    };
    $("#todoAdd").onclick = () => {
      const v = $("#todoInput").value.trim(); if (!v) return;
      if (!D.profile.todos) D.profile.todos = [];
      D.profile.todos.push({ id: "td" + Date.now(), text: v, done: false });
      save(); renderOverview();
    };
    $("#todoInput").onkeydown = (e) => { if (e.key === "Enter") $("#todoAdd").click(); };

    /* 渲染总览的账户余额卡 + 资产构成条（与财务页共用 renderAssets） */
    renderAssets();
    animateNumbers($("#body-overview"));
  }
  function quickWeightModal() {
    openModal("记录体重", `
      <div class="form form-2">
        <div class="fld"><label>日期</label><input type="date" id="qwDate" value="${todayStr()}"></div>
        <div class="fld"><label>体重 kg</label><input type="number" id="qwW" step="0.1" placeholder="0"></div>
        <div class="fld"><label>体脂 %</label><input type="number" id="qwF" step="0.1" placeholder="0"></div>
        <div class="fld"><label>肌肉 %</label><input type="number" id="qwM" step="0.1" placeholder="0"></div>
      </div>
      <button class="btn btn-primary w-full mt-2" id="qwSave">保存</button>`);
    $("#qwSave").onclick = () => {
      const date = $("#qwDate").value, w = parseFloat($("#qwW").value);
      if (!date || isNaN(w)) { toast("请填写日期和体重", "warn"); return; }
      D.profile.body.weight = w;
      D.nutrition.weight = (D.nutrition.weight || []).filter((x) => x.date !== date);
      D.nutrition.weight.push({ date, weight: w, fatRate: parseFloat($("#qwF").value) || 0, muscleRate: parseFloat($("#qwM").value) || 0 });
      save(); renderAll(); toast("体重已保存 · 已同步目标"); closeModal();
    };
  }
  function punchNow(key) {
    const t = todayStr(); punchRec(t).times[key] = nowHM(); save(); renderPunch(); renderOverview();
    const st = PUNCH_STEPS.find((s) => s.key === key);
    toast("已记录 " + (st ? st.label : key) + " " + nowHM());
  }
  // 一键工作流：弹窗选段次 + 时间，写入对应段，自动同步到打卡界面
  function punchModal() {
    const t = todayStr(); const tm = (punchRec(t).times) || {};
    let sel = null;
    const segs = PUNCH_STEPS.map((s) => `<button class="pseg" data-seg="${s.key}"><div class="pseg-ic">${s.emoji}</div><div class="pseg-l">${s.label}</div><div class="pseg-t">${tm[s.key] || "未打卡"}</div></button>`).join("");
    openModal("打卡", `
      <div class="pseg-grid">${segs}</div>
      <div id="pTimeWrap" style="display:none;margin-top:14px;">
        <label style="display:block;margin-bottom:6px;color:var(--slate);">选择时间（默认当前时刻）</label>
        <div style="display:flex;gap:8px;align-items:center;">
          <input type="time" id="pTime" class="punch-time" style="flex:1;">
          <button class="btn btn-sm btn-ghost" id="pNow">现在</button>
        </div>
        <div style="display:flex;gap:8px;margin-top:14px;justify-content:flex-end;">
          <button class="btn btn-ghost" id="pCancel">取消</button>
          <button class="btn btn-primary" id="pOk">确认打卡</button>
        </div>
      </div>
      <div id="pHint" class="card-sub mt-2">请选择要打卡的时段</div>`);
    const wrap = $("#pTimeWrap"), hint = $("#pHint"), timeInp = $("#pTime");
    $$("#modalBody .pseg").forEach((b) => (b.onclick = () => {
      sel = b.dataset.seg;
      timeInp.value = (punchRec(t).times || {})[sel] || nowHM();
      wrap.style.display = "block"; hint.textContent = "已选：" + PUNCH_STEPS.find((x) => x.key === sel).label;
      $$("#modalBody .pseg").forEach((x) => x.classList.toggle("active", x === b));
    }));
    $("#pNow").onclick = () => { timeInp.value = nowHM(); };
    $("#pCancel").onclick = () => { sel = null; wrap.style.display = "none"; hint.textContent = "请选择要打卡的时段"; $$("#modalBody .pseg").forEach((x) => x.classList.remove("active")); };
    $("#pOk").onclick = () => {
      if (!sel) { toast("请先选择时段", "warn"); return; }
      const v = timeInp.value || nowHM();
      punchRec(t).times[sel] = v; save(); closeModal(); renderPunch(); renderOverview();
      toast("已记录 " + PUNCH_STEPS.find((x) => x.key === sel).label + " " + v);
    };
  }
  function stat(label, value, foot, page) {
    const nav = page ? ` data-nav="${page}" style="cursor:pointer;"` : "";
    return `<div class="stat"${nav}><div class="stat-label">${label}</div><div class="stat-value">${value}</div><div class="stat-foot">${foot}</div></div>`;
  }

  /* ============ 渲染：营养 ============ */
  let curMealDate = todayStr();
  function shiftMealDate(delta) { const d = dateFromStr(curMealDate); d.setDate(d.getDate() + delta); curMealDate = dstr(d); renderNutrition(); }
  function renderNutrition() {
    const t = curMealDate; const tg = dayTarget(t); const inT = intakeOf(t);
    const MACRO_IC = { carb: "🍚", protein: "🥩", fat: "🧈", chol: "🥚", purine: "🦐" };
    const macro = (cls, name, val, tgt, unit = "g") => {
      const p = tgt ? clamp(val / tgt, 0, 1) : 0; const over = val > tgt;
      return `<div class="macro"><div class="m-icon ${cls}">${MACRO_IC[cls] || name[0]}</div><div class="m-name">${name}</div><div class="m-val">${Math.round(val)}<span class="target"> / ${tgt}${unit}</span></div><div class="bar"><div class="bar-fill" style="width:${p * 100}%;background:${over ? "#f43f5e" : "#10b981"};"></div></div></div>`;
    };
    const mealHTML = MEALS.map((m) => {
      const list = dayMeals(t)[m.k] || [];
      const cal = list.reduce((s, i) => s + (+i.calories || 0), 0);
      const items = list.map((it) => `
        <div class="meal-item">
          <div class="mi-main">
            <div class="mi-name">${esc(it.name)}</div>
            <div class="mi-macros"><span style="color:#64748b">🔥</span> ${Math.round(it.calories)} kcal · <span style="color:#64748b">🍚</span> ${Math.round(it.carbs)}g · <span style="color:#64748b">🥩</span> ${Math.round(it.protein)}g · <span style="color:#64748b">🧈</span> ${Math.round(it.fat)}g · <span style="color:#64748b">🥚</span> ${Math.round(it.cholesterol || 0)}mg · <span style="color:#64748b">🦐</span> ${Math.round(it.purine || 0)}mg</div>
          </div>
          <div class="mi-cal">${Math.round(it.calories)}</div>
          <button class="mi-del" data-editmeal="${m.k}:${it.id}" title="编辑">编</button>
          <button class="mi-del" data-delmeal="${m.k}:${it.id}" title="删除" style="margin-left:4px;">×</button>
        </div>`).join("");
      return `
        <div class="meal-group">
          <div class="meal-group-head">
            <div class="meal-group-title"><span style="color:${m.color}">${ic(m.k)}</span>${m.name}</div>
            <div class="meal-kcal">${Math.round(cal)} kcal</div>
          </div>
          ${list.length ? items : `<div class="empty-state" style="padding:16px 8px;"><div class="empty-icon" style="font-size:32px;">🍽️</div><div class="empty-title" style="font-size:13px;">还没记录</div><div class="empty-desc" style="font-size:11px;">点击下方按钮添加</div></div>`}
          <button class="meal-add-btn" data-addmeal="${m.k}">+ 添加${m.name}</button>
        </div>`;
    }).join("");

    $("#body-nutrition").innerHTML = `
      <div class="demo-badge">本地优先 · 数据存浏览器</div>

      <div class="card" style="display:flex;align-items:center;gap:12px;justify-content:space-between;">
        <div style="display:flex;align-items:center;gap:10px;">
          <button class="cal-nav" id="mdPrev" aria-label="前一天">‹</button>
          <div>
            <div class="card-title" id="mdLabel">${t.slice(5)} · 周${WK[dateFromStr(t).getDay()]}</div>
            <div class="card-sub">${t === todayStr() ? "今天 · 可改历史" : "历史日期 · 可补登 / 修改"}</div>
          </div>
          <button class="cal-nav" id="mdNext" aria-label="后一天">›</button>
        </div>
        <button class="btn btn-sm btn-ghost" id="mdToday">回到今天</button>
      </div>

      <div class="card" style="border-left:4px solid var(--green);">
        <div style="display:flex;gap:20px;align-items:center;flex-wrap:wrap;">
          ${ring(inT.calories / tg.calories, inT.calories > tg.calories ? "#f43f5e" : "#10b981", "热量")}
          <div style="flex:1;min-width:220px;">
            <div class="card-title" style="margin-bottom:6px;">今日营养 · <span class="tag carb-${carbTypeOf(t)}">${carbIcon(carbTypeOf(t))} ${CARB_LABEL[carbTypeOf(t)]}</span></div>
            <div class="card-sub">${WK[dateFromStr(t).getDay()]} · 目标 ${tg.calories} kcal · ${tg.train}</div>
            <div class="card-value" style="margin-top:6px;">${inT.count ? Math.max(0, tg.calories - inT.calories) + " kcal 剩余" : tg.calories + " kcal 目标"}</div>
            <div class="card-sub">已摄入 ${inT.calories} kcal</div>
          </div>
        </div>
      </div>

      <div class="card mt-3">
        <div class="card-head"><div class="card-title">宏量元素</div><span class="card-sub">蛋白质目标固定 145g / 天</span></div>
        <div class="macros">
          ${macro("carb", "碳水", inT.carbs, tg.carbs)}
          ${macro("protein", "蛋白质", inT.protein, tg.protein)}
          ${macro("fat", "脂肪", inT.fat, tg.fat)}
          ${macro("chol", "胆固醇", inT.cholesterol, 500, "mg")}
          ${macro("purine", "嘌呤", inT.purine, 700, "mg")}
        </div>
      </div>

      <div class="card mt-3">
        <div class="card-head"><div class="card-title">${t.slice(5)} 餐食记录</div><span class="card-sub">可补登 / 修改历史</span></div>
        <div class="meal-grid">${mealHTML}</div>
      </div>

      <div class="card mt-3">
        <div class="card-head"><div class="card-title">本周碳循环计划</div></div>
        ${weekPlan()}
      </div>`;

    // 事件
    $("#mdPrev").onclick = () => shiftMealDate(-1);
    $("#mdNext").onclick = () => shiftMealDate(1);
    $("#mdToday").onclick = () => { curMealDate = todayStr(); renderNutrition(); };
    // 事件委托：餐食操作（删除/编辑/添加）
    $("#body-nutrition").onclick = (e) => {
      const d = e.target;
      if (d.dataset.delmeal) { const [mk, id] = d.dataset.delmeal.split(":"); dayMeals(t)[mk] = dayMeals(t)[mk].filter((x) => String(x.id) !== id); save(); renderNutrition(); renderOverview(); }
      else if (d.dataset.editmeal) { const [mk, id] = d.dataset.editmeal.split(":"); editMeal(t, mk, +id); }
      else if (d.dataset.addmeal) addMealModal(d.dataset.addmeal);
    };
  }

  function waterBars(w, lim) {
    const META = {
      water: { label: "水", unit: "ml", color: "#3b82f6" },
      caffeine: { label: "咖啡因", unit: "mg", color: "#c2925c" },
      chlorogenic: { label: "绿原酸", unit: "mg", color: "#6fcf97" },
      theophylline: { label: "茶碱", unit: "mg", color: "#e0b13c" },
    };
    const keys = ["water", "caffeine", "chlorogenic", "theophylline"];
    return keys.map((k) => {
      const m = META[k]; const v = +w[k] || 0, max = lim[k], p = clamp(v / max, 0, 1), over = v > max;
      return `<div class="wb-row"><div class="wb-top"><span><span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${m.color};margin-right:6px;"></span>${m.label}</span><span class="wb-num">${Math.round(v)} / ${max}${m.unit}${over ? " · 超量" : ""}</span></div><div class="bar"><div class="bar-fill" style="width:${p * 100}%;background:${m.color};"></div></div></div>`;
    }).join("");
  }
  // 饮水四大数据丝滑增长反馈：从旧值逐帧过渡到新值（数字 + 进度条 + 圆环）
  function animateWater(from, to) {
    const wrap = $("#wbWrap"); if (!wrap) return;
    const keys = ["water", "caffeine", "chlorogenic", "theophylline"];
    const lim = { water: 2500, caffeine: 250, chlorogenic: 500, theophylline: 150 };
    const rows = wrap.querySelectorAll(".wb-row");
    const t0 = performance.now(), dur = 650;
    const step = (now) => {
      const p = Math.min(1, (now - t0) / dur);
      const e = 1 - Math.pow(1 - p, 3);
      let wp = from.water || 0;
      keys.forEach((k, i) => {
        const row = rows[i]; if (!row) return;
        const ov = from[k] || 0, nv = to[k] || 0; const cur = ov + (nv - ov) * e;
        const fill = row.querySelector(".bar-fill"); if (fill) fill.style.width = (clamp(cur / lim[k], 0, 1) * 100) + "%";
        const num = row.querySelector(".wb-num"); if (num) { const over = nv > lim[k]; num.textContent = Math.round(cur) + " / " + lim[k] + (k === "water" ? "ml" : "mg") + (over ? " · 超量" : ""); }
        if (k === "water") wp = cur;
      });
      const ring = $("#wRingProg"); if (ring) ring.style.strokeDashoffset = Math.round(2 * Math.PI * 48 * (1 - clamp(wp / 2000, 0, 1)));
      const rp = $("#wRingPct"); if (rp) rp.textContent = Math.round(clamp(wp / 2000, 0, 1) * 100) + "%";
      const ru = $("#wRingUnit"); if (ru) ru.textContent = Math.round(wp) + " / 2000 ml";
      if (p < 1) requestAnimationFrame(step);
    };
    rows.forEach((r) => { const f = r.querySelector(".bar-fill"); if (f) f.style.transition = "none"; });
    requestAnimationFrame(step);
  }

  function weekPlan() {
    const now = new Date(); const monday = new Date(now); const diff = (now.getDay() + 6) % 7; monday.setDate(now.getDate() - diff);
    let html = "";
    for (let i = 0; i < 7; i++) {
      const d = new Date(monday); d.setDate(monday.getDate() + i); const ds = dstr(d); const tg = dayTarget(ds);
      html += `<div class="row"><div class="row-ic" style="background:${i === diff ? "#10b981" : "#f1f5f9"};color:${i === diff ? "#fff" : "#64748b"};">${i === diff ? "今" : "周" + WK[(i + 1) % 7]}</div><div class="row-main"><div class="row-title">${ds.slice(5)} · <span class="tag carb-${tg.type}">${carbIcon(tg.type)} ${tg.label}</span></div><div class="row-meta">目标 ${tg.calories} kcal · 蛋白 ${tg.protein}g · ${tg.train}</div></div><div class="card-sub num">${tg.carbs}/${tg.fat}g</div></div>`;
    }
    return html;
  }

  function parseNutritionText(txt) {
    const raw = (txt || "").toString();
    let t = raw;
    // 归一化：去粗体、各类括号、表格竖线、全角标点、千分位、「每X克」限定词
    t = t.replace(/\*\*/g, " ")
         .replace(/[【】\[\]〈〉「」『』{}]/g, " ")
         .replace(/[（）()]/g, " ")
         .replace(/[|｜]/g, " ")
         .replace(/[：:＝=]/g, ":")
         .replace(/，/g, ",")
         .replace(/每\s*\d+\s*(?:克|g|千?卡|大卡|kcal)/gi, " ")
         .replace(/(\d),(\d)/g, "$1$2")
         .replace(/\s+/g, " ")
         .trim();

    const C_UNIT = "(?:克|g)";
    const M_UNIT = "(?:毫克|mg|微克|μg)";
    const CAL_UNIT = "(?:千卡|大卡|卡路里|kcal|cal|calories)";

    /* ========== 新增：预提取食物名称+份量（如"蛋白粉30g"、"鸡胸肉150g"）========== */
    // 食物名模式：中文/英文单词（2字以上）+ 可选空格/括号 + 数字 + 单位
    const DISH_PAT = /([\u4e00-\u9fff]{2,}|[A-Za-z]{2,})[\s\(（\[]{0,4}(\d+(?:\.\d+)?)\s*(克|g)\b/gi;
    let dishMatch;
    let extractedDish = "";
    let dishEndIndex = -1;
    while ((dishMatch = DISH_PAT.exec(t)) !== null) {
      const fullMatch = dishMatch[0];
      const dishName = dishMatch[1];
      const dishQty = dishMatch[2];
      const dishUnit = dishMatch[3];
      // 排除：如果匹配到的"名称"实际上是营养标签的一部分
      if (/^(?:总热量|热量|能量|碳水(?:化合物)?|蛋白质|脂肪|胆固醇|嘌呤|calories?|protein|fat|carbs?|cholesterol|purine)$/i.test(dishName)) continue;
      // 取第一个有效的食物名+份量
      if (!extractedDish) {
        extractedDish = fullMatch.trim();
        dishEndIndex = dishMatch.index + fullMatch.length;
      }
    }

  function numFor(labelPat, unitPat) {
    const labelRe = new RegExp(labelPat, "gi");
    let m;
    while ((m = labelRe.exec(t)) !== null) {
      const ctx = t.slice(Math.max(0, m.index - 4), m.index);
      if (/(饱和|反式)/.test(ctx)) continue; // 跳过饱和/反式脂肪，取总脂肪
      const after = t.slice(m.index + m[0].length);
      const head = after.slice(0, 60); // 仅看标签后紧邻一段，避免跨行/备注误抓数字

      // 【关键修复】如果这个匹配位置在已提取的食物名称范围内，跳过！
      // 例如"蛋白粉30g"中的"蛋白"不应该被当作"蛋白质"标签
      if (extractedDish && m.index < dishEndIndex && m.index + m[0].length <= dishEndIndex + 5) {
        continue;
      }

      // 优先匹配「数字+单位」，否则取标签后第一个数字
      if (unitPat) {
        const um = head.match(new RegExp("(\\d+(?:\\.\\d+)?)\\s*" + unitPat, "i"));
        if (um) return parseFloat(um[1]);
      }
      const nm = head.match(/(\d+(?:\.\d+)?)/);
      if (nm) return parseFloat(nm[1]);
    }
    return "";
  }
    function numForUnit(unitPat) {
      const re = new RegExp("(\\d+(?:\\.\\d+)?)\\s*" + unitPat, "i");
      const m = t.match(re);
      return m ? parseFloat(m[1]) : "";
    }

    // 中文数字 → 阿拉伯数字（菜名量词前归一化，如「一粒」→「1粒」「半碗」→「0.5碗」）
    const CN = {零:"0",一:"1",两:"2",二:"2",三:"3",四:"4",五:"5",六:"6",七:"7",八:"8",九:"9",半:"0.5"};
    function cnToArabic(s) {
      s = (s || "").trim();
      if (/^\d+(\.\d+)?$/.test(s)) return s;
      const single = CN[s]; if (single !== undefined) return single;
      if (/^十/.test(s)) s = "一" + s;
      let sec = 0, has = false;
      for (const ch of s) {
        if (CN[ch] !== undefined) { sec = (ch === "半") ? 0.5 : CN[ch]; has = true; }
        else if (ch === "十") { sec = (sec === 0 ? 1 : sec) * 10; }
        else return s;
      }
      return has ? String(sec) : s;
    }

    const cal = numFor("(?:总热量|热量|能量|热值|大卡|卡路里|calories?)", CAL_UNIT) || numForUnit(CAL_UNIT);
    const c   = numFor("(?:碳水(?:化合物)?|碳水化合物|carbs?)", C_UNIT);
    const p   = numFor("(?:蛋白质|蛋白|protein)", C_UNIT);
    const f   = numFor("(?:脂肪|fat)", C_UNIT);
    const ch  = numFor("(?:胆固醇|cholesterol)", M_UNIT);
    const pu  = numFor("(?:嘌呤|purine)", M_UNIT);

    // 名称抽取：优先使用预提取的"食物名+份量"，其次括号内【菜名】，最后取首个营养关键词/数字前的短语
    let name = "";
    // 【优先】如果预提取到了食物名+份量（如"蛋白粉30g"），直接使用
    if (extractedDish && extractedDish.length >= 2 && extractedDish.length <= 50) {
      name = extractedDish;
    }
    // 其次尝试括号内的菜名
    if (!name) {
      const bq = raw.match(/[【\[]([^】\]\n]{1,20})[】\]]/);
      if (bq && !/营养|成分|分析|估算|计算|热量|能量/i.test(bq[1])) name = bq[1].trim();
    }
    // 最后 fallback 到原有逻辑
    if (!name) {
      const lines = t.split(/[\n;；]+/).map((x) => x.trim()).filter(Boolean);
      const first = lines[0] || "";
      // 多菜品清单：首个菜品行含 ≥2 个「菜名+量词(g/个/片/块...)」且菜名非营养标签
      const DISH_UNIT = "(?:g|克|个|颗|片|块|碗|盒|根|条|只|枚|份|串|把|杯|袋|罐|瓶|勺|张|瓣|粒|尾|笼|碟|盘)";
      const NUT = /(?:总热量|热量|能量|碳水|蛋白质|脂肪|胆固醇|嘌呤|calories|protein|fat|carbs|cholesterol|purine)/i;
      const CNUM = "(?:\\d+(?:\\.\\d+)?|[零一二两三四五六七八九十半]+)";
      const dishRe = new RegExp("([\\u4e00-\\u9fff]{2,}|[A-Za-z]{2,})[^\\d，,；;\\n]{0,12}?" + CNUM + DISH_UNIT, "gi");
      let dm, dishCount = 0;
      while ((dm = dishRe.exec(first)) !== null) { if (!NUT.test(dm[1])) dishCount++; }
      if (dishCount >= 2) {
        let line0 = (raw.split(/\n/)[0] || first).trim();
        // 菜名量词前的中文数字归一化为阿拉伯数字
        const allCN = "(零|一|二|两|三|四|五|六|七|八|九|十|半)+";
        line0 = line0.replace(new RegExp(allCN + "(?=" + DISH_UNIT + ")", "g"), (m) => cnToArabic(m));
        line0 = line0.replace(/[，,。．！!？?\s]+$/, "").trim();
        name = line0.length > 120 ? line0.slice(0, 120) : line0;
      } else {
        const kw = /(?:总热量|热量|能量|碳水|蛋白质|脂肪|胆固醇|嘌呤|营养|成分|每|calories|protein|fat|carbs|cholesterol|purine)/i;
        const di = first.search(/\d/);
        const ki = first.search(kw);
        const cut = (di >= 0 && ki >= 0) ? Math.min(di, ki) : (di >= 0 ? di : (ki >= 0 ? ki : -1));
        let cand = cut >= 0 ? first.slice(0, cut) : first;
        cand = cand.replace(/[：:=]/g, " ").replace(/[，,。．！!？?\s]+$/, "")
                   .replace(/(?:约|大约|估计|估量|approx).*$/i, "") // 丢弃「约」及其后的附带说明
                   .replace(/^(?:这是一道|这是|我为你|帮你|根据|以下|分析|约|大约|估计|一份|菜品|食物|名称|菜名|一道|做法|步骤)[：:\s]*/i, "")
                   .replace(/(的|了|哦|呢|呀|～|~)\s*$/, "").trim();
        if (cand && !/分析|如下|营养|成分|根据|以下|包含|估算|计算|热量|能量|碳水|蛋白质|脂肪|胆固醇|嘌呤|提供|食材|calories|protein|fat|carbs/i.test(cand) && cand.length >= 2 && cand.length <= 18) name = cand;
      }
    }
    return { name, cal, c, p, f, ch, pu };
  }

  /* ============ 多菜品清单解析（逗号/顿号分隔的多个食物） ============ */
  function parseMultiMealText(txt) {
    const raw = (txt || "").toString();
    let t = raw;
    // 归一化（与 parseNutritionText 一致）
    t = t.replace(/\*\*/g, " ")
         .replace(/[【】\[\]〈〉「」『』{}]/g, " ")
         .replace(/[（）()]/g, " ")
         .replace(/[|｜]/g, " ")
         .replace(/[：:＝=]/g, ":")
         .replace(/，/g, ",")
         .replace(/每\s*\d+\s*(?:克|g|千?卡|大卡|kcal)/gi, " ")
         .replace(/(\d),(\d)/g, "$1$2")
         .replace(/\s+/g, " ")
         .trim();

    const C_UNIT = "(?:克|g)";
    const M_UNIT = "(?:毫克|mg|微克|μg)";
    const CAL_UNIT = "(?:千卡|大卡|卡路里|kcal|cal|calories)";

    // 中文数字映射
    const CN = {零:"0",一:"1",两:"2",二:"2",三:"3",四:"4",五:"5",六:"6",七:"7",八:"8",九:"9",半:"0.5"};
    function cnToArabic(s) {
      s = (s || "").trim();
      if (/^\d+(\.\d+)?$/.test(s)) return s;
      const single = CN[s]; if (single !== undefined) return single;
      if (/^十/.test(s)) s = "一" + s;
      let sec = 0, has = false;
      for (const ch of s) {
        if (CN[ch] !== undefined) { sec = (ch === "半") ? 0.5 : CN[ch]; has = true; }
        else if (ch === "十") { sec = (sec === 0 ? 1 : sec) * 10; }
        else return s;
      }
      return has ? String(sec) : s;
    }

    // 提取汇总营养值（如果有）
    function numFor(labelPat, unitPat) {
      const labelRe = new RegExp(labelPat, "gi");
      let m;
      while ((m = labelRe.exec(t)) !== null) {
        const after = t.slice(m.index + m[0].length);
        const head = after.slice(0, 60);
        if (unitPat) {
          const um = head.match(new RegExp("(\\d+(?:\\.\\d+)?)\\s*" + unitPat, "i"));
          if (um) return parseFloat(um[1]);
        }
        const nm = head.match(/(\d+(?:\.\d+)?)/);
        if (nm) return parseFloat(nm[1]);
      }
      return "";
    }
    function numForUnit(unitPat) {
      const re = new RegExp("(\\d+(?:\\.\\d+)?)\\s*" + unitPat, "i");
      const m = t.match(re);
      return m ? parseFloat(m[1]) : "";
    }

    const sumCal = numFor("(?:总热量|热量|能量|热值|大卡|卡路里|calories?)", CAL_UNIT) || numForUnit(CAL_UNIT);
    const sumC   = numFor("(?:碳水(?:化合物)?|碳水化合物|carbs?)", C_UNIT);
    const sumP   = numFor("(?:蛋白质|蛋白|protein)", C_UNIT);
    const sumF   = numFor("(?:脂肪|fat)", C_UNIT);
    const sumCh  = numFor("(?:胆固醇|cholesterol)", M_UNIT);
    const sumPu  = numFor("(?:嘌呤|purine)", M_UNIT);

    // ===== 核心拆分逻辑 =====
    // 从文本中提取"食物行"——去掉营养标签行后的剩余部分
    const nutLinePat = /^(?:总\s*热量|热量|能量|碳水|蛋白质|脂肪|胆固醇|嘌呤|calories|protein|fat|carbs|cholesterol|purine)[\s:：\d\.\s]+$/im;
    const lines = t.split(/[\n;；]+/).map((l) => l.trim()).filter(Boolean);
    const foodLines = lines.filter((l) => !nutLinePat.test(l));
    const foodText = foodLines.join(" ");

    if (!foodText.trim()) {
      // 没有食物文本，回退到单菜品解析
      const single = parseNutritionText(raw);
      return [single].filter((x) => x.name);
    }

    // 多菜品正则拆分
    // 支持格式：
    //   "200克姜母鸭"     — 数字+克+名称
    //   "150g小炒黄牛肉"  — 数字+g+名称
    //   "三片西瓜"       — 中文数词+量词+名称
    //   "50克花生"       — 数字+克+名称
    const DISH_UNIT = "(?:g|克|个|颗|片|块|碗|盒|根|条|只|枚|份|串|把|杯|袋|罐|瓶|勺|张|瓣|粒|尾|笼|碟|盘)";
    const CNUM = "(?:\\d+(?:\\.\\d+)?|[零一二两三四五六七八九十半]+)";

    // 模式 A：数字+单位+中文名称（如 "200克姜母鸭"、"50g花生"）
    const PAT_A = new RegExp("(" + CNUM + ")\\s*(" + DISH_UNIT + ")\\s*([\\u4e00-\\u9fff]{2,}(?:[\\u4e00-\\u9fff\\(\\)\\[\\]·\\-]{0,15}?)?)", "gi");

    // 模式 B：中文名称+数字+单位（如 "姜母鸭200克"、"蛋白粉30g"）— 较少见但支持
    const PAT_B = /([\u4e00-\u9fff]{2,}|[A-Za-z]{2,})[\s\(（\[]{0,4}(\d+(?:\.\d+)?)\s*(克|g)\b/gi;

    const meals = [];
    const seenNames = new Set(); // 去重

    // 先尝试模式 A（最常见）
    let matchA;
    while ((matchA = PAT_A.exec(foodText)) !== null) {
      const qtyStr = cnToArabic(matchA[1]);
      const unit = matchA[2];
      let name = (matchA[3] || "").trim();
      if (!name) continue;
      // 清理名称中的尾随标点
      name = name.replace(/[，,。．！!？?\s]+$/, "").trim();
      if (name.length < 2) continue;
      // 排除营养标签误匹配
      if (/^(?:总热量|热量|能量|碳水(?:化合物)?|蛋白质|脂肪|胆固醇|嘌呤)$/i.test(name)) continue;
      // 去重
      const key = name + qtyStr + unit;
      if (seenNames.has(key)) continue;
      seenNames.add(key);

      meals.push({
        name: name + "(" + qtyStr + unit + ")",
        cal: "", c: "", p: "", f: "", ch: "", pu: "",
        _rawName: name,
        _qty: parseFloat(qtyStr) || 0,
        _unit: unit,
      });
    }

    // 如果模式 A 没有匹配到，尝试模式 B
    if (meals.length === 0) {
      let matchB;
      while ((matchB = PAT_B.exec(foodText)) !== null) {
        const dishName = matchB[1];
        const qtyStr = matchB[2];
        const unit = matchB[3];
        if (/^(?:总热量|热量|能量|碳水(?:化合物)?|蛋白质|脂肪|胆固醇|嘌呤)$/i.test(dishName)) continue;
        const key = dishName + qtyStr + unit;
        if (seenNames.has(key)) continue;
        seenNames.add(key);

        meals.push({
          name: dishName + "(" + qtyStr + unit + ")",
          cal: "", c: "", p: "", f: "", ch: "", pu: "",
          _rawName: dishName,
          _qty: parseFloat(qtyStr) || 0,
          _unit: unit,
        });
      }
    }

    // 如果有汇总营养值且有多个菜品，按份量比例分配
    if (meals.length >= 2 && sumCal) {
      const totalQty = meals.reduce((s, m) => s + (m._qty || 0), 0);
      if (totalQty > 0) {
        meals.forEach((m) => {
          const ratio = (m._qty || 0) / totalQty;
          m.cal = Math.round((sumCal || 0) * ratio * 10) / 10;
          m.c   = Math.round((sumC   || 0) * ratio * 10) / 10;
          m.p   = Math.round((sumP   || 0) * ratio * 10) / 10;
          m.f   = Math.round((sumF   || 0) * ratio * 10) / 10;
          m.ch  = Math.round((sumCh  || 0) * ratio * 10) / 10;
          m.pu  = Math.round((sumPu  || 0) * ratio * 10) / 10;
        });
      }
    } else if (meals.length === 1 && sumCal) {
      // 单菜品直接使用汇总值
      meals[0].cal = sumCal;
      meals[0].c   = sumC;
      meals[0].p   = sumP;
      meals[0].f   = sumF;
      meals[0].ch  = sumCh;
      meals[0].pu  = sumPu;
    }

    // 如果什么都没拆出来，回退到单菜品解析
    if (meals.length === 0) {
      const single = parseNutritionText(raw);
      return [single].filter((x) => x.name);
    }

    return meals;
  }
  if (typeof window !== "undefined") window.__parseMultiMealText = parseMultiMealText;

  if (typeof window !== "undefined") window.__parseNutritionText = parseNutritionText;
  if (typeof window !== "undefined") window.__TLR = { get D() { return D; }, normalize, unwrapSave };

  function addMealModal(mealKey) {
    const m = MEALS.find((x) => x.k === mealKey);
    const md = curMealDate || todayStr();
    openModal(`添加${m.name} · ${md.slice(5)}`, `
      <div class="card-sub mb-2">粘贴餐食描述自动识别，或手动填写营养：</div>
      <div class="fld full"><label>智能识别</label><textarea id="smart" placeholder="粘贴豆包等营养素分析，自动识别：辣椒炒肉50g… 总热量：814 碳水：45.2 蛋白质：38.1 脂肪：22.4 胆固醇：210 嘌呤：180"></textarea></div>
      <button class="btn btn-sm" id="pasteBtn">📋 粘贴并识别</button>
      <div class="form form-2 mt-2">
        <div class="fld"><label>名称</label><input id="mName" placeholder="吃了什么"></div>
        <div class="fld"><label>热量 kcal</label><input id="mCal" type="number" placeholder="0"></div>
        <div class="fld"><label>碳水 g</label><input id="mC" type="number" placeholder="0"></div>
        <div class="fld"><label>蛋白质 g</label><input id="mP" type="number" placeholder="0"></div>
        <div class="fld"><label>脂肪 g</label><input id="mF" type="number" placeholder="0"></div>
        <div class="fld"><label>胆固醇 mg</label><input id="mCh" type="number" placeholder="0"></div>
        <div class="fld"><label>嘌呤 mg</label><input id="mPu" type="number" placeholder="0"></div>
      </div>
      <button class="btn btn-primary w-full mt-2" id="mSubmit">保存</button>
    `);
    const fill = () => {
      const txt = $("#smart").value || "";
      if (!txt.trim()) { toast("请先粘贴文本", "warn"); return; }
      // 先尝试多菜品解析
      const meals = parseMultiMealText(txt);
      if (meals.length >= 2) {
        // 多菜品：展示预览，用户确认后批量添加
        const listHTML = meals.map((m, i) =>
          `<div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid var(--border);">
            <span><strong>${i+1}.</strong> ${esc(m.name)}</span>
            <span style="color:var(--text-muted);font-size:12px;">
              ${m.cal ? m.cal+"kcal" : "-"} | ${m.c ? m.c+"g碳水" : "-"} | ${m.p ? m.p+"g蛋白" : "-"}
            </span>
          </div>`
        ).join("");
        openModal(`识别到 ${meals.length} 道菜`, `
          <div class="card-sub mb-2">以下菜品将批量添加到<strong>${m.name}</strong>：</div>
          <div style="max-height:300px;overflow-y:auto;">${listHTML}</div>
          <div class="card-sub mt-2" style="color:var(--warning);">⚠️ 营养值按份量比例估算，请后续核对</div>
          <button class="btn btn-primary w-full mt-2" id="batchAddBtn">✅ 全部添加 (${meals.length}道)</button>
          <button class="btn w-full mt-1" onclick="closeModal()">取消</button>
        `);
        // 绑定批量添加按钮
        $("#batchAddBtn").onclick = () => {
          meals.forEach((mi) => {
            dayMeals(curMealDate)[mealKey].push({
              id: Date.now() + Math.random(),
              name: mi.name,
              calories: +mi.cal || 0,
              carbs: +mi.c || 0,
              protein: +mi.p || 0,
              fat: +mi.f || 0,
              cholesterol: +mi.ch || 0,
              purine: +mi.pu || 0,
            });
          });
          save(); closeModal(); renderNutrition(); renderOverview();
          toast(`已添加 ${meals.length} 道菜 · ${curMealDate.slice(5)}`);
        };
      } else {
        // 单菜品：原有逻辑
        const r = meals[0] || parseNutritionText(txt);
        $("#mName").value = r.name;
        $("#mCal").value = r.cal;
        $("#mC").value = r.c;
        $("#mP").value = r.p;
        $("#mF").value = r.f;
        $("#mCh").value = r.ch;
        $("#mPu").value = r.pu;
        toast("已识别并填充，可手动修改");
      }
    };
    // 粘贴并识别：一键读剪贴板 → 填入 → 识别；剪贴板被浏览器拒绝时，若已手动粘贴则直接识别现有文本
    $("#pasteBtn").onclick = async () => {
      let txt = "";
      try {
        if (navigator.clipboard && navigator.clipboard.readText) txt = await navigator.clipboard.readText();
      } catch (e) { txt = ""; }
      if (txt && txt.trim()) {
        $("#smart").value = txt;
        fill();
      } else if (($("#smart").value || "").trim()) {
        fill();
      } else {
        try { $("#smart").focus(); } catch (e) {}
        toast("无法读取剪贴板，请长按输入框手动粘贴后再点本按钮", "warn");
      }
    };
    $("#mSubmit").onclick = () => {
      const name = $("#mName").value.trim() || "未命名";
      const rec = { id: Date.now(), name, calories: +$("#mCal").value || 0, carbs: +$("#mC").value || 0, protein: +$("#mP").value || 0, fat: +$("#mF").value || 0, cholesterol: +$("#mCh").value || 0, purine: +$("#mPu").value || 0 };
      dayMeals(curMealDate)[mealKey].push(rec); save(); closeModal(); renderNutrition(); renderOverview(); toast("已添加 · " + curMealDate.slice(5));
    };
  }

  function editMeal(ds, mk, id) {
    const it = dayMeals(ds)[mk].find((x) => x.id === id); if (!it) return;
    openModal("编辑餐食", `
      <div class="form form-2">
        <div class="fld"><label>名称</label><input id="meName" value="${esc(it.name)}"></div>
        <div class="fld"><label>热量 kcal</label><input id="meCal" type="number" value="${it.calories}"></div>
        <div class="fld"><label>碳水 g</label><input id="meC" type="number" value="${it.carbs}"></div>
        <div class="fld"><label>蛋白质 g</label><input id="meP" type="number" value="${it.protein}"></div>
        <div class="fld"><label>脂肪 g</label><input id="meF" type="number" value="${it.fat}"></div>
        <div class="fld"><label>胆固醇 mg</label><input id="meCh" type="number" value="${it.cholesterol || 0}"></div>
        <div class="fld"><label>嘌呤 mg</label><input id="mePu" type="number" value="${it.purine || 0}"></div>
      </div>
      <button class="btn btn-primary w-full mt-2" id="meSave">保存</button>
    `);
    $("#meSave").onclick = () => {
      Object.assign(it, {
        name: $("#meName").value.trim() || it.name,
        calories: +$("#meCal").value || 0, carbs: +$("#meC").value || 0, protein: +$("#meP").value || 0,
        fat: +$("#meF").value || 0, cholesterol: +$("#meCh").value || 0, purine: +$("#mePu").value || 0
      });
      save(); closeModal(); renderNutrition(); renderOverview(); toast("已更新");
    };
  }

  /* ============ 渲染：健身 ============ */
  let calY = new Date().getFullYear(), calM = new Date().getMonth();
  function renderFitness() {
    const ft = D.fitness; const t = todayStr();

    $("#body-fitness").innerHTML = `
      <div class="demo-badge">本地优先 · 数据存浏览器</div>
      <div class="mt-3" id="trainSections"></div>

      <div class="card mt-3">
        <div class="card-head"><div class="card-title">训练记录</div></div>
        <div id="trainLog"></div>
      </div>`;

    renderTrainSections();
    renderTrainLog();
  }

  /* 可复用的日历渲染（健身页 & 总览日历侧边栏共用） */
  function drawCalendar(gridId, titleId) {
    const ft = D.fitness; const t = todayStr();
    $("#" + titleId).textContent = `${calY}年${calM + 1}月`;
    const first = new Date(calY, calM, 1); const start = (first.getDay() + 6) % 7; const days = new Date(calY, calM + 1, 0).getDate();
    let g = ""; for (let i = 0; i < start; i++) g += `<div class="cal-cell other"></div>`;
    for (let d = 1; d <= days; d++) {
      const ds = `${calY}-${String(calM + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      const e = ft.calendar[ds]; let cls = "cal-cell"; if (ds === t) cls += " today"; let part = "", badges = "";
      if (e) {
        if (e.parts && e.parts.length) { if (e.parts.includes("休息")) { cls += " rest"; part = "休"; } else { cls += " trained"; part = e.parts.join("·"); } }
        if (e.creatine) badges += '<span class="bdg bdg-cr">💊</span>'; if (e.fishOil) badges += '<span class="bdg bdg-fo">🐟</span>';
      }
      g += `<div class="${cls}" data-date="${ds}"><div class="cell-badges">${badges}</div>${d}<div class="cell-part">${part}</div></div>`;
    }
    $("#" + gridId).innerHTML = g;
    $$("#" + gridId + " [data-date]").forEach((c) => c.onclick = () => openDayModal(c.dataset.date));
  }

  function totalTrainDays() { let n = 0; Object.values(D.fitness.calendar).forEach((e) => { if (e && e.parts && e.parts.length && !e.parts.includes("休息")) n++; }); return n; }
  function streakDays() {
    const ft = D.fitness; const today = new Date(); const t = dstr(today);
    if (!ft.calendar[t] || !ft.calendar[t].parts.length) return 0;
    let n = 0; const d = new Date(today);
    while (true) { const ds = dstr(d); const e = ft.calendar[ds]; if (!e || !e.parts.length) break; if (!e.parts.includes("休息")) n++; d.setDate(d.getDate() - 1); }
    return n;
  }

  /* ============ 渲染：日历（健身卡到期 + 训练日历） ============ */
  function renderCalendar() {
    const ft = D.fitness; const exp = ft.expiry; const expD = dateFromStr(exp); const today = new Date();
    const diff = Math.ceil((expD - today) / 86400000);
    $("#body-calendar").innerHTML = `
      <div class="demo-badge">本地优先 · 数据存浏览器</div>
      <div class="card" style="border-left:4px solid var(--amber);">
        <div style="display:flex;gap:18px;align-items:center;flex-wrap:wrap;">
          <div style="width:56px;height:56px;border-radius:16px;background:var(--amber-soft);display:flex;align-items:center;justify-content:center;font-size:28px;">🎫</div>
          <div style="flex:1;min-width:200px;">
            <div class="card-sub">健身卡剩余</div>
            <div class="card-value" style="color:${diff < 0 ? "#f43f5e" : diff < 7 ? "#f59e0b" : "#10b981"};">${diff < 0 ? "已过期" : diff + " 天"}</div>
            <div class="card-sub mt-1">到期日 ${exp}</div>
          </div>
          <div class="grid" style="grid-template-columns:1fr 1fr;gap:10px;">
            ${stat("累计健身", totalTrainDays(), "天")}
            ${stat("连续训练", streakDays(), "天")}
          </div>
        </div>
      </div>

      <div class="card mt-3">
        <div class="cal-head"><button class="cal-nav" data-cal="prev">&lt;</button><span class="cal-title" id="calTitleCal"></span><button class="cal-nav" data-cal="next">&gt;</button></div>
        <div class="cal-week"><span>一</span><span>二</span><span>三</span><span>四</span><span>五</span><span>六</span><span>日</span></div>
        <div class="cal-grid" id="calGridCal"></div>
        <div class="cal-legend"><span style="color:#10b981">● 训练</span><span style="color:#3b82f6">● 休息</span><span class="lg"><span style="color:#8b5cf6">💊</span>肌酸</span><span class="lg"><span style="color:#3b82f6">🐟</span>鱼油</span></div>
      </div>`;

    drawCalendar("calGridCal", "calTitleCal");
    $$("#body-calendar [data-cal]").forEach((b) => b.onclick = () => { const d = b.dataset.cal === "prev" ? -1 : 1; calM += d; if (calM < 0) { calM = 11; calY--; } if (calM > 11) { calM = 0; calY++; } drawCalendar("calGridCal", "calTitleCal"); });
  }

  /* ============ 渲染：体重 ============ */
  function renderWeight() {
    const arr = (D.nutrition.weight || []).slice().sort((a, b) => a.date.localeCompare(b.date));
    const lw = arr.length ? arr[arr.length - 1] : null;
    const prev = arr.length > 1 ? arr[arr.length - 2] : null;
    const fatMass = (r) => (r && r.weight && r.fatRate != null) ? +(r.weight * r.fatRate / 100).toFixed(1) : null;
    const musMass = (r) => (r && r.weight && r.muscleRate != null) ? +(r.weight * r.muscleRate / 100).toFixed(1) : null;
    const upDown = (cur, pre) => {
      if (cur == null || pre == null) return `<span class="card-sub">—</span>`;
      const d = +(cur - pre).toFixed(1);
      if (d > 0) return `<span style="color:#f43f5e;font-weight:800;">↑ +${d}</span>`;
      if (d < 0) return `<span style="color:#10b981;font-weight:800;">↓ ${d}</span>`;
      return `<span style="color:#64748b;">→ 0</span>`;
    };

    const t = todayStr();
    const wForm = `
      <div class="form form-3">
        <div class="fld"><label>日期</label><input type="date" id="wDate" value="${t}"></div>
        <div class="fld"><label>体重 kg</label><input type="number" id="wWeight" step="0.1" placeholder="0"></div>
        <div class="fld"><label>体脂 %</label><input type="number" id="wFat" step="0.1" placeholder="0"></div>
        <div class="fld"><label>肌肉 %</label><input type="number" id="wMus" step="0.1" placeholder="0"></div>
        <div class="fld" style="justify-content:flex-end;"><button class="btn btn-primary" id="wSave">保存</button></div>
      </div>`;

    $("#body-weight").innerHTML = `
      <div class="demo-badge">本地优先 · 数据存浏览器</div>

      <!-- 看板1：身体三参数（最新） -->
      <div class="card">
        <div class="card-head"><div class="card-title">身体参数（最新）</div><span class="card-sub">${lw ? "更新于 " + lw.date.slice(5) : "还没有记录"}</span></div>
        <div class="grid grid-3">
          <div class="stat"><div class="stat-label">⚖️ 体重</div><div class="stat-value">${lw ? lw.weight : "--"}<span class="unit"> kg</span></div><div class="stat-foot">较上次 ${upDown(lw && lw.weight, prev && prev.weight)}</div></div>
          <div class="stat"><div class="stat-label">🥩 脂肪量</div><div class="stat-value">${lw ? (fatMass(lw) != null ? fatMass(lw) : "--") : "--"}<span class="unit"> kg</span></div><div class="stat-foot">体脂率 ${lw ? lw.fatRate : "--"}% · 较上次 ${upDown(lw && fatMass(lw), prev && fatMass(prev))}</div></div>
          <div class="stat"><div class="stat-label">💪 肌肉量</div><div class="stat-value">${lw ? (musMass(lw) != null ? musMass(lw) : "--") : "--"}<span class="unit"> kg</span></div><div class="stat-foot">肌肉率 ${lw ? lw.muscleRate : "--"}% · 较上次 ${upDown(lw && musMass(lw), prev && musMass(prev))}</div></div>
        </div>
      </div>

      <!-- 看板2：记录体重 / 体脂 / 肌肉 -->
      <div class="card mt-3">
        <div class="card-head"><div class="card-title">记录体重 / 体脂 / 肌肉</div><span class="card-sub">输入体脂率·肌肉率，自动换算脂肪量 / 肌肉量</span></div>
        ${wForm}
      </div>

      <!-- 看板3：历史记录（每条可删） -->
      <div class="card mt-3">
        <div class="card-head"><div class="card-title">历史记录</div><span class="card-sub">体重 · 脂肪量 · 肌肉量 及涨跌（最新在上）</span></div>
        <div class="scroll-list" id="weightHist"></div>
      </div>

      <!-- 看板4：身体趋势 -->
      <div class="card mt-3">
        <div class="card-head">
          <div class="card-title">身体趋势</div>
          <div class="trend-tabs" id="bodyTrendTabs">
            <button class="trend-tab ${D.nutrition.trendDays === 7 ? "active" : ""}" data-days="7">周</button>
            <button class="trend-tab ${D.nutrition.trendDays === 30 ? "active" : ""}" data-days="30">月</button>
            <button class="trend-tab ${D.nutrition.trendDays === 365 ? "active" : ""}" data-days="365">年</button>
          </div>
        </div>
        <div class="trend-grid">
          <div class="trend-sub">
            <div class="ts-head"><span class="ts-dot" style="background:#10b981"></span>体重 <span class="ts-unit">kg</span></div>
            <div class="chart-box"><canvas id="bodyTrendWeight" class="chart"></canvas></div>
          </div>
          <div class="trend-sub">
            <div class="ts-head"><span class="ts-dot" style="background:#f43f5e"></span>体脂量 <span class="ts-unit">kg</span></div>
            <div class="chart-box"><canvas id="bodyTrendFat" class="chart"></canvas></div>
          </div>
          <div class="trend-sub">
            <div class="ts-head"><span class="ts-dot" style="background:#3b82f6"></span>肌肉量 <span class="ts-unit">kg</span></div>
            <div class="chart-box"><canvas id="bodyTrendMuscle" class="chart"></canvas></div>
          </div>
        </div>
      </div>`;

    $("#wSave").onclick = () => {
      const date = $("#wDate").value, w = parseFloat($("#wWeight").value), f = parseFloat($("#wFat").value), m = parseFloat($("#wMus").value);
      if (!date || isNaN(w)) { toast("请填写日期和体重", "warn"); return; }
      D.nutrition.weight = (D.nutrition.weight || []).filter((x) => x.date !== date);
      D.nutrition.weight.push({ date, weight: w, fatRate: f || 0, muscleRate: m || 0 });
      D.nutrition.weight.sort((a, b) => a.date.localeCompare(b.date));
      D.profile.body.weight = w;
      save(); renderWeight(); toast("体重已保存 · 已同步身体参数并重算目标");
    };

    function renderWeightHist() {
      const box = $("#weightHist"); if (!box) return;
      const a = (D.nutrition.weight || []).slice().sort((x, y) => x.date.localeCompare(y.date));
      if (!a.length) { box.innerHTML = `<div class="card-sub">暂无体重记录</div>`; return; }
      let html = "";
      for (let i = a.length - 1; i >= 0; i--) {
        const r = a[i], p = i > 0 ? a[i - 1] : null;
        const fm = fatMass(r), pm = fatMass(p), mm = musMass(r), mp = musMass(p);
        html += `<div class="row" style="padding:8px 0;border-bottom:1px solid var(--border);">
          <div class="row-main">
            <div class="row-title">${r.date.slice(5)}</div>
            <div class="row-meta">
              体重 ${r.weight}kg ${upDown(r.weight, p && p.weight)} ·
              脂肪 ${fm != null ? fm : "--"}kg ${upDown(fm, pm)} ·
              肌肉 ${mm != null ? mm : "--"}kg ${upDown(mm, mp)}
            </div>
          </div>
          <button class="mi-del" data-delweight="${r.date}" title="删除" style="margin-left:10px;">×</button>
        </div>`;
      }
      box.innerHTML = html;
      $$("#weightHist [data-delweight]").forEach((b) => b.onclick = () => {
        const d = b.dataset.delweight;
        D.nutrition.weight = (D.nutrition.weight || []).filter((x) => x.date !== d);
        save(); renderWeight(); toast("已删除 " + d.slice(5) + " 的记录");
      });
    }
    renderWeightHist();
    $$("#bodyTrendTabs .trend-tab").forEach((b) => b.onclick = () => { D.nutrition.trendDays = +b.dataset.days; save(); renderWeight(); });

    const td = bodyTrendData(D.nutrition.trendDays || 7);
    const drawTrend = (sel, vals, color) => {
      const c = $(sel); if (!c) return;
      const has = vals.filter((v) => v != null).length;
      if (has) {
        const nums = vals.filter((v) => v != null);
        const mn = Math.min(...nums), mx = Math.max(...nums);
        const pad = (mx - mn) * 0.25 || 1;
        drawLine(c, [{ data: vals, labels: td.labels, color, fill: color + "14" }], { min: Math.floor(mn - pad), max: Math.ceil(mx + pad), h: 170 });
      } else {
        const { ctx, w, h } = setupCanvas(c, 170); const ct = chartTheme(); ctx.fillStyle = ct.text; ctx.textAlign = "center"; ctx.fillText("暂无数据", w / 2, h / 2);
      }
    };
    drawTrend("#bodyTrendWeight", td.weight, "#10b981");
    drawTrend("#bodyTrendFat", td.fat, "#f43f5e");
    drawTrend("#bodyTrendMuscle", td.muscle, "#3b82f6");
    animateNumbers($("#body-weight"));
  }

  /* ============ 渲染：喝水 / 饮品 ============ */
  function renderWater() {
    const t = effectiveToday();  // 使用"有效今天"（凌晨 3 点前算昨天）
    const w = D.nutrition.water[t] || { water: 0, caffeine: 0, chlorogenic: 0, theophylline: 0, drinks: [] };
    const wlim = { water: 2500, caffeine: 250, chlorogenic: 500, theophylline: 150 };
    const wPct = clamp(w.water / 2000, 0, 1);
    const drinkLog = (w.drinks && w.drinks.length)
      ? w.drinks.map((d, i) => `<div class="row" style="padding:6px 0;"><div class="row-main"><div class="row-title">${drinkIcon(d.name)} ${esc(d.name)}</div></div><span class="row-meta">${d.time || ""}</span><button class="mi-del" data-deldrink="${i}" title="删除" style="margin-left:8px;">×</button></div>`).join("")
      : `<div class="card-sub">今天还没记录饮品</div>`;
    const drinkBtns = (D.nutrition.drinks || []).map((d) => `<button class="drink" data-drink="${d.id}">${drinkIcon(d.name)} ${esc(d.name)} +${d.water}ml</button>`).join("");
    $("#body-water").innerHTML = `
      <div class="demo-badge">本地优先 · 数据存浏览器</div>
      <div class="card">
        <div class="card-head">
          <div class="card-title">今日饮水 / 饮品</div>
          <button class="btn btn-sm btn-rose" data-clearwater="1">清空今日</button>
        </div>
        <div class="ring-wrap" id="wRing" style="margin:0 auto;">
          <svg viewBox="0 0 120 120">
            <circle class="ring-bg" cx="60" cy="60" r="48"></circle>
            <circle class="ring-prog" id="wRingProg" cx="60" cy="60" r="48" stroke="#3b82f6" stroke-dasharray="${Math.round(2 * Math.PI * 48)}" stroke-dashoffset="${Math.round(2 * Math.PI * 48 * (1 - wPct))}"></circle>
          </svg>
          <div class="ring-center"><div class="ring-pct" id="wRingPct">${Math.round(wPct * 100)}%</div><div class="ring-unit" id="wRingUnit">${fmt(w.water)} / 2000 ml</div></div>
        </div>
        <div class="card-sub mt-3">快速记录</div>
        <div class="drink-list mt-1">${drinkBtns}</div>
        <div class="mt-3" id="wbWrap">${waterBars(w, wlim)}</div>
        <div class="card-sub mt-3">今日喝过</div>
        ${drinkLog}
      </div>`;

    $$("#body-water [data-drink]").forEach((b) => b.onclick = () => {
      const d = D.nutrition.drinks.find((x) => x.id === b.dataset.drink); if (!d) return;
      const old = D.nutrition.water[t] || { water: 0, caffeine: 0, chlorogenic: 0, theophylline: 0, drinks: [] };
      const x = { water: old.water, caffeine: old.caffeine, chlorogenic: old.chlorogenic, theophylline: old.theophylline, drinks: old.drinks ? old.drinks.slice() : [] };
      x.water += d.water; x.caffeine += d.caffeine; x.chlorogenic += d.chlorogenic; x.theophylline += d.theophylline;
      x.drinks.push({ name: d.name, time: new Date().toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" }) });
      D.nutrition.water[t] = x; save(); renderWater(); animateWater(old, x); toast("已记录 " + d.name);
    });
    $$("#body-water [data-deldrink]").forEach((b) => b.onclick = () => {
      const i = +b.dataset.deldrink; const x = D.nutrition.water[t]; if (!x || !x.drinks) return; x.drinks.splice(i, 1); save(); renderWater(); toast("已删除该条饮品");
    });
    const cw = $("#body-water [data-clearwater]");
    if (cw) cw.onclick = () => { delete D.nutrition.water[t]; save(); renderWater(); renderOverview(); toast("已清空今日饮水"); };
  }

  function openDayModal(ds) {
    const ft = D.fitness; const e = ft.calendar[ds] || { parts: [], creatine: false, fishOil: false };
    let sel = [...(e.parts || [])], cr = !!e.creatine, fo = !!e.fishOil;
    const render = () => {
      $("#modalBody").innerHTML = `<div class="card-title mb-2">${ds.slice(5)} · 训练打卡</div>
        <div style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:14px;">${CAL_PARTS.map((p) => `<button class="btn btn-sm ${sel.includes(p) ? "btn-primary" : "btn-ghost"}" data-p="${p}">${partIcon(p)} ${p}</button>`).join("")}</div>
        <div class="row" style="padding:10px 0;"><div class="row-main"><div class="row-title">💊 肌酸</div></div><div class="toggle ${cr ? "on" : ""}" data-t="cr" style="width:44px;height:24px;border-radius:12px;background:${cr ? "var(--accent)" : "var(--line)"};position:relative;cursor:pointer;"><div style="width:20px;height:20px;border-radius:50%;background:#fff;position:absolute;top:2px;left:${cr ? "22px" : "2px"};transition:left .2s;"></div></div></div>
        <div class="row" style="padding:10px 0;"><div class="row-main"><div class="row-title">🐟 鱼油</div></div><div class="toggle ${fo ? "on" : ""}" data-t="fo" style="width:44px;height:24px;border-radius:12px;background:${fo ? "var(--accent)" : "var(--line)"};position:relative;cursor:pointer;"><div style="width:20px;height:20px;border-radius:50%;background:#fff;position:absolute;top:2px;left:${fo ? "22px" : "2px"};transition:left .2s;"></div></div></div>
        <div class="flex gap-2 mt-2"><button class="btn btn-rose" id="dayClear">清除</button><button class="btn btn-primary w-full" id="daySave">保存</button></div>`;
      $$("#modalBody [data-p]").forEach((b) => b.onclick = () => {
        const p = b.dataset.p;
        if (p === "休息") { sel = sel.includes("休息") ? [] : ["休息"]; }
        else { const i = sel.indexOf("休息"); if (i > -1) sel.splice(i, 1); const j = sel.indexOf(p); if (j > -1) sel.splice(j, 1); else sel.push(p); }
        render();
      });
      $$("#modalBody [data-t]").forEach((b) => b.onclick = () => { if (b.dataset.t === "cr") cr = !cr; else fo = !fo; render(); });
      $("#dayClear").onclick = () => { delete ft.calendar[ds]; save(); closeModal(); renderFitness(); renderOverview(); if (curPage === "calendar") renderCalendar(); };
      $("#daySave").onclick = () => { if (!sel.length && !cr && !fo) delete ft.calendar[ds]; else ft.calendar[ds] = { parts: [...sel], creatine: cr, fishOil: fo }; save(); closeModal(); renderFitness(); renderOverview(); if (curPage === "calendar") renderCalendar(); };
    };
    openModal("训练打卡", ""); render();
  }

  let trainCollapsed = Object.fromEntries(TRAIN_PARTS.map((p) => [p, true]));
  function renderTrainSections() {
    const ft = D.fitness;
    const html = TRAIN_PARTS.map((p) => {
      const acts = ft.actions[p] || [];
      const total = acts.reduce((s, a) => s + (a.sets || 0), 0);
      const body = acts.map((a, i) => `<div class="act-row" data-part="${p}" data-i="${i}">
        <input value="${esc(a.name)}" data-f="name" class="act-name" placeholder="动作名">
        <input type="number" value="${a.maxWeight || 0}" data-f="maxWeight" placeholder="kg" class="act-w">
        <span class="act-sets">${a.sets || 0}组</span>
        <button class="btn btn-sm" data-act="inc">+</button>
        <button class="btn btn-sm" data-act="reset">R</button>
        <button class="btn btn-sm" data-act="del" style="color:var(--rose-ink);border-color:var(--rose-soft);background:var(--rose-soft);">×</button>
      </div>`).join("");
      return `<div class="card mt-3">
        <div class="card-head" data-toggle="${p}" style="cursor:pointer;">
          <div class="card-title">${partIcon(p)} ${p} <span class="caret ${trainCollapsed[p] ? "" : "open"}">▸</span></div>
          <span class="card-sub">${acts.length} 动作 / ${total} 组</span>
        </div>
        <div data-body="${p}" style="${trainCollapsed[p] ? "display:none;" : ""}">${body}<button class="btn btn-ghost w-full mt-2" data-add="${p}">+ 添加动作</button></div>
      </div>`;
    }).join("");
    const el = $("#trainSections");
    el.innerHTML = html;
    if (el.__bound) return;
    el.__bound = true;
    el.addEventListener("click", (ev) => {
      const head = ev.target.closest("[data-toggle]"); if (head) { const p = head.dataset.toggle; trainCollapsed[p] = !trainCollapsed[p]; const b = $(`[data-body="${p}"]`); b.style.display = trainCollapsed[p] ? "none" : "block"; const c = head.querySelector(".caret"); if (c) c.classList.toggle("open", !trainCollapsed[p]); return; }
      const add = ev.target.closest("[data-add]"); if (add) { const p = add.dataset.add; if (!ft.actions[p]) ft.actions[p] = []; ft.actions[p].push({ name: "新动作", maxWeight: 0, sets: 0 }); save(); renderTrainSections(); return; }
      const btn = ev.target.closest("[data-act]"); if (!btn) return;
      const row = btn.closest(".act-row"); if (!row) return;
      const p = row.dataset.part, i = +row.dataset.i, act = btn.dataset.act;
      if (act === "inc") { ft.actions[p][i].sets = (ft.actions[p][i].sets || 0) + 1; }
      else if (act === "reset") { ft.actions[p][i].sets = 0; }
      else if (act === "del") { ft.actions[p].splice(i, 1); }
      const t = todayStr(); const tEntry = ft.calendar[t] || { parts: [] };
      if (act === "inc" && !tEntry.parts.includes(p)) { tEntry.parts.push(p); ft.calendar[t] = tEntry; }
      save(); renderTrainSections(); renderOverview(); renderTrainLog();
    });
    el.addEventListener("change", (ev) => {
      const inp = ev.target.closest("input[data-f]"); if (!inp) return; const p = inp.closest("[data-part]").dataset.part, i = +inp.closest("[data-part]").dataset.i, f = inp.dataset.f;
      if (ft.actions[p] && ft.actions[p][i]) { ft.actions[p][i][f] = f === "name" ? inp.value : (+inp.value || 0); save(); }
    });
  }

  function renderTrainLog() {
    const t = todayStr(); const e = D.fitness.calendar[t];
    let html = "";
    if (e && e.parts.length) {
      const parts = e.parts.join("·");
      html += `<div class="row"><div class="row-ic" style="background:#d1fae5;color:#047857;">练</div><div class="row-main"><div class="row-title">${t.slice(5)} · ${parts}</div><div class="row-meta">${e.creatine ? '💊' + " 肌酸 " : ""}${e.fishOil ? '🐟' + " 鱼油" : ""}${e.creatine || e.fishOil ? "" : "已打卡"}</div></div><span class="tag tag-green">今日</span></div>`;
    } else html += emptyState('🏋️', '今天还没训练', '点日历或动作 + 号打卡', null, null);
    $("#trainLog").innerHTML = html;
  }

  /* ============ 渲染：财务 ============ */
  let fCurMonth = cmk();
  function renderFinance() {
    const F = D.finance; const nw = netWorth(); const ms = monthSummary(fCurMonth);
    const invProfit = D.finance.invs.reduce((s, i) => s + ((+i.cv || 0) - (+i.cap || 0)), 0);
    rolloverFriv();
    const frivT = frivTotal(); const frivC = frivItems().length; const frivM = cmk();
    finApplyClass();
    $("#body-finance").innerHTML = `
      ${finLockBar()}
      <div class="demo-badge">本地优先 · 数据存浏览器</div>

      <!-- 单一 hero：净资产 + 4 个核心指标 + 同比 -->
      <div class="hero-dark">
        <div class="hd-label">净资产（总资产 − 总负债）</div>
        <div class="hd-main"><span style="color:${nw >= 0 ? "#34d399" : "#fb7185"}">${MM(nw)}</span></div>
        ${(() => {
          const cur = ms.bal;
          const prevMk = (() => { const d = new Date(fCurMonth + "-01"); d.setMonth(d.getMonth() - 1); return dstr(d).slice(0, 7); })();
          const prev = monthSummary(prevMk).bal;
          if (prev == null || prev === 0) return "";
          const delta = cur - prev;
          const pct = (delta / Math.abs(prev) * 100).toFixed(1);
          const up = delta >= 0;
          return `<div class="hd-trend ${up ? "up" : "down"}">${up ? "↑" : "↓"} ${pct.replace("-", "")}% vs 上月 ${MM2(prev)}</div>`;
        })()}
        <div class="hd-grid hd-grid-4">
          <div class="hd-item"><div class="hi-l">总资产</div><div class="hi-v">${MM(aTot() + flexOf(cmk()) + iTot() + hTot() + sTot())}</div></div>
          <div class="hd-item"><div class="hi-l">总负债</div><div class="hi-v" style="color:#fb7185">${MM(dTot())}</div></div>
          <div class="hd-item"><div class="hi-l">本月收入</div><div class="hi-v" style="color:#34d399">${MM(ms.inc)}</div></div>
          <div class="hd-item"><div class="hi-l">本月支出</div><div class="hi-v" style="color:#fb7185">${MM(ms.exp)}</div></div>
        </div>
        <details class="asset-edit">
          <summary>理财与负债（点击展开）</summary>
          <div class="card-sub mb-1">理财项目</div>
          <div id="invList"></div>
          <div style="display:grid;grid-template-columns:1fr 80px 80px;gap:8px;margin-top:8px;"><input id="invName" placeholder="名称"><input id="invCap" type="number" placeholder="本金"><input id="invCv" type="number" placeholder="市值"></div>
          <button class="btn btn-sm w-full mt-1" id="addInv">+ 添加理财</button>
          <div class="card-sub mb-1 mt-2">负债</div>
          <div id="debtList"></div>
          <div style="display:flex;gap:8px;margin-top:8px;"><input id="debtName" placeholder="负债名" style="flex:1;padding:8px 10px;border-radius:8px;border:1px solid var(--border);"><input id="debtAmt" type="number" placeholder="金额" style="width:90px;padding:8px 10px;border-radius:8px;border:1px solid var(--border);"><button class="btn btn-sm" id="addDebt">+</button></div>
        </details>
      </div>

      <!-- 账户余额（前置独立卡 · 卡片化） -->
      <div class="card mt-3">
        <div class="card-head">
          <div class="card-title">账户余额</div>
          <div style="display:flex;gap:8px;align-items:center;">
            <span class="card-sub" style="font-weight:700;color:var(--accent);">${MM(aTot())}</span>
            <button class="btn btn-sm btn-ghost" id="addAcBtn">+ 账户</button>
          </div>
        </div>
        <div id="acctGrid" class="acct-grid"></div>
        <div style="display:flex;gap:8px;margin-top:10px;display:none;" id="addAcRow">
          <input id="newAc" placeholder="账户名" style="flex:1;padding:8px 10px;border-radius:8px;border:1px solid var(--border);">
          <input id="newBal" type="number" placeholder="余额" style="width:90px;padding:8px 10px;border-radius:8px;border:1px solid var(--border);">
          <button class="btn btn-sm btn-primary" id="addAc">保存</button>
        </div>
      </div>

      <!-- 资产构成横向堆叠条 -->
      <div class="card mt-3">
        <div class="card-head"><div class="card-title">资产构成</div><span class="card-sub">总资产 ${MM(aTot() + flexOf(cmk()) + iTot() + hTot() + sTot())}</span></div>
        <div class="asset-bar" id="assetBar"></div>
        <div class="asset-legend" id="assetLegend"></div>
      </div>

      <!-- 本月概览：结余 + 储蓄率 + 日均预算 -->
      <div class="card mt-3 fin-summary">
        <div class="card-head"><div class="card-title">本月概览</div><span class="card-sub">${fCurMonth.replace("-", "年")}月</span></div>
        <div class="fin-summary-grid">
          <div class="fs-item">
            <div class="fs-l">本月结余</div>
            <div class="fs-v" style="color:${ms.bal >= 0 ? "#34d399" : "#fb7185"}">${ms.bal >= 0 ? "+" : ""}${MM(ms.bal)}</div>
          </div>
          <div class="fs-item">
            <div class="fs-l">储蓄率</div>
            <div class="fs-v">${ms.inc > 0 ? Math.round(ms.bal / ms.inc * 100) : 0}%</div>
          </div>
          <div class="fs-item">
            <div class="fs-l">日均预算（剩 ${(() => { const d = new Date(); const last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate(); return Math.max(0, last - d.getDate() + 1); })()} 天）</div>
            <div class="fs-v">${MM(ms.inc > 0 ? Math.max(0, ms.inc - ms.exp) / Math.max(1, (() => { const d = new Date(); const last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate(); return last - d.getDate() + 1; })()) : 0)}</div>
          </div>
        </div>
      </div>

      <!-- 图表前置：支出/收入饼图紧跟 hero，直观看钱花哪了/哪来的 -->
      <div class="grid grid-2 mt-3">
        <div class="card"><div class="card-head"><div class="card-title">支出分类</div><span class="card-sub">${fCurMonth.replace("-", "年")}月</span></div><div class="chart-box"><canvas id="chExp" class="chart"></canvas></div></div>
        <div class="card"><div class="card-head"><div class="card-title">收入来源</div><span class="card-sub">${fCurMonth.replace("-", "年")}月</span></div><div class="chart-box"><canvas id="chInc" class="chart"></canvas></div></div>
      </div>

      <!-- 记账本 -->
      <div class="card mt-3">
        <div class="card-head"><div class="card-title">记账本</div>
          <div style="display:flex;gap:8px;">
            <button class="btn btn-sm btn-ghost" id="catBtn">分类</button>
            <select id="fltMonth" class="btn btn-sm" style="padding:5px 8px;"></select>
          </div>
        </div>
        <div class="form form-3">
          <div class="fld"><label>日期</label><input type="date" id="tDate" value="${todayStr()}"></div>
          <div class="fld"><label>类型</label><select id="tType"><option value="expense">支出</option><option value="income">收入</option></select></div>
          <div class="fld"><label>分类</label><select id="tCat"></select></div>
          <div class="fld"><label>金额</label><input type="number" id="tAmt" step="0.01" placeholder="0.00"></div>
          <div class="fld"><label>账户</label><select id="tAcct"></select></div>
          <div class="fld"><label>备注</label><input id="tNote" placeholder="可选"></div>
        </div>
        <button class="btn btn-primary w-full mt-2" id="addTx">+ 添加记账</button>
        <div class="scroll-list" id="txList"></div>
      </div>

      <!-- 乱花 -->
      <div class="card mt-3">
        <div class="card-head"><div class="card-title">本月非必要性开支 💸</div><div class="tag tag-rose">每月 1 日 0:00 清空</div></div>
        <div class="friv-total"><span class="num">${MM(frivT)}</span><span class="friv-sub">${frivC} 笔 · ${frivM.replace("-", "年")}月</span></div>
        <div class="form form-3">
          <div class="fld"><label>日期</label><input type="date" id="frDate" value="${todayStr()}"></div>
          <div class="fld"><label>买了啥</label><input id="frNote" placeholder="奶茶 / 盲盒 / 随便花"></div>
          <div class="fld"><label>花了多少</label><input id="frAmt" type="number" step="0.01" placeholder="0.00"></div>
        </div>
        <button class="btn btn-primary w-full mt-2" id="addFriv">+ 记一笔乱花</button>
        <div class="scroll-list" id="frivList"></div>
      </div>

      <!-- 月度设置拆为 3 张卡：工资 / 公积金 / 社保 -->
      <div class="card mt-3">
        <div class="card-head"><div class="card-title">月度设置 · 工资</div></div>
        <div class="fld mb-1"><label>月份</label><select id="setMonth"></select></div>
        <div class="form form-2"><div class="fld"><label>月薪</label><input id="setSal" type="number" step="0.01"></div></div>
        <button class="btn btn-primary w-full mt-2" id="saveSet">保存</button>
        <div class="card-sub mt-2" style="font-weight:700;">工资发放记录</div>
        <div class="scroll-list" id="salList"></div>
      </div>

      <div class="card mt-3">
        <div class="card-head"><div class="card-title">公积金</div></div>
        <div class="fld mb-1"><label>月份</label><select id="houMonth"></select></div>
        <div style="display:flex;gap:8px;"><input id="houAmt" type="number" step="0.01" placeholder="本月缴存" style="flex:1;padding:8px 10px;border-radius:8px;border:1px solid var(--border);"><button class="btn btn-sm" id="saveHou">保存</button></div>
        <div class="card mt-2" style="padding:12px 14px;background:var(--amber-soft);"><div style="display:flex;justify-content:space-between;"><span class="card-sub">公积金累计</span><b class="num" style="color:#b45309">${MM(hTot())}</b></div></div>
        <div class="card-sub mt-2" style="font-weight:700;">公积金缴存记录</div>
        <div class="scroll-list" id="houList"></div>
      </div>

      <div class="card mt-3">
        <div class="card-head"><div class="card-title">社保</div></div>
        <div class="fld mb-1"><label>月份</label><select id="sfMonth"></select></div>
        <div style="display:flex;gap:8px;"><input id="sfAmt" type="number" step="0.01" placeholder="本月缴存（精确到分）" style="flex:1;padding:8px 10px;border-radius:8px;border:1px solid var(--border);"><button class="btn btn-sm" id="saveSf">保存</button></div>
        <div class="card mt-2" style="padding:12px 14px;background:var(--amber-soft);"><div style="display:flex;justify-content:space-between;"><span class="card-sub">社保累计</span><b class="num" style="color:#b45309">${MM2(sTot())}</b></div></div>
        <div class="card-sub mt-2" style="font-weight:700;">社保缴存记录</div>
        <div class="scroll-list" id="sfList"></div>
      </div>

      <!-- 趋势图：近 12 月收支结余堆叠柱 -->
      <div class="card mt-3"><div class="card-head"><div class="card-title">月度汇总（近 12 月）</div><span class="card-sub">绿=收入 红=支出 蓝=结余</span></div><div class="chart-box"><canvas id="chTrend" class="chart" style="height:270px;"></canvas></div></div>
      <div class="card mt-3"><div class="card-head"><div class="card-title">年度汇总 <span id="yrBadge" class="tag tag-violet"></span></div><div class="fld" style="width:auto;"><select id="yrSel"></select></div></div><div class="chart-box"><canvas id="chYear" class="chart" style="height:260px;"></canvas></div></div>`;

    const months = allMonths().reverse();
    $("#fltMonth").innerHTML = months.map((m) => `<option value="${m}" ${m === fCurMonth ? "selected" : ""}>${m.replace("-", "年")}月</option>`).join("");
    $("#setMonth").innerHTML = months.slice().reverse().map((m) => `<option value="${m}">${m.replace("-", "年")}月</option>`).join("");
    $("#houMonth").innerHTML = months.slice().reverse().map((m) => `<option value="${m}">${m.replace("-", "年")}月</option>`).join("");
    $("#sfMonth").innerHTML = months.slice().reverse().map((m) => `<option value="${m}">${m.replace("-", "年")}月</option>`).join("");
    const yrs = Array.from(new Set(allMonths().map((m) => +m.split("-")[0]))).concat([new Date().getFullYear()]).sort();
    $("#yrSel").innerHTML = yrs.map((y) => `<option value="${y}">${y}年</option>`).join("");
    $("#yrBadge").textContent = new Date().getFullYear() + "年";
    $("#yrSel").value = new Date().getFullYear();

    popCat(); popAcct(); renderTxList(); renderAssets(); loadSet(); refreshFinCharts();

    $("#tType").onchange = popCat;
    $("#fltMonth").onchange = () => { fCurMonth = $("#fltMonth").value; renderTxList(); };
    $("#addTx").onclick = addTxn;
    $("#catBtn").onclick = openCatModal;
    $("#addAc").onclick = addAcct;
    const acBtn = $("#addAcBtn"); if (acBtn) acBtn.onclick = () => { const row = $("#addAcRow"); if (row) { row.style.display = "flex"; try { $("#newAc").focus(); } catch (e) {} } };
    $("#addInv").onclick = addInv;
    $("#addDebt").onclick = addDebt;
    $("#saveSet").onclick = () => { D.finance.msets[$("#setMonth").value] = { salary: +$("#setSal").value || 0 }; save(); refreshFinCharts(); renderFinance(); toast("已保存"); };
    $("#saveHou").onclick = () => { D.finance.hfund[$("#houMonth").value] = +$("#houAmt").value || 0; save(); renderFinance(); toast("已保存"); };
    $("#saveSf").onclick = () => { D.finance.sfund[$("#sfMonth").value] = +$("#sfAmt").value || 0; save(); renderFinance(); toast("已保存"); };
    $("#setMonth").onchange = () => loadSet();
    $("#houMonth").onchange = () => { $("#houAmt").value = D.finance.hfund[$("#houMonth").value] || ""; };
    $("#sfMonth").onchange = () => { $("#sfAmt").value = D.finance.sfund[$("#sfMonth").value] || ""; };
    $("#yrSel").onchange = () => { $("#yrBadge").textContent = $("#yrSel").value + "年"; refreshFinCharts(); };
    const ft = $("#finToggle"); if (ft) ft.onclick = finToggle;
    const af = $("#addFriv"); if (af) af.onclick = addFriv;
    renderFrivList();
    renderFundLists();
    animateNumbers($("#body-finance"));
  }

  function popCat() { const arr = $("#tType").value === "income" ? D.finance.icats : D.finance.ecats; $("#tCat").innerHTML = arr.map((c) => `<option>${c}</option>`).join(""); }
  function popAcct() { $("#tAcct").innerHTML = Object.keys(D.finance.bals).concat(["其他"]).map((a) => `<option>${a}</option>`).join(""); }
  function renderTxList() {
    const tx = txnsOf(fCurMonth).slice().sort((a, b) => b.date.localeCompare(a.date) || (b.ts || 0) - (a.ts || 0));
    $("#txList").innerHTML = tx.length ? tx.map((t) => `<div class="row"><div class="row-ic" style="background:${t.type === "income" ? "#d1fae5" : "#ffe4e6"};color:${t.type === "income" ? "#047857" : "#be123c"};">${t.type === "income" ? "收" : "支"}</div><div class="row-main"><div class="row-title">${catIcon(t.cat)} ${esc(t.cat)} · ${esc(t.note || "—")}</div><div class="row-meta">${t.date.slice(5)} · ${esc(t.acct || "其他")}</div></div><span class="num" style="color:${t.type === "income" ? "#047857" : "#be123c"};font-weight:800;">${t.type === "income" ? "+" : "-"}${MM2(t.amt)}</span><button class="mi-del" data-deltx="${t.id}">×</button></div>`).join("") : `<div class="empty">本月暂无记录</div>`;
    $$("#txList [data-deltx]").forEach((b) => b.onclick = () => { const id = b.dataset.deltx; const txn = D.finance.txns.find((x) => x.id === id); if (txn) { if (txn.acct && D.finance.bals[txn.acct]) D.finance.bals[txn.acct] += txn.type === "expense" ? +txn.amt : -txn.amt; } D.finance.txns = D.finance.txns.filter((x) => x.id !== id); save(); renderFinance(); renderOverview(); toast("已删除"); });
  }
  function addTxn() {
    const date = $("#tDate").value, type = $("#tType").value, cat = $("#tCat").value, amt = +$("#tAmt").value, acct = $("#tAcct").value, note = $("#tNote").value.trim();
    if (!date || isNaN(amt) || amt <= 0) { toast("请填写完整", "warn"); return; }
    D.finance.txns.push({ id: "t" + Date.now(), date, type, cat, amt, acct, note, ts: Date.now() });
    if (D.finance.bals[acct]) D.finance.bals[acct] += type === "expense" ? -amt : amt;
    save(); $("#tAmt").value = ""; $("#tNote").value = ""; fCurMonth = date.slice(0, 7); $("#fltMonth").value = fCurMonth; renderTxList(); renderAssets(); refreshFinCharts(); renderOverview(); toast("已记账");
  }

  /* ============ 一键直达：快速记账弹窗（绕过财务页） ============ */
  /* 融合 finance-ops（AI CFO 助手）理念：分类按近期使用频率排序 / 单屏录入 / 金额为主输入；
     参考 tax-policy-qa：单笔金额不直接关联税扣除（仅记），后续可导出时按分类标记税前扣除 */
  function quickTxnModal() {
    const txns = D.finance.txns || [];
    const qChips = (type) => {
      const cats = type === "income" ? D.finance.icats : D.finance.ecats;
      const freq = {};
      txns.filter((x) => x.type === type).forEach((x) => { freq[x.cat] = (freq[x.cat] || 0) + 1; });
      return cats.slice().sort((a, b) => (freq[b] || 0) - (freq[a] || 0));
    };
    const accts = () => Object.keys(D.finance.bals);
    const draw = (type) => {
      const cats = qChips(type);
      const selAcct = accts()[0] || "现金";
      $("#modalBody").innerHTML = `
        <div class="card-sub mb-2">快速记一笔 · ${todayStr()}</div>
        <div style="display:flex;gap:8px;margin-bottom:12px;">
          <button class="btn btn-sm ${type === "expense" ? "btn-primary" : "btn-ghost"}" data-qt="expense" style="flex:1;">📉 支出</button>
          <button class="btn btn-sm ${type === "income" ? "btn-primary" : "btn-ghost"}" data-qt="income" style="flex:1;">📈 收入</button>
        </div>
        <div class="fld mb-2"><label>分类（按最近使用频率）</label>
          <div style="display:flex;flex-wrap:wrap;gap:6px;" id="qtChips">
            ${cats.map((c, i) => `<button class="flow-btn ${i === 0 ? "qt-sel" : ""}" data-qc="${esc(c)}" style="padding:6px 12px;font-size:13px;">${esc(c)}</button>`).join("")}
          </div>
        </div>
        <div class="form form-2 mt-2">
          <div class="fld"><label>金额（元）</label><input id="qtAmt" type="number" step="0.01" placeholder="0.00" style="font-size:18px;font-weight:800;" autofocus></div>
          <div class="fld"><label>账户</label><select id="qtAcct">${accts().map((a) => `<option>${esc(a)}</option>`).join("")}</select></div>
        </div>
        <div class="form form-2 mt-2">
          <div class="fld"><label>日期</label><input id="qtDate" type="date" value="${todayStr()}"></div>
          <div class="fld"><label>备注</label><input id="qtNote" placeholder="可选"></div>
        </div>
        <div style="display:flex;gap:8px;margin-top:12px;">
          <button class="btn btn-primary" id="qtSaveMore" style="flex:1;">保存并继续</button>
          <button class="btn btn-ghost" id="qtSave" style="flex:1;">保存</button>
        </div>
        <input type="hidden" id="qtType" value="${type}">
      `;
      $("#qtAcct").value = selAcct;
      let curCat = cats[0];
      $$("#qtChips [data-qc]").forEach((b) => b.onclick = () => { $$("#qtChips [data-qc]").forEach((x) => x.classList.remove("qt-sel")); b.classList.add("qt-sel"); curCat = b.dataset.qc; });
      $$("#modalBody [data-qt]").forEach((b) => b.onclick = () => draw(b.dataset.qt));
      const saveOne = (keep) => {
        const date = $("#qtDate").value, t = $("#qtType").value, amt = +$("#qtAmt").value, acct = $("#qtAcct").value, note = $("#qtNote").value.trim();
        if (!date || isNaN(amt) || amt <= 0) { toast("请填金额", "warn"); return; }
        if (!curCat) { toast("请选分类", "warn"); return; }
        D.finance.txns.push({ id: "t" + Date.now(), date, type: t, cat: curCat, amt, acct, note, ts: Date.now() });
        if (D.finance.bals[acct]) D.finance.bals[acct] += t === "expense" ? -amt : amt;
        save();
        fCurMonth = date.slice(0, 7);
        renderOverview(); refreshFinCharts(); renderFinance();
        toast("已记账 · " + (t === "expense" ? "-" : "+") + MM(amt));
        if (keep) {
          $("#qtAmt").value = ""; $("#qtNote").value = "";
          try { $("#qtAmt").focus(); } catch (e) {}
        } else { closeModal(); }
      };
      $("#qtSave").onclick = () => saveOne(false);
      $("#qtSaveMore").onclick = () => saveOne(true);
    };
    openModal("💎 快速记账", ""); draw("expense");
  }

  /* ============ 一键直达：快速喝水弹窗（绕过饮水页） ============ */
  function quickWaterModal() {
    const t = effectiveToday();  // 使用"有效今天"（凌晨 3 点前算昨天）
    const draw = () => {
      const w = D.nutrition.water[t] || { water: 0, caffeine: 0, chlorogenic: 0, theophylline: 0, drinks: [] };
      const wPct = clamp(w.water / 2000, 0, 1);
      const drinks = D.nutrition.drinks || [];
      const drinkLog = (w.drinks && w.drinks.length)
        ? w.drinks.slice().reverse().map((d) => `<div class="row" style="padding:5px 0;"><div class="row-main"><div class="row-title" style="font-size:13px;">${drinkIcon(d.name)} ${esc(d.name)}</div></div><span class="row-meta" style="font-size:12px;">${d.time || ""}</span></div>`).join("")
        : `<div class="card-sub" style="font-size:12px;">今天还没记录</div>`;
      const drinkChips = drinks.length
        ? drinks.map((d) => `<button class="flow-btn" data-qd="${d.id}" style="padding:8px 12px;font-size:13px;">${drinkIcon(d.name)} ${esc(d.name)}<span style="color:var(--text-soft);font-weight:600;margin-left:4px;">+${d.water}</span></button>`).join("")
        : `<div class="card-sub">还没有饮品模板，去喝水页添加</div>`;
      $("#modalBody").innerHTML = `
        <div style="text-align:center;margin-bottom:14px;">
          <div style="font-size:28px;font-weight:800;font-family:var(--font-num);color:var(--blue);letter-spacing:-0.5px;">${fmt(w.water)} <span style="font-size:14px;color:var(--text-soft);font-weight:600;">/ 2000 ml</span></div>
          <div style="font-size:12px;color:var(--text-soft);margin-top:2px;">${Math.round(wPct * 100)}% · ${wPct >= 1 ? "已达标 🎉" : "还差 " + fmt(2000 - w.water) + " ml"}</div>
        </div>
        <div class="bar" style="height:8px;"><div class="bar-fill" style="width:${Math.round(wPct * 100)}%;background:linear-gradient(90deg,#38bdf8,#2563eb);"></div></div>
        <div class="card-sub mt-3" style="font-weight:700;">点饮品即记录（可连续点）</div>
        <div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:8px;">${drinkChips}</div>
        <div class="card-sub mt-3" style="font-weight:700;">今日喝过</div>
        <div class="scroll-list" style="max-height:160px;">${drinkLog}</div>
      `;
      $$("#modalBody [data-qd]").forEach((b) => b.onclick = () => {
        const d = drinks.find((x) => x.id === b.dataset.qd); if (!d) return;
        const old = D.nutrition.water[t] || { water: 0, caffeine: 0, chlorogenic: 0, theophylline: 0, drinks: [] };
        const x = { water: old.water, caffeine: old.caffeine, chlorogenic: old.chlorogenic, theophylline: old.theophylline, drinks: old.drinks ? old.drinks.slice() : [] };
        x.water += d.water; x.caffeine += d.caffeine; x.chlorogenic += d.chlorogenic; x.theophylline += d.theophylline;
        x.drinks.push({ name: d.name, time: new Date().toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" }) });
        D.nutrition.water[t] = x; save(); draw(); renderOverview(); renderWater(); toast("已记录 " + d.name + " +" + d.water + "ml");
      });
    };
    openModal("🥃 快速喝水", ""); draw();
  }
  function renderAssets() {
    /* 账户余额：卡片化（每账户一张小卡，显示余额+占比+点击切换编辑）— 同时填充总览和财务页 */
    const entries = Object.entries(D.finance.bals).sort((a, b) => b[1] - a[1]);
    const total = aTot();
    const cardHtml = entries.length ? entries.map(([n, v]) => {
      const pct = total > 0 ? (v / total * 100) : 0;
      const neg = v < 0;
      return `<div class="acct-card" data-acct-name="${esc(n)}">
          <div class="acct-name">${esc(n)}</div>
          <div class="acct-amt" style="color:${neg ? "#fb7185" : "var(--text)"}">${MM(v)}</div>
          <div class="acct-bar"><div class="acct-bar-fill" style="width:${Math.max(2, pct)}%;background:${neg ? "#fb7185" : "linear-gradient(90deg,#34d399,#10b981)"};"></div></div>
          <div class="acct-meta">
            <span class="card-sub">占比 ${pct.toFixed(1)}%</span>
            <span class="acct-actions">
              <button class="mi-del" data-editbal="${esc(n)}" title="编辑">✎</button>
              <button class="mi-del" data-delbal="${esc(n)}" title="删除">×</button>
            </span>
          </div>
        </div>`;
    }).join("") : `<div class="card-sub">还没有账户</div>`;
    $$(".acct-grid").forEach((grid) => {
      grid.innerHTML = cardHtml;
      Array.from(grid.querySelectorAll("[data-editbal]")).forEach((b) => b.onclick = () => quickAcctEdit(b.dataset.editbal));
      Array.from(grid.querySelectorAll("[data-delbal]")).forEach((b) => b.onclick = () => { const n = b.dataset.delbal; const ks = Object.keys(D.finance.bals); if (ks.length <= 1) { toast("至少保留一个", "warn"); return; } if (confirm("删除账户「" + n + "」？")) { delete D.finance.bals[n]; save(); renderAssets(); refreshFinCharts(); renderOverview(); } });
    });
    /* 兼容：如果 balList 还存在，用旧逻辑 */
    if ($("#balList")) {
      $("#balList").innerHTML = entries.map(([n, v]) => `<div class="row" style="padding:8px 0;"><div class="row-main"><div class="row-title">${esc(n)}</div></div><input class="fld" style="width:100px;text-align:right;padding:6px 8px;" type="number" data-bal="${esc(n)}" value="${v}"><button class="mi-del" data-delbal="${esc(n)}">×</button></div>`).join("");
      $$("#balList [data-bal]").forEach((i) => i.onchange = () => { D.finance.bals[i.dataset.bal] = +i.value || 0; save(); renderAssets(); refreshFinCharts(); renderOverview(); });
      $$("#balList [data-delbal]").forEach((b) => b.onclick = () => { const n = b.dataset.delbal; const ks = Object.keys(D.finance.bals); if (ks.length <= 1) { toast("至少保留一个", "warn"); return; } if (confirm("删除账户「" + n + "」？")) { delete D.finance.bals[n]; save(); renderAssets(); refreshFinCharts(); renderOverview(); } });
    }

    if ($("#invList")) {
      $("#invList").innerHTML = D.finance.invs.length ? D.finance.invs.map((iv, i) => `<div class="row" style="padding:8px 0;"><input class="fld" style="flex:1;padding:6px 8px;" data-inv="${i}" data-f="name" value="${esc(iv.name)}"><input class="fld" style="width:80px;text-align:right;padding:6px 8px;" type="number" data-inv="${i}" data-f="cv" value="${iv.cv}"><span class="num ${iv.cv - iv.cap >= 0 ? "text-green" : "text-rose"}" style="min-width:64px;text-align:right;color:${iv.cv - iv.cap >= 0 ? "#047857" : "#be123c"}">${iv.cv - iv.cap >= 0 ? "+" : ""}${MM2(iv.cv - iv.cap)}</span><button class="mi-del" data-delinv="${i}">×</button></div>`).join("") : `<div class="card-sub">暂无理财</div>`;
      $$("#invList [data-inv]").forEach((i) => i.onchange = () => { const iv = D.finance.invs[+i.dataset.inv]; iv[i.dataset.f] = i.dataset.f === "name" ? i.value : (+i.value || 0); save(); renderAssets(); refreshFinCharts(); renderOverview(); });
      $$("#invList [data-delinv]").forEach((b) => b.onclick = () => { D.finance.invs.splice(+b.dataset.delinv, 1); save(); renderAssets(); refreshFinCharts(); renderOverview(); });
    }

    if ($("#debtList")) {
      $("#debtList").innerHTML = D.finance.debts.length ? D.finance.debts.map((d, i) => `<div class="row" style="padding:8px 0;"><div class="row-main"><div class="row-title">${esc(d.name)}</div></div><input class="fld" style="width:100px;text-align:right;padding:6px 8px;" type="number" data-debt="${i}" value="${d.amt}"><button class="mi-del" data-deldebt="${i}">×</button></div>`).join("") : `<div class="card-sub">暂无负债</div>`;
      $$("#debtList [data-debt]").forEach((i) => i.onchange = () => { D.finance.debts[+i.dataset.debt].amt = +i.value || 0; save(); renderAssets(); refreshFinCharts(); renderOverview(); });
      $$("#debtList [data-deldebt]").forEach((b) => b.onclick = () => { D.finance.debts.splice(+b.dataset.deldebt, 1); save(); renderAssets(); refreshFinCharts(); renderOverview(); });
    }

    /* 资产构成横向堆叠条 — 同时填充总览和财务页 */
    const segs = [
      { name: "账户", value: aTot(), color: "#10b981" },
      { name: "理财", value: iTot(), color: "#3b82f6" },
      { name: "公积金", value: hTot(), color: "#f59e0b" },
      { name: "社保", value: sTot(), color: "#a855f7" },
    ].filter((s) => s.value > 0);
    const tot = segs.reduce((s, x) => s + x.value, 0) || 1;
    const barHtml = `<div class="asset-bar-track">${segs.map((s) => `<div class="asset-bar-seg" style="width:${(s.value / tot * 100).toFixed(2)}%;background:${s.color};" title="${s.name} ${MM(s.value)}"></div>`).join("")}</div>`;
    const legendHtml = segs.map((s) => `<div class="lg-item"><span class="lg-dot" style="background:${s.color};"></span><span class="lg-name">${s.name}</span><span class="lg-val">${MM(s.value)}</span><span class="lg-pct">${(s.value / tot * 100).toFixed(1)}%</span></div>`).join("");
    $$(".asset-bar").forEach((b) => (b.innerHTML = barHtml));
    $$(".asset-legend").forEach((l) => (l.innerHTML = legendHtml));
  }
  function quickAcctEdit(name) {
    openModal("编辑账户 · " + name, `
      <div class="fld mb-2"><label>账户名</label><input id="qaName" value="${esc(name)}"></div>
      <div class="fld mb-2"><label>余额</label><input id="qaBal" type="number" step="0.01" value="${D.finance.bals[name] || 0}" style="font-size:18px;font-weight:800;"></div>
      <button class="btn btn-primary w-full" id="qaSave">保存</button>
    `);
    $("#qaSave").onclick = () => {
      const newName = $("#qaName").value.trim(); const newBal = +$("#qaBal").value || 0;
      if (!newName) { toast("请输入名称", "warn"); return; }
      if (newName !== name) {
        if (D.finance.bals[newName] != null) { toast("已存在同名账户", "warn"); return; }
        const oldBal = D.finance.bals[name];
        delete D.finance.bals[name];
        D.finance.bals[newName] = newBal;
        D.finance.txns.forEach((t) => { if (t.acct === name) t.acct = newName; });
      } else {
        D.finance.bals[name] = newBal;
      }
      save(); closeModal(); renderAssets(); refreshFinCharts(); renderOverview(); popAcct(); toast("已更新");
    };
  }
  function addAcct() { const n = $("#newAc").value.trim(), b = +$("#newBal").value || 0; if (!n) { toast("请输入名称", "warn"); return; } if (D.finance.bals[n] != null) { toast("已存在", "warn"); return; } D.finance.bals[n] = b; save(); $("#newAc").value = ""; $("#newBal").value = ""; const row = $("#addAcRow"); if (row) row.style.display = "none"; popAcct(); renderAssets(); refreshFinCharts(); renderOverview(); toast("已添加"); }
  function addInv() { const n = $("#invName").value.trim(), c = +$("#invCap").value, v = +$("#invCv").value; if (!n || isNaN(c) || isNaN(v)) { toast("请完整填写", "warn"); return; } D.finance.invs.push({ name: n, cap: c, cv: v }); save(); $("#invName").value = ""; $("#invCap").value = ""; $("#invCv").value = ""; renderAssets(); refreshFinCharts(); renderOverview(); toast("已添加"); }
  function addDebt() { const n = $("#debtName").value.trim(), a = +$("#debtAmt").value; if (!n || isNaN(a) || a <= 0) { toast("请填写", "warn"); return; } D.finance.debts.push({ name: n, amt: a }); save(); $("#debtName").value = ""; $("#debtAmt").value = ""; renderAssets(); refreshFinCharts(); renderOverview(); toast("已添加"); }
  function loadSet() { const s = gms($("#setMonth").value); $("#setSal").value = s.salary || ""; }
  function openCatModal() {
    let type = "expense";
    const draw = () => {
      $("#modalBody").innerHTML = `<div style="display:flex;gap:8px;margin-bottom:14px;"><button class="btn btn-sm ${type === "expense" ? "btn-primary" : "btn-ghost"}" data-ct="expense">支出分类</button><button class="btn btn-sm ${type === "income" ? "btn-primary" : "btn-ghost"}" data-ct="income">收入分类</button></div>
        <div style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:14px;" id="catList"></div>
        <div style="display:flex;gap:8px;"><input id="newCat" placeholder="新分类" style="flex:1;padding:8px 10px;border-radius:8px;border:1px solid var(--border);"><button class="btn btn-sm btn-primary" id="addCat">+</button></div>
        <button class="btn btn-primary w-full mt-2" id="catClose">完成</button>`;
      const arr = type === "expense" ? D.finance.ecats : D.finance.icats;
      $("#catList").innerHTML = arr.map((c) => `<span style="display:inline-flex;align-items:center;gap:4px;padding:5px 10px;border-radius:999px;background:var(--surface-2);font-size:12px;font-weight:600;">${esc(c)}<span data-xcat="${esc(c)}" style="cursor:pointer;color:var(--rose-ink);font-weight:800;">×</span></span>`).join("");
      $$("#catList [data-xcat]").forEach((x) => x.onclick = () => { const a = type === "expense" ? D.finance.ecats : D.finance.icats; if (a.length <= 2) { toast("至少保留2个", "warn"); return; } a.splice(a.indexOf(x.dataset.xcat), 1); save(); draw(); });
      $$("#modalBody [data-ct]").forEach((b) => b.onclick = () => { type = b.dataset.ct; draw(); });
      $("#addCat").onclick = () => { const n = $("#newCat").value.trim(); if (!n) return; const a = type === "expense" ? D.finance.ecats : D.finance.icats; if (a.includes(n)) { toast("已存在", "warn"); return; } a.push(n); save(); draw(); };
      $("#catClose").onclick = () => { closeModal(); popCat(); };
    };
    openModal("管理分类", ""); draw();
  }

  function refreshFinCharts() {
    const ms = monthSummary(fCurMonth);
    const ecItems = Object.entries(ms.ec).filter(([, v]) => v > 0).map(([l, v], i) => ({ label: l, value: v, color: ["#f43f5e", "#f59e0b", "#fbbf24", "#e11d48", "#ec4899", "#fb7185", "#a855f7"][i % 7] }));
    const icItems = Object.entries(ms.ic).filter(([, v]) => v > 0).map(([l, v], i) => ({ label: l, value: v, color: ["#10b981", "#3b82f6", "#8b5cf6", "#14b8a6", "#22d3ee", "#84cc16"][i % 6] }));
    drawDoughnut($("#chExp"), ecItems.length ? ecItems : [{ label: "无", value: 1, color: "#e2e8f0" }], { center: FIN.on ? "🔒" : fmt(ms.exp), centerSub: "支出" });
    drawDoughnut($("#chInc"), icItems.length ? icItems : [{ label: "无", value: 1, color: "#e2e8f0" }], { center: FIN.on ? "🔒" : fmt(ms.inc), centerSub: "收入" });
    const mk = allMonths().slice(-12);
    /* 趋势图改为堆叠柱：收入/支出/结余三组并排柱，比 line 更直观对比量级 */
    drawBar($("#chTrend"), mk.map((m) => +m.split("-")[1] + "月"), [
      { data: mk.map((m) => monthSummary(m).inc), color: "#10b981" },
      { data: mk.map((m) => monthSummary(m).exp), color: "#f43f5e" },
      { data: mk.map((m) => monthSummary(m).bal), color: "#3b82f6" },
    ], { h: 270 });
    const yr = +$("#yrSel").value; const months = Array.from({ length: 12 }, (_, i) => `${yr}-${String(i + 1).padStart(2, "0")}`);
    drawBar($("#chYear"), months.map((m) => +m.split("-")[1] + "月"), [
      { data: months.map((m) => monthSummary(m).inc), color: "#10b981" },
      { data: months.map((m) => monthSummary(m).exp), color: "#f43f5e" },
      { data: months.map((m) => monthSummary(m).bal), color: "#3b82f6" },
    ], { h: 260 });
  }

  /* ============ 渲染：设置 ============ */
  function renderSettings() {
    const p = D.profile; const b = p.body;
    const T = targets();
    $("#body-settings").innerHTML = `
      <div class="grid grid-2">
        <div class="card">
          <div class="card-head"><div class="card-title">个人资料</div></div>
          <div class="form form-2">
            <div class="fld"><label>称呼</label><input id="pName" value="${esc(p.name)}"></div>
            <div class="fld"><label>头像代号（1-2 字）</label><input id="pAvatar" value="${esc(p.avatar)}" maxlength="2"></div>
          </div>
          <button class="btn btn-primary w-full mt-2" id="saveProfile">保存</button>
        </div>
        <div class="card">
          <div class="card-head"><div class="card-title">身体参数</div></div>
          <div class="form form-2">
            <div class="fld"><label>性别</label><select id="bGender"><option value="male" ${b.gender === "male" ? "selected" : ""}>男</option><option value="female" ${b.gender === "female" ? "selected" : ""}>女</option></select></div>
            <div class="fld"><label>年龄</label><input id="bAge" type="number" value="${b.age}"></div>
            <div class="fld"><label>身高 cm</label><input id="bHeight" type="number" step="0.1" value="${b.height}"></div>
            <div class="fld"><label>体重 kg</label><input id="bWeight" type="number" step="0.1" value="${b.weight}"></div>
            <div class="fld"><label>每周训练次数</label><input id="bFreq" type="number" min="0" max="14" step="1" value="${actToFreq(b.activity)}"><div class="card-sub" id="actHint" style="margin-top:4px;"></div></div>
            <div class="fld"><label>每日平均热量缺口 kcal <span class="card-sub" style="font-weight:400;">（正=减脂，0=维持，负=增肌盈余）</span></label><input id="bGap" type="number" step="50" value="${b.gap != null ? b.gap : 300}"><div class="card-sub" id="gapHint" style="margin-top:4px;"></div></div>
            <div class="fld"><label>健身卡到期</label><input id="bExpiry" type="date" value="${D.fitness.expiry}"></div>
          </div>
          <button class="btn btn-primary w-full mt-2" id="saveBody">计算并保存目标</button>
          <div class="card-sub mt-2" id="tgtPreview"></div>
        </div>
      </div>

      <div class="card mt-3">
        <div class="card-head"><div class="card-title">当前目标预览</div></div>
        <div class="form form-2">
          <div class="fld"><label>BMR</label><input readonly value="${Math.round(T.bmr)} kcal"></div>
          <div class="fld"><label>TDEE</label><input readonly value="${T.tdee} kcal"></div>
          <div class="fld"><label>每日缺口（你输入）</label><input readonly value="${T.dailyGap} kcal · ${T.dailyGap > 0 ? "减脂" : T.dailyGap < 0 ? "增肌盈余" : "维持"}"></div>
          <div class="fld"><label>高碳日</label><input readonly value="${T.high.calories} kcal / 碳${T.high.carbs}g / 蛋${T.high.protein}g / 脂${T.high.fat}g"></div>
          <div class="fld"><label>中碳日</label><input readonly value="${T.mid.calories} kcal / 碳${T.mid.carbs}g / 蛋${T.mid.protein}g / 脂${T.mid.fat}g"></div>
          <div class="fld"><label>低碳日</label><input readonly value="${T.low.calories} kcal / 碳${T.low.carbs}g / 蛋${T.low.protein}g / 脂${T.low.fat}g"></div>
          <div class="fld"><label>周均缺口</label><input readonly value="${T.avgGap} kcal" style="color:${T.avgGap > 500 ? "#f43f5e" : T.avgGap < -200 ? "#f43f5e" : ""}"></div>
        </div>
        <div class="card-sub mt-2" id="gapDistribution"></div>
        <div class="card-sub mt-1">胆固醇 ≤300mg/天 · 嘌呤 ≤600mg/天（运动营养共识：训练者高蛋白饮食实际摄入偏高，留余地）</div>
      </div>

      <div class="card mt-3">
        <div class="card-head"><div class="card-title">云同步</div></div>
        <p class="card-sub mb-2">手机 / 电脑 共享同一份数据：填写下方「同步地址」后即自动双向同步（任一端改动，另端刷新可见）。未配置时可用导出 / 导入手动互传。</p>
        <div class="fld" style="margin-bottom:8px;"><label>同步地址（支持 GET / PUT JSON 的服务，如你自己的小服务器）</label><input id="syncUrl" placeholder="https://你的同步服务/天龙人_state.json" value="${SYNC_URL}"></div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:4px;">
          <button class="btn btn-sm btn-primary" id="syncNow">立即同步</button>
          <button class="btn btn-sm" id="exportBtn">导出存档</button>
          <button class="btn btn-sm btn-ghost" id="importBtn">导入存档</button>
          <input type="file" id="importFile" accept=".json" style="display:none;">
          <button class="btn btn-sm" id="resetBtn">重置工作区</button>
          <button class="btn btn-sm btn-rose" id="clearBtn">清空所有数据</button>
        </div>
        <div class="card-sub mt-2" id="syncStatus">${SYNC_URL ? "已配置同步地址（自动）" : "未配置 · 仅本地 + 手动导出导入"}</div>
        <div class="demo-note mt-2">💡 数据完全存储在浏览器本地（localStorage），不会上传到任何服务器。可随时导出备份，或重置为空白状态重新开始。</div>
      </div>

      <div class="card mt-3">
        <div class="card-head"><div class="card-title">财务加密 🔒</div></div>
        <p class="card-sub mb-2">上锁后，净资产 / 记账金额 / 图表等内容以 🔒 遮挡，需输入密码才能查看。密码仅保存在你本机浏览器，发给他人或换设备均不会带出。</p>
        <div style="display:flex;gap:8px;flex-wrap:wrap;">
          <button class="btn btn-sm ${FIN.on ? "btn-ghost" : "btn-primary"}" id="setFinLock">${FIN.on ? "解锁 / 已上锁" : "上锁保护"}</button>
          <button class="btn btn-sm" id="setFinPin">${FIN.pin ? "修改密码" : "设置密码"}</button>
        </div>
        <div class="card-sub mt-2">当前状态：<b>${FIN.on ? "🔒 已加密" : "🔓 未加密"}</b></div>
      </div>

      <div class="card mt-3">
        <div class="card-head"><div class="card-title">关于</div></div>
        <p class="card-sub">天龙人 · 个人工作台 v4.1<br>整合 营养师 / 天龙人 / 小金库 三个小样，现代卡片风格。本地优先：数据只存在你当前浏览器，分享链接不会带出你的任何记录。</p>
      </div>`;

    const prev = () => {
      const tmp = Object.assign({}, D.profile.body); tmp.gap = +$("#bGap").value || 0; const t = computeTargetsFromParams(tmp);
      $("#tgtPreview").innerHTML = `BMR ${Math.round(t.bmr)} · TDEE ${t.tdee} · 蛋白质 ${t.proteinPerKg}g/kg · 缺口 ${t.dailyGap}kcal/天 ${t.dailyGap > 0 ? '<b style="color:#10b981">· 减脂</b>' : t.dailyGap < 0 ? '<b style="color:#3b82f6">· 增肌盈余</b>' : '<b style="color:#64748b">· 维持</b>'}`;
      const gd = $("#gapDistribution"); if (gd) {
        const w = D.profile.body.weight || 66.4;
        const weeklyFatLossKg = t.weeklyDeficit > 0 ? (t.weeklyDeficit / 7700).toFixed(2) : (-t.weeklyDeficit / 7700).toFixed(2);
        const mode = t.weeklyDeficit > 0 ? "≈周减 " + weeklyFatLossKg + " kg 脂肪" : t.weeklyDeficit < 0 ? "≈周增 " + weeklyFatLossKg + " kg 脂肪（增肌盈余）" : "维持体重";
        gd.innerHTML = `<b>缺口分配（每周 2 训练+2 中训+3 休息）</b>：高碳日 ${t.gapHigh >= 0 ? "−" : "+"}${Math.abs(t.gapHigh)} · 中碳日 −${t.gapMid} · 低碳日 −${t.gapLow} kcal（训练日少减甚至略盈余保住增肌信号，休息日多减拉高脂肪氧化）<br><span style="color:${Math.abs(t.dailyGap) > 500 ? "#f43f5e" : "#10b981"}">${mode}${Math.abs(t.dailyGap) > 500 ? " · 缺口偏大（脱发/肌肉流失风险，建议 ≤500）" : ""}</span>`;
      }
    };
    prev();
    $("#saveProfile").onclick = () => { p.name = $("#pName").value.trim() || "我"; p.avatar = $("#pAvatar").value.trim() || "我"; save(); setGreeting(); renderAll(); toast("已保存"); };
    const actHint = () => { const a = freqToAct($("#bFreq").value); const h = $("#actHint"); if (h) h.textContent = "活动系数 " + a + " · " + ACT_DESC[a]; };
    const gapHint = () => { const gv = +$("#bGap").value || 0; const h = $("#gapHint"); if (!h) return; const tag = gv > 0 ? "减脂" : gv < 0 ? "增肌盈余" : "维持"; const lvl = gv > 0 ? (gv > 500 ? "· 偏大" : "· 安全范围") : (gv < -200 ? "· 增肌略快" : "· 合理"); h.textContent = `${tag} ${lvl} · 7700 kcal ≈ 1kg 脂肪`; };
    actHint(); $("#bFreq").oninput = actHint;
    gapHint(); $("#bGap").oninput = () => { gapHint(); prev(); };
    $("#saveBody").onclick = () => {
      const freq = Math.min(14, Math.max(0, +$("#bFreq").value || 0));
      p.body = { gender: $("#bGender").value, age: +$("#bAge").value || 27, height: +$("#bHeight").value || 171.5, weight: +$("#bWeight").value || 66.4, activity: freqToAct(freq), gap: +$("#bGap").value || 0 };
      D.fitness.expiry = $("#bExpiry").value || D.fitness.expiry; save(); prev(); renderAll(); toast("目标已更新 · 缺口 " + p.body.gap + " kcal/天");
    };
    $("#exportBtn").onclick = () => { const blob = new Blob([JSON.stringify(D, null, 2)], { type: "application/json" }); const u = URL.createObjectURL(blob); const a = document.createElement("a"); a.href = u; a.download = `天龙人_${todayStr()}.json`; a.click(); URL.revokeObjectURL(u); toast("已导出"); };
    $("#importBtn").onclick = () => $("#importFile").click();
    $("#importFile").onchange = (e) => { const f = e.target.files[0]; if (!f) return; const r = new FileReader(); r.onload = (ev) => {
      try {
        const raw = JSON.parse(ev.target.result);
        const j = unwrapSave(raw);
        const n = j && normalize(j);
        if (!n) { toast("不是有效的天龙人存档", "warn"); return; }
        D = n; save(); renderAll(); toast("导入成功 · 已载入你的存档");
      } catch (err) { toast("文件解析失败，请确认是导出的 JSON", "warn"); }
    }; r.readAsText(f); e.target.value = ""; };
    $("#resetBtn").onclick = () => { if (confirm("重置为空白工作区？所有记录将被清空，配置保留。")) { D = demo(); save(); renderAll(); toast("已重置为空白工作区"); } };
    const sfl = $("#setFinLock"); if (sfl) sfl.onclick = finToggle;
    const sfp = $("#setFinPin"); if (sfp) sfp.onclick = finChangePin;
    $("#clearBtn").onclick = () => { if (confirm("清空所有数据？将变为空白工作区，不可恢复（建议先导出备份）。")) { localStorage.removeItem(STORE); D = emptyWorkspace(); save(); renderAll(); toast("已清空所有数据"); } };
    const syncUrlInput = $("#syncUrl");
    if (syncUrlInput) syncUrlInput.onchange = () => { SYNC_URL = syncUrlInput.value.trim(); try { localStorage.setItem("tlr_sync_url", SYNC_URL); } catch (e) {} const s = $("#syncStatus"); if (s) s.textContent = SYNC_URL ? "已配置同步地址（自动）" : "未配置 · 仅本地 + 手动导出导入"; toast(SYNC_URL ? "同步地址已保存" : "已关闭自动同步"); if (SYNC_URL) syncPull(renderAll); };
    const syncNowBtn = $("#syncNow");
    if (syncNowBtn) syncNowBtn.onclick = () => { if (!SYNC_URL) { toast("请先填写同步地址", "warn"); return; } syncPull(() => { syncPush(); renderAll(); }); };
  }

  /* ============ 渲染：打卡（自填时间 + 提醒） ============ */
  const PUNCH_STEPS = [
    { key: "amIn", label: "上午上班", emoji: "🌅", win: "08:15", leave: false },
    { key: "amOut", label: "上午下班", emoji: "🍱", win: "12:15", leave: true },
    { key: "pmIn", label: "下午上班", emoji: "☀️", win: "14:00", leave: false },
    { key: "pmOut", label: "下午下班", emoji: "🌆", win: "17:30", leave: true },
  ];
  function punchRec(ds) { D.punch = D.punch || {}; return D.punch[ds] || (D.punch[ds] = { times: {}, ot: 0 }); }
  function toMin(hm) { if (!hm || !/^\d{1,2}:\d{2}$/.test(hm)) return null; const [h, m] = hm.split(":").map(Number); return h * 60 + m; }
  function nowHM() { const d = new Date(); return String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0"); }
  function renderPunch() {
    D.punch = D.punch || {};
    const t = todayStr(); const d = new Date(); const wd = d.getDay(); const weekend = wd === 0 || wd === 6;
    const rec = punchRec(t); const tm = rec.times || {};
    const nm = toMin(nowHM());
    const statusOf = (st) => {
      const v = tm[st.key];
      if (!v) {
        if (weekend) return { cls: "tag-gray", txt: "未打卡" };
        const wm = toMin(st.win);
        return nm > wm ? { cls: "tag-rose", txt: "漏打卡" } : { cls: "tag-gray", txt: "待打卡" };
      }
      if (weekend) return { cls: "tag-amber", txt: "加班 " + v };
      const wm = toMin(st.win), vm = toMin(v);
      if (st.leave) {
        if (vm < wm) { const d = wm - vm; return { cls: "tag-rose", txt: "早退 " + v, late: d, kind: "早退" }; }
        return { cls: "tag-green", txt: "正常 " + v };
      }
      if (vm <= wm) return { cls: "tag-green", txt: "准时 " + v };
      const d = vm - wm; return { cls: "tag-rose", txt: "迟到 " + v, late: d, kind: "迟到" };
    };
    const rows = PUNCH_STEPS.map((st) => {
      const s = statusOf(st);
      const lateChip = s.late ? `<span class="prow-late ${st.leave ? "early" : "late"}" title="${st.leave ? "早退 " + s.late + " 分钟" : "迟到 " + s.late + " 分钟，建议下班延后 " + s.late + " 分补工时"}">${s.kind} ${s.late} 分${st.leave ? "" : " · 下班延后 " + s.late}</span>` : "";
      return `<div class="prow">
        <div class="prow-main"><div class="prow-label">${st.emoji} ${st.label}</div><div class="prow-tip">建议 ${st.win}</div></div>
        <input type="time" class="punch-time" data-pk="${st.key}" value="${tm[st.key] || ""}">
        <span class="tag ${s.cls}">${s.txt}</span>
        ${lateChip}
        <button class="btn btn-sm btn-ghost" data-now="${st.key}">现在</button>
        <button class="btn btn-sm btn-ghost mi-del" data-del="${st.key}" title="删除该打卡">×</button>
      </div>`;
    }).join("");
    let banner;
    if (weekend) banner = "周末 · 打卡计为加班，任意时间记录即可";
    else {
      const next = PUNCH_STEPS.find((st) => !tm[st.key]);
      if (!next) banner = "✅ 今日四段打卡已全部记录";
      else { const wm = toMin(next.win); banner = (nm >= wm) ? `⏰ 该「${next.label}」了（建议 ${next.win}）` : `距「${next.label}」还有 ${wm - nm} 分钟（建议 ${next.win}）`; }
    }
    const keys = Object.keys(D.punch).sort().reverse().slice(0, 7);
    const hist = keys.length ? keys.map((k) => {
      const rr = D.punch[k]; const w = new Date(k).getDay(); const we = w === 0 || w === 6; const ts = rr.times || {};
      const parts = PUNCH_STEPS.map((st) => `${st.label}${ts[st.key] || "—"}`).join(" · ");
      return `<div class="row"><div class="row-main"><div class="row-title">${k.slice(5)}</div><div class="row-meta">${parts}</div></div><span class="tag ${we ? "tag-amber" : "tag-gray"}">${we ? "周末" : "工作日"}</span></div>`;
    }).join("") : emptyState('📋', '还没有打卡记录', '开始记录你的每日打卡吧', null, null);
    $("#body-punch").innerHTML = `
      <div class="demo-badge">本地优先 · 数据存浏览器</div>
      <div class="card">
        <div class="card-head"><div class="card-title">上下班打卡</div><span class="card-sub">${t} 周${WK[wd]}${weekend ? " · 周末" : ""}</span></div>
        <div class="punch-banner ${weekend ? "we" : ""}">${banner}</div>
        <div class="prows">${rows}</div>
        <div class="punch-foot" style="display:flex;justify-content:space-between;align-items:center;gap:8px;"><span>手动填写实际时间，或点「现在」记录当前时刻；系统按建议时间判断 准时 / 迟到 / 早退 / 加班。</span><button class="btn btn-sm btn-ghost" data-clear="1">清空今日</button></div>
      </div>
      <div class="card mt-3">
        <div class="card-head"><div class="card-title">近期打卡</div></div>
        <div class="punch-hist">${hist}</div>
      </div>`;
    // 事件委托：打卡操作（时间修改/现在打卡/删除/清空）
    $("#body-punch").onclick = (e) => {
      const d = e.target;
      if (d.classList.contains("punch-time")) { punchRec(t).times[d.dataset.pk] = d.value; save(); renderPunch(); }
      else if (d.dataset.now) { punchRec(t).times[d.dataset.now] = nowHM(); save(); renderPunch(); }
      else if (d.dataset.del) { delete punchRec(t).times[d.dataset.del]; save(); renderPunch(); toast("已删除该打卡"); }
      else if (d.dataset.clear) { if (confirm("清空今日（" + t + "）全部打卡记录？")) { delete D.punch[t]; save(); renderPunch(); renderOverview(); toast("已清空今日打卡"); } }
    };
  }

  /* ============ 顶部问候 & 导航 ============ */
  function setGreeting() {
    const h = new Date().getHours(); const hi = h < 6 ? "凌晨好" : h < 12 ? "早上好" : h < 14 ? "中午好" : h < 18 ? "下午好" : "晚上好";
    $("#greetTitle").textContent = `${hi}，${D.profile.name}`;
    const d = new Date(); $("#greetSub").textContent = `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日 周${WK[d.getDay()]} · 掌控每一天`;
    $("#avatarBtn").textContent = D.profile.avatar;
  }
  let curPage = "overview";
  let _initialized = false; // 标记是否已完成首次全量渲染
  const _renderMap = {
    overview: renderOverview, calendar: renderCalendar, weight: renderWeight,
    nutrition: renderNutrition, fitness: renderFitness, finance: renderFinance,
    settings: renderSettings, punch: renderPunch, water: renderWater,
  };
  function navigate(p) {
    curPage = p;
    $$(".nav-item").forEach((b) => b.classList.toggle("active", b.dataset.page === p));
    $$(".page").forEach((pg) => pg.classList.toggle("active", pg.id === "page-" + p));
    closeDrawer();
    // 只渲染目标页面（首次加载由 renderAll 统一处理）
    if (_initialized && _renderMap[p]) _renderMap[p]();
  }
  function openDrawer() { $("#sidebar").classList.add("open"); $("#backdrop").classList.add("on"); }
  function closeDrawer() { $("#sidebar").classList.remove("open"); $("#backdrop").classList.remove("on"); }

  // renderAll：首次调用全量渲染（确保各页面数据就绪），后续只刷新当前页
  function renderAll() {
    if (!_initialized) {
      _initialized = true;
      Object.values(_renderMap).forEach(fn => fn());
    } else if (_renderMap[curPage]) {
      _renderMap[curPage]();
    }
  }

  /* ============ 事件 & 启动 ============ */
  function bind() {
    $$(".nav-item").forEach((b) => (b.onclick = () => navigate(b.dataset.page)));
    $("#menuBtn").onclick = openDrawer;
    $("#backdrop").onclick = closeDrawer;
    $("#modalClose").onclick = closeModal;
    $("#overlay").onclick = (e) => { if (e.target === $("#overlay")) closeModal(); };
    $("#avatarBtn").onclick = () => navigate("settings");
    $("#themeBtn").onclick = toggleTheme;
    document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeModal(); });
    // resize 防抖：避免频繁重渲染
    let _resizeT;
    window.addEventListener("resize", () => {
      clearTimeout(_resizeT);
      _resizeT = setTimeout(() => {
        if (_renderMap[curPage]) _renderMap[curPage]();
      }, 150);
    });
    bindGestures();
  }

  /* ============ 手势：右滑关弹窗/开侧栏，左滑收起侧栏 ============ */
  function bindGestures() {
    const ov = $("#overlay"), sb = $("#sidebar");
    let sx = 0, sy = 0;
    const modalOpen = () => ov.classList.contains("on");
    const drawerOpen = () => sb.classList.contains("open");
    window.addEventListener("touchstart", (e) => { const t = e.touches[0]; sx = t.clientX; sy = t.clientY; }, { passive: true });
    window.addEventListener("touchend", (e) => {
      const t = e.changedTouches[0];
      const dx = t.clientX - sx, dy = t.clientY - sy;
      const adx = Math.abs(dx), ady = Math.abs(dy);
      if (adx < 50 || adx < ady * 1.5) return; // 非水平滑动（如纵向滚屏）忽略
      if (dx > 0) { // 向右滑
        if (modalOpen()) closeModal();
        else if (!drawerOpen()) openDrawer();
      } else { // 向左滑
        if (drawerOpen()) closeDrawer();
      }
    }, { passive: true });
  }

  function setThemeIcon() {
    const dark = document.documentElement.getAttribute("data-theme") === "dark";
    $("#themeBtn").innerHTML = dark
      ? '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"></circle><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"></path></svg>'
      : '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.8A9 9 0 1 1 11.2 3 7 7 0 0 0 21 12.8z"></path></svg>';
  }
  function toggleTheme() {
    const cur = document.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "light";
    const next = cur === "dark" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", next);
    try { localStorage.setItem("tl-theme", next); } catch (e) {}
    setThemeIcon(); renderAll();
  }

  function start() {
    setGreeting();
    setThemeIcon();
    bind();
    finApplyClass();
    initRipple();  // 初始化 ripple 波纹效果
    initPWA();     // PWA 支持（SW + 安装提示）
    initVisibilityRefresh();  // 标签页切换自动刷新
    dailyRollover();  // 每日数据重置（凌晨 3 点生效）

    // 添加噪点纹理
    document.body.classList.add('noise-bg');

    if (SYNC_URL) syncPull(renderAll);
    else renderAll();
    rolloverFriv();
    setInterval(() => {
      // 每分钟检查：月度重置（非必要性开支）
      if (rolloverFriv()) { if (curPage === "finance") renderFinance(); toast("非必要性开支已清空 · 新的一月 🎈"); }
      // 每分钟检查：日重置（饮水、待办等）
      if (dailyRollover()) { renderAll(); }
    }, 60000);
  }

  /* ============ Ripple 波纹效果 ============ */
  function initRipple() {
    document.addEventListener("click", (e) => {
      const btn = e.target.closest(".btn");
      if (!btn) return;

      // 避免重复触发（已有 ripple 动画中的不新增）
      if (btn.querySelector(".ripple")) return;

      const rect = btn.getBoundingClientRect();
      const size = Math.max(rect.width, rect.height) * 2;
      const x = e.clientX - rect.left - size / 2;
      const y = e.clientY - rect.top - size / 2;

      const ripple = document.createElement("span");
      ripple.className = "ripple";
      ripple.style.cssText = `width:${size}px;height:${size}px;left:${x}px;top:${y}px;`;

      btn.appendChild(ripple);

      ripple.addEventListener("animationend", () => ripple.remove());
    });
  }

  /* ============ 交错显示动画 (Stagger) ============ */
  function staggerChildren(container, selector = '.stagger-item') {
    if (!container) return;
    container.querySelectorAll(selector).forEach((el, i) => {
      el.classList.add('stagger-item');
      el.style.animationDelay = `${i * 0.05}s`;
    });
  }

  /* ============ 图表统一配色 ============ */
  const CHART_COLORS = {
    primary: '#0e9f6e',
    success: '#10b981',
    danger: '#f43f5e',
    warning: '#f59e0b',
    info: '#3b82f6',
    violet: '#8b5cf6',
    teal: '#14b8a6',
    grid: 'rgba(0,0,0,0.06)',
    text: '#64748b',
  };

  /* ============ 图表 Tooltip 组件 ============ */
  class ChartTooltip {
    constructor(canvas) {
      this.canvas = canvas;
      this.el = document.createElement('div');
      this.el.className = 'chart-tooltip';
      canvas.parentElement.appendChild(this.el);
      this.hide();
    }
    show(x, y, content) {
      this.el.innerHTML = content;
      const rect = this.canvas.parentElement.getBoundingClientRect();
      this.el.style.left = Math.min(x, rect.width - 120) + 'px';
      this.el.style.top = (y - 40) + 'px';
      this.el.classList.add('visible');
    }
    hide() { this.el.classList.remove('visible'); }
  }

  /* ============ 图表动画包装器 ============ */
  function animateChart(drawFn, duration = 800) {
    const start = performance.now();
    function frame(now) {
      const progress = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3); // easeOutCubic
      drawFn(eased);
      if (progress < 1) requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  }

  /* ============ PWA 支持 ============ */
  let deferredPrompt;
  function initPWA() {
    // 注册 Service Worker
    if ('serviceWorker' in navigator) {
      window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js')
          .then((reg) => console.log('[SW] 注册成功，scope:', reg.scope))
          .catch((err) => console.warn('[SW] 注册失败:', err));
      });
    }

    // 安装提示
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      deferredPrompt = e;
      showPWAInstallBanner();
    });

    window.addEventListener('appinstalled', () => {
      toast('✅ 天龙人已安装为应用');
      deferredPrompt = null;
      hidePWAInstallBanner();
    });
  }

  function showPWAInstallBanner() {
    const existing = $('#pwaInstallBar');
    if (existing) { existing.style.display = 'flex'; return; }

    const bar = document.createElement('div');
    bar.id = 'pwaInstallBar';
    bar.className = 'pwa-install-bar';
    bar.innerHTML = `
      <span class="pwa-install-text">📱 安装天龙人到桌面，像 APP 一样使用</span>
      <button class="pwa-install-btn" id="pwaInstallBtn">安装</button>
    `;
    const content = $('.content');
    if (content) content.insertBefore(bar, content.firstChild);

    $('#pwaInstallBtn').onclick = async () => {
      if (!deferredPrompt) return;
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === 'accepted') toast('🎉 已安装到桌面！');
      deferredPrompt = null;
      hidePWAInstallBanner();
    };
  }

  function hidePWAInstallBanner() {
    const bar = $('#pwaInstallBar');
    if (bar) bar.style.display = 'none';
  }

  /* ============ visibilitychange 自动刷新 ============ */
  function initVisibilityRefresh() {
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden && _initialized) renderAll();
    });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start); else start();
})();
