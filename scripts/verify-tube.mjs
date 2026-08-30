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
runInNewContext(`${(await readFile(new URL('../tube.js', import.meta.url), 'utf8')).replace('export class FriendTube', 'class FriendTube')}\nthis.FriendTube = FriendTube;`, context);
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

// Independently project the actual CSS transforms, including all four corners.
function projectedBounds(card) {
  const numbers = card.el.style.transform.match(/-?\d+(?:\.\d+)?(?:e[+-]?\d+)?/gi).map(Number);
  // The 3 in translate3d is also matched.
  const [, x, y, z, , , yaw, cant, scale] = numbers;
  const w = (card.el.offsetWidth || 128) / 2;
  const h = (card.el.offsetHeight || 158) / 2;
  const points = [];
  for (const u of [-w, w]) for (const v of [-h, h]) {
    const tiltedX = (u * Math.cos(cant) - v * Math.sin(cant)) * scale;
    const tiltedY = (u * Math.sin(cant) + v * Math.cos(cant)) * scale;
    const perspective = tube.perspective / (tube.perspective - z + tiltedX * Math.sin(yaw));
    points.push({ x: (x + tiltedX * Math.cos(yaw)) * perspective, y: (y + tiltedY) * perspective });
  }
  return {
    left: Math.min(...points.map(p => p.x)), right: Math.max(...points.map(p => p.x)),
    top: Math.min(...points.map(p => p.y)), bottom: Math.max(...points.map(p => p.y))
  };
}

let minimumGap = Infinity;
for (const count of [0, 1, 2, 4, 5, 7, 11, 12, 13, 17, 18]) {
  for (const width of [760, 900, 1100, 1440]) for (const height of [440, 570, 680]) {
    stage.clientWidth = width;
    stage.clientHeight = height;
    tube.setFriends(friends.slice(0, count));
    assert.equal(tube.mobile, false);
    assert.ok(tube.scale > 0 && tube.scale <= 1);
    for (const card of tube.cards) assert.equal(card.speed, tube.rows === 1 ? 1 : .65 + card.row / (tube.rows - 1) * .9, 'Restore the original differential row speeds on desktop');
    const offsets = tube.cards.map(card => card.theta);
    // The 0.65/1.10/1.55 multipliers realign after 20 base revolutions.
    // Sample their entire relative-motion cycle, including uneven rows.
    for (let degree = 0; degree < 7200; degree += 6) {
      tube.angle = degree * Math.PI / 180;
      tube.draw();
      const front = [];
      for (const card of tube.cards) {
        const bounds = projectedBounds(card);
        const label = `${count} cards, ${width}×${height}, ${degree}°`;
        assert.ok(bounds.top >= -height / 2 + 19.9 && bounds.bottom <= height / 2 - 19.9, `Vertical clipping: ${label}`);
        assert.ok(bounds.left >= -width / 2 && bounds.right <= width / 2, `Horizontal clipping: ${label}`);
        if (Math.sin(card.theta + tube.angle * card.speed) >= tube.radius / tube.perspective) front.push({ card, bounds });
      }
      for (let i = 0; i < front.length; i++) for (let j = i + 1; j < front.length; j++) {
        const a = front[i], b = front[j];
        if (a.card.row !== b.card.row) {
          // Cards on opposite sides of the screen do not need vertical separation.
          if (a.bounds.right < b.bounds.left || b.bounds.right < a.bounds.left) continue;
          const gap = a.card.row < b.card.row ? b.bounds.top - a.bounds.bottom : a.bounds.top - b.bounds.bottom;
          minimumGap = Math.min(minimumGap, gap);
          assert.ok(gap >= 5.9, 'Differential row movement must retain a small 6px minimum clearance');
        } else {
          const gap = Math.max(b.bounds.left - a.bounds.right, a.bounds.left - b.bounds.right);
          assert.ok(gap >= 12, 'Neighbours on a front-facing row must remain horizontally separated');
        }
      }
    }
    assert.deepEqual(tube.cards.map(card => card.theta), offsets, 'Rotation must not mutate the starting row offsets');
  }
}
assert.ok(minimumGap < 8, 'The closest front-facing rows should leave only a small gap');

// The actual cards grow while the stage stays at its original height.
const tubeCss = await readFile(new URL('../tube.css', import.meta.url), 'utf8');
assert.match(tubeCss, /\.tube-stage \{\s*height: clamp\(440px, calc\(100svh - 165px\), 680px\)/);
assert.doesNotMatch(tubeCss, /\* 1\.12/);
assert.match(tubeCss, /@media \(max-width: 760px\)[\s\S]*?\.tube-stage \{ height: clamp\(440px, calc\(100svh - 165px\), 600px\); \}/);
// Recorded compact-layout scales before directly enlarging the cards.
const compactScales = [
  [1100, 440, .40104912038435014], [1100, 570, .5367540121078491], [1100, 680, .650102436542511],
  [1440, 440, .4019743475997658], [1440, 570, .5384848117828369], [1440, 680, .6527450084686279]
];
let smallestGrowth = Infinity, largestGrowth = 0;
for (const [width, originalHeight, previousScale] of compactScales) {
  stage.clientWidth = width;
  stage.clientHeight = originalHeight;
  tube.setFriends(friends);
  const growth = tube.scale / previousScale;
  smallestGrowth = Math.min(smallestGrowth, growth);
  largestGrowth = Math.max(largestGrowth, growth);
  assert.ok(growth >= 1.1 && growth <= 1.15, 'Desktop cards should grow by 10–15%, not just gain empty space');
  assert.equal(stage.clientHeight, originalHeight);
}
console.log(`✓ Larger friend cards: ${((smallestGrowth - 1) * 100).toFixed(1)}–${((largestGrowth - 1) * 100).toFixed(1)}% increase at the SAME stage height; mobile unchanged`);

// Existing narrow-screen layout and row speeds must stay unchanged.
for (const count of [1, 7, 18]) for (const width of [320, 600, 759]) {
  stage.clientWidth = width;
  stage.clientHeight = 560;
  tube.setFriends(friends.slice(0, count));
  assert.equal(tube.mobile, true);
  assert.equal(tube.scale, .7);
  assert.equal(tube.spacing, 560 * .16);
  assert.equal(tube.radius, Math.max(150, width * .43));
  assert.equal(tube.perspective, tube.radius * 2.8);
  for (const card of tube.cards) assert.equal(card.speed, tube.rows === 1 ? 1 : .65 + card.row / (tube.rows - 1) * .9);
}

// Recompute geometry on resize, without resetting rotation or starting a loop.
tube.angle = 12.5;
stage.clientWidth = 1100;
stage.clientHeight = 680;
tube.resize();
const largeScale = tube.scale;
assert.equal(tube.cards[0].speed, .65);
assert.equal(tube.cards[tube.columns].speed, 1.1);
assert.equal(tube.cards.at(-1).speed, 1.55);
stage.clientHeight = 440;
tube.resize();
assert.ok(tube.scale < largeScale);
assert.equal(tube.angle, 12.5);
assert.equal(frames.size, 0);
stage.clientWidth = 375;
tube.resize();
assert.equal(tube.scale, .7);
assert.equal(tube.spacing, 440 * .16);
assert.equal(tube.cards[0].speed, .65);
assert.equal(tube.cards.at(-1).speed, 1.55);
console.log(`✓ Desktop Tube: differential row speeds, compact projected clearance over 20 turns (minimum ${minimumGap.toFixed(1)}px), viewport fit, responsive refitting and unchanged mobile geometry`);
