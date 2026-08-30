import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";

const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
const css = await readFile(new URL("../styles.css", import.meta.url), "utf8");
const app = await readFile(new URL("../app.js", import.meta.url), "utf8");

test("the collection has no search, category UI, dark theme, footer or marketing sections", () => {
  assert.doesNotMatch(html, /themeButton|searchInput|filterList|data-filter|name="relation"|<footer|id="about"|collection-note|section-subtitle|nav-links/);
  assert.doesNotMatch(css, /body\.dark|\.search-box|\.filter-list|\.sidebar|\.about-section/);
  assert.doesNotMatch(app, /inner-circle-theme|activeFilter|relationName|els\.search|els\.filterList/);
  assert.match(html, /name="color-scheme" content="light"/);
  for (const id of ["organiseStamps", "shuffleStamps", "stampFocusBubble", "boardHelp", "openAddFriend"]) {
    assert.ok(html.includes(`id="${id}"`));
  }
});

// Exercise application startup and form submission without a browser or live data writes.
async function startApplication(friends) {
  class Element {
    constructor() {
      this.events = new Map();
      this.classList = { add() {}, remove() {}, contains: () => false };
      this.innerHTML = "";
    }
    addEventListener(event, callback) { this.events.set(event, callback); }
    close() { this.closed = true; }
  }
  const nodes = new Map([...html.matchAll(/id="([^"]+)"/g)].map(([, id]) => [`#${id}`, new Element()]));
  nodes.set(".app-shell", new Element());
  const writes = [];
  const sandbox = {
    document: {
      querySelector: selector => nodes.get(selector) || null,
      querySelectorAll: () => [],
      addEventListener() {},
      body: new Element()
    },
    window: { addEventListener() {} },
    location: { hash: "", pathname: "/", search: "" },
    localStorage: { getItem() { throw new Error("Removed theme preference must not be read"); } },
    StampBoard: class {
      constructor(options) {
        for (const key of ["board", "grid", "controls", "organise", "shuffle", "status"]) assert.ok(options[key], key);
      }
      sync() {}
    },
    selectBoardFriends: records => records.slice(),
    focusLineFor: () => null,
    setTimeout: () => 1,
    clearTimeout() {},
    FormData: class { get(name) { return { name: "New friend", nickname: "", birthday: "" }[name] ?? null; } },
    fetch: async (url, options) => {
      if (!options) return { ok: true, json: async () => friends };
      assert.equal(url, "/api/friends");
      assert.equal(options.method, "POST");
      const payload = JSON.parse(options.body);
      writes.push(payload);
      return { ok: true, json: async () => ({ ...payload, id: "new", interactions: [] }) };
    },
    console
  };
  const executable = app.replace(/^import .*;\n/gm, "").replace(/^init\(\);$/m, "globalThis.ready = init();");
  runInNewContext(`${executable}\nglobalThis.profileMarkup = detailShellMarkup;`, sandbox);
  await sandbox.ready;
  return { nodes, writes, profileMarkup: sandbox.profileMarkup };
}

test("startup displays every selected category without relying on removed controls", async () => {
  const friends = ["close", "work", "community"].map((relation, index) => ({ id: String(index + 1), name: `Friend ${index}`, relation, interactions: [] }));
  const original = JSON.stringify(friends);
  const { nodes, profileMarkup } = await startApplication(friends);
  assert.equal(nodes.get("#resultCount").textContent, 3);
  assert.equal(nodes.get("#emptyState").hidden, true);
  assert.equal((nodes.get("#friendsGrid").innerHTML.match(/data-friend-id=/g) || []).length, 3);
  for (const friend of friends) {
    assert.doesNotMatch(profileMarkup(friend), /親近好友|工作夥伴|生活圈|<span>關係<\/span>/);
  }
  assert.equal(JSON.stringify(friends), original, "Existing category data must remain unchanged");
});

test("a friend can be added to an empty collection without choosing a category", async () => {
  const { nodes, writes } = await startApplication([]);
  assert.equal(nodes.get("#emptyState").hidden, false);
  await nodes.get("#friendForm").events.get("submit")({ preventDefault() {} });
  assert.deepEqual(writes, [{ name: "New friend", nickname: "", relation: "community", birthday: "" }]);
  assert.equal(nodes.get("#resultCount").textContent, 1);
  assert.equal(nodes.get("#emptyState").hidden, true);
  assert.equal(nodes.get("#friendDialog").closed, true);
});
