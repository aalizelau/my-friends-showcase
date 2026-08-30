import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import { focusLineFor } from "../focus-lines.mjs";

const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
const css = await readFile(new URL("../styles.css", import.meta.url), "utf8");
const tubeCss = await readFile(new URL("../tube.css", import.meta.url), "utf8");
const carouselCss = await readFile(new URL("../carousel.css", import.meta.url), "utf8");
const app = await readFile(new URL("../app.js", import.meta.url), "utf8");

test("the collection has no search, category UI, dark theme, footer or marketing sections", () => {
  assert.doesNotMatch(html, /themeButton|searchInput|filterList|data-filter|name="relation"|<footer|id="about"|collection-note|section-subtitle|nav-links/);
  assert.doesNotMatch(css + tubeCss + carouselCss, /body\.dark|\.search-box|\.filter-list|\.sidebar|\.about-section/);
  assert.doesNotMatch(html, /tube-center|circle-intro|tube-portrait-relation/);
  assert.doesNotMatch(app, /inner-circle-theme|activeFilter|relationName|els\.search|els\.filterList/);
  assert.match(html, /name="color-scheme" content="light"/);
  for (const id of ["organiseStamps", "shuffleStamps", "stampFocusBubble", "boardHelp", "openAddFriend"]) {
    assert.ok(html.includes(`id="${id}"`));
  }
});

test("the toolbar shows the friend prompt and Tube retains two non-interactive ring lines", () => {
  assert.match(html, /<p>點選朋友，看看近況<\/p>/);
  assert.doesNotMatch(html + app, /resultCount/);
  assert.equal((html.match(/class="tube-orbit tube-orbit-(?:top|bottom)" aria-hidden="true"/g) || []).length, 2);
  assert.match(tubeCss, /\.tube-orbit \{ pointer-events: none;/);
});

test("focus controls omit the exit button and bubbles omit their visible caption", () => {
  assert.doesNotMatch(html, /返回收藏|focus-close|closeStampFocus|focus-bubble-caption/);
  assert.doesNotMatch(css, /focus-bubble-caption|\.focus-close/);
  assert.match(html, /id="openFocusedFriend"/);
  assert.match(html, /class="focus-bubble-text"/);
});

test("Ring contains its avatar and bubble layers below the detail drawer", () => {
  assert.match(carouselCss, /#carouselMode\s*\{[^}]*isolation:\s*isolate/);
  assert.match(css, /\.drawer-backdrop\s*\{[^}]*z-index:\s*39/);
  assert.match(css, /\.friend-drawer\s*\{[^}]*z-index:\s*40/);
});

test("detail content omits the top divider but retains entry separators and the active tab underline", () => {
  assert.doesNotMatch(css, /\.(?:now-item|topic-list|profile-timeline)\s*\{[^}]*border-top:/);
  assert.match(css, /\.now-item:nth-child\(n \+ 3\)\s*\{[^}]*border-top: 1px solid var\(--ink\)/);
  assert.match(css, /@media[^]*\.now-grid\s*\{\s*grid-template-columns: 1fr;\s*\}[^]*\.now-item:nth-child\(n \+ 2\)\s*\{[^}]*border-top: 1px solid var\(--ink\)/);
  assert.match(css, /\.topic-item\s*\{[^}]*border-bottom:/);
  assert.match(css, /\.profile-event\s*\{[^}]*border-bottom:/);
  assert.match(css, /\.detail-tabs button.active::after\s*\{\s*background: var\(--ink\)/);
});

// Exercise application startup and form submission without a browser or live data writes.
async function startApplication(friends, storage = new Map()) {
  class Element {
    constructor() {
      this.events = new Map();
      this.eventOptions = new Map();
      const classes = new Set();
      this.classList = { add: name => classes.add(name), remove: name => classes.delete(name), contains: name => classes.has(name), toggle: (name, on) => on ? classes.add(name) : classes.delete(name) };
      this.attributes = new Map();
      this.scrollIntoViewCalls = [];
      this.innerHTML = "";
    }
    set innerHTML(value) {
      this.topicList?.children.forEach(child => { child.isConnected = false; });
      this.topicList = null;
      this.markup = value;
      this.children = [...value.matchAll(/data-friend-id="([^"]+)"/g)].map(([, id]) => {
        const child = new Element();
        child.dataset = { friendId: id };
        return child;
      });
      const topicList = value.match(/class="topic-list" data-topic-friend="([^"]*)"/);
      if (topicList) {
        const decode = value => value.replace(/&(?:amp|lt|gt|quot|#039);/g, entity => ({ "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&#039;": "'" })[entity]);
        this.topicList = new Element();
        this.topicList.dataset = { topicFriend: decode(topicList[1]) };
        this.topicList.children = [...value.matchAll(/<details class="topic-item" data-topic-key="([^"]*)"([^>]*)>/g)].map(([, key, attributes]) => {
          const child = new Element();
          child.dataset = { topicKey: decode(key) };
          child.open = /\bopen\b/.test(attributes);
          child.isConnected = true;
          child.matches = selector => selector === "details.topic-item";
          return child;
        });
      }
      this.onContentChange?.();
    }
    get innerHTML() { return this.markup; }
    addEventListener(event, callback, options) { this.events.set(event, callback); this.eventOptions.set(event, options); }
    setAttribute(name, value) { this.attributes.set(name, value); }
    focus() { this.wasFocused = true; }
    scrollTo(options) { this.scrollTop = options.top; this.scrollBehavior = options.behavior; }
    scrollIntoView(options) { this.scrollIntoViewCalls.push(options); }
    querySelectorAll(selector) { return selector === "details[data-topic-key]" ? this.children : []; }
    querySelector(selector) { return selector === ".topic-list" ? this.topicList : null; }
    showModal() { this.open = true; }
    reset() {}
    close() { this.closed = true; }
  }
  const nodes = new Map([...html.matchAll(/id="([^"]+)"/g)].map(([, id]) => [`#${id}`, new Element()]));
  nodes.set(".app-shell", new Element());
  nodes.set("#detailPanel", new Element());
  nodes.get("#friendDrawer").querySelector = selector => nodes.get("#detailPanel").querySelector(selector);
  const windowEvents = new Map();
  const writes = [];
  let tube, stamps;
  const rings = [];
  const sandbox = {
    document: {
      querySelector: selector => nodes.get(selector) || null,
      querySelectorAll: selector => selector === "dialog" ? [nodes.get("#friendDialog"), nodes.get("#sourceDialog")] : [],
      addEventListener() {},
      body: new Element()
    },
    window: { addEventListener: (event, callback) => windowEvents.set(event, callback) },
    location: { hash: "", pathname: "/", search: "" },
    history: { replaceState() {} },
    localStorage: {
      getItem(key) { assert.match(key, /^my-friends\.topic-expansion\.v1:/); return storage.get(key) ?? null; },
      setItem(key, value) { assert.match(key, /^my-friends\.topic-expansion\.v1:/); storage.set(key, value); }
    },
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
    RingCarousel: class {
      constructor(options) {
        this.options = options;
        this.cards = options.items.map(item => ({ item, el: new Element() }));
        rings.push(this);
      }
      setSuspended(suspended) { this.suspended = suspended; }
      turn(direction) { this.lastTurn = direction; }
      destroy() { this.destroyed = true; }
    },
    selectBoardFriends: records => records.slice(),
    focusLineFor,
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
  runInNewContext(`${executable}\nglobalThis.profileMarkup = detailShellMarkup; globalThis.tabMarkup = detailTabMarkup; globalThis.closeProfile = closeDrawer; globalThis.switchTab = switchDetailTab;`, sandbox);
  await sandbox.ready;
  return { nodes, writes, tube, stamps, rings, windowEvents, storage, closeProfile: sandbox.closeProfile, profileMarkup: sandbox.profileMarkup, tabMarkup: sandbox.tabMarkup, switchTab: sandbox.switchTab };
}

function topicFixture(id = "1", titles = ["Life", "Work", "Plans"]) {
  return { id, name: `Friend ${id}`, profile: { topics: titles.map(title => ({ title, summary: `${title} summary`, points: [], sources: [] })) } };
}

function topicElements(application) { return application.nodes.get("#detailPanel").topicList.children; }
function topicStates(application) { return topicElements(application).map(topic => topic.open); }
function toggleTopic(application, index, open) {
  const target = topicElements(application)[index];
  target.open = open;
  application.nodes.get("#friendDrawer").events.get("toggle")({ target });
}

test("topic expansion remembers opens and closes across tabs, profile visits and reloads, per friend", async () => {
  const friends = [topicFixture(), topicFixture("2")];
  const original = JSON.stringify(friends);
  const application = await startApplication(friends);
  application.tube.options.onOpen("1");
  application.switchTab("topics");
  assert.deepEqual(topicStates(application), [true, false, false]);
  assert.equal(application.nodes.get("#friendDrawer").eventOptions.get("toggle"), true);
  toggleTopic(application, 0, false);
  toggleTopic(application, 1, true);
  toggleTopic(application, 2, true);
  application.switchTab("now");
  application.switchTab("topics");
  assert.deepEqual(topicStates(application), [false, true, true]);
  application.closeProfile();
  application.tube.options.onOpen("2");
  application.switchTab("topics");
  assert.deepEqual(topicStates(application), [true, false, false], "Friends must not share expansion choices");
  application.tube.options.onOpen("1");
  application.switchTab("topics");
  assert.deepEqual(topicStates(application), [false, true, true]);
  const reloaded = await startApplication(friends, application.storage);
  reloaded.tube.options.onOpen("1");
  reloaded.switchTab("topics");
  assert.deepEqual(topicStates(reloaded), [false, true, true]);
  toggleTopic(reloaded, 1, false);
  toggleTopic(reloaded, 2, false);
  reloaded.closeProfile();
  reloaded.tube.options.onOpen("1");
  reloaded.switchTab("topics");
  assert.deepEqual(topicStates(reloaded), [false, false, false], "All topics may stay collapsed");
  assert.equal(JSON.stringify(friends), original);
  assert.equal(application.writes.length + reloaded.writes.length, 0, "UI preferences must not change profile notes");
});

test("topic state is flushed before queued toggle events when leaving tabs, profiles or the page", async () => {
  const friends = [topicFixture(), topicFixture("2")];
  for (const leave of [app => app.switchTab("now"), app => app.closeProfile(), app => app.tube.options.onOpen("2"), app => app.windowEvents.get("pagehide")()]) {
    const application = await startApplication(friends);
    application.tube.options.onOpen("1");
    application.switchTab("topics");
    topicElements(application)[0].open = false;
    topicElements(application)[2].open = true;
    leave(application);
    const reloaded = await startApplication(friends, application.storage);
    reloaded.tube.options.onOpen("1");
    reloaded.switchTab("topics");
    assert.deepEqual(topicStates(reloaded), [false, false, true]);
  }
});

test("topic identity survives reordering and safely distinguishes duplicate titles", async () => {
  const application = await startApplication([topicFixture("1", ['Life & "plans"', "Work", "Work"])]);
  application.tube.options.onOpen("1");
  application.switchTab("topics");
  toggleTopic(application, 0, false);
  toggleTopic(application, 2, true);
  const reloaded = await startApplication([topicFixture("1", ["Work", 'Life & "plans"', "Work"])], application.storage);
  reloaded.tube.options.onOpen("1");
  reloaded.switchTab("topics");
  assert.deepEqual(topicStates(reloaded), [false, false, true]);
});

test("invalid or unavailable browser storage leaves Topics usable with in-session memory", async () => {
  const key = "my-friends.topic-expansion.v1:1";
  const blocked = { get() { throw new Error("Blocked"); }, set() { throw new Error("Full"); } };
  for (const storage of [new Map([[key, "invalid JSON"]]), new Map([[key, "{}"]]), new Map([[key, '[null, [], [3, true], ["bad", "true"]]']]), blocked]) {
    const application = await startApplication([topicFixture()], storage);
    application.tube.options.onOpen("1");
    application.switchTab("topics");
    assert.deepEqual(topicStates(application), [true, false, false]);
    toggleTopic(application, 0, false);
    toggleTopic(application, 1, true);
    application.switchTab("now");
    application.switchTab("topics");
    assert.deepEqual(topicStates(application), [false, true, false]);
  }
});

test("switching detail tabs retains the current position while explicit source links still navigate", async () => {
  const { nodes, tube, switchTab } = await startApplication([{ id: "1", name: "Friend", profile: {
    sources: [{ id: "note", date: "2026-08-30", label: "Original note", text: "Source text" }]
  } }]);
  tube.options.onOpen("1");
  const drawer = nodes.get("#friendDrawer");
  const panel = nodes.get("#detailPanel");
  // A content replacement may adjust scroll anchoring before the position is restored.
  panel.onContentChange = () => { drawer.scrollTop = 0; };
  for (const position of [0, 128, 340]) for (const tab of ["us", "topics", "timeline", "source", "now"]) {
    drawer.scrollTop = position;
    switchTab(tab);
    assert.equal(drawer.scrollTop, position, `${tab} should retain the current position`);
    assert.equal(drawer.scrollBehavior, "instant");
  }
  assert.equal(panel.scrollIntoViewCalls.length, 0, "Tab changes must not scroll the panel into view");
  const sourceCalls = [];
  panel.querySelector = selector => selector === ".target" && /class="source-entry [^"]*target"/.test(panel.innerHTML)
    ? { scrollIntoView: options => sourceCalls.push(options) } : null;
  switchTab("source", "note");
  assert.equal(sourceCalls.length, 1);
  assert.equal(sourceCalls[0].block, "start");
  assert.equal(sourceCalls[0].behavior, "smooth");
  drawer.scrollTop = 128;
  switchTab("source", "missing");
  assert.equal(sourceCalls.length, 1);
  assert.equal(drawer.scrollTop, 128, "Missing source targets must not trigger a fallback jump");
});

test("all five detail tabs omit introductory copy while retaining profile content and controls", async () => {
  const friend = { id: "1", name: "Friend", profile: {
    now: [{ label: "Current label", value: "Current value", detail: "Current detail", sources: ["note"] }],
    recent: "Recent update", recentSources: ["note"],
    relationship: { summary: "Friendship summary", points: ["Shared memory"], sources: ["note"] },
    todo: [{ text: "Next plan", sources: ["note"] }],
    topics: [{ title: "Topic title", summary: "Topic summary", points: ["Topic point"], sources: ["note"] }],
    timeline: [{ date: "2026-08-30", category: "Life", title: "Event title", description: "Event description", source: "note" }],
    sources: [{ id: "note", date: "2026-08-30", label: "Original note", text: "Unchanged source text" }]
  } };
  const original = JSON.stringify(friend);
  const { tabMarkup, profileMarkup, writes } = await startApplication([friend]);
  const expected = {
    now: ["Current detail", "Recent update"],
    us: ["Friendship summary", "Shared memory", "Next plan"],
    topics: ["Topic summary", "Topic point"],
    timeline: ["Event title", "Event description"],
    source: ["Unchanged source text", 'data-edit-source="note"']
  };
  for (const [tab, content] of Object.entries(expected)) {
    const markup = tabMarkup(friend, tab);
    assert.doesNotMatch(markup, /detail-intro|source-intro|Current snapshot|Between us|Organized by topic|Changes over time|Raw · 只由你手動編輯/);
    for (const value of content) assert.ok(markup.includes(value), `${tab} must preserve ${value}`);
    if (tab !== "source") assert.ok(markup.includes('data-source-jump="note"'));
    assert.ok(profileMarkup(friend).includes(`data-detail-tab="${tab}"`));
    assert.doesNotThrow(() => tabMarkup({ id: "2", name: "Blank friend" }, tab));
  }
  assert.doesNotMatch(app + css, /detail-intro|source-intro/);
  assert.equal(JSON.stringify(friend), original);
  assert.equal(writes.length, 0);
});

test("startup displays every selected category without relying on removed controls", async () => {
  const friends = ["close", "work", "community"].map((relation, index) => ({ id: String(index + 1), name: `Friend ${index}`, relation, interactions: [] }));
  const original = JSON.stringify(friends);
  const { nodes, profileMarkup } = await startApplication(friends);
  assert.equal(nodes.get("#tubeWorld").children.length, 3);
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

test("Ring shares friend data, pauses behind profiles, and is destroyed when switching views", async () => {
  const { nodes, tube, rings, closeProfile } = await startApplication([{ id: "1", name: "Friend", relation: "work" }]);
  nodes.get("#ringView").events.get("click")();
  assert.equal(tube.enabled, false);
  assert.equal(nodes.get("#carouselMode").hidden, false);
  assert.equal(nodes.get("#stampBoard").hidden, true);
  assert.equal(nodes.get("#ringView").attributes.get("aria-pressed"), "true");
  const ring = rings[0];
  assert.equal(ring.options.orientation, "horizontal");
  assert.equal(ring.cards[0].item.id, "1");
  assert.ok(ring.cards[0].item.markup, "New friends must not disappear when they lack an assigned image");
  assert.equal(ring.cards[0].item.rel, undefined);
  ring.options.onOpen("1");
  assert.equal(ring.suspended, true);
  closeProfile();
  assert.equal(ring.suspended, false);
  assert.equal(ring.cards[0].el.wasFocused, true);
  nodes.get("#tubeView").events.get("click")();
  assert.equal(ring.destroyed, true);
  assert.equal(nodes.get("#carouselMode").hidden, true);
  assert.equal(tube.enabled, true);
});

test("a friend can be added to an empty collection without choosing a category", async () => {
  const { nodes, writes } = await startApplication([]);
  assert.equal(nodes.get("#emptyState").hidden, false);
  await nodes.get("#friendForm").events.get("submit")({ preventDefault() {} });
  assert.deepEqual(writes, [{ name: "New friend", nickname: "", relation: "community", birthday: "" }]);
  assert.equal(nodes.get("#tubeWorld").children.length, 1);
  assert.equal(nodes.get("#emptyState").hidden, true);
  assert.equal(nodes.get("#friendDialog").closed, true);
});

test("Ring uses the same source-backed personality lines as Stamps and profiles open at the top", async () => {
  const friends = [
    { id: "1", name: "Recorded friend", profile: { sources: [{ id: "2026-08-26", text: "Existing notes" }] } },
    { id: "2", name: "Blank friend" }
  ];
  const { nodes, rings, stamps, closeProfile } = await startApplication(friends);
  nodes.get("#ringView").events.get("click")();
  const ring = rings[0];
  assert.equal(ring.cards[0].item.bubble, stamps.options.getFocusBubble("1").text);
  assert.equal(ring.cards[1].item.bubble, "");
  const drawer = nodes.get("#friendDrawer");
  drawer.scrollTop = 700;
  ring.options.onOpen("1");
  assert.equal(drawer.scrollTop, 0);
  assert.equal(drawer.scrollBehavior, "instant");
  assert.equal(nodes.get(".app-shell").inert, true);
  assert.equal(drawer.inert, false);
  closeProfile();
  assert.equal(nodes.get(".app-shell").inert, false);
  assert.equal(drawer.inert, true);
  drawer.scrollTop = 400;
  ring.options.onOpen("2");
  assert.equal(drawer.scrollTop, 0);
  assert.match(nodes.get("#drawerContent").innerHTML, /Blank friend/);
});
