// 讀取層：把 data/friends/*.md 解析回前端要的 friend 物件。
// 契約見 docs/profile-schema.md。frontmatter 只支援 migrate.mjs 產出的 YAML 子集
// （巢狀 map、map 序列、行內 flow 陣列、JSON 雙引號/單引號/裸量值），遇到未預期語法會明確拋錯，不會靜默誤解。

import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";

// ---------- scalar ----------
function parseScalar(s) {
  s = s.trim();
  if (s === "" || s === "null" || s === "~") return null;
  if (s === "true") return true;
  if (s === "false") return false;
  if (s[0] === '"') return JSON.parse(s);                       // JSON 雙引號（含跳脫）
  if (s[0] === "'") return s.slice(1, -1).replace(/''/g, "'");  // YAML 單引號
  if (s[0] === "[") return parseFlowArray(s);
  if (/^-?\d+(\.\d+)?$/.test(s)) return Number(s);
  return s;                                                     // 裸字串
}

// 行內陣列 ["a", "b"]：逐字掃描，尊重引號內的逗號
function parseFlowArray(s) {
  const inner = s.slice(1, -1).trim();
  if (!inner) return [];
  const items = [];
  let i = 0;
  while (i < inner.length) {
    while (i < inner.length && /\s/.test(inner[i])) i++;
    if (inner[i] === '"') {
      let j = i + 1, str = '"';
      while (j < inner.length) {
        if (inner[j] === "\\") { str += inner[j] + inner[j + 1]; j += 2; continue; }
        str += inner[j];
        if (inner[j] === '"') { j++; break; }
        j++;
      }
      items.push(JSON.parse(str));
      i = j;
    } else {
      let j = i;
      while (j < inner.length && inner[j] !== ",") j++;
      items.push(parseScalar(inner.slice(i, j)));
      i = j;
    }
    while (i < inner.length && inner[i] !== ",") i++;
    i++; // 跳過逗號
  }
  return items;
}

// ---------- frontmatter (block YAML 子集) ----------
function parseFrontmatter(text) {
  const lines = [];
  for (const raw of text.split("\n")) {
    const line = raw.replace(/\s+$/, "");
    if (!line.trim() || /^\s*#/.test(line)) continue; // 略過空行與整行註解
    lines.push({ indent: line.length - line.trimStart().length, content: line.trim() });
  }
  let pos = 0;

  const isDash = c => c === "-" || c.startsWith("- ");
  const splitKey = c => {
    const i = c.indexOf(":");
    if (i < 0) throw new Error(`frontmatter 非預期的行：${c}`);
    return [c.slice(0, i).trim(), c.slice(i + 1).trim()];
  };

  function parseNode(indent) {
    return isDash(lines[pos].content) ? parseSeq(indent) : parseMap(indent);
  }
  function parseMap(indent) {
    const obj = {};
    while (pos < lines.length && lines[pos].indent === indent && !isDash(lines[pos].content)) {
      const [key, rest] = splitKey(lines[pos].content);
      pos++;
      if (rest !== "") obj[key] = parseScalar(rest);
      else obj[key] = parseNode(lines[pos].indent); // key: 後接更深的巢狀 block
    }
    return obj;
  }
  function parseSeq(indent) {
    const arr = [];
    while (pos < lines.length && lines[pos].indent === indent && isDash(lines[pos].content)) {
      const content = lines[pos].content;
      if (content === "-") { pos++; arr.push(parseNode(lines[pos].indent)); continue; }
      const inner = content.slice(2);           // "- " 之後
      const childIndent = indent + 2;
      if (/^[^:\s][^:]*:(\s|$)/.test(inner)) {  // map 序列項（首鍵行內）
        const obj = {};
        const [k0, r0] = splitKey(inner);
        obj[k0] = parseScalar(r0);              // migrate 產出中首鍵一定是行內量值
        pos++;
        while (pos < lines.length && lines[pos].indent === childIndent && !isDash(lines[pos].content)) {
          const [k, r] = splitKey(lines[pos].content);
          if (r === "") throw new Error(`序列項內不支援巢狀 block：${lines[pos].content}`);
          obj[k] = parseScalar(r);
          pos++;
        }
        arr.push(obj);
      } else {
        arr.push(parseScalar(inner));
        pos++;
      }
    }
    return arr;
  }

  const result = pos < lines.length ? parseNode(lines[pos].indent) : {};
  return result;
}

// ---------- body sources ----------
function parseBodySources(body) {
  const parts = body.split(/\n### /);
  const sources = [];
  for (const part of parts.slice(1)) {            // parts[0] 是 "## Sources" 前言
    const nl = part.indexOf("\n");
    const id = (nl < 0 ? part : part.slice(0, nl)).trim();
    const restLines = (nl < 0 ? "" : part.slice(nl + 1)).split("\n");
    let k = 0;
    while (k < restLines.length && !restLines[k].trim()) k++;
    // meta 行格式："date: X · label: Y [· archive: true]"；label 可含 " · "，用定位解析
    let metaLine = restLines[k] || "";
    let archive = false;
    if (metaLine.endsWith(" · archive: true")) { archive = true; metaLine = metaLine.slice(0, -" · archive: true".length); }
    let date = "", label = "";
    const li = metaLine.indexOf(" · label: ");
    if (metaLine.startsWith("date: ") && li >= 0) {
      date = metaLine.slice("date: ".length, li).trim();
      label = metaLine.slice(li + " · label: ".length).trim();
    } else {
      for (const seg of metaLine.split(" · ")) {          // 後備：舊式逐段
        const ci = seg.indexOf(": ");
        if (ci < 0) continue;
        const key = seg.slice(0, ci).trim(), val = seg.slice(ci + 2).trim();
        if (key === "date") date = val; else if (key === "label") label = val;
      }
    }
    sources.push({ id, date, label, archive, text: restLines.slice(k + 1).join("\n").trim() });
  }
  return sources;
}

// ---------- public ----------
export function parseProfile(md) {
  const m = md.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!m) throw new Error("缺少 frontmatter");
  const friend = parseFrontmatter(m[1]);
  friend.profile = { ...(friend.profile ?? {}), sources: parseBodySources(m[2]) };
  return friend;
}

export async function loadFriends(dir) {
  const files = (await readdir(dir)).filter(f => f.endsWith(".md")).sort();
  const friends = [];
  for (const file of files) {
    try {
      friends.push(parseProfile(await readFile(join(dir, file), "utf8")));
    } catch (err) {
      throw new Error(`解析 ${file} 失敗：${err.message}`);
    }
  }
  return friends;
}
