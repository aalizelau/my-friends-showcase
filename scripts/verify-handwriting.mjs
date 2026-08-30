import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { loadFriends } from "../server/profiles.mjs";
import { FOCUS_LINES } from "../focus-lines.mjs";

// Read Unicode cmap tables directly; no font-tool dependency or external requests.
async function glyphLookup(relativePath) {
  const font = await readFile(new URL(relativePath, import.meta.url));
  const u16 = offset => font.readUInt16BE(offset);
  const u32 = offset => font.readUInt32BE(offset);
  let cmap;
  for (let i = 0; i < u16(4); i++) {
    const record = 12 + i * 16;
    if (font.toString("ascii", record, record + 4) === "cmap") cmap = u32(record + 8);
  }
  assert.ok(cmap, "Font must contain a cmap table");
  const tables = [];
  for (let i = 0; i < u16(cmap + 2); i++) {
    const record = cmap + 4 + i * 8;
    const platform = u16(record);
    const encoding = u16(record + 2);
    if (platform === 0 || (platform === 3 && [1, 10].includes(encoding))) tables.push(cmap + u32(record + 4));
  }
  return character => tables.some(table => {
    const code = character.codePointAt(0);
    if (u16(table) === 12) {
      for (let i = 0; i < u32(table + 12); i++) {
        const group = table + 16 + i * 12;
        if (code >= u32(group) && code <= u32(group + 4)) return u32(group + 8) + code - u32(group) !== 0;
      }
    } else if (u16(table) === 4 && code <= 0xffff) {
      const count = u16(table + 6) / 2;
      const end = table + 14;
      const start = end + count * 2 + 2;
      const delta = start + count * 2;
      const range = delta + count * 2;
      for (let i = 0; i < count; i++) {
        if (code < u16(start + i * 2) || code > u16(end + i * 2)) continue;
        const offset = u16(range + i * 2);
        if (!offset) return ((code + u16(delta + i * 2)) & 0xffff) !== 0;
        const glyph = u16(range + i * 2 + offset + 2 * (code - u16(start + i * 2)));
        return glyph !== 0 && ((glyph + u16(delta + i * 2)) & 0xffff) !== 0;
      }
    }
    return false;
  });
}

test("local fonts cover the current names, bubble Han characters, and English alphabet", async () => {
  const chinese = await glyphLookup("../assets/fonts/lxgw-wenkai-tc/LXGWWenKaiTC-Regular.ttf");
  const english = await glyphLookup("../assets/fonts/gloria-hallelujah/GloriaHallelujah.ttf");
  const friends = await loadFriends(fileURLToPath(new URL("../data/friends", import.meta.url)));
  const content = [...friends.map(friend => friend.name), ...Object.values(FOCUS_LINES).map(line => line.text)].join("");
  for (const character of new Set(content.match(/\p{Script=Han}/gu))) {
    assert.ok(chinese(character), `Chinese font missing U+${character.codePointAt(0).toString(16)}`);
    assert.ok(!english(character), "Chinese characters must fall through to WenKai TC");
  }
  for (const character of "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789") {
    assert.ok(english(character), `English font missing ${character}`);
  }
});

test("My Friends uses the local Mountains of Christmas bold 700 face only for the header", async () => {
  const fontPath = "../assets/fonts/mountains-of-christmas/MountainsofChristmas-Bold.ttf";
  const titleFont = await glyphLookup(fontPath);
  for (const character of new Set("My Friends")) assert.ok(titleFont(character), `Title font missing ${character}`);
  const font = await readFile(new URL(fontPath, import.meta.url));
  let weight;
  for (let i = 0; i < font.readUInt16BE(4); i++) {
    const record = 12 + i * 16;
    if (font.toString("ascii", record, record + 4) === "OS/2") weight = font.readUInt16BE(font.readUInt32BE(record + 8) + 4);
  }
  assert.equal(weight, 700, "Use a real bold font file, not a browser-synthesized weight");
  const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
  const css = await readFile(new URL("../styles.css", import.meta.url), "utf8");
  assert.match(html, /<title>My Friends<\/title>/);
  assert.match(html, /aria-label="My Friends 首頁"/);
  assert.match(html, /class="brand-title">My Friends<\/span>/);
  assert.doesNotMatch(html, /Inner Circle|inner circle\./);
  assert.match(css, /@font-face\s*\{[^}]*font-family: "Mountains of Christmas";[^}]*MountainsofChristmas-Bold\.ttf[^}]*font-weight: 700;/);
  assert.match(css, /\.brand-title\s*\{[^}]*font: 700[^}]*"Mountains of Christmas"/);
  assert.match(html, /rel="preload" href="assets\/fonts\/mountains-of-christmas\/MountainsofChristmas-Bold\.ttf"/);
  assert.doesNotMatch(html + css, /Melted Ideas|melted-ideas/);
  assert.match(css, /--font-handwritten: "Gloria Hallelujah", "LXGW WenKai TC"/);
});

test("the ink title keeps the logo and three static stars in its original vivid colours", async () => {
  const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
  const css = await readFile(new URL("../styles.css", import.meta.url), "utf8");
  assert.equal((html.match(/class="brand-star brand-star-(?:orange|gold|green)" aria-hidden="true"/g) || []).length, 3);
  assert.match(html, /class="brand-mark" aria-hidden="true"><i><\/i><i><\/i><i><\/i><\/span>/);
  assert.doesNotMatch(html + css, /brand-star-(?:one|two|three|four|five|six|coral|sage)\b/);
  assert.match(html, /class="brand-wordmark">\s*<span class="brand-title">My Friends<\/span>/);
  assert.match(css, /\.brand-title\s*\{[^}]*color: var\(--ink\)/);
  assert.match(css, /\.brand-star\s*\{[^}]*pointer-events: none;/);
  const starRules = css.match(/\.brand-star[^}]*\}/g).join("\n");
  assert.doesNotMatch(starRules, /animation:|transition:/);
  for (const colour of ["orange", "mustard", "forest"]) {
    assert.equal(starRules.split(`background: var(--${colour});`).length - 1, 1);
  }
  assert.match(css, /\.brand-wordmark\s*\{[^}]*padding: 12px 17px 10px 3px;/);
});
