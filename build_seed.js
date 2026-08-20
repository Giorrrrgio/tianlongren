/* 把三份用户存档合并成工作台种子数据 seed.js
 * 来源：
 *   小金库   -> finance
 *   天龙人   -> fitness(calendar/expiry/actions) + nutrition(water/drinks/weight)
 *   营养师   -> nutrition(daily/planStartDate)
 * 原则：一个字段都不许丢。
 */
const fs = require("fs");
const path = require("path");

const DESK = "C:/Users/Administrator/Desktop";
const fin = JSON.parse(fs.readFileSync(path.join(DESK, "小金库_20260811_0010.json"), "utf8"));
const fit = JSON.parse(fs.readFileSync(path.join(DESK, "tianlongren_backup_2026-08-11.json"), "utf8"));
const nut = JSON.parse(fs.readFileSync(path.join(DESK, "nutritionist_backup_2026-08-11.json"), "utf8"));

// msets: 原结构 { "2026-07": 500 } -> { "2026-07": { salary:500, flexible:0 } }
const msets = {};
for (const [k, v] of Object.entries(fin.msets || {})) {
  msets[k] = (v && typeof v === "object") ? v : { salary: Number(v) || 0, flexible: 0 };
}

// 最新体重（取自天龙人体重记录最后一条）
const wHist = (fit.weight || []).slice().sort((a, b) => a.date.localeCompare(b.date));
const latestW = wHist.length ? wHist[wHist.length - 1].weight : 65.8;

const SEED = {
  __v: 3,
  profile: {
    name: "我",
    avatar: "我",
    body: { gender: "male", age: 27, height: 171.5, weight: latestW, activity: 1.725 },
    level: { lv: 3, xp: 60, max: 100 },
  },
  nutrition: {
    daily: nut.dailyRecords || {},       // 营养师全部饮食记录（含空占位，保证零丢失）
    planStartDate: nut.planStartDate || null,
    weight: fit.weight || [],           // 天龙人体重/体脂/肌肉
    water: fit.water || {},             // 天龙人饮水/咖啡因
    drinks: fit.drinks || [],           // 天龙人饮品按钮
    trendDays: 14,
  },
  fitness: {
    expiry: fit.expiry || "2026-09-05",
    calendar: fit.calendar || {},       // 天龙人训练日历
    actions: fit.actions || {},         // 天龙人分部位动作
  },
  finance: {
    txns: fin.txns || [],               // 小金库全部流水
    msets,
    ecats: fin.ecats || [],
    icats: fin.icats || [],
    bals: fin.bals || {},               // 小金库账户余额
    invs: fin.invs || [],
    debts: fin.debts || [],
    hfund: fin.hfund || {},             // 公积金
  },
};

const out = "window.__SEED__ = " + JSON.stringify(SEED) + ";\n";
fs.writeFileSync(path.join(__dirname, "seed.js"), out, "utf8");

// 校验：逐字段报告计数，确保没丢
const r = (o) => (o ? Object.keys(o).length : 0);
console.log("=== 合并校验 ===");
console.log("finance.txns      :", SEED.finance.txns.length);
console.log("finance.bals      :", r(SEED.finance.bals), JSON.stringify(SEED.finance.bals));
console.log("finance.debts     :", SEED.finance.debts.length, JSON.stringify(SEED.finance.debts));
console.log("finance.hfund     :", r(SEED.finance.hfund), JSON.stringify(SEED.finance.hfund));
console.log("finance.msets     :", r(SEED.finance.msets), JSON.stringify(SEED.finance.msets));
console.log("finance.ecats     :", SEED.finance.ecats.length);
console.log("finance.icats     :", SEED.finance.icats.length);
console.log("fitness.calendar  :", r(SEED.fitness.calendar));
console.log("fitness.actions   :", r(SEED.fitness.actions));
console.log("fitness.expiry    :", SEED.fitness.expiry);
console.log("nutrition.daily   :", r(SEED.nutrition.daily));
console.log("nutrition.weight  :", SEED.nutrition.weight.length);
console.log("nutrition.water   :", r(SEED.nutrition.water));
console.log("nutrition.drinks :", SEED.nutrition.drinks.length);
console.log("nutrition.planStart:", SEED.nutrition.planStartDate);
console.log("seed.js bytes     :", out.length);
console.log("OK: seed.js 已生成");
