// 朋友資料改由後端讀取層提供（data/friends/*.md）；見 server.mjs 與 docs/profile-schema.md
import { StampBoard } from "./stamp-board.mjs";
import { FriendTube } from "./tube.js";
import { RingCarousel } from "./carousel.js";
import { focusLineFor, selectBoardFriends } from "./focus-lines.mjs";

const palettes = [
  { skin: "#f29a82", hair: "#292e2b", shirt: "#e75837", bg: "#efe0ca" },
  { skin: "#d78a65", hair: "#1f2723", shirt: "#15594c", bg: "#dce5dc" },
  { skin: "#f2b189", hair: "#e76c43", shirt: "#2765dd", bg: "#f2dfb9" },
  { skin: "#c77855", hair: "#252826", shirt: "#e9a621", bg: "#d7e1df" },
  { skin: "#e9a177", hair: "#31322e", shirt: "#e8dfd2", bg: "#e5d6c4" },
  { skin: "#8b553d", hair: "#161d1a", shirt: "#ec6845", bg: "#dfe4d8" },
  { skin: "#f2b494", hair: "#665c50", shirt: "#115346", bg: "#ecd9cd" },
  { skin: "#c6805c", hair: "#171d1a", shirt: "#2f62db", bg: "#e5dfc8" }
];

let state = { friends: [], visibleIds: null, faceOf: {} };

// 優先展示有手帳資料的朋友；剩餘位置隨機抽人，保留手繪臉孔切片。
// 每組臉孔包 9 張；依序把每一組分配給不同的人，一組用完換下一組。
const FACE_PACKS = [
  Array.from({ length: 9 }, (_, i) => `assets/faces/face-${i + 1}.png`),
  Array.from({ length: 9 }, (_, i) => `assets/faces-2/face-${i + 1}.png`)
];

function assignFaces() {
  const shuffled = selectBoardFriends(state.friends, FACE_PACKS.flat().length);
  state.visibleIds = new Set();
  state.faceOf = {};
  let cursor = 0;
  for (const pack of FACE_PACKS) {
    for (const src of pack) {
      const friend = shuffled[cursor++];
      if (!friend) break; // 人數不夠時就停
      state.visibleIds.add(friend.id);
      state.faceOf[friend.id] = src;
    }
  }
}

function visibleFriends() {
  return state.visibleIds ? state.friends.filter(f => state.visibleIds.has(f.id)) : state.friends;
}

// 有分配到臉孔切片就用圖片頭像，否則退回手繪 SVG
function avatarMarkup(friend) {
  const src = state.faceOf[friend.id];
  if (src) return `<img class="avatar-img" src="${escapeHtml(src)}" alt="${escapeHtml(friend.name)} 的頭像" loading="lazy" />`;
  return avatarSvg(friend.avatar, friend.name);
}
let activeFriendId = null;
let activeDetailTab = "now";
let toastTimer;
let drawerCloseTimer;
let activeView = "tube";
let carousel = null;
const topicExpansion = new Map();

function topicExpansionStorageKey(friendId) {
  return `my-friends.topic-expansion.v1:${encodeURIComponent(friendId)}`;
}

function topicExpansionFor(friendId) {
  if (!topicExpansion.has(friendId)) {
    let entries = [];
    try {
      const saved = JSON.parse(localStorage.getItem(topicExpansionStorageKey(friendId)));
      if (Array.isArray(saved)) entries = saved.filter(entry => Array.isArray(entry) && entry.length === 2 && typeof entry[0] === "string" && typeof entry[1] === "boolean");
    } catch { /* Unavailable or invalid storage must not prevent opening a profile. */ }
    topicExpansion.set(friendId, new Map(entries));
  }
  return topicExpansion.get(friendId);
}

function rememberTopicExpansion() {
  if (activeFriendId === null || activeDetailTab !== "topics") return;
  const list = els.drawer.querySelector(".topic-list");
  if (!list || list.dataset.topicFriend !== String(activeFriendId)) return;
  const saved = topicExpansionFor(activeFriendId);
  let changed = false;
  list.querySelectorAll("details[data-topic-key]").forEach(topic => {
    const key = topic.dataset.topicKey;
    if (saved.get(key) !== topic.open) {
      saved.set(key, topic.open);
      changed = true;
    }
  });
  if (!changed) return;
  try {
    localStorage.setItem(topicExpansionStorageKey(activeFriendId), JSON.stringify([...saved]));
  } catch { /* Keep the preference in memory when browser storage is blocked or full. */ }
}

const els = {
  grid: document.querySelector("#friendsGrid"),
  empty: document.querySelector("#emptyState"),
  drawer: document.querySelector("#friendDrawer"),
  drawerContent: document.querySelector("#drawerContent"),
  drawerBackdrop: document.querySelector("#drawerBackdrop"),
  friendDialog: document.querySelector("#friendDialog"),
  friendForm: document.querySelector("#friendForm"),
  sourceDialog: document.querySelector("#sourceDialog"),
  sourceForm: document.querySelector("#sourceForm"),
  toast: document.querySelector("#toast")
};

const stampBoard = new StampBoard({
  board: document.querySelector("#stampBoard"),
  grid: els.grid,
  controls: document.querySelector("#stampFocusControls"),
  bubble: document.querySelector("#stampFocusBubble"),
  getFocusBubble: id => focusLineFor(state.friends.find(friend => friend.id === id)),
  organise: document.querySelector("#organiseStamps"),
  shuffle: document.querySelector("#shuffleStamps"),
  status: document.querySelector("#boardStatus"),
  onOpenProfile: openDrawer
});

const tube = new FriendTube({
  stage: document.querySelector("#tubeStage"),
  world: document.querySelector("#tubeWorld"),
  gallery: document.querySelector("#tubeGallery"),
  cardMarkup: tubeCard,
  onOpen: openDrawer
});

function escapeHtml(value = "") {
  return String(value).replace(/[&<>'"]/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#039;", '"': "&quot;" })[char]);
}

function avatarSvg(seed = 0, name = "") {
  const index = Math.abs(Number(seed)) % palettes.length;
  const p = palettes[index];
  const hairVariants = [
    '<path d="M35 65c-5-26 9-45 36-48 27-3 45 14 46 43-13-9-25-11-38-7-17 6-24 14-44 12Z"/>',
    '<path d="M32 63c-1-31 16-47 43-47 26 0 44 20 42 50-8-11-18-17-30-17-20 0-32 12-55 14Z"/><path d="M32 57c-7 18-7 33 4 46" fill="none" stroke-width="8"/>',
    '<path d="M32 65c-4-24 5-45 30-50 31-6 53 15 55 47-15-13-29-17-41-14-15 4-23 15-44 17Z"/><circle cx="103" cy="29" r="16"/>',
    '<path d="M31 63c2-27 15-45 44-46 30-1 45 20 43 52-12-12-27-17-41-14-17 3-28 12-46 8Z"/><path d="M37 49c8-9 15-13 22-11M53 29c9 0 16 3 22 9M77 25c8 4 13 9 16 16" fill="none" stroke-width="7" stroke-linecap="round"/>',
    '<path d="M32 62c-3-31 18-47 45-45 28 2 42 22 39 50-10-12-22-18-37-18-18 0-30 11-47 13Z"/><path d="M110 56c9 17 5 38-2 48" fill="none" stroke-width="9"/>',
    '<path d="M29 61c2-26 15-43 42-46 30-3 48 17 48 50-17-14-28-18-40-17-20 1-31 10-50 13Z"/><circle cx="37" cy="34" r="12"/><circle cx="56" cy="21" r="13"/><circle cx="81" cy="20" r="14"/><circle cx="105" cy="34" r="13"/>'
  ];
  const hair = hairVariants[index % hairVariants.length];
  const glasses = index === 1 || index === 4 ? '<g fill="none" stroke="#fffdf7" stroke-width="4"><rect x="44" y="63" width="25" height="18" rx="7"/><rect x="80" y="63" width="25" height="18" rx="7"/><path d="M69 70h11"/></g>' : "";
  return `<svg viewBox="0 0 150 150" role="img" aria-label="${escapeHtml(name)} 的手繪頭像">
    <path d="M12 78C8 35 33 7 76 6c42-1 68 26 64 72-3 40-24 65-64 65-39 0-61-24-64-65Z" fill="${p.bg}"/>
    <path d="M30 144c5-31 20-47 46-47 28 0 43 17 47 47" fill="${p.shirt}"/>
    <ellipse cx="75" cy="69" rx="42" ry="49" fill="${p.skin}"/>
    <g fill="${p.hair}" stroke="${p.hair}">${hair}</g>
    <path d="M58 68h.1M91 68h.1" stroke="#292e2b" stroke-width="6" stroke-linecap="round"/>
    <path d="M75 70c-2 7-3 12-2 15l6 1" fill="none" stroke="#be6048" stroke-width="2.5" stroke-linecap="round"/>
    <path d="M63 94c8 5 16 5 24 0" fill="none" stroke="#9f493d" stroke-width="2.5" stroke-linecap="round"/>
    ${glasses}
  </svg>`;
}

function latestInteraction(friend) {
  return [...(friend.interactions || [])].sort((a, b) => b.date.localeCompare(a.date))[0];
}

function boardFriends() {
  return visibleFriends()
    .sort((a, b) => (latestInteraction(b)?.date || "").localeCompare(latestInteraction(a)?.date || ""));
}

function render() {
  const friends = boardFriends();
  els.empty.hidden = friends.length !== 0;
  els.grid.hidden = friends.length === 0;
  els.grid.innerHTML = friends.map(friendCard).join("");
  tube.setFriends(friends);
  carousel?.destroy();
  carousel = null;
  updateView();
}

function updateView() {
  const hasFriends = visibleFriends().length > 0;
  document.querySelector("#stampBoard").hidden = activeView !== "stamps" || !hasFriends;
  document.querySelector("#stampActions").hidden = activeView !== "stamps";
  document.querySelector("#tubeControls").hidden = activeView !== "tube";
  document.querySelector("#ringControls").hidden = activeView !== "ring";
  document.querySelector("#carouselMode").hidden = activeView !== "ring" || !hasFriends;
  tube.setEnabled(activeView === "tube" && hasFriends);
  if (activeView === "ring" && hasFriends) {
    if (!carousel) carousel = new RingCarousel({
      mount: document.querySelector("#carouselMode"),
      orientation: "horizontal",
      items: boardFriends().map(friend => ({ id: friend.id, name: friend.name,
        bubble: focusLineFor(friend)?.text || "",
        markup: avatarMarkup(friend).replace('loading="lazy"', 'loading="eager" draggable="false"') })),
      onOpen: openDrawer
    });
    carousel.setSuspended(!!activeFriendId || document.body.classList.contains("dialog-open"));
  } else {
    carousel?.destroy();
    carousel = null;
  }
  for (const id of ["ringPrevious", "ringNext"]) document.querySelector(`#${id}`).disabled = visibleFriends().length < 2;
  // Measure only after the stamp board is visible, never at a hidden width of zero.
  if (activeView === "stamps") stampBoard.sync();
  for (const view of ["tube", "ring", "stamps"]) {
    const button = document.querySelector(`#${view}View`);
    button.classList.toggle("active", activeView === view);
    button.setAttribute("aria-pressed", String(activeView === view));
  }
}

function setView(view) {
  stampBoard.closeFocus(false);
  activeView = view;
  updateView();
}

function tubeCard(friend, index) {
  const papers = ["#e9e6d5", "#f0e0d5", "#dde5db", "#e4e4ed", "#f0e6ca", "#e1e8e5"];
  return `<button class="tube-portrait" type="button" data-friend-id="${escapeHtml(friend.id)}" aria-label="查看 ${escapeHtml(friend.name)} 的詳情" style="--portrait-paper:${papers[index % papers.length]}">
    <span class="avatar">${avatarMarkup(friend).replace('loading="lazy"', 'loading="eager" draggable="false"')}</span>
    <span class="tube-portrait-name">${escapeHtml(friend.name)}</span>
  </button>`;
}

function friendCard(friend) {
  return `<article class="friend-card" tabindex="0" role="button" data-friend-id="${escapeHtml(friend.id)}" data-friend-name="${escapeHtml(friend.name)}" aria-label="專注查看 ${escapeHtml(friend.name)}；方向鍵可移動" aria-expanded="false" aria-controls="stampFocusControls">
    <div class="avatar">${avatarMarkup(friend)}</div>
    <h3>${escapeHtml(friend.name)}</h3>
  </article>`;
}

function formatDate(value, short = false) {
  if (!value) return "尚未記錄";
  const date = new Date(`${value}T12:00:00`);
  return new Intl.DateTimeFormat("zh-Hant", short ? { month: "short", day: "numeric" } : { year: "numeric", month: "long", day: "numeric" }).format(date);
}

function openDrawer(id) {
  const friend = state.friends.find(f => f.id === id);
  if (!friend) return;
  rememberTopicExpansion();
  stampBoard.closeFocus(false);
  tube.setSuspended(true);
  carousel?.setSuspended(true);
  activeFriendId = id;
  activeDetailTab = "now";
  clearTimeout(drawerCloseTimer);
  els.drawerContent.innerHTML = detailShellMarkup(friend);
  els.drawer.scrollTo({ top: 0, behavior: "instant" });
  els.drawerBackdrop.hidden = false;
  els.drawer.inert = false;
  document.querySelector(".app-shell").inert = true;
  requestAnimationFrame(() => {
    if (activeFriendId !== id) return;
    els.drawer.classList.add("open");
    document.querySelector("#closeDrawer").focus({ preventScroll: true });
  });
  els.drawer.setAttribute("aria-hidden", "false");
  document.body.classList.add("drawer-open");
  if (location.hash !== `#/friend/${id}`) location.hash = `#/friend/${id}`; // 每位朋友各自的 URL
}

function detailShellMarkup(friend) {
  const profile = profileFor(friend);
  const subtitle = [friend.nickname, friend.birthYear ? `Born ${friend.birthYear}` : ""].filter(Boolean).join(" · ");
  return `<header class="detail-header">
      <div class="detail-avatar">${avatarMarkup(friend)}</div>
      <div class="detail-identity">
        <h2>${escapeHtml(friend.name)}</h2>
        ${subtitle ? `<p>${escapeHtml(subtitle)}</p>` : ""}
      </div>
      <button class="primary-button detail-add" type="button" data-add-source="${escapeHtml(friend.id)}">＋ 新增記錄</button>
    </header>
    <nav class="detail-tabs" aria-label="朋友資料層次">
      ${[["now", "Now"], ["us", "我們"], ["topics", "Topics"], ["timeline", "Timeline"], ["source", "Source"]].map(([id, label]) => `<button class="${id === "now" ? "active" : ""}" type="button" data-detail-tab="${id}">${label}${id === "source" ? `<span>${profile.sources.length}</span>` : ""}</button>`).join("")}
    </nav>
    <div class="detail-panel" id="detailPanel">${detailTabMarkup(friend, "now")}</div>
    <div class="detail-footer"><button class="text-button detail-delete" type="button" data-delete-friend="${escapeHtml(friend.id)}">刪除這位朋友</button></div>`;
}

function profileFor(friend) {
  if (friend.profile && friend.profile.now) return friend.profile;
  // 還沒 AI 整理的朋友：now/topics 顯示佔位，但真實的 sources/relationship/todo 照樣呈現
  const p = friend.profile || {};
  return {
    now: [
      { label: "最新近況", value: friend.lifeUpdate || "尚未記錄", detail: friend.note || "從 Source 分頁新增一則記錄開始。", sources: [] }
    ],
    recent: friend.lifeUpdate || "還沒有近期更新。",
    recentSources: [],
    relationship: p.relationship,
    todo: p.todo || [],
    topics: (p.topics && p.topics.length) ? p.topics : [{ title: "尚未整理", summary: friend.note || "新增原始記錄後，再慢慢整理成主題。", points: [], sources: [] }],
    timeline: p.timeline || [],
    sources: p.sources || []
  };
}

function detailTabMarkup(friend, tab) {
  const profile = profileFor(friend);
  if (tab === "us") return usMarkup(profile);
  if (tab === "topics") return topicsMarkup(profile, friend.id);
  if (tab === "timeline") return profileTimelineMarkup(profile);
  if (tab === "source") return sourcesMarkup(profile);
  return nowMarkup(profile);
}

function usMarkup(profile) {
  const rel = profile.relationship;
  const todo = profile.todo || [];
  const highlights = rel && (rel.points?.length || rel.summary)
    ? `${rel.summary ? `<p class="us-summary">${escapeHtml(rel.summary)}</p>` : ""}${rel.points?.length ? `<ul class="us-points">${rel.points.map(p => `<li>${escapeHtml(p)}</li>`).join("")}</ul>` : ""}${sourceButtons(rel.sources)}`
    : `<p class="us-empty">還沒有記錄你們之間的高光時刻。</p>`;
  const todoList = todo.length
    ? `<ul class="todo-list">${todo.map(t => `<li>${escapeHtml(t.text)}${sourceButtons(t.sources)}</li>`).join("")}</ul>`
    : `<p class="us-empty">還沒有想一起做或聊的事。</p>`;
  return `<section class="us-block"><h3 class="us-h">友誼高光</h3>${highlights}</section>
    <section class="us-block"><h3 class="us-h">下次可以…</h3>${todoList}</section>`;
}

function sourceButtons(ids = []) {
  if (!ids.length) return "";
  return `<div class="source-buttons">${ids.map(id => `<button type="button" data-source-jump="${escapeHtml(id)}">↗ ${escapeHtml(id)}</button>`).join("")}</div>`;
}

function nowMarkup(profile) {
  return `<div class="now-grid">${profile.now.map(item => `<section class="now-item">
      <span>${escapeHtml(item.label)}</span>
      <h3>${escapeHtml(item.value)}</h3>
      <p>${escapeHtml(item.detail)}</p>
      ${sourceButtons(item.sources)}
    </section>`).join("")}</div>
    <section class="recent-update">
      <span class="status-dot" aria-hidden="true"></span>
      <div><span>最近的變化</span><p>${escapeHtml(profile.recent)}</p>${sourceButtons(profile.recentSources)}</div>
    </section>`;
}

function topicsMarkup(profile, friendId) {
  const saved = topicExpansionFor(friendId);
  const occurrences = new Map();
  return `<div class="topic-list" data-topic-friend="${escapeHtml(friendId)}">${profile.topics.map((topic, index) => {
    // Titles survive reordering; an occurrence suffix keeps duplicate titles independent.
    const identity = JSON.stringify(topic.id != null ? ["id", topic.id] : ["title", topic.title]);
    const occurrence = occurrences.get(identity) || 0;
    occurrences.set(identity, occurrence + 1);
    const key = encodeURIComponent(JSON.stringify([identity, occurrence]));
    const open = saved.has(key) ? saved.get(key) : index === 0;
    return `<details class="topic-item" data-topic-key="${escapeHtml(key)}" ${open ? "open" : ""}>
      <summary><span>${String(index + 1).padStart(2, "0")}</span><strong>${escapeHtml(topic.title)}</strong><i>＋</i></summary>
      <div class="topic-content"><p>${escapeHtml(topic.summary)}</p>${topic.points?.length ? `<ul>${topic.points.map(point => `<li>${escapeHtml(point)}</li>`).join("")}</ul>` : ""}${sourceButtons(topic.sources)}</div>
    </details>`;
  }).join("")}</div>`;
}

function profileTimelineMarkup(profile) {
  return `<div class="profile-timeline">${profile.timeline.map(item => `<article class="profile-event">
      <time>${escapeHtml(item.date)}</time>
      <div><span>${escapeHtml(item.category)}</span><h3>${escapeHtml(item.title)}</h3><p>${escapeHtml(item.description)}</p>${sourceButtons([item.source])}</div>
    </article>`).join("")}</div>`;
}

function sourcesMarkup(profile, targetId = "") {
  const archiveSources = profile.sources.filter(source => source.archive);
  const newSources = profile.sources.filter(source => !source.archive);
  const sourceGroup = (title, description, sources, className = "") => sources.length ? `<section class="source-group ${className}">
      <header class="source-group-header"><h2>${escapeHtml(title)}</h2><span>${escapeHtml(description)}</span><b>${sources.length}</b></header>
      <div class="source-list">${sources.map(source => sourceEntryMarkup(source, targetId)).join("")}</div>
    </section>` : "";
  return `${sourceGroup("Archive", "日期不詳的原始筆記", archiveSources, "archive-group")}
    ${sourceGroup("新加入的 Source", "具有明確加入日期的原始記錄", newSources)}`;
}

function sourceEntryMarkup(source, targetId = "") {
  return `<article class="source-entry ${source.archive ? "archive" : ""} ${source.id === targetId ? "target" : ""}" data-source-id="${escapeHtml(source.id)}">
    <header><div><div class="source-stamp">${source.archive ? '<span class="archive-mark">ARCHIVE</span><small>日期不詳</small>' : `<time>${escapeHtml(source.date)}</time>`}</div><h3>${escapeHtml(source.label)}</h3></div><button class="source-edit" type="button" data-edit-source="${escapeHtml(source.id)}">編輯</button></header>
    <pre>${escapeHtml(source.text)}</pre>
  </article>`;
}

function switchDetailTab(tab, sourceId = "") {
  const friend = state.friends.find(item => item.id === activeFriendId);
  if (!friend) return;
  rememberTopicExpansion();
  const scrollTop = els.drawer.scrollTop;
  activeDetailTab = tab;
  els.drawer.querySelectorAll("[data-detail-tab]").forEach(button => button.classList.toggle("active", button.dataset.detailTab === tab));
  const panel = document.querySelector("#detailPanel");
  panel.innerHTML = tab === "source" ? sourcesMarkup(profileFor(friend), sourceId) : detailTabMarkup(friend, tab);
  const target = tab === "source" && sourceId && panel.querySelector(".target");
  // Only explicit source links navigate within the page; tabs retain the current position.
  if (target) target.scrollIntoView({ block: "start", behavior: "smooth" });
  else els.drawer.scrollTo({ top: scrollTop, behavior: "instant" });
}

function closeDrawer() {
  rememberTopicExpansion();
  const returnId = activeFriendId;
  els.drawer.classList.remove("open");
  els.drawer.setAttribute("aria-hidden", "true");
  els.drawer.inert = true;
  document.querySelector(".app-shell").inert = false;
  document.body.classList.remove("drawer-open");
  clearTimeout(drawerCloseTimer);
  drawerCloseTimer = setTimeout(() => { els.drawerBackdrop.hidden = true; }, 340);
  activeFriendId = null;
  const returnCard = activeView === "tube"
    ? [...document.querySelector("#tubeWorld").children].find(card => card.dataset.friendId === returnId)
    : activeView === "ring" ? carousel?.cards.find(card => card.item.id === returnId)?.el
    : stampBoard.entries.get(returnId)?.element;
  (returnCard || document.querySelector(`#${activeView}View`)).focus({ preventScroll: true });
  tube.setSuspended(document.body.classList.contains("dialog-open"));
  carousel?.setSuspended(document.body.classList.contains("dialog-open"));
  if (/^#\/friend\//.test(location.hash)) history.replaceState(null, "", location.pathname + location.search); // 清掉網址上的朋友 hash
}

function openDialog(dialog) {
  if (dialog === els.friendDialog) els.friendForm.reset();
  dialog.showModal();
  document.body.classList.add("dialog-open");
  tube.setSuspended(true);
  carousel?.setSuspended(true);
}

function closeDialog(dialog) {
  dialog.close();
  document.body.classList.remove("dialog-open");
  tube.setSuspended(els.drawer.classList.contains("open"));
  carousel?.setSuspended(els.drawer.classList.contains("open"));
}

// 新增一條原始記錄到某位朋友（抽屜「＋新增記錄」）；純手動，AI 不改
function openAddSource(friendId) {
  const friend = state.friends.find(f => f.id === friendId);
  if (!friend) return;
  els.sourceForm.reset();
  els.sourceForm.elements.friendId.value = friendId;
  els.sourceForm.elements.sourceId.value = "";
  document.querySelector("#sourceEyebrow").textContent = "NEW RECORD";
  document.querySelector("#sourceTitle").textContent = "新增記錄";
  document.querySelector("#sourceDialogSub").textContent = `新增給 ${friend.name} 的原始記錄`;
  openDialog(els.sourceDialog);
}

// 編輯 Source 分頁裡的一條原始記錄（手動，AI 不改）
function openEditSource(friendId, sid) {
  const friend = state.friends.find(f => f.id === friendId);
  const src = friend && (friend.profile.sources || []).find(s => s.id === sid);
  if (!src) return;
  els.sourceForm.reset();
  els.sourceForm.elements.friendId.value = friendId;
  els.sourceForm.elements.sourceId.value = sid;
  els.sourceForm.elements.date.value = src.date || "";
  els.sourceForm.elements.label.value = src.label || "";
  els.sourceForm.elements.text.value = src.text || "";
  document.querySelector("#sourceEyebrow").textContent = "EDIT SOURCE";
  document.querySelector("#sourceTitle").textContent = "編輯原始記錄";
  document.querySelector("#sourceDialogSub").textContent = `${friend.name}｜${src.id}`;
  openDialog(els.sourceDialog);
}

function showToast(message) {
  clearTimeout(toastTimer);
  els.toast.textContent = message;
  els.toast.classList.add("show");
  toastTimer = setTimeout(() => els.toast.classList.remove("show"), 2600);
}

["openAddFriend", "emptyAddFriend"].forEach(id => document.querySelector(`#${id}`).addEventListener("click", () => openDialog(els.friendDialog)));
document.querySelector("#closeDrawer").addEventListener("click", closeDrawer);
els.drawerBackdrop.addEventListener("click", closeDrawer);
// Native details toggle events do not bubble; capture handles mouse and keyboard changes.
els.drawer.addEventListener("toggle", event => {
  if (event.target.matches("details.topic-item") && event.target.isConnected) rememberTopicExpansion();
}, true);
// Flush changes before navigation, even if the native toggle event is still queued.
window.addEventListener("pagehide", rememberTopicExpansion);
els.drawer.addEventListener("click", event => {
  const trigger = event.target.closest("[data-add-source]");
  if (trigger) openAddSource(trigger.dataset.addSource);
  const tab = event.target.closest("[data-detail-tab]");
  if (tab) switchDetailTab(tab.dataset.detailTab);
  const source = event.target.closest("[data-source-jump]");
  if (source) switchDetailTab("source", source.dataset.sourceJump);
  const del = event.target.closest("[data-delete-friend]");
  if (del) deleteFriend(del.dataset.deleteFriend);
  const editSrc = event.target.closest("[data-edit-source]");
  if (editSrc) openEditSource(activeFriendId, editSrc.dataset.editSource);
});

async function deleteFriend(id) {
  const friend = state.friends.find(f => f.id === id);
  const name = friend ? friend.name : "這位朋友";
  if (!confirm(`確定要刪除「${name}」嗎？\n資料會移到 data/trash，可從那裡復原。`)) return;
  try {
    const res = await fetch(`/api/friends/${encodeURIComponent(id)}`, { method: "DELETE" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    state.friends = state.friends.filter(f => f.id !== id);
    closeDrawer();
    render();
    showToast(`已刪除「${name}」`);
  } catch (err) {
    console.error("刪除失敗", err);
    showToast("刪除失敗，請確認伺服器有在執行");
  }
}
document.querySelectorAll("[data-close-dialog]").forEach(button => button.addEventListener("click", () => closeDialog(document.querySelector(`#${button.dataset.closeDialog}`))));
document.querySelectorAll("dialog").forEach(dialog => dialog.addEventListener("click", event => {
  if (event.target === dialog) closeDialog(dialog);
}));
document.querySelectorAll("dialog").forEach(dialog => dialog.addEventListener("close", () => {
  document.body.classList.remove("dialog-open");
  tube.setSuspended(els.drawer.classList.contains("open"));
  carousel?.setSuspended(els.drawer.classList.contains("open"));
}));
document.querySelector("#tubeView").addEventListener("click", () => setView("tube"));
document.querySelector("#stampsView").addEventListener("click", () => setView("stamps"));
document.querySelector("#ringView").addEventListener("click", () => setView("ring"));
document.querySelector("#ringPrevious").addEventListener("click", () => carousel?.turn(-1));
document.querySelector("#ringNext").addEventListener("click", () => carousel?.turn(1));

els.friendForm.addEventListener("submit", async event => {
  event.preventDefault();
  const data = new FormData(els.friendForm);
  const payload = {
    name: data.get("name").trim(),
    nickname: data.get("nickname").trim(),
    relation: "community", // Compatibility default until the backend category field is retired.
    birthday: data.get("birthday")
  };
  if (!payload.name) return;
  try {
    const res = await fetch("/api/friends", {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload)
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const friend = await res.json();
    state.friends.unshift(friend);
    state.visibleIds?.add(friend.id);
    render();
    closeDialog(els.friendDialog);
    showToast(`已新增 ${friend.name}`);
    setTimeout(() => openDrawer(friend.id), 180);
  } catch (err) {
    console.error("新增朋友失敗", err);
    showToast("新增失敗，請確認伺服器有在執行");
  }
});

els.sourceForm.addEventListener("submit", async event => {
  event.preventDefault();
  const data = new FormData(els.sourceForm);
  const fid = data.get("friendId");
  const sid = data.get("sourceId");
  const editing = !!sid;
  const payload = { text: data.get("text").trim(), label: data.get("label").trim(), date: data.get("date").trim() };
  if (!payload.text) return;
  const url = editing
    ? `/api/friends/${encodeURIComponent(fid)}/sources/${encodeURIComponent(sid)}`
    : `/api/friends/${encodeURIComponent(fid)}/sources`;
  try {
    const res = await fetch(url, {
      method: editing ? "PATCH" : "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload)
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const newId = res.headers.get("x-source-id") || sid;
    const friend = await res.json();
    const idx = state.friends.findIndex(f => f.id === friend.id);
    if (idx >= 0) state.friends[idx] = friend;
    render();
    closeDialog(els.sourceDialog);
    showToast(editing ? "已更新原始記錄" : "已新增原始記錄");
    if (activeFriendId === friend.id && els.drawer.classList.contains("open")) switchDetailTab("source", newId);
  } catch (err) {
    console.error("儲存原始記錄失敗", err);
    showToast("儲存失敗，請確認伺服器有在執行");
  }
});

document.addEventListener("keydown", event => {
  if (event.key !== "Escape") return;
  const dialog = document.querySelector("dialog[open]");
  if (dialog) {
    event.preventDefault();
    closeDialog(dialog);
  } else if (els.drawer.classList.contains("open")) closeDrawer();
});

// 每位朋友各自的 URL：#/friend/<id>。深連結、分享、書籤、返回鍵都可用。
function friendIdFromHash() {
  const m = location.hash.match(/^#\/friend\/(.+)$/);
  return m ? decodeURIComponent(m[1]) : null;
}
function applyHash() {
  const id = friendIdFromHash();
  if (id) {
    if (!state.friends.some(f => f.id === id)) { history.replaceState(null, "", location.pathname + location.search); return; }
    if (activeFriendId !== id || !els.drawer.classList.contains("open")) openDrawer(id);
  } else if (els.drawer.classList.contains("open")) {
    closeDrawer();
  }
}
window.addEventListener("hashchange", applyHash);

async function init() {
  try {
    const res = await fetch("/api/friends");
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    state.friends = await res.json();
    assignFaces(); // 優先有記錄的朋友 + 分配臉孔切片（兩組共 18 位）
  } catch (err) {
    console.error("讀取朋友資料失敗", err);
    showToast("讀取資料失敗，請確認伺服器有在執行（node server.mjs）");
  }
  render();
  applyHash(); // 開網址帶的朋友（深連結）
}
init();
