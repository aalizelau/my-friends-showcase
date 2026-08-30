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
