// Animation lifecycle checks without a browser or third-party dependencies.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';

class Element {
  constructor() {
    this.handlers = new Map();
    this.style = {};
    this.dataset = {};
    this.children = [];
    this.attributes = {};
    this.clientWidth = 1280;
    this.clientHeight = 560;
    this.classList = { toggle() {}, add() {}, remove() {} };
  }
  addEventListener(type, fn) { this.handlers.set(type, [...(this.handlers.get(type) || []), fn]); }
  emit(type, event = {}) { for (const fn of this.handlers.get(type) || []) fn(event); }
  setAttribute(key, value) { this.attributes[key] = value; }
  set innerHTML(value) {
    this.children = [...value.matchAll(/data-friend-id="(\d+)"/g)].map(([, id]) => {
      const el = new Element(); el.dataset.friendId = id; return el;
    });
  }
  setPointerCapture(id) { this.capture = id; }
  hasPointerCapture(id) { return this.capture === id; }
  releasePointerCapture() { this.capture = null; }
  contains(el) { return this.children.includes(el); }
}

const controls = new Map();
const document = new Element();
document.hidden = false;
document.querySelector = key => {
  if (!controls.has(key)) controls.set(key, new Element());
  return controls.get(key);
};
const window = new Element();
const media = new Element();
media.matches = true;
const frames = new Map();
let frameId = 0, clock = 0;
const context = {
  document, window, matchMedia: () => media,
  ResizeObserver: class { observe() {} },
  IntersectionObserver: class { observe() {} },
  performance: { now: () => clock },
  requestAnimationFrame: fn => { frames.set(++frameId, fn); return frameId; },
  cancelAnimationFrame: id => frames.delete(id),
};
runInNewContext(`${await readFile(new URL('../tube.js', import.meta.url), 'utf8')}\nthis.FriendTube = FriendTube;`, context);
const stage = new Element(), world = new Element(), gallery = new Element();
const tube = new context.FriendTube({ stage, world, gallery, cardMarkup: f => `<button data-friend-id="${f.id}"></button>`, onOpen() {} });
const friends = Array.from({ length: 18 }, (_, i) => ({ id: String(i + 1) }));
const step = ms => {
  clock += ms;
  const pending = [...frames.values()]; frames.clear();
  pending.forEach(fn => fn(clock));
};

tube.setFriends(friends);
tube.setEnabled(true);
assert.equal(world.children.length, 18);
assert.equal(frames.size, 0, 'Reduced motion must start without animation');
const initialPose = world.children[0].style.transform;
tube.turn(1);
assert.notEqual(world.children[0].style.transform, initialPose, 'Manual rotation must still work with reduced motion');
assert.equal(frames.size, 0, 'Reduced-motion manual rotation must be immediate');

controls.get('#tubePause').emit('click');
assert.equal(frames.size, 1, 'Explicit play starts exactly one loop');
step(16); step(16);
assert.equal(frames.size, 1);
tube.setSuspended(true);
assert.equal(frames.size, 0, 'Opening a dialog suspends the loop');
tube.setSuspended(false);
assert.equal(frames.size, 1);
document.hidden = true;
document.emit('visibilitychange');
assert.equal(frames.size, 0, 'Hidden documents do not render');
document.hidden = false;
document.emit('visibilitychange');
tube.setEnabled(false);
assert.equal(frames.size, 0, 'Grid/list views stop the tube loop');
tube.setEnabled(true);
tube.inViewport = false;
tube.syncAnimation();
assert.equal(frames.size, 0, 'Offscreen galleries do not render');
tube.inViewport = true;
tube.syncAnimation();
controls.get('#tubePause').emit('click');
const pausedPose = world.children[0].style.transform;
step(1000);
assert.equal(world.children[0].style.transform, pausedPose, 'Pause freezes the scene');

tube.pointerDown({ button: 0, isPrimary: true, pointerId: 1, pointerType: 'touch', clientX: 100, clientY: 100 });
tube.pointerMove({ pointerId: 1, pointerType: 'touch', clientX: 105, clientY: 140 });
assert.equal(tube.drag.moved, false, 'Vertical touch scrolling must not rotate the cylinder');
tube.pointerEnd({ pointerId: 1 }, true);
tube.pointerDown({ button: 0, isPrimary: true, pointerId: 2, pointerType: 'mouse', clientX: 100, clientY: 100 });
tube.pointerMove({ pointerId: 2, pointerType: 'mouse', clientX: 180, clientY: 100 });
assert.notEqual(world.children[0].style.transform, pausedPose, 'Dragging works even when autoplay is paused');
window.emit('blur');
assert.equal(tube.drag, null, 'Interrupted drags are released');
assert.equal(stage.capture, null);
assert.equal(frames.size, 0);

tube.setFriends(friends.slice(0, 1));
assert.equal(controls.get('#tubeNext').disabled, true);
assert.equal(frames.size, 0, 'Single results do not spin away');
stage.clientWidth = 320;
tube.resize();
assert.ok(!world.children[0].style.transform.includes('NaN'), 'Mobile projection must remain valid');
tube.setFriends([]);
tube.setEnabled(false);
assert.equal(frames.size, 0);
console.log('✓ Tube: reduced motion, explicit play, pause, offscreen/hidden/modal lifecycle, view switching, touch scrolling, drag interruption, single/empty results and mobile projection');
