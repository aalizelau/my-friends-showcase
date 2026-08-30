// Inner Circle 本地伺服器：靜態檔 + 讀取層 / 寫入層 API。
// 用法：node server.mjs   然後開 http://localhost:4173
import { createServer } from "node:http";
import { readFile, writeFile, rename, mkdir, readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join, normalize, extname } from "node:path";
import { loadFriends, parseProfile } from "./server/profiles.mjs";
import { friendToMarkdown } from "./server/serialize.mjs";

const ROOT = dirname(fileURLToPath(import.meta.url));
const FRIENDS_DIR = join(ROOT, "data", "friends");
const TRASH_DIR = join(ROOT, "data", "trash");
const PORT = process.env.PORT || 4173;
const PALETTE_COUNT = 8;
const RELATIONS = new Set(["close", "work", "community"]);
const isValidId = id => /^\d+$/.test(id); // id 一律數字 → 天然防目錄穿越

const TYPES = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8", ".png": "image/png",
  ".svg": "image/svg+xml", ".md": "text/markdown; charset=utf-8"
};

const sendJSON = (res, code, data) =>
  res.writeHead(code, { "content-type": "application/json; charset=utf-8" }).end(JSON.stringify(data));

const readBody = req => new Promise((resolve, reject) => {
  let raw = "";
  req.on("data", c => { raw += c; if (raw.length > 1e6) reject(new Error("payload too large")); });
  req.on("end", () => { try { resolve(raw ? JSON.parse(raw) : {}); } catch (e) { reject(e); } });
  req.on("error", reject);
});

const friendPath = id => join(FRIENDS_DIR, `${id}.md`);

// 原子寫入：先寫暫存檔再 rename，避免中途當掉造成半截檔
async function atomicWrite(filePath, content) {
  const tmp = `${filePath}.${process.pid}.tmp`;
  await writeFile(tmp, content, "utf8");
  await rename(tmp, filePath);
}

async function readFriend(id) {
  try { return parseProfile(await readFile(friendPath(id), "utf8")); }
  catch (e) { return e.code === "ENOENT" ? null : Promise.reject(e); }
}

// 下一個 id：現有朋友與回收桶（trash 的 <id>-<ts>.md）中的最大數字 + 1，避免重用已刪除的編號
async function nextFriendId() {
  const nums = [];
  for (const d of [FRIENDS_DIR, TRASH_DIR]) {
    let files = [];
    try { files = await readdir(d); } catch { /* trash 可能還沒建立 */ }
    for (const f of files) {
      const m = f.match(/^(\d+)(?:-\d+)?\.md$/);
      if (m) nums.push(Number(m[1]));
    }
  }
  return (nums.length ? Math.max(...nums) : 0) + 1;
}

// POST /api/friends —— 新增朋友（id/avatar 由伺服器決定，避免用戶端控制檔名）
async function createFriend(req, res) {
  const body = await readBody(req);
  const name = String(body.name ?? "").trim();
  const relation = String(body.relation ?? "");
  if (!name) return sendJSON(res, 400, { error: "name 為必填" });
  if (!RELATIONS.has(relation)) return sendJSON(res, 400, { error: "relation 不合法" });

  const id = String(await nextFriendId());
  const avatar = (await loadFriends(FRIENDS_DIR)).length % PALETTE_COUNT;
  const friend = {
    id, name,
    nickname: String(body.nickname ?? "").trim(),
    relation,
    birthday: String(body.birthday ?? "").trim() || undefined,
    avatar,
    interactions: []
  };
  await atomicWrite(friendPath(id), friendToMarkdown(friend));
  sendJSON(res, 201, await readFriend(id)); // 回傳權威版本（重讀）
}

// 由日期產生乾淨、唯一的 source id（"2026.05.15"→"2026-05-15"；碰撞就補 -2/-3…）
function uniqueSourceId(date, sources) {
  const nums = String(date).match(/\d+/g);
  let base = nums ? nums.join("-") : String(date).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  if (!base) base = "s-" + Date.now().toString(36);
  const existing = new Set(sources.map(s => s.id));
  if (!existing.has(base)) return base;
  for (let i = 2; ; i++) if (!existing.has(`${base}-${i}`)) return `${base}-${i}`;
}

// POST /api/friends/:id/sources —— 新增一條原始記錄（id 由日期決定並去重）
async function createSource(req, res, id) {
  if (!isValidId(id)) return sendJSON(res, 400, { error: "id 不合法" });
  const friend = await readFriend(id);
  if (!friend) return sendJSON(res, 404, { error: "not found" });
  const body = await readBody(req);
  const text = String(body.text ?? "").trim();
  if (!text) return sendJSON(res, 400, { error: "text 為必填" });
  const date = String(body.date ?? "").trim() || new Date().toISOString().slice(0, 10).replace(/-/g, ".");
  const label = String(body.label ?? "").trim() || "未命名記錄";
  friend.profile = friend.profile ?? {};
  friend.profile.sources = friend.profile.sources ?? [];
  const sid = uniqueSourceId(date, friend.profile.sources);
  friend.profile.sources.push({ id: sid, date, label, archive: false, text });
  await atomicWrite(friendPath(id), friendToMarkdown(friend));
  res.writeHead(201, { "content-type": "application/json; charset=utf-8", "x-source-id": sid })
    .end(JSON.stringify(await readFriend(id)));
}

// PATCH /api/friends/:id/sources/:sid —— 手動編輯一條原始記錄（改 date/label/text，保留 id/archive）
async function editSource(req, res, id, sid) {
  if (!isValidId(id)) return sendJSON(res, 400, { error: "id 不合法" });
  const friend = await readFriend(id);
  if (!friend) return sendJSON(res, 404, { error: "not found" });
  const src = (friend.profile?.sources ?? []).find(s => s.id === sid);
  if (!src) return sendJSON(res, 404, { error: "source not found" });
  const body = await readBody(req);
  const text = String(body.text ?? "").trim();
  if (!text) return sendJSON(res, 400, { error: "text 為必填" });
  src.text = text;
  if (typeof body.label === "string" && body.label.trim()) src.label = body.label.trim();
  if (typeof body.date === "string" && body.date.trim()) src.date = body.date.trim();
  await atomicWrite(friendPath(id), friendToMarkdown(friend));
  sendJSON(res, 200, await readFriend(id));
}

// DELETE /api/friends/:id —— 軟刪除：搬到 data/trash（可復原），不硬刪
async function deleteFriend(res, id) {
  if (!isValidId(id)) return sendJSON(res, 400, { error: "id 不合法" });
  await mkdir(TRASH_DIR, { recursive: true });
  try {
    await rename(friendPath(id), join(TRASH_DIR, `${id}-${Date.now()}.md`));
  } catch (e) {
    if (e.code === "ENOENT") return sendJSON(res, 404, { error: "not found" });
    throw e;
  }
  sendJSON(res, 200, { ok: true, id });
}

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://localhost:${PORT}`);
    const path = decodeURIComponent(url.pathname);

    // ---- 寫入層 ----
    if (req.method === "POST") {
      if (path === "/api/friends") return await createFriend(req, res);
      const m = path.match(/^\/api\/friends\/([^/]+)\/sources$/);
      if (m) return await createSource(req, res, m[1]);
      return sendJSON(res, 404, { error: "not found" });
    }
    if (req.method === "PATCH") {
      const ms = path.match(/^\/api\/friends\/([^/]+)\/sources\/([^/]+)$/);
      if (ms) return await editSource(req, res, ms[1], ms[2]);
      return sendJSON(res, 404, { error: "not found" });
    }
    if (req.method === "DELETE") {
      const m = path.match(/^\/api\/friends\/([^/]+)$/);
      if (m) return await deleteFriend(res, m[1]);
      return sendJSON(res, 404, { error: "not found" });
    }

    // ---- 讀取層 ----
    if (path === "/api/friends") return sendJSON(res, 200, await loadFriends(FRIENDS_DIR));
    const one = path.match(/^\/api\/friends\/([^/]+)$/);
    if (one) {
      const friend = isValidId(one[1]) ? await readFriend(one[1]) : null;
      return friend ? sendJSON(res, 200, friend) : sendJSON(res, 404, { error: "not found" });
    }

    // ---- 靜態檔 ----
    const rel = path === "/" ? "index.html" : path.replace(/^\/+/, "");
    const filePath = normalize(join(ROOT, rel));
    if (!filePath.startsWith(ROOT)) return sendJSON(res, 403, { error: "forbidden" }); // 防目錄穿越
    const file = await readFile(filePath);
    res.writeHead(200, { "content-type": TYPES[extname(filePath)] || "application/octet-stream" }).end(file);
  } catch (err) {
    if (err.code === "ENOENT") return sendJSON(res, 404, { error: "not found" });
    console.error(err);
    sendJSON(res, 500, { error: err.message });
  }
});

server.listen(PORT, () => console.log(`Inner Circle → http://localhost:${PORT}`));
