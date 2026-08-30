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
(function () {
  "use strict";

  const TAU = Math.PI * 2;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  // wrap an angle to (-PI, PI]
  const shortAngle = a => { a = ((a + Math.PI) % TAU + TAU) % TAU - Math.PI; return a; };
  const easeInOutCubic = t => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

  class RingCarousel {
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
      this.metaEl.innerHTML = `<span class="carousel-meta__idx"></span>`
        + `<h2 class="carousel-meta__name"></h2><span class="carousel-meta__rel"></span>`;
      this.mount.appendChild(this.metaEl);

      const N = this.items.length;
      this.step = TAU / N;
      this.cards = this.items.map((item, i) => {
        const el = document.createElement("figure");
        el.className = "carousel-card";
        el.dataset.slot = String(i);
        el.innerHTML = `<img src="${item.src}" alt="" draggable="false" />`;
        this.stage.appendChild(el);
        return { el, item, i };
      });

      this.onResize();
      this.addEventListeners();

      // Entry: a short spin that damps down and snaps — the ring "launches".
      this.velocity = -5.2;
      this.lastT = performance.now();
      this.raf = requestAnimationFrame(this._frame);
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
        this.cardW = clamp(W * 0.185, 190, 300);
        this.cardH = this.cardW * 1.18;
        this.R = Math.max((W * 0.30) / Math.sin(this.step), 720);
        this.frontX = W * 0.5;
        this.frontY = H * 0.46;
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
      }
    }

    updateFront() {
      const slot = ((Math.round(-this.rotation / this.step) % this.cards.length) + this.cards.length) % this.cards.length;
      if (slot === this.frontSlot) return;
      this.frontSlot = slot;
      const item = this.items[slot];
      this.metaEl.querySelector(".carousel-meta__idx").textContent = String(slot + 1).padStart(2, "0");
      this.metaEl.querySelector(".carousel-meta__name").textContent = item.name || "";
      this.metaEl.querySelector(".carousel-meta__rel").textContent = item.rel || "";
      this.metaEl.classList.add("show");
      // restart the swap fade without depending on a second rAF
      this.metaEl.classList.remove("swap");
      void this.metaEl.offsetWidth; // reflow
      this.metaEl.classList.add("swap");
    }

    frame(now) {
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
      this.raf = requestAnimationFrame(this._frame);
    }

    /* -------- input -------- */
    // the pointer axis that turns the ring: x for horizontal, y for vertical
    pointerCoord(e) {
      return this.orientation === "horizontal" ? e.clientX : e.clientY;
    }

    onWheel(e) {
      this.tween = null;
      // horizontal wheels/trackpads report deltaX; fall back to deltaY for mice
      const delta = this.orientation === "horizontal" ? (e.deltaX || e.deltaY) : e.deltaY;
      this.velocity = clamp(this.velocity + delta * this.scrollSpeed, -this.maxSpeed, this.maxSpeed);
    }

    onPointerDown(e) {
      this.dragging = true;
      this.moved = 0;
      this.tween = null;
      this.velocity = 0;
      this.lastPos = this.pointerCoord(e);
      this.lastMoveT = performance.now();
      this.pointerVel = 0;
      this.downCard = e.target.closest && e.target.closest(".carousel-card");
      if (e.pointerId != null && this.stage.setPointerCapture) {
        try { this.stage.setPointerCapture(e.pointerId); } catch (_) {}
      }
    }

    onPointerMove(e) {
      if (!this.dragging) return;
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
    }

    onPointerUp() {
      if (!this.dragging) return;
      this.dragging = false;
      if (this.moved < 8 && this.downCard) {
        this.handleCardClick(this.downCard);
      } else {
        this.velocity = clamp(this.pointerVel || 0, -this.maxSpeed, this.maxSpeed);
      }
      this.downCard = null;
    }

    handleCardClick(cardEl) {
      const slot = Number(cardEl.dataset.slot);
      if (slot === this.frontSlot) {
        this.onOpen(this.items[slot].id);
        return;
      }
      // turn the ring the short way until this card faces front
      const theta = this.rotation + slot * this.step;
      const to = this.rotation - shortAngle(theta);
      this.velocity = 0;
      this.tween = { from: this.rotation, to, elapsed: 0, dur: this.pickDur };
    }

    addEventListeners() {
      window.addEventListener("resize", this._onResize);
      this.mount.addEventListener("wheel", this._onWheel, { passive: true });
      this.stage.addEventListener("pointerdown", this._onDown);
      window.addEventListener("pointermove", this._onMove);
      window.addEventListener("pointerup", this._onUp);
      window.addEventListener("pointercancel", this._onUp);
    }

    destroy() {
      if (this.raf) cancelAnimationFrame(this.raf);
      window.removeEventListener("resize", this._onResize);
      this.mount.removeEventListener("wheel", this._onWheel);
      this.stage.removeEventListener("pointerdown", this._onDown);
      window.removeEventListener("pointermove", this._onMove);
      window.removeEventListener("pointerup", this._onUp);
      window.removeEventListener("pointercancel", this._onUp);
      if (this.stage.parentNode) this.stage.parentNode.removeChild(this.stage);
      if (this.metaEl.parentNode) this.metaEl.parentNode.removeChild(this.metaEl);
    }
  }

  window.RingCarousel = RingCarousel;
})();
