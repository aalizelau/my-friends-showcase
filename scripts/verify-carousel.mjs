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
  removeAttribute(key) { delete this.attributes[key]; }
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

function fixture({ count = 18, reduced = true, width = 1280, height = 680, bubbles = false } = {}) {
  const mount = new Element(); mount.clientWidth = width; mount.clientHeight = height;
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
    items: Array.from({ length: count }, (_, i) => ({ id: String(i), name: `Friend ${i}`, bubble: bubbles && i !== 1 ? `Personality ${i}` : '', markup: '<svg aria-label="avatar"></svg>' })),
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

test('bubbles belong only to the centered friend with notes, including keyboard navigation', () => {
  const { carousel, mount, frames } = fixture({ bubbles: true });
  assert.equal(carousel.bubbleEl.hidden, false);
  assert.equal(carousel.bubbleText.textContent, 'Personality 0');
  assert.equal(carousel.cards[0].el.attributes['aria-describedby'], 'ringFocusBubble');
  assert.equal(carousel.bubbleEl.children.length, 1, 'Only the personality text is visible in the bubble');
  assert.match(carousel.bubbleEl.attributes['aria-label'], /非本人原話/);
  carousel.turn(1);
  assert.equal(carousel.bubbleEl.hidden, true, 'Unrecorded friends should not receive invented text');
  assert.equal(carousel.cards[0].el.attributes['aria-describedby'], undefined);
  mount.emit('keydown', { key: 'ArrowRight', preventDefault() {} });
  assert.equal(carousel.bubbleText.textContent, 'Personality 2');
  assert.equal(carousel.bubbleEl.hidden, false);
  assert.equal(carousel.cards[2].el.attributes['aria-describedby'], 'ringFocusBubble');
  carousel.setSuspended(true);
  assert.equal(carousel.bubbleEl.hidden, true);
  carousel.setSuspended(false);
  assert.equal(carousel.bubbleEl.hidden, false);
  assert.equal(frames.size, 0);
  carousel.destroy();
  assert.equal(mount.children.length, 0);
});

test('bubbles wait until motion settles and hide during dragging or offscreen', () => {
  const { carousel, settle, document } = fixture({ reduced: false, bubbles: true });
  assert.equal(carousel.bubbleEl.hidden, true);
  settle();
  const slot = (carousel.frontSlot + 2) % carousel.cards.length;
  carousel.handleCardClick(carousel.cards[slot].el);
  assert.equal(carousel.bubbleEl.hidden, true);
  settle();
  assert.equal(carousel.bubbleEl.hidden, false);
  assert.equal(carousel.bubbleText.textContent, `Personality ${slot}`);
  const event = { button: 0, isPrimary: true, pointerId: 1, clientX: 100, clientY: 100, target: carousel.cards[slot].el };
  carousel.onPointerDown(event);
  assert.equal(carousel.bubbleEl.hidden, true);
  carousel.onPointerUp(event);
  assert.equal(carousel.bubbleEl.hidden, false);
  document.hidden = true; document.emit('visibilitychange');
  assert.equal(carousel.bubbleEl.hidden, true);
  document.hidden = false; document.emit('visibilitychange');
  assert.equal(carousel.bubbleEl.hidden, false);
  carousel.observer.notify([{ isIntersecting: false }]);
  assert.equal(carousel.bubbleEl.hidden, true);
  carousel.destroy();
});

test('speech, portrait and name have separate space on narrow and short stages', () => {
  for (const width of [320, 390, 760, 1280, 1920]) for (const height of [580, 600, 760]) {
    const { carousel } = fixture({ bubbles: true, width, height });
    const portraitTop = carousel.frontY - carousel.cardH / 2;
    const bubbleBottom = height - parseFloat(carousel.bubbleEl.style.bottom);
    assert.ok(bubbleBottom >= 224, 'Reserve enough room for the handwritten bubble');
    assert.ok(portraitTop - bubbleBottom >= 17.99, 'The bubble tail must not cover the avatar');
    assert.ok(parseFloat(carousel.metaEl.style.top) + 64 <= height - 24, 'Keep the centered name in the stage');
    const originalY = carousel.frontY;
    carousel.turn(1);
    carousel.onResize();
    assert.equal(carousel.frontY, originalY, 'The ring must not jump when a friend has no bubble');
    carousel.destroy();
  }
});
