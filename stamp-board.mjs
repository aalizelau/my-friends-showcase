import { t } from "./i18n.js";

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const axes = ["x", "y", "angle", "scale"];
const copy = position => ({ ...position });

export function boardMetrics(width, count, mode = "shuffle") {
  const itemWidth = clamp(Math.round(width * .14), 86, 132);
  const itemHeight = itemWidth + 44;
  const padding = width < 500 ? 20 : 30;
  const gap = width < 500 ? 20 : 30;
  const columns = Math.max(1, Math.floor((width - padding * 2 + gap) / (itemWidth + gap)));
  const rows = Math.ceil(count / columns);
  const minimumHeight = width < 500 ? 620 : 570;
  const organisedHeight = rows * itemHeight + Math.max(0, rows - 1) * gap + padding * 2;
  const height = mode === "organise"
    ? Math.max(minimumHeight, organisedHeight)
    : Math.max(minimumHeight, Math.min(720, organisedHeight * .7));
  return { width, height, itemWidth, itemHeight, padding, gap, columns };
}

// Clamp the rotated footprint, not just the unrotated image box.
export function constrainPosition(position, metrics) {
  const { width, height, itemWidth, itemHeight } = metrics;
  const angle = position.angle * Math.PI / 180;
  const footprintWidth = Math.abs(Math.cos(angle)) * itemWidth + Math.abs(Math.sin(angle)) * itemHeight;
  const footprintHeight = Math.abs(Math.sin(angle)) * itemWidth + Math.abs(Math.cos(angle)) * itemHeight;
  const insetX = (footprintWidth - itemWidth) / 2 + 10;
  const insetY = (footprintHeight - itemHeight) / 2 + 10;
  const x = width >= footprintWidth + 20 ? clamp(position.x, insetX, width - itemWidth - insetX) : (width - itemWidth) / 2;
  const y = height >= footprintHeight + 20 ? clamp(position.y, insetY, height - itemHeight - insetY) : (height - itemHeight) / 2;
  return { ...position, x, y };
}

export function organisedPositions(count, metrics, random = Math.random) {
  const { width, height, itemWidth, itemHeight, gap, columns } = metrics;
  const rows = Math.ceil(count / columns);
  const usedColumns = Math.min(count, columns);
  const startX = (width - usedColumns * itemWidth - Math.max(0, usedColumns - 1) * gap) / 2;
  const startY = (height - rows * itemHeight - Math.max(0, rows - 1) * gap) / 2;
  return Array.from({ length: count }, (_, index) => constrainPosition({
    x: startX + (index % columns) * (itemWidth + gap),
    y: startY + Math.floor(index / columns) * (itemHeight + gap),
    angle: random() * 10 - 5,
    scale: 1
  }, metrics));
}

export function shuffledPositions(count, metrics, random = Math.random) {
  return Array.from({ length: count }, () => constrainPosition({
    x: random() * Math.max(0, metrics.width - metrics.itemWidth),
    y: random() * Math.max(0, metrics.height - metrics.itemHeight),
    angle: random() * 70 - 35,
    scale: 1
  }, metrics));
}

export function focusGeometry(metrics, visibleTop = 0, visibleBottom = metrics.height, bubbleHeight = 0) {
  const bubbleSpace = bubbleHeight ? bubbleHeight + 20 : 0;
  const scale = Math.min(1.5, (metrics.width - 40) / metrics.itemWidth,
    Math.max(.5, (metrics.height - bubbleSpace - 108) / metrics.itemHeight));
  const centerX = metrics.width / 2;
  const centerY = clamp((visibleTop + visibleBottom - 96 + bubbleSpace) / 2,
    metrics.itemHeight * scale / 2 + 12 + bubbleSpace, metrics.height - metrics.itemHeight * scale / 2 - 96);
  return {
    position: { x: centerX - metrics.itemWidth / 2, y: centerY - metrics.itemHeight / 2, angle: 0, scale },
    bubbleTop: centerY - metrics.itemHeight * scale / 2 - bubbleSpace,
    controlsTop: centerY + metrics.itemHeight * scale / 2 + 16
  };
}

export class StampBoard {
  constructor({ board, grid, controls, bubble, getFocusBubble, organise, shuffle, status, onOpenProfile }) {
    Object.assign(this, { board, grid, controls, bubble, getFocusBubble, organise, shuffle, status, onOpenProfile });
    this.entries = new Map();
    this.mode = "shuffle";
    this.focusedId = null;
    this.layer = 1;
    this.frame = null;
    this.drag = null;
    this.motionPreference = window.matchMedia("(prefers-reduced-motion: reduce)");
    this.grid.classList.add("board-ready");
    grid.addEventListener("pointerdown", event => this.pointerDown(event));
    grid.addEventListener("pointermove", event => this.pointerMove(event));
    grid.addEventListener("pointerup", event => this.pointerUp(event));
    grid.addEventListener("pointercancel", event => this.pointerUp(event, true));
    grid.addEventListener("lostpointercapture", event => this.pointerUp(event, true));
    grid.addEventListener("click", event => {
      if (performance.now() < (this.suppressClickUntil || 0)) return;
      const card = event.target.closest("[data-friend-id]");
      if (card) this.focusedId === card.dataset.friendId ? this.closeFocus() : this.focus(card.dataset.friendId);
    });
    grid.addEventListener("keydown", event => this.keyDown(event));
    board.addEventListener("click", event => {
      if (!event.target.closest("[data-friend-id], .stamp-focus-controls, .focus-bubble")) this.closeFocus();
    });
    organise.addEventListener("click", () => this.layout("organise"));
    shuffle.addEventListener("click", () => this.layout("shuffle"));
    controls.querySelector("#openFocusedFriend").addEventListener("click", () => {
      const id = this.focusedId;
      this.closeFocus(false);
      if (id) this.onOpenProfile(id);
    });
    document.addEventListener("keydown", event => {
      if (event.key === "Escape" && this.focusedId) {
        event.preventDefault();
        this.closeFocus();
      }
    });
    this.motionPreference.addEventListener("change", () => this.start());
    this.resizeObserver = new ResizeObserver(() => {
      const width = this.board.clientWidth;
      if (width > 0 && this.metrics && Math.abs(width - this.metrics.width) > 1) this.resize();
    });
    this.resizeObserver.observe(board);
    // A downloaded handwriting font can change line wrapping after focus opens.
    if (bubble) {
      this.bubbleResizeObserver = new ResizeObserver(() => {
        if (!this.focusedId || bubble.hidden) return;
        this.positionFocus();
        this.start();
      });
      this.bubbleResizeObserver.observe(bubble);
    }
  }

  sync() {
    this.closeFocus(false);
    this.drag = null;
    const previous = this.entries;
    this.entries = new Map();
    for (const element of this.grid.querySelectorAll("[data-friend-id]")) {
      const id = element.dataset.friendId;
      const old = previous.get(id);
      this.entries.set(id, old ? { ...old, element } : { element, velocity: { x: 0, y: 0, angle: 0, scale: 0 } });
    }
    const sameItems = this.entries.size === previous.size && [...this.entries.keys()].every(id => previous.has(id));
    this.board.hidden = this.entries.size === 0;
    this.organise.disabled = this.shuffle.disabled = this.entries.size === 0;
    if (!this.entries.size) return;
    this.measure();
    if (!sameItems) this.layout(this.mode, false);
    else {
      for (const entry of this.entries.values()) this.paint(entry);
      this.start();
    }
  }

  measure() {
    this.metrics = boardMetrics(this.board.clientWidth, this.entries.size, this.mode);
    this.board.style.height = `${this.metrics.height}px`;
    this.board.style.setProperty("--stamp-size", `${this.metrics.itemWidth}px`);
    this.board.style.setProperty("--stamp-height", `${this.metrics.itemHeight}px`);
  }

  layout(mode, animate = true) {
    if (!this.entries.size) return;
    this.closeFocus(false);
    this.drag = null;
    this.mode = mode;
    this.measure();
    const positions = mode === "organise"
      ? organisedPositions(this.entries.size, this.metrics)
      : shuffledPositions(this.entries.size, this.metrics);
    const now = performance.now();
    [...this.entries.values()].forEach((entry, index) => {
      entry.home = positions[index];
      entry.goal = copy(entry.home);
      entry.element.classList.remove("is-dragging");
      entry.element.style.zIndex = String(++this.layer);
      entry.startAt = now + (animate && mode === "shuffle" && !this.motionPreference.matches ? index * 14 : 0);
      if (!entry.current || (animate && mode === "shuffle")) {
        entry.current = animate && !this.motionPreference.matches
          ? { x: (this.metrics.width - this.metrics.itemWidth) / 2, y: (this.metrics.height - this.metrics.itemHeight) / 2, angle: 0, scale: .9 }
          : copy(entry.goal);
        entry.velocity = { x: 0, y: 0, angle: 0, scale: 0 };
      }
      if (!animate) entry.current = copy(entry.goal);
      this.paint(entry);
    });
    this.organise.classList.toggle("active", mode === "organise");
    this.status.textContent = mode === "organise" ? t("statusOrganised") : t("statusShuffled");
    this.start();
  }

  resize() {
    const oldMetrics = this.metrics;
    this.measure();
    const arranged = this.mode === "organise" ? organisedPositions(this.entries.size, this.metrics, () => .5) : null;
    [...this.entries.values()].forEach((entry, index) => {
      entry.home = constrainPosition(arranged ? { ...arranged[index], angle: entry.home.angle } : {
        ...entry.home,
        x: entry.home.x / Math.max(1, oldMetrics.width - oldMetrics.itemWidth) * (this.metrics.width - this.metrics.itemWidth),
        y: entry.home.y / Math.max(1, oldMetrics.height - oldMetrics.itemHeight) * (this.metrics.height - this.metrics.itemHeight)
      }, this.metrics);
      entry.goal = copy(entry.home);
    });
    if (this.focusedId) this.positionFocus();
    this.start();
  }

  focus(id) {
    if (this.focusedId || this.drag?.moved) return;
    const entry = this.entries.get(id);
    if (!entry) return;
    this.focusedId = id;
    entry.home = { ...entry.current, scale: 1 };
    entry.element.style.zIndex = "100000";
    entry.element.classList.add("is-focused");
    entry.element.setAttribute("aria-expanded", "true");
    this.board.classList.add("has-focus");
    this.organise.disabled = this.shuffle.disabled = true;
    for (const [otherId, other] of this.entries) {
      if (otherId !== id) {
        other.element.inert = true;
        other.element.setAttribute("aria-hidden", "true");
      }
    }
    this.controls.hidden = false;
    const line = this.getFocusBubble?.(id);
    if (this.bubble) {
      this.bubble.querySelector(".focus-bubble-text").textContent = line?.text || "";
      this.bubble.hidden = !line;
      if (line) entry.element.setAttribute("aria-describedby", "stampFocusBubble");
    }
    const rect = this.board.getBoundingClientRect();
    const availableHeight = Math.min(rect.bottom, window.innerHeight) - Math.max(rect.top, 80);
    const bubbleSpace = this.bubble && !this.bubble.hidden ? this.bubble.offsetHeight + 20 : 0;
    if (availableHeight < this.metrics.itemHeight * 1.5 + 130 + bubbleSpace) {
      // Bring the board into view before centering on short viewports.
      window.scrollTo({ top: window.scrollY + rect.top - 88, behavior: "instant" });
    }
    this.positionFocus();
    this.controls.querySelector("#openFocusedFriend").focus({ preventScroll: true });
    this.status.textContent = t("statusFocus", {
      name: entry.element.dataset.friendName,
      quote: line ? t("statusFocusQuote", { text: line.text }) : ""
    });
    this.start();
  }

  positionFocus() {
    const entry = this.entries.get(this.focusedId);
    if (!entry) return;
    const rect = this.board.getBoundingClientRect();
    const visibleTop = Math.max(0, 80 - rect.top);
    const visibleBottom = Math.min(this.metrics.height, window.innerHeight - rect.top - 12);
    const bubbleHeight = this.bubble && !this.bubble.hidden ? this.bubble.offsetHeight : 0;
    const geometry = focusGeometry(this.metrics, visibleTop, visibleBottom, bubbleHeight);
    entry.goal = geometry.position;
    entry.startAt = 0;
    this.controls.style.top = `${geometry.controlsTop}px`;
    if (this.bubble) this.bubble.style.top = `${geometry.bubbleTop}px`;
  }

  closeFocus(restoreFocus = true) {
    if (!this.focusedId) return;
    const entry = this.entries.get(this.focusedId);
    this.focusedId = null;
    this.board.classList.remove("has-focus");
    this.organise.disabled = this.shuffle.disabled = false;
    this.controls.hidden = true;
    if (this.bubble) {
      this.bubble.hidden = true;
      this.bubble.querySelector(".focus-bubble-text").textContent = "";
    }
    for (const other of this.entries.values()) {
      other.element.inert = false;
      other.element.removeAttribute("aria-hidden");
    }
    if (entry) {
      entry.goal = copy(entry.home);
      entry.element.classList.remove("is-focused");
      entry.element.setAttribute("aria-expanded", "false");
      entry.element.removeAttribute("aria-describedby");
      entry.element.style.zIndex = String(++this.layer);
      if (restoreFocus) entry.element.focus({ preventScroll: true });
    }
    this.status.textContent = t("statusReturned");
    this.start();
  }

  pointerDown(event) {
    if (event.button !== 0 || !event.isPrimary || this.focusedId) return;
    const card = event.target.closest("[data-friend-id]");
    const entry = card && this.entries.get(card.dataset.friendId);
    if (!entry) return;
    entry.goal = copy(entry.current);
    entry.velocity = { x: 0, y: 0, angle: 0, scale: 0 };
    entry.startAt = 0;
    entry.element.style.zIndex = String(++this.layer);
    this.drag = { entry, pointerId: event.pointerId, x: event.clientX, y: event.clientY,
      origin: copy(entry.current), lastX: event.clientX, lastY: event.clientY, time: performance.now(), vx: 0, vy: 0, moved: false };
    card.setPointerCapture(event.pointerId);
  }

  pointerMove(event) {
    const drag = this.drag;
    if (!drag || event.pointerId !== drag.pointerId) return;
    const dx = event.clientX - drag.x;
    const dy = event.clientY - drag.y;
    if (!drag.moved && Math.hypot(dx, dy) < 6) return;
    drag.moved = true;
    event.preventDefault();
    drag.entry.element.classList.add("is-dragging");
    const now = performance.now();
    const elapsed = Math.max(16, now - drag.time);
    drag.vx = (event.clientX - drag.lastX) / elapsed;
    drag.vy = (event.clientY - drag.lastY) / elapsed;
    Object.assign(drag, { lastX: event.clientX, lastY: event.clientY, time: now });
    drag.entry.current = constrainPosition({ ...drag.origin, x: drag.origin.x + dx, y: drag.origin.y + dy }, this.metrics);
    drag.entry.goal = copy(drag.entry.current);
    drag.entry.velocity = { x: 0, y: 0, angle: 0, scale: 0 };
    this.paint(drag.entry);
  }

  pointerUp(event, cancelled = false) {
    const drag = this.drag;
    if (!drag || event.pointerId !== drag.pointerId) return;
    this.drag = null;
    drag.entry.element.classList.remove("is-dragging");
    if (drag.moved) {
      this.suppressClickUntil = performance.now() + 350;
      const momentum = !cancelled && performance.now() - drag.time < 80 && !this.motionPreference.matches ? 100 : 0;
      drag.entry.home = constrainPosition({ ...drag.entry.current,
        x: drag.entry.current.x + drag.vx * momentum,
        y: drag.entry.current.y + drag.vy * momentum,
        angle: clamp(drag.entry.current.angle + drag.vx * momentum * .04, -35, 35)
      }, this.metrics);
      drag.entry.goal = copy(drag.entry.home);
      this.organise.classList.remove("active");
      this.status.textContent = t("statusMoved", { name: drag.entry.element.dataset.friendName });
      this.start();
    }
    if (drag.entry.element.hasPointerCapture(event.pointerId)) drag.entry.element.releasePointerCapture(event.pointerId);
  }

  keyDown(event) {
    const card = event.target.closest("[data-friend-id]");
    if (!card) return;
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      this.focusedId ? this.closeFocus() : this.focus(card.dataset.friendId);
      return;
    }
    const directions = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
    if (!directions[event.key] || this.focusedId) return;
    event.preventDefault();
    const entry = this.entries.get(card.dataset.friendId);
    const [dx, dy] = directions[event.key];
    const distance = event.shiftKey ? 30 : 10;
    entry.home = constrainPosition({ ...entry.home, x: entry.home.x + dx * distance, y: entry.home.y + dy * distance }, this.metrics);
    entry.goal = copy(entry.home);
    entry.startAt = 0;
    entry.element.style.zIndex = String(++this.layer);
    this.organise.classList.remove("active");
    this.start();
  }

  paint(entry) {
    const { x, y, angle, scale } = entry.current;
    entry.element.style.transform = `translate3d(${x}px, ${y}px, 0) rotate(${angle}deg) scale(${scale})`;
  }

  start() {
    if (this.frame !== null) return;
    this.lastFrame = performance.now();
    this.frame = requestAnimationFrame(time => this.tick(time));
  }

  tick(time) {
    this.frame = null;
    const dt = Math.min(.032, Math.max(.001, (time - this.lastFrame) / 1000));
    this.lastFrame = time;
    let moving = false;
    for (const entry of this.entries.values()) {
      if (!entry.goal || this.drag?.entry === entry) continue;
      if (this.motionPreference.matches) {
        entry.current = copy(entry.goal);
        entry.velocity = { x: 0, y: 0, angle: 0, scale: 0 };
      } else if (time < entry.startAt) {
        moving = true;
        continue;
      } else {
        // Small integration steps keep the same 500 / 80 spring stable after a slow frame.
        const steps = Math.ceil(dt * 120);
        const step = dt / steps;
        for (const axis of axes) {
          for (let i = 0; i < steps; i++) {
            entry.velocity[axis] += (500 * (entry.goal[axis] - entry.current[axis]) - 80 * entry.velocity[axis]) * step;
            entry.current[axis] += entry.velocity[axis] * step;
          }
          const threshold = axis === "scale" ? .001 : .03;
          if (Math.abs(entry.goal[axis] - entry.current[axis]) > threshold || Math.abs(entry.velocity[axis]) > threshold) moving = true;
          else { entry.current[axis] = entry.goal[axis]; entry.velocity[axis] = 0; }
        }
      }
      this.paint(entry);
    }
    if (moving) this.frame = requestAnimationFrame(next => this.tick(next));
  }
}
