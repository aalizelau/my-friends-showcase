import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";

const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
const css = await readFile(new URL("../styles.css", import.meta.url), "utf8");
const tubeCss = await readFile(new URL("../tube.css", import.meta.url), "utf8");
const app = await readFile(new URL("../app.js", import.meta.url), "utf8");

test("the collection has no search, category UI, dark theme, footer or marketing sections", () => {
  assert.doesNotMatch(html, /themeButton|searchInput|filterList|data-filter|name="relation"|<footer|id="about"|collection-note|section-subtitle|nav-links/);
  assert.doesNotMatch(css + tubeCss, /body\.dark|\.search-box|\.filter-list|\.sidebar|\.about-section/);
  assert.doesNotMatch(html, /tube-center|circle-intro|tube-portrait-relation/);
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
      const classes = new Set();
      this.classList = { add: name => classes.add(name), remove: name => classes.delete(name), contains: name => classes.has(name), toggle: (name, on) => on ? classes.add(name) : classes.delete(name) };
      this.attributes = new Map();
      this.innerHTML = "";
    }
    set innerHTML(value) {
      this.markup = value;
      this.children = [...value.matchAll(/data-friend-id="([^"]+)"/g)].map(([, id]) => {
        const child = new Element();
        child.dataset = { friendId: id };
        return child;
      });
    }
    get innerHTML() { return this.markup; }
    addEventListener(event, callback) { this.events.set(event, callback); }
    setAttribute(name, value) { this.attributes.set(name, value); }
    focus() { this.wasFocused = true; }
    showModal() { this.open = true; }
    reset() {}
    close() { this.closed = true; }
  }
  const nodes = new Map([...html.matchAll(/id="([^"]+)"/g)].map(([, id]) => [`#${id}`, new Element()]));
  nodes.set(".app-shell", new Element());
  const writes = [];
  let tube, stamps;
  const sandbox = {
    document: {
      querySelector: selector => nodes.get(selector) || null,
      querySelectorAll: selector => selector === "dialog" ? [nodes.get("#friendDialog"), nodes.get("#sourceDialog")] : [],
      addEventListener() {},
      body: new Element()
    },
    window: { addEventListener() {} },
    location: { hash: "", pathname: "/", search: "" },
    history: { replaceState() {} },
    localStorage: { getItem() { throw new Error("Removed theme preference must not be read"); } },
    StampBoard: class {
      constructor(options) {
        for (const key of ["board", "grid", "controls", "organise", "shuffle", "status"]) assert.ok(options[key], key);
        this.options = options;
        this.syncCount = 0;
        this.entries = new Map();
        stamps = this;
      }
      sync() {
        this.syncCount++;
        this.entries = new Map(this.options.grid.children.map(element => [element.dataset.friendId, { element }]));
      }
      closeFocus() { this.closedFocus = true; }
    },
    FriendTube: class {
      constructor(options) {
        for (const key of ["stage", "world", "gallery", "cardMarkup", "onOpen"]) assert.ok(options[key], key);
        this.options = options;
        tube = this;
      }
      setFriends(friends) { this.options.world.innerHTML = friends.map(this.options.cardMarkup).join(""); }
      setEnabled(enabled) { this.enabled = enabled; this.options.gallery.hidden = !enabled; }
      setSuspended(suspended) { this.suspended = suspended; }
    },
    selectBoardFriends: records => records.slice(),
    focusLineFor: () => null,
    setTimeout: () => 1,
    clearTimeout() {},
    requestAnimationFrame: callback => callback(),
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
  runInNewContext(`${executable}\nglobalThis.profileMarkup = detailShellMarkup; globalThis.closeProfile = closeDrawer;`, sandbox);
  await sandbox.ready;
  return { nodes, writes, tube, stamps, closeProfile: sandbox.closeProfile, profileMarkup: sandbox.profileMarkup };
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

test("Tube defaults on, shares friend identities, and switches cleanly with Stamps", async () => {
  const { nodes, tube, stamps } = await startApplication([{ id: "1", name: "Friend", relation: "work" }]);
  assert.equal(tube.enabled, true);
  assert.equal(stamps.syncCount, 0, "Hidden stamps must not be measured on startup");
  assert.equal(nodes.get("#stampBoard").hidden, true);
  assert.equal(nodes.get("#stampActions").hidden, true);
  assert.doesNotMatch(nodes.get("#tubeWorld").innerHTML, /工作夥伴|tube-portrait-relation/);
  assert.equal(nodes.get("#tubeWorld").children[0].dataset.friendId, nodes.get("#friendsGrid").children[0].dataset.friendId);
  nodes.get("#stampsView").events.get("click")();
  assert.equal(stamps.syncCount, 1);
  assert.equal(nodes.get("#stampBoard").hidden, false);
  assert.equal(nodes.get("#stampActions").hidden, false);
  assert.equal(nodes.get("#tubeControls").hidden, true);
  assert.equal(tube.enabled, false);
  assert.equal(nodes.get("#stampsView").attributes.get("aria-pressed"), "true");
  nodes.get("#tubeView").events.get("click")();
  assert.equal(tube.enabled, true);
  assert.equal(nodes.get("#stampBoard").hidden, true);
  assert.equal(stamps.closedFocus, true);
});

test("opening profiles and dialogs suspends Tube and closing restores the right state", async () => {
  const { nodes, tube, closeProfile } = await startApplication([{ id: "1", name: "Friend", relation: "work" }]);
  tube.options.onOpen("1");
  assert.equal(tube.suspended, true);
  assert.equal(nodes.get("#friendDrawer").classList.contains("open"), true);
  closeProfile();
  assert.equal(tube.suspended, false);
  assert.equal(nodes.get("#tubeWorld").children[0].wasFocused, true);
  nodes.get("#openAddFriend").events.get("click")();
  assert.equal(tube.suspended, true);
  nodes.get("#friendDialog").events.get("close")();
  assert.equal(tube.suspended, false, "Native dialog close must resume the tube");
  tube.options.onOpen("1");
  nodes.get("#sourceDialog").events.get("close")();
  assert.equal(tube.suspended, true, "Closing a source dialog must not animate behind the profile");
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
