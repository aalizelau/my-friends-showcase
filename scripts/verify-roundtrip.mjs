// 序列化 round-trip 測試：證明寫入層不會弄壞既有資料。
// 用法：node scripts/verify-roundtrip.mjs
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { parseProfile } from "../server/profiles.mjs";
import { friendToMarkdown } from "../server/serialize.mjs";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const dir = join(ROOT, "data", "friends");
let fail = 0;

// A) serialize(parse(md)) 與原檔逐位元組相同（序列化器 = 解析器的精確逆運算）
for (const file of readdirSync(dir).filter(f => f.endsWith(".md")).sort()) {
  const md = readFileSync(join(dir, file), "utf8");
  const out = friendToMarkdown(parseProfile(md));
  if (out === md) console.log(`✓ ${file}：serialize(parse(md)) 與原檔完全相同`);
  else {
    fail++;
    let i = 0; while (i < md.length && md[i] === out[i]) i++;
    console.error(`✗ ${file}：@${i}\n  原檔: ${JSON.stringify(md.slice(i, i + 50))}\n  產出: ${JSON.stringify(out.slice(i, i + 50))}`);
  }
}

// B) 新朋友（無 profile）序列化 → 解析回來，核心欄位保留、profile.sources 為空
const fresh = { id: "tmp-x9", name: "小明", nickname: "", relation: "close", birthday: "1990-01-01", avatar: 3, interactions: [] };
const back = parseProfile(friendToMarkdown(fresh));
const coreOk = ["id", "name", "nickname", "relation", "birthday", "avatar"].every(k => back[k] === fresh[k]);
if (coreOk && Array.isArray(back.interactions) && back.interactions.length === 0 && back.profile.sources.length === 0)
  console.log("✓ 新朋友：核心欄位與空 interactions/sources 正確");
else { fail++; console.error("✗ 新朋友 round-trip 有誤", JSON.stringify(back)); }

// C) 挑一個有完整 profile 的檔，加一則片段後重寫，既有 profile/sources 不受影響
const rich = readdirSync(dir).filter(f => f.endsWith(".md"))
  .map(f => parseProfile(readFileSync(join(dir, f), "utf8"))).find(fr => fr.profile.now);
const before = JSON.stringify(rich.profile);
const n = rich.interactions.length;
rich.interactions.push({ id: "test1", date: "2026-09-01", type: "見面", note: "測試片段", lifeUpdate: "" });
const rich2 = parseProfile(friendToMarkdown(rich));
if (JSON.stringify(rich2.profile) === before && rich2.interactions.length === n + 1)
  console.log("✓ 加片段：既有 profile/sources 完整保留");
else { fail++; console.error("✗ 加片段破壞了既有資料"); }

console.log(fail ? `\n${fail} 項失敗` : "\n全部通過");
process.exit(fail ? 1 : 0);
