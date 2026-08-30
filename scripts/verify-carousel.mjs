import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';

const source = (await readFile(new URL('../carousel.js', import.meta.url), 'utf8')).replace('export class RingCarousel', 'class RingCarousel');

class Element {
  constructor() {
    this.events = new Map(); this.children = []; this.dataset = {}; this.attributes = {};
    this.style = {}; this.clientWidth = 1280; this.clientHeight = 680;
    this.classList = { add() {}, remove() {} };
  }
  addEventListener(type, fn) { if (!this.events.has(type)) this.events.set(type, new Set()); this.events.get(type).add(fn); }
  removeEventListener(type, fn) { this.events.get(type)?.delete(fn); }
  emit(type, event = {}) { for (const fn of this.events.get(type) || []) fn(event); }
  setAttribute(key, value) { this.attributes[key] = value; }
  set innerHTML(value) { this.markup = value; this.metaName = new Element(); }
  get innerHTML() { return this.markup; }
  querySelector(selector) { return selector === '.carousel-meta__name' ? this.metaName : null; }
  appendChild(el) { this.children.push(el); el.parentNode = this; }
  removeChild(el) { this.children = this.children.filter(child => child !== el); el.parentNode = null; }
  closest(selector) { return selector === '.carousel-card' && this.className === 'carousel-card' ? this : null; }
  matches() { return true; }
  setPointerCapture(id) { this.capture = id; }
  hasPointerCapture(id) { return this.capture === id; }
  releasePointerCapture() { this.capture = null; }
}

function fixture({ count = 18, reduced = true, width = 1280 } = {}) {
  const mount = new Element(); mount.clientWidth = width;
  const document = new Element(); document.hidden = false; document.createElement = () => new Element();
  const window = new Element();
  const motion = new Element(); motion.matches = reduced; window.matchMedia = () => motion;
  const frames = new Map(); let sequence = 0, clock = 0, opened;
  const sandbox = { document, window, performance: { now: () => clock },
    requestAnimationFrame: fn => { frames.set(++sequence, fn); return sequence; },
    cancelAnimationFrame: id => frames.delete(id),
    IntersectionObserver: class { constructor(fn) { this.notify = fn; } observe() {} disconnect() { this.disconnected = true; } }
  };
  runInNewContext(`${source}\nthis.RingCarousel = RingCarousel;`, sandbox);
  const carousel = new sandbox.RingCarousel({ mount, orientation: 'horizontal',
    items: Array.from({ length: count }, (_, i) => ({ id: String(i), name: `Friend ${i}`, markup: '<svg aria-label="avatar"></svg>' })),
    onOpen: id => { opened = id; }
  });
  const step = () => { clock += 16; const pending = [...frames.values()]; frames.clear(); pending.forEach(fn => fn(clock)); };
  const settle = () => { for (let i = 0; i < 1000 && frames.size; i++) step(); };
  return { carousel, mount, document, window, motion, frames, step, settle, opened: () => opened };
}

test('horizontal geometry is finite for zero, one, two and many friends on mobile and desktop', () => {
  for (const count of [0, 1, 2, 3, 18]) for (const width of [320, 1280]) {
    const { carousel, frames } = fixture({ count, width });
    assert.ok(Number.isFinite(carousel.R) && carousel.R < 10000);
    assert.equal(carousel.cards.length, count);
    for (const card of carousel.cards) assert.doesNotMatch(card.el.style.transform, /NaN|Infinity/);
    assert.equal(frames.size, 0);
    if (count < 2) { carousel.turn(1); assert.equal(frames.size, 0); }
    carousel.destroy();
  }
});

test('reduced motion centres and opens the correct friend, with keyboard and manual wheel controls', () => {
  const { carousel, frames, opened, mount } = fixture();
  carousel.handleCardClick(carousel.cards[2].el);
  assert.equal(carousel.frontSlot, 2);
  assert.equal(opened(), undefined);
  carousel.handleCardClick(carousel.cards[2].el);
  assert.equal(opened(), '2');
  assert.equal(carousel.metaEl.metaName.textContent, 'Friend 2');
  mount.emit('keydown', { key: 'ArrowRight', preventDefault() {} });
  assert.equal(carousel.frontSlot, 3);
  carousel.onWheel({ deltaX: 1, deltaY: 0, deltaMode: 0 });
  assert.equal(carousel.frontSlot, 2);
  const rotation = carousel.rotation;
  carousel.onWheel({ ctrlKey: true, deltaY: 100 });
  assert.equal(carousel.rotation, rotation);
  assert.equal(frames.size, 0);
});

test('animation settles, pauses when hidden or suspended, and releases resources on exit', () => {
  const { carousel, frames, settle, document, window, mount } = fixture({ reduced: false });
  assert.equal(frames.size, 1);
  settle();
  assert.equal(frames.size, 0, 'Settled rings should not keep requesting frames');
  carousel.turn(1);
  assert.equal(frames.size, 1);
  carousel.setSuspended(true);
  assert.equal(frames.size, 0);
  carousel.setSuspended(false);
  carousel.turn(1);
  document.hidden = true; document.emit('visibilitychange');
  assert.equal(frames.size, 0);
  document.hidden = false; document.emit('visibilitychange');
  assert.equal(frames.size, 1);
  carousel.observer.notify([{ isIntersecting: false }]);
  assert.equal(frames.size, 0);
  carousel.observer.notify([{ isIntersecting: true }]);
  assert.equal(frames.size, 1);
  carousel.destroy();
  assert.equal(frames.size, 0);
  assert.equal(mount.children.length, 0);
  assert.ok(carousel.observer.disconnected);
  for (const target of [window, document, mount, carousel.stage]) {
    for (const handlers of target.events.values()) assert.equal(handlers.size, 0);
  }
});

test('dragging does not open a profile and vertical touch gestures keep page scrolling available', () => {
  const { carousel, frames, opened } = fixture();
  const card = carousel.cards[0].el;
  const down = { button: 0, isPrimary: true, pointerId: 1, pointerType: 'touch', clientX: 100, clientY: 100, target: card };
  carousel.onPointerDown({ ...down, button: 2 });
  assert.equal(carousel.dragging, false);
  carousel.onPointerDown(down);
  carousel.onPointerMove({ ...down, clientX: 101, clientY: 140 });
  assert.equal(carousel.dragging, false);
  assert.equal(carousel.rotation, 0);
  carousel.onPointerDown(down);
  carousel.onPointerMove({ ...down, clientX: 280 });
  carousel.onPointerUp(down);
  carousel.stage.emit('click', { detail: 1, target: card });
  assert.equal(opened(), undefined);
  assert.equal(carousel.stage.capture, null);
  assert.equal(frames.size, 0);
});

test('normal pointer release retains flick momentum after lost capture', () => {
  const { carousel, frames } = fixture({ reduced: false });
  const event = { button: 0, isPrimary: true, pointerId: 1, pointerType: 'mouse', clientX: 100, clientY: 100, target: carousel.cards[0].el };
  carousel.onPointerDown(event);
  carousel.onPointerMove({ ...event, clientX: 180 });
  carousel.onPointerUp(event);
  const velocity = carousel.velocity;
  assert.notEqual(velocity, 0);
  carousel.stage.emit('lostpointercapture', { pointerId: 1 });
  assert.equal(carousel.velocity, velocity);
  assert.equal(frames.size, 1);
  carousel.destroy();
});
