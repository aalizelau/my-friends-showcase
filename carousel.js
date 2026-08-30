/*
 * Ring carousel — the part of Yousuf-developer/Viscose-carousel worth keeping:
 * cards riding a big wheel that sits mostly off-screen, so you see a tall arc
 * sweeping past. Scroll / drag / swipe to turn it; it carries momentum and
 * snaps a card to the front. Click an off-centre card to turn it to the front;
 * click the front card to open that friend.
 *
 * Deliberately NOT ported: the viscous "sticky links between cards" — the goo,
 * honey threads and smooth-minimum melting. That effect only exists because
 * the original draws the whole ring as one SDF fragment shader; here the ring
 * is plain 2-D transforms, so the cards never touch and nothing strings.
 *
 * Feel is borrowed from the original's params.js (scrollSpeed, damping,
 * maxSpeed, snap, ringRadius) so it turns like Viscose without the shader.
 */
const TAU = Math.PI * 2;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
// wrap an angle to (-PI, PI]
const shortAngle = a => { a = ((a + Math.PI) % TAU + TAU) % TAU - Math.PI; return a; };
const easeInOutCubic = t => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

export class RingCarousel {
  constructor({ mount, items, onOpen, orientation }) {
    this.mount = mount;
    this.items = items;
    this.onOpen = onOpen || function () {};
    // "vertical" = wheel off to the left, cards sweep up/down (the original).
    // "horizontal" = wheel below screen, cards sweep left↔right across a wide arc.
    this.orientation = orientation === "horizontal" ? "horizontal" : "vertical";

    this.rotation = 0;      // radians; a card i faces front when rotation ≡ -i*step
    this.velocity = 0;      // rad/s
    this.dragging = false;
    this.moved = 0;
    this.downCard = null;
    this.tween = null;      // click-to-centre easing {from,to,start,dur}
    this.frontSlot = -1;
    this.bubbleSlot = -1;
    this.hasBubbles = items.some(item => item.bubble);
    this.raf = null;
    this.suspended = false;
    this.destroyed = false;
    this.inViewport = true;
    this.listeners = [];
    this.motion = window.matchMedia('(prefers-reduced-motion: reduce)');

    // -- feel, adapted from Viscose params.js --
    this.scrollSpeed = 0.0016; // rad/s of angular velocity per px of wheel delta
    this.damping = 0.92;       // velocity kept per 60fps frame
    this.maxSpeed = 9;         // rad/s — one flick cannot run away
    this.dragSpeed = 1;
    this.snapFrom = 1.1;       // rad/s under which the ring commits to a slot
    this.snapLerp = 0.16;
    this.radialFactor = this.orientation === "horizontal" ? 0.4 : 0.55;  // card tilt with the wheel (0 = upright)
    this.pickDur = 0.6;        // click-to-centre seconds

    this._onResize = this.onResize.bind(this);
    this._onWheel = this.onWheel.bind(this);
    this._onDown = this.onPointerDown.bind(this);
    this._onMove = this.onPointerMove.bind(this);
    this._onUp = this.onPointerUp.bind(this);
    this._frame = this.frame.bind(this);

    this.init();
  }

  init() {
    this.stage = document.createElement("div");
    this.stage.className = "carousel-stage";
    this.mount.appendChild(this.stage);

    this.metaEl = document.createElement("div");
    this.metaEl.className = "carousel-meta";
    this.metaEl.innerHTML = `<h2 class="carousel-meta__name"></h2>`;
    this.mount.appendChild(this.metaEl);

    this.bubbleEl = document.createElement("div");
    this.bubbleEl.id = "ringFocusBubble";
    this.bubbleEl.className = "focus-bubble carousel-bubble";
    this.bubbleEl.hidden = true;
    this.bubbleEl.setAttribute("role", "note");
    this.bubbleEl.setAttribute("aria-label", "依手帳想像的語氣，非本人原話");
    this.bubbleText = document.createElement("p");
    this.bubbleText.className = "focus-bubble-text";
    this.bubbleEl.appendChild(this.bubbleText);
    this.mount.appendChild(this.bubbleEl);

    const N = this.items.length;
    this.step = TAU / Math.max(N, 1);
    this.cards = this.items.map((item, i) => {
      const el = document.createElement("button");
      el.type = "button";
      el.className = "carousel-card";
      el.dataset.slot = String(i);
      el.setAttribute("aria-label", `查看 ${item.name || "朋友"} 的詳情`);
      if (item.markup) el.innerHTML = item.markup;
      else {
        const img = document.createElement("img");
        img.src = item.src;
        img.alt = "";
        img.draggable = false;
        el.appendChild(img);
      }
      this.stage.appendChild(el);
      return { el, item, i };
    });

    this.onResize();
    this.addEventListeners();

    // Entry: a short spin that damps down and snaps — the ring "launches".
    this.velocity = this.motion.matches || N < 2 ? 0 : -5.2;
    this.updateFront();
    this.syncAnimation();
  }

  geometry() {
    const W = this.mount.clientWidth || window.innerWidth;
    const H = this.mount.clientHeight || window.innerHeight;
    this.W = W; this.H = H;
    if (this.orientation === "horizontal") {
      // Big wheel below the screen: cards ride a wide, gentle top arc and
      // sweep left↔right. Radius is derived from width so the two side cards
      // sit at ~0.30·W from centre — comfortably complete (front + 2 full,
      // with the next pair peeking at the edges), holding through a turn.
      this.cardW = clamp(W * 0.185, Math.min(190, W * .56), 300);
      // Reserve a stable speech area, even when passing a friend without notes.
      // Keep the card, name and bubble within the stage on shorter screens.
      if (this.hasBubbles) this.cardW = Math.min(this.cardW, Math.max(120, H - 358) / 1.18);
      this.cardH = this.cardW * 1.18;
      this.R = Math.max((W * 0.30) / Math.sin(Math.min(this.step, Math.PI / 3)), 720);
      this.frontX = W * 0.5;
      this.frontY = H * 0.46;
      if (this.hasBubbles) this.frontY = Math.max(this.frontY, 244 + this.cardH / 2);
      this.cx = this.frontX;        // centre directly below the front card
      this.cy = this.frontY + this.R;
    } else {
      // Big wheel off to the left: cards ride a tall arc and sweep up/down.
      this.cardH = clamp(H * 0.46, 200, 460);
      this.cardW = this.cardH * 0.82;
      this.R = Math.max(H * 1.5, 560);
      this.frontX = W * 0.4;
      this.frontY = H * 0.5;
      this.cx = this.frontX - this.R;
      this.cy = H * 0.5;
    }
  }

  onResize() {
    this.geometry();
    this.cards.forEach(c => {
      c.el.style.width = this.cardW + "px";
      c.el.style.height = this.cardH + "px";
    });
    if (this.orientation === "horizontal") {
      // meta centred just below the front card
      this.metaEl.classList.add("carousel-meta--center");
      this.metaEl.style.left = this.frontX + "px";
      this.metaEl.style.top = (this.frontY + this.cardH * 0.5 + 26) + "px";
      this.metaEl.style.maxWidth = Math.min(this.W * 0.6, 520) + "px";
    } else {
      // meta sits just right of the front card (like Viscose's side type)
      this.metaEl.classList.remove("carousel-meta--center");
      this.metaEl.style.left = (this.frontX + this.cardW * 0.5 + Math.min(48, this.W * 0.03)) + "px";
      this.metaEl.style.top = this.cy + "px";
      this.metaEl.style.maxWidth = Math.max(120, this.W - (this.frontX + this.cardW * 0.5) - 60) + "px";
    }
    this.bubbleEl.style.bottom = (this.H - this.frontY + this.cardH / 2 + 18) + "px";
    this.layout();
  }

  layout() {
    const horizontal = this.orientation === "horizontal";
    const spread = this.step * (horizontal ? 4 : 3.2); // angular reach over which cards fade/shrink out
    for (const c of this.cards) {
      const theta = this.rotation + c.i * this.step;
      const a = Math.abs(shortAngle(theta));
      const x = horizontal ? this.cx + this.R * Math.sin(theta) : this.cx + this.R * Math.cos(theta);
      const y = horizontal ? this.cy - this.R * Math.cos(theta) : this.cy + this.R * Math.sin(theta);
      const t = clamp(a / spread, 0, 1);
      const scale = lerp(1, 0.6, t);
      const opacity = a > spread ? 0 : lerp(1, 0.12, t);
      const tilt = shortAngle(theta) * this.radialFactor;
      c.el.style.transform = `translate(${x}px, ${y}px) translate(-50%, -50%) rotate(${tilt}rad) scale(${scale})`;
      c.el.style.opacity = opacity.toFixed(3);
      c.el.style.zIndex = String(1000 - Math.round(a * 200));
      c.el.style.pointerEvents = opacity > 0.55 ? "auto" : "none";
      const visible = opacity > .55 && x + this.cardW / 2 > 0 && x - this.cardW / 2 < this.W
        && y + this.cardH / 2 > 0 && y - this.cardH / 2 < this.H;
      c.el.tabIndex = visible ? 0 : -1;
      c.el.setAttribute("aria-hidden", String(!visible));
    }
  }

  updateFront() {
    if (!this.cards.length) return;
    const slot = ((Math.round(-this.rotation / this.step) % this.cards.length) + this.cards.length) % this.cards.length;
    if (slot === this.frontSlot) return;
    this.frontSlot = slot;
    const item = this.items[slot];
    this.metaEl.querySelector(".carousel-meta__name").textContent = item.name || "";
    this.bubbleText.textContent = item.bubble || "";
  }

  updateBubble() {
    const centered = this.frontSlot >= 0 && Math.abs(shortAngle(this.rotation + this.frontSlot * this.step)) < .0001;
    const visible = centered && !!this.items[this.frontSlot]?.bubble && !this.dragging && !this.tween
      && Math.abs(this.velocity) <= .001 && !this.suspended && !document.hidden && this.inViewport;
    const slot = visible ? this.frontSlot : -1;
    if (slot === this.bubbleSlot) return;
    if (this.bubbleSlot >= 0) this.cards[this.bubbleSlot].el.removeAttribute("aria-describedby");
    this.bubbleSlot = slot;
    this.bubbleEl.hidden = !visible;
    if (visible) this.cards[slot].el.setAttribute("aria-describedby", this.bubbleEl.id);
  }

  needsFrame() {
    const snap = Math.round(this.rotation / this.step) * this.step;
    return !this.destroyed && !this.suspended && !document.hidden && this.inViewport && !this.dragging
      && this.cards.length > 1 && !!(this.tween || Math.abs(this.velocity) > .001 || Math.abs(snap - this.rotation) > .0001);
  }

  syncAnimation() {
    this.updateBubble();
    if (!this.needsFrame()) {
      if (this.raf !== null) cancelAnimationFrame(this.raf);
      this.raf = null;
    } else if (this.raf === null) {
      this.lastT = performance.now();
      this.raf = requestAnimationFrame(this._frame);
    }
  }

  setSuspended(suspended) {
    this.suspended = suspended;
    if (suspended) {
      this.cancelGesture();
      this.velocity = 0;
      this.tween = null;
    }
    this.syncAnimation();
  }

  frame(now) {
    this.raf = null;
    if (!this.needsFrame()) return;
    const dt = Math.min(0.05, (now - this.lastT) / 1000);
    this.lastT = now;

    if (this.tween) {
      this.tween.elapsed += dt;
      const p = clamp(this.tween.elapsed / this.tween.dur, 0, 1);
      this.rotation = lerp(this.tween.from, this.tween.to, easeInOutCubic(p));
      if (p >= 1) this.tween = null;
    } else if (!this.dragging) {
      this.rotation += this.velocity * dt;
      this.velocity *= Math.pow(this.damping, dt * 60);
      if (Math.abs(this.velocity) < this.snapFrom) {
        const target = Math.round(this.rotation / this.step) * this.step;
        this.rotation = lerp(this.rotation, target, 1 - Math.pow(1 - this.snapLerp, dt * 60));
        this.velocity *= 0.6;
      }
    }

    this.layout();
    this.updateFront();
    this.syncAnimation();
  }

  /* -------- input -------- */
  // the pointer axis that turns the ring: x for horizontal, y for vertical
  pointerCoord(e) {
    return this.orientation === "horizontal" ? e.clientX : e.clientY;
  }

  onWheel(e) {
    if (e.ctrlKey || this.destroyed || this.suspended || document.hidden || !this.inViewport || this.dragging || this.items.length < 2) return;
    // Long speech bubbles retain their own scroll area (and CSS scroll containment).
    const text = e.target?.closest?.('.focus-bubble-text');
    if (text && text.scrollHeight > text.clientHeight) return;
    const units = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? this.H : 1;
    const dx = e.deltaX || 0, dy = e.deltaY || 0;
    const delta = (this.orientation === "horizontal" && Math.abs(dx) > Math.abs(dy) ? dx : dy) * units;
    if (!delta) return;
    e.preventDefault();
    this.tween = null;
    if (this.motion.matches) {
      this.turn(delta > 0 ? -1 : 1);
      return;
    }
    this.rotation += clamp(delta * this.scrollSpeed, -this.step, this.step);
    this.velocity = clamp(this.velocity + delta * this.scrollSpeed, -this.maxSpeed, this.maxSpeed);
    this.layout();
    this.updateFront();
    this.syncAnimation();
  }

  onPointerDown(e) {
    if (e.button !== 0 || e.isPrimary === false || this.suspended || this.items.length < 2) return;
    this.dragging = true;
    this.moved = 0;
    this.tween = null;
    this.velocity = 0;
    this.lastPos = this.pointerCoord(e);
    this.downX = e.clientX;
    this.downY = e.clientY;
    this.pointerId = e.pointerId;
    this.lastMoveT = performance.now();
    this.pointerVel = 0;
    this.downCard = e.target.closest && e.target.closest(".carousel-card");
    this.syncAnimation();
  }

  onPointerMove(e) {
    if (!this.dragging || e.pointerId !== this.pointerId) return;
    if (!this.moved) {
      if (e.pointerType === "touch" && Math.abs(e.clientY - this.downY) > Math.abs(e.clientX - this.downX)) {
        this.cancelGesture();
        this.syncAnimation();
        return;
      }
      if (Math.abs(this.pointerCoord(e) - this.lastPos) < 6) return;
      this.stage.setPointerCapture(e.pointerId);
    }
    const now = performance.now();
    const pos = this.pointerCoord(e);
    const d = pos - this.lastPos;
    this.moved += Math.abs(d);
    const dTheta = (d / this.R) * this.dragSpeed; // arc length → angle
    this.rotation += dTheta;
    const dt = Math.max(1, now - this.lastMoveT) / 1000;
    this.pointerVel = dTheta / dt;
    this.lastPos = pos;
    this.lastMoveT = now;
    this.layout();
    this.updateFront();
  }

  cancelGesture() {
    const id = this.pointerId;
    this.dragging = false;
    this.pointerId = null;
    this.downCard = null;
    if (id != null && this.stage.hasPointerCapture(id)) this.stage.releasePointerCapture(id);
  }

  onPointerUp(e) {
    if (!this.dragging || e.pointerId !== this.pointerId) return;
    const moved = this.moved >= 6;
    this.cancelGesture();
    if (moved) {
      this.suppressClickUntil = performance.now() + 350;
      this.velocity = this.motion.matches || performance.now() - this.lastMoveT > 100 ? 0 : clamp(this.pointerVel || 0, -this.maxSpeed, this.maxSpeed);
      if (this.motion.matches) {
        this.rotation = Math.round(this.rotation / this.step) * this.step;
        this.layout();
        this.updateFront();
      }
    }
    this.syncAnimation();
  }

  handleCardClick(cardEl) {
    if (this.suspended) return;
    const slot = Number(cardEl.dataset.slot);
    if (slot === this.frontSlot) {
      this.onOpen(this.items[slot].id);
      return;
    }
    // turn the ring the short way until this card faces front
    const theta = this.rotation + slot * this.step;
    const to = this.rotation - shortAngle(theta);
    this.velocity = 0;
    if (this.motion.matches) {
      this.rotation = to;
      this.layout();
      this.updateFront();
    } else this.tween = { from: this.rotation, to, elapsed: 0, dur: this.pickDur };
    this.syncAnimation();
  }

  turn(direction) {
    if (this.suspended || this.cards.length < 2) return;
    const slot = ((this.frontSlot + direction) % this.cards.length + this.cards.length) % this.cards.length;
    this.handleCardClick(this.cards[slot].el);
  }

  listen(target, type, handler, options) {
    target.addEventListener(type, handler, options);
    this.listeners.push(() => target.removeEventListener(type, handler, options));
  }

  addEventListeners() {
    this.listen(window, "resize", this._onResize);
    this.listen(this.mount, "wheel", this._onWheel, { passive: false });
    this.listen(this.stage, "pointerdown", this._onDown);
    this.listen(window, "pointermove", this._onMove);
    this.listen(window, "pointerup", this._onUp);
    const cancel = event => {
      if (!this.dragging || (event.pointerId != null && event.pointerId !== this.pointerId)) return;
      this.cancelGesture(); this.velocity = 0; this.syncAnimation();
    };
    this.listen(window, "pointercancel", cancel);
    this.listen(window, "blur", cancel);
    this.listen(this.stage, "lostpointercapture", cancel);
    this.listen(document, "visibilitychange", () => { if (document.hidden) this.cancelGesture(); this.syncAnimation(); });
    this.listen(this.motion, "change", () => {
      this.velocity = 0;
      this.tween = null;
      this.rotation = Math.round(this.rotation / this.step) * this.step;
      this.layout(); this.updateFront(); this.syncAnimation();
    });
    this.listen(this.stage, "click", event => {
      if (event.detail && performance.now() < (this.suppressClickUntil || 0)) return;
      const card = event.target.closest(".carousel-card");
      if (card) this.handleCardClick(card);
    });
    this.listen(this.mount, "keydown", event => {
      if (!["ArrowLeft", "ArrowRight"].includes(event.key)) return;
      event.preventDefault();
      this.turn(event.key === "ArrowLeft" ? -1 : 1);
    });
    this.listen(this.stage, "focusin", event => {
      if (!event.target.matches(":focus-visible")) return;
      this.velocity = 0;
      this.tween = null;
      this.rotation -= shortAngle(this.rotation + Number(event.target.dataset.slot) * this.step);
      this.layout(); this.updateFront(); this.syncAnimation();
    });
    this.observer = new IntersectionObserver(([entry]) => { this.inViewport = entry.isIntersecting; this.syncAnimation(); });
    this.observer.observe(this.mount);
  }

  destroy() {
    this.destroyed = true;
    this.cancelGesture();
    if (this.raf !== null) cancelAnimationFrame(this.raf);
    this.raf = null;
    this.listeners.forEach(remove => remove());
    this.observer.disconnect();
    if (this.stage.parentNode) this.stage.parentNode.removeChild(this.stage);
    if (this.metaEl.parentNode) this.metaEl.parentNode.removeChild(this.metaEl);
    if (this.bubbleEl.parentNode) this.bubbleEl.parentNode.removeChild(this.bubbleEl);
  }
}
