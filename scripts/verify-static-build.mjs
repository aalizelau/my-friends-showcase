import test from "node:test";
import assert from "node:assert/strict";
import { access, readFile, rm } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { loadFriends } from "../server/profiles.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const DIST = join(ROOT, "dist");

test("build-static bakes friends.json and marks the site read-only", async () => {
  await rm(DIST, { recursive: true, force: true });
  const result = spawnSync(process.execPath, ["scripts/build-static.mjs"], { cwd: ROOT, encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr || result.stdout);

  const html = await readFile(join(DIST, "index.html"), "utf8");
  assert.match(html, /<html data-readonly="true"/);
  assert.match(html, /src="app\.js"/);

  const baked = JSON.parse(await readFile(join(DIST, "data", "friends.json"), "utf8"));
  const source = await loadFriends(join(ROOT, "data", "friends"));
  assert.equal(baked.length, source.length);
  assert.deepEqual(baked.map(f => f.id).sort(), source.map(f => f.id).sort());
  assert.ok(baked.every(f => f.name && Array.isArray(f.profile?.sources)));

  for (const file of ["app.js", "styles.css", "assets/faces/face-1.png", ".nojekyll"]) {
    await access(join(DIST, file));
  }

  const app = await readFile(join(DIST, "app.js"), "utf8");
  assert.match(app, /data\/friends\.json/);
  assert.match(app, /isReadOnly/);
});
