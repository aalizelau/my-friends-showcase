// Build a read-only static site for GitHub Pages (or any static host).
// Usage: node scripts/build-static.mjs
// Output: dist/ with baked data/friends.json and data-readonly="true" on <html>.
import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { loadFriends } from "../server/profiles.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const DIST = join(ROOT, "dist");
const FRIENDS_DIR = join(ROOT, "data", "friends");

const STATIC_FILES = [
  "app.js",
  "i18n.js",
  "locale-content.mjs",
  "focus-lines.mjs",
  "stamp-board.mjs",
  "tube.js",
  "carousel.js",
  "styles.css",
  "tube.css",
  "carousel.css"
];

async function main() {
  await rm(DIST, { recursive: true, force: true });
  await mkdir(join(DIST, "data"), { recursive: true });

  const friends = await loadFriends(FRIENDS_DIR);
  await writeFile(join(DIST, "data", "friends.json"), `${JSON.stringify(friends, null, 2)}\n`, "utf8");

  for (const file of STATIC_FILES) {
    await cp(join(ROOT, file), join(DIST, file));
  }
  await cp(join(ROOT, "assets"), join(DIST, "assets"), { recursive: true });

  let html = await readFile(join(ROOT, "index.html"), "utf8");
  if (!html.includes("<html ")) throw new Error("index.html missing <html> tag");
  html = html.replace("<html ", '<html data-readonly="true" ');
  await writeFile(join(DIST, "index.html"), html, "utf8");

  // Prevent Jekyll from ignoring files that start with underscore.
  await writeFile(join(DIST, ".nojekyll"), "", "utf8");

  console.log(`Static site → ${DIST} (${friends.length} friends, read-only)`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
