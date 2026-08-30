/* Source-informed adaptation of ImageTube in https://github.com/matdn/helmet.
 * Cylinder positions, staggered rows and inertia come from FiberScene.tsx.
 * Rows retain differential speeds; desktop uses compact projection-aware
 * spacing. See docs/tube-reference for the preserved baseline.
 */

// Fit the front-facing rows over the whole turn, not only their starting pose.
// Rear cards may still be naturally occluded by cards on the front of the tube.
function desktopRowSpacing({ radius, perspective, cardWidth, cardHeight, scale, gap }) {
  const start = Math.asin(radius / perspective);
  const samples = [];
  const sampleCount = 540;
  // Only cards that share horizontal screen space need vertical clearance.
  // Sample independent row angles, so the fit does not rely on matching speeds.
  for (let i = 0; i <= sampleCount; i++) {
    const theta = start + (Math.PI - 2 * start) * i / sampleCount;
    const row = [];
    for (const cant of [.035, -.035]) {
      const points = [];
      for (const u of [-cardWidth / 2, cardWidth / 2]) for (const v of [-cardHeight / 2, cardHeight / 2]) {
        const localX = (u * Math.cos(cant) - v * Math.sin(cant)) * scale;
        const localY = (u * Math.sin(cant) + v * Math.cos(cant)) * scale;
        const q = perspective / (perspective - radius * Math.sin(theta) + localX * Math.cos(theta));
        points.push({ x: (radius * Math.cos(theta) + localX * Math.sin(theta)) * q, y: localY * q, q });
      }
      row.push({ points, left: Math.min(...points.map(p => p.x)), right: Math.max(...points.map(p => p.x)),
        top: Math.min(...points.map(p => p.y)), bottom: Math.max(...points.map(p => p.y)) });
    }
    samples.push(row);
  }
  let spacing = 0;
  for (const [outer] of samples) for (const [, middle] of samples) {
    // Padding covers the horizontal motion between angular samples.
    if (outer.right + 4 < middle.left || middle.right + 4 < outer.left) continue;
    for (const point of outer.points) {
      spacing = Math.max(spacing, (middle.bottom + gap + .5 - point.y) / point.q,
        (point.y - middle.top + gap + .5) / point.q);
    }
  }
  return spacing;
}

function desktopTubeLayout({ width, height, radius, perspective, rows, cardWidth, cardHeight }) {
  const gap = 6;
  const inset = 20;
  const cant = .035;
  const footprintWidth = cardWidth * Math.cos(cant) + cardHeight * Math.sin(cant);
  const footprintHeight = cardHeight * Math.cos(cant) + cardWidth * Math.sin(cant);
  const measure = (scale, compact = false) => {
    const halfWidth = footprintWidth * scale / 2;
    const halfHeight = footprintHeight * scale / 2;
    // Bounds include the corners of the tilted card, not just its centre.
    const nearestZ = Math.hypot(radius, halfWidth);
    const maxProjection = perspective / (perspective - nearestZ);
    const minFrontProjection = perspective / (perspective - radius * radius / perspective + halfWidth);
    const spacing = rows === 3
      ? compact ? desktopRowSpacing({ radius, perspective, cardWidth, cardHeight, scale, gap })
        : halfHeight + (halfHeight * maxProjection + gap) / minFrontProjection
      : rows === 2 ? halfHeight * 2 + gap / minFrontProjection : 0;
    const projectedHalfHeight = ((rows - 1) / 2 * spacing + halfHeight) * maxProjection;
    return { scale, spacing, projectedHalfHeight };
  };
  let low = 0;
  let high = Math.min(1, width / 1100, height / 570);
  for (let i = 0; i < 24; i++) {
    const candidate = measure((low + high) / 2);
    if (candidate.projectedHalfHeight <= height / 2 - inset) low = candidate.scale;
    else high = candidate.scale;
  }
  if (rows !== 3) return measure(low);
  // Enlarge the actual cards by up to 12%, using the unused space between
  // horizontally staggered cards rather than increasing the Tube's height.
  high = low * 1.12;
  let result = measure(high, true);
  if (result.projectedHalfHeight <= height / 2 - inset) return result;
  result = measure(low);
  for (let i = 0; i < 8; i++) {
    const candidate = measure((low + high) / 2, true);
    if (candidate.projectedHalfHeight <= height / 2 - inset) {
      result = candidate;
      low = candidate.scale;
    } else high = candidate.scale;
  }
  return result;
}

export class FriendTube {
  constructor({ stage, world, gallery, cardMarkup, onOpen }) {
    this.stage = stage;
    this.world = world;
    this.gallery = gallery;
    this.cardMarkup = cardMarkup;
    this.onOpen = onOpen;
    this.cards = [];
    this.angle = 0;
    this.targetAngle = null;
    this.velocity = 0;
    this.direction = 1;
    this.enabled = false;
    this.inViewport = true;
    this.suspended = false;
    this.hovered = false;
    this.focused = false;
    this.drag = null;
    this.suppressClickUntil = 0;
    this.frame = null;
    this.lastTime = null;
    this.motion = matchMedia('(prefers-reduced-motion: reduce)');
    this.paused = this.motion.matches;
    this.pauseButton = document.querySelector('#tubePause');
    this.tick = this.tick.bind(this);

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(stage);
    this.intersectionObserver = new IntersectionObserver(([entry]) => {
      this.inViewport = entry.isIntersecting;
      this.syncAnimation();
    });
    this.intersectionObserver.observe(stage);
    document.addEventListener('visibilitychange', () => this.syncAnimation());
    this.motion.addEventListener('change', () => {
      this.paused = this.motion.matches;
      this.velocity = 0;
      this.updatePauseButton();
      this.syncAnimation();
    });

    this.pauseButton.addEventListener('click', () => {
      this.paused = !this.paused;
      this.velocity = 0;
      this.updatePauseButton();
      this.syncAnimation();
    });
    document.querySelector('#tubePrevious').addEventListener('click', () => this.turn(-1));
    document.querySelector('#tubeNext').addEventListener('click', () => this.turn(1));
    stage.addEventListener('keydown', event => {
      const card = event.target.closest('[data-friend-id]');
      if (card && (event.key === 'Enter' || event.key === ' ')) {
        event.preventDefault();
        this.onOpen(card.dataset.friendId);
        return;
      }
      if (!['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
      event.preventDefault();
      this.turn(event.key === 'ArrowLeft' ? -1 : 1);
    });
    stage.addEventListener('click', event => {
      if (event.detail && performance.now() < this.suppressClickUntil) {
        event.preventDefault();
        return;
      }
      const card = event.target.closest('[data-friend-id]');
      if (card) this.onOpen(card.dataset.friendId);
    });
    stage.addEventListener('pointerover', event => {
      if (event.pointerType === 'mouse') this.hovered = !!event.target.closest('[data-friend-id]');
    });
    stage.addEventListener('pointerout', event => {
      if (event.pointerType === 'mouse') this.hovered = !!event.relatedTarget?.closest?.('[data-friend-id]');
    });
    stage.addEventListener('pointerleave', () => { this.hovered = false; });
    stage.addEventListener('focusin', event => {
      this.focused = true;
      const card = this.cards.find(card => card.el === event.target);
      // Keyboard focus brings a portrait to the front, even if it was behind
      // the cylinder. Pointer focus leaves the clicked portrait in place.
      if (card && event.target.matches(':focus-visible')) {
        const theta = card.theta + this.angle * card.speed;
        const delta = Math.atan2(Math.sin(Math.PI / 2 - theta), Math.cos(Math.PI / 2 - theta));
        this.angle += delta / card.speed;
        this.targetAngle = null;
        this.velocity = 0;
        this.draw();
      }
      this.syncAnimation();
    });
    stage.addEventListener('focusout', event => {
      this.focused = stage.contains(event.relatedTarget);
      this.syncAnimation();
    });
    stage.addEventListener('pointerdown', event => this.pointerDown(event));
    stage.addEventListener('pointermove', event => this.pointerMove(event));
    stage.addEventListener('pointerup', event => this.pointerEnd(event));
    stage.addEventListener('pointercancel', event => this.pointerEnd(event, true));
    stage.addEventListener('lostpointercapture', event => this.pointerEnd(event, true));
    // Embedded browsers may emit mouse events without pointer events. Avoid
    // handling both streams when a native pointer gesture is already active.
    const mouseInput = event => ({
      button: event.button, isPrimary: true, pointerType: 'mouse', pointerId: 'mouse',
      clientX: event.clientX, clientY: event.clientY
    });
    stage.addEventListener('mousedown', event => {
      if (!this.drag) this.pointerDown(mouseInput(event));
    });
    window.addEventListener('mousemove', event => {
      if (this.drag?.id === 'mouse') this.pointerMove(mouseInput(event));
    });
    window.addEventListener('mouseup', event => {
      if (this.drag?.id === 'mouse') this.pointerEnd(mouseInput(event));
    });
    window.addEventListener('blur', () => {
      if (this.drag) this.pointerEnd({ pointerId: this.drag.id }, true);
    });
    stage.addEventListener('dragstart', event => event.preventDefault());
    stage.addEventListener('wheel', event => {
      // Never trap page scrolling or interfere with pinch-to-zoom.
      if (event.ctrlKey || this.paused || this.suspended || this.motion.matches) return;
      const units = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? stage.clientHeight : 1;
      const delta = (event.deltaX || event.deltaY) * units;
      this.velocity = Math.max(-1.2, Math.min(1.2, this.velocity + delta * .002));
      this.direction = Math.sign(delta) || this.direction;
      this.syncAnimation();
    }, { passive: true });
    this.updatePauseButton();
  }

  setFriends(friends) {
    // Each person appears exactly once. No repeated filler portraits.
    this.world.innerHTML = friends.map(this.cardMarkup).join('');
    this.rows = friends.length >= 12 ? 3 : friends.length >= 5 ? 2 : 1;
    this.columns = Math.ceil(friends.length / this.rows) || 1;
    this.cards = [...this.world.children].map((el, index) => {
      const row = Math.floor(index / this.columns);
      const count = Math.min(this.columns, friends.length - row * this.columns);
      return {
        el,
        row,
        // SOURCE: alternating half-column offsets and cylindrical placement.
        theta: friends.length === 1 ? Math.PI / 2 : (index % this.columns + (row % 2 ? .5 : 0)) / count * Math.PI * 2 + .2,
        speed: 1,
      };
    });
    this.gallery.classList.toggle('is-small', friends.length < 5);
    for (const id of ['tubePrevious', 'tubeNext', 'tubePause']) {
      document.querySelector(`#${id}`).disabled = friends.length < 2;
    }
    this.hovered = false;
    this.focused = false;
    this.velocity = 0;
    this.angle = 0;
    this.targetAngle = null;
    this.resize();
    this.syncAnimation();
  }

  setEnabled(enabled) {
    this.enabled = enabled;
    this.gallery.hidden = !enabled;
    if (enabled) this.resize();
    this.syncAnimation();
  }

  setSuspended(suspended) {
    this.suspended = suspended;
    if (suspended) this.velocity = 0;
    this.syncAnimation();
  }

  updatePauseButton() {
    this.pauseButton.setAttribute('aria-pressed', String(this.paused));
    this.pauseButton.setAttribute('aria-label', this.paused ? '開始自動旋轉' : '暫停自動旋轉');
    document.querySelector('#tubePauseIcon').textContent = this.paused ? '▷' : 'Ⅱ';
    document.querySelector('#tubePauseLabel').textContent = this.paused ? '播放' : '暫停';
  }

  resize() {
    const width = this.stage.clientWidth;
    if (!width) return;
    this.mobile = width < 760;
    this.radius = this.mobile ? Math.max(150, width * .43) : Math.min(460, width * .365);
    this.perspective = this.radius * (this.mobile ? 2.8 : 2.5);
    this.stage.style.perspective = `${this.perspective}px`;
    this.scale = this.mobile ? .7 : Math.min(1, width / 1100, this.stage.clientHeight / 570);
    this.spacing = this.stage.clientHeight * .16;
    if (!this.mobile) {
      const portrait = this.cards[0]?.el;
      const layout = desktopTubeLayout({
        width, height: this.stage.clientHeight, radius: this.radius, perspective: this.perspective,
        rows: this.rows || 1, cardWidth: portrait?.offsetWidth || 128, cardHeight: portrait?.offsetHeight || 158
      });
      this.scale = layout.scale;
      this.spacing = layout.spacing;
    }
    for (const card of this.cards) {
      card.speed = this.rows > 1 ? .65 + card.row / (this.rows - 1) * .9 : 1;
    }
    this.draw();
  }

  draw() {
    if (!this.radius) return;
    for (const card of this.cards) {
      const theta = card.theta + this.angle * card.speed;
      const x = Math.cos(theta) * this.radius;
      const z = Math.sin(theta) * this.radius;
      const y = (card.row - (this.rows - 1) / 2) * this.spacing;
      // Keep both sides readable; source uses DoubleSide with mirrored backs.
      let yaw = Math.PI / 2 - theta;
      if (Math.sin(theta) < this.radius / this.perspective) yaw += Math.PI;
      // A slight cant retains the feeling of small paper portraits.
      const cant = (card.row % 2 ? -1 : 1) * .035;
      card.el.style.transform = `translate3d(${x.toFixed(2)}px,${y.toFixed(2)}px,${z.toFixed(2)}px) translate(-50%,-50%) rotateY(${yaw}rad) rotateZ(${cant}rad) scale(${this.scale})`;
      card.el.style.opacity = String(.70 + ((Math.sin(theta) + 1) / 2) * .30);
    }
  }

  canAnimate() {
    return this.enabled && this.inViewport && !document.hidden && !this.suspended && this.cards.length > 1;
  }

  needsFrame() {
    return this.canAnimate() && (this.targetAngle !== null || (!this.paused && !this.focused && !this.drag));
  }

  syncAnimation() {
    if (!this.needsFrame()) {
      if (this.frame !== null) cancelAnimationFrame(this.frame);
      this.frame = null;
      this.lastTime = null;
    } else if (this.frame === null) {
      this.lastTime = null;
      this.frame = requestAnimationFrame(this.tick);
    }
  }

  tick(now) {
    this.frame = null;
    if (!this.needsFrame()) { this.lastTime = null; return; }
    const dt = this.lastTime === null ? 1 / 60 : Math.min((now - this.lastTime) / 1000, .05);
    this.lastTime = now;
    if (this.targetAngle !== null) {
      const delta = this.targetAngle - this.angle;
      this.angle += delta * (1 - Math.exp(-12 * dt));
      if (Math.abs(delta) < .001) {
        this.angle = this.targetAngle;
        this.targetAngle = null;
      }
    } else {
      // SOURCE: time-based spin damping; lower base speed is a design choice.
      this.velocity *= Math.pow(.92, dt * 60);
      this.angle += (this.direction * .065 + this.velocity) * dt * (this.hovered ? .18 : 1);
    }
    this.draw();
    if (this.needsFrame()) this.frame = requestAnimationFrame(this.tick);
    else this.lastTime = null;
  }

  turn(direction) {
    if (this.cards.length < 2) return;
    const step = Math.PI * 2 / this.columns;
    this.velocity = 0;
    if (this.motion.matches) {
      this.angle += direction * step;
      this.targetAngle = null;
      this.draw();
    } else {
      this.targetAngle = (this.targetAngle ?? this.angle) + direction * step;
      this.syncAnimation();
    }
  }

  pointerDown(event) {
    if (event.button !== 0 || !event.isPrimary || this.suspended) return;
    this.drag = { id: event.pointerId, x: event.clientX, y: event.clientY, lastX: event.clientX, lastTime: performance.now(), moved: false };
    this.velocity = 0;
    this.targetAngle = null;
    this.syncAnimation();
  }

  pointerMove(event) {
    const drag = this.drag;
    if (!drag || event.pointerId !== drag.id) return;
    const dx = event.clientX - drag.x;
    const dy = event.clientY - drag.y;
    if (!drag.moved) {
      if (Math.abs(dx) < 6) return;
      if (event.pointerType === 'touch' && Math.abs(dy) > Math.abs(dx)) {
        this.drag = null;
        this.syncAnimation();
        return;
      }
      drag.moved = true;
      if (event.pointerId !== 'mouse') this.stage.setPointerCapture(event.pointerId);
      this.stage.classList.add('is-dragging');
    }
    const now = performance.now();
    const delta = -(event.clientX - drag.lastX) / this.radius;
    this.angle += delta;
    this.velocity = Math.max(-1.2, Math.min(1.2, delta / Math.max((now - drag.lastTime) / 1000, .016)));
    drag.lastTime = now;
    drag.lastX = event.clientX;
    this.draw();
  }

  pointerEnd(event, cancelled = false) {
    const drag = this.drag;
    if (!drag || event.pointerId !== drag.id) return;
    if (drag.moved) this.suppressClickUntil = performance.now() + 350;
    if (cancelled || this.paused || this.motion.matches) this.velocity = 0;
    this.direction = Math.sign(this.velocity) || this.direction;
    this.drag = null;
    this.stage.classList.remove('is-dragging');
    if (event.pointerId !== 'mouse' && this.stage.hasPointerCapture(event.pointerId)) this.stage.releasePointerCapture(event.pointerId);
    this.syncAnimation();
  }
}
