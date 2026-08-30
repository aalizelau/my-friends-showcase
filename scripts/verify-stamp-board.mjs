import test from "node:test";
import assert from "node:assert/strict";
import { boardMetrics, constrainPosition, organisedPositions, shuffledPositions, focusGeometry, StampBoard } from "../stamp-board.mjs";

function seededRandom(seed = 42) {
  return () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 2 ** 32; };
}

function assertInBounds(position, metrics) {
  const radians = position.angle * Math.PI / 180;
  const halfWidth = (Math.abs(Math.cos(radians)) * metrics.itemWidth + Math.abs(Math.sin(radians)) * metrics.itemHeight) / 2;
  const halfHeight = (Math.abs(Math.sin(radians)) * metrics.itemWidth + Math.abs(Math.cos(radians)) * metrics.itemHeight) / 2;
  const centerX = position.x + metrics.itemWidth / 2;
  const centerY = position.y + metrics.itemHeight / 2;
  assert.ok(centerX - halfWidth >= 9.99);
  assert.ok(centerY - halfHeight >= 9.99);
  assert.ok(centerX + halfWidth <= metrics.width - 9.99);
  assert.ok(centerY + halfHeight <= metrics.height - 9.99);
}

test("organise keeps 1–50 stamps within desktop, tablet and mobile boards", () => {
  for (const width of [288, 343, 390, 720, 1150]) {
    for (const count of [1, 2, 9, 18, 50]) {
      const metrics = boardMetrics(width, count, "organise");
      const positions = organisedPositions(count, metrics, seededRandom());
      assert.equal(positions.length, count);
      positions.forEach(position => {
        assertInBounds(position, metrics);
        assert.ok(Math.abs(position.angle) <= 5);
      });
      assert.equal(new Set(positions.map(p => `${p.x},${p.y}`)).size, count);
    }
  }
});

test("shuffle and drag clamping include the rotated stamp footprint", () => {
  for (const width of [288, 343, 720, 1150]) {
    const metrics = boardMetrics(width, 18);
    shuffledPositions(1000, metrics, seededRandom()).forEach(position => {
      assertInBounds(position, metrics);
      assert.ok(Math.abs(position.angle) <= 35);
    });
    for (const angle of [-35, 0, 35]) {
      assertInBounds(constrainPosition({ x: -1000, y: 10000, angle, scale: 1 }, metrics), metrics);
    }
  }
});

test("focus centers and enlarges the stamp while leaving room for its controls", () => {
  for (const width of [288, 343, 720, 1150]) {
    const metrics = boardMetrics(width, 18, "organise");
    const { position, controlsTop } = focusGeometry(metrics, 0, Math.min(650, metrics.height));
    assert.equal(position.angle, 0);
    assert.equal(position.scale, 1.5);
    assert.equal(position.x + metrics.itemWidth / 2, width / 2);
    assert.ok(controlsTop + 80 < metrics.height);
  }
});

// Minimal DOM adapter: exercises the actual controller without browser dependencies or data writes.
class Element extends EventTarget {
  constructor(id = "") {
    super();
    this.dataset = id ? { friendId: id, friendName: `Friend ${id}` } : {};
    const classes = new Set();
    this.classList = { add: name => classes.add(name), remove: name => classes.delete(name), contains: name => classes.has(name),
      toggle: (name, value) => value ? classes.add(name) : classes.delete(name) };
    this.style = { setProperty(name, value) { this[name] = value; } };
    this.attributes = new Map();
    this.clientWidth = 1100;
    this.children = [];
    this.top = 100;
  }
  setAttribute(name, value) { this.attributes.set(name, value); }
  removeAttribute(name) { this.attributes.delete(name); }
  querySelectorAll() { return this.children; }
  querySelector(selector) { return this.controls[selector]; }
  closest() { return this.dataset.friendId ? this : null; }
  focus() { this.wasFocused = true; }
  getBoundingClientRect() { return { top: this.top, bottom: this.top + parseFloat(this.style.height || 570) }; }
  setPointerCapture(id) { this.pointerId = id; }
  hasPointerCapture(id) { return this.pointerId === id; }
  releasePointerCapture() { this.pointerId = null; }
}

function fixture({ reducedMotion = false } = {}) {
  const preference = new EventTarget();
  preference.matches = reducedMotion;
  globalThis.window = { matchMedia: () => preference, innerHeight: 900, scrollY: 0, scrollTo() {} };
  globalThis.document = new EventTarget();
  globalThis.ResizeObserver = class { observe() {} };
  globalThis.requestAnimationFrame = () => 1;
  const board = new Element();
  const grid = new Element();
  grid.children = Array.from({ length: 18 }, (_, index) => new Element(String(index + 1)));
  const controls = new Element();
  controls.controls = { "#closeStampFocus": new Element(), "#openFocusedFriend": new Element() };
  const options = { board, grid, controls, organise: new Element(), shuffle: new Element(), sidebar: new Element(), status: new Element(), hint: new Element() };
  let openedProfile;
  const controller = new StampBoard({ ...options, onOpenProfile: id => { openedProfile = id; } });
  controller.sync();
  const settle = () => {
    let time = performance.now();
    for (let i = 0; i < 240; i++) { time += 16; controller.tick(time); }
  };
  return { ...options, controller, settle, openedProfile: () => openedProfile };
}

test("focus preserves position, blurs only peers, and restores keyboard focus on Escape", () => {
  const { controller, board, sidebar, controls, organise, shuffle, settle } = fixture();
  const entry = controller.entries.get("1");
  const original = { ...entry.current };
  controller.focus("1");
  settle();
  assert.equal(controller.focusedId, "1");
  assert.ok(board.classList.contains("has-focus"));
  assert.ok(sidebar.inert && organise.disabled && shuffle.disabled);
  assert.equal(controller.entries.get("2").element.inert, true);
  assert.equal(entry.element.attributes.get("aria-expanded"), "true");
  assert.equal(entry.current.scale, 1.5);
  assert.equal(controls.hidden, false);
  const escape = new Event("keydown", { cancelable: true });
  escape.key = "Escape";
  document.dispatchEvent(escape);
  settle();
  assert.equal(controller.focusedId, null);
  assert.deepEqual(entry.current, original);
  assert.equal(entry.element.wasFocused, true);
  assert.equal(controls.hidden, true);
  assert.equal(sidebar.inert, false);
  assert.equal(controller.entries.get("2").element.inert, false);
});

test("focused profile action retains the existing friend identifier", () => {
  const { controller, controls, openedProfile } = fixture();
  controller.focus("7");
  controls.controls["#openFocusedFriend"].dispatchEvent(new Event("click"));
  assert.equal(openedProfile(), "7");
  assert.equal(controller.focusedId, null);
});

test("shuffle changes positions without replacing friends; organise keeps the same elements", () => {
  const { controller, settle } = fixture();
  const elements = [...controller.entries.values()].map(entry => entry.element);
  const original = [...controller.entries.values()].map(entry => ({ ...entry.home }));
  controller.layout("shuffle");
  settle();
  assert.notDeepEqual([...controller.entries.values()].map(entry => entry.home), original);
  assert.deepEqual([...controller.entries.values()].map(entry => entry.element), elements);
  controller.layout("organise");
  settle();
  for (const entry of controller.entries.values()) {
    assert.ok(Math.abs(entry.current.angle) <= 5);
    assertInBounds(entry.current, controller.metrics);
  }
});

test("dragging is bounded and does not turn into a click; keyboard movement also works", () => {
  const { controller, settle } = fixture();
  const entry = controller.entries.get("1");
  const event = { button: 0, isPrimary: true, pointerId: 1, target: entry.element, clientX: 100, clientY: 100, preventDefault() {} };
  controller.pointerDown(event);
  controller.pointerMove({ ...event, clientX: 2000, clientY: -1000 });
  controller.pointerUp(event);
  settle();
  assert.ok(controller.suppressClickUntil > performance.now());
  assertInBounds(entry.current, controller.metrics);
  const previousX = entry.home.x;
  controller.keyDown({ target: entry.element, key: "ArrowLeft", shiftKey: true, preventDefault() {} });
  settle();
  assert.equal(entry.current.x, previousX - 30);
  controller.keyDown({ target: entry.element, key: "Enter", preventDefault() {} });
  assert.equal(controller.focusedId, "1");
});

test("resize preserves a focused stamp and reclamps its restored position", () => {
  const { controller, board, settle } = fixture();
  controller.focus("2");
  board.clientWidth = 343;
  controller.resize();
  settle();
  assert.equal(controller.focusedId, "2");
  assert.equal(controller.entries.get("2").current.x + controller.metrics.itemWidth / 2, 343 / 2);
  controller.closeFocus();
  settle();
  for (const entry of controller.entries.values()) assertInBounds(entry.current, controller.metrics);
});

test("empty filters disable controls and returning results restores the board", () => {
  const { controller, grid, board, organise, shuffle } = fixture();
  controller.focus("1");
  grid.children = [];
  controller.sync();
  assert.equal(controller.focusedId, null);
  assert.equal(board.hidden, true);
  assert.ok(organise.disabled && shuffle.disabled);
  grid.children = [new Element("1")];
  controller.sync();
  assert.equal(board.hidden, false);
  assert.equal(organise.disabled, false);
  assert.equal(controller.entries.size, 1);
});

test("reduced motion applies final transforms immediately", () => {
  const { controller } = fixture({ reducedMotion: true });
  controller.layout("shuffle");
  controller.tick(performance.now() + 16);
  for (const entry of controller.entries.values()) assert.deepEqual(entry.current, entry.goal);
  controller.focus("3");
  controller.tick(performance.now() + 16);
  assert.equal(controller.entries.get("3").current.scale, 1.5);
});
