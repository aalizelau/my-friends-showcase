// JSON → md 遷移：把 app.js 裡 3 位真實朋友轉成 data/friends/<id>.md
// 零依賴，用法：node scripts/migrate.mjs
// 契約見 docs/profile-schema.md；序列化邏輯與寫入層共用 server/serialize.mjs

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { friendToMarkdown } from "../server/serialize.mjs";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const REAL_IDS = ["alvin", "toki", "alvin-keung"]; // 其餘為示範資料，不轉

// 從 app.js 抽出 defaultFriends 陣列（純資料，可安全 eval）
function extractDefaultFriends() {
  const src = readFileSync(join(ROOT, "app.js"), "utf8");
  const marker = src.indexOf("const defaultFriends =");
  if (marker < 0) throw new Error("app.js 已不含 defaultFriends（demo 資料已移除）。此腳本僅供一次性初始遷移。");
  const arrStart = src.indexOf("[", marker);
  const end = src.indexOf("\nconst palettes");
  let literal = src.slice(arrStart, end).trim();
  if (literal.endsWith(";")) literal = literal.slice(0, -1);
  return new Function("return " + literal)();
}

const outDir = join(ROOT, "data", "friends");
mkdirSync(outDir, { recursive: true });
const all = extractDefaultFriends();
let count = 0;
for (const id of REAL_IDS) {
  const friend = all.find(x => x.id === id);
  if (!friend?.profile) { console.warn(`⚠ 找不到 ${id} 或缺 profile，略過`); continue; }
  writeFileSync(join(outDir, `${id}.md`), friendToMarkdown(friend), "utf8");
  console.log(`✓ ${id} → data/friends/${id}.md`);
  count++;
}
console.log(`\n完成：${count} 個檔案`);
