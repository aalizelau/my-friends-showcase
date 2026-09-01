import { getLang } from "./i18n.js";

function pick(zh, en) {
  return getLang() === "en" && en != null && en !== "" ? en : zh;
}

// Accept both the current API shape (text/textEn + label/labelEn) and the
// legacy combined source body that an already-running server may still return.
// Source cards must never expose the storage divider or both languages at once.
function localizeSource(source) {
  let label = source.label ?? "";
  let labelEn = source.labelEn ?? "";
  if (!labelEn) {
    const marker = " · labelEn: ";
    const index = label.indexOf(marker);
    if (index >= 0) {
      labelEn = label.slice(index + marker.length).trim();
      label = label.slice(0, index).trim();
    }
  }

  let text = source.text ?? "";
  let textEn = source.textEn ?? "";
  if (!textEn) {
    const parts = String(text).split(/\r?\n\s*===en===\s*\r?\n/);
    if (parts.length > 1) {
      text = parts.shift().trim();
      textEn = parts.join("\n").trim();
    }
  }

  return { ...source, label: pick(label, labelEn), text: pick(text, textEn) };
}

export function localizeFriend(friend) {
  if (!friend) return friend;
  const p = friend.profile;
  const sources = (p?.sources || []).map(localizeSource);
  if (getLang() !== "en") return p ? { ...friend, profile: { ...p, sources } } : friend;
  return {
    ...friend,
    nickname: pick(friend.nickname, friend.nicknameEn),
    lifeUpdate: pick(friend.lifeUpdate, friend.lifeUpdateEn),
    note: pick(friend.note, friend.noteEn),
    tags: pick(friend.tags, friend.tagsEn),
    profile: p && {
      ...p,
      now: (p.now || []).map(n => ({ ...n, label: pick(n.label, n.labelEn), value: pick(n.value, n.valueEn), detail: pick(n.detail, n.detailEn) })),
      recent: pick(p.recent, p.recentEn),
      relationship: p.relationship && {
        ...p.relationship,
        summary: pick(p.relationship.summary, p.relationship.summaryEn),
        points: pick(p.relationship.points, p.relationship.pointsEn)
      },
      todo: (p.todo || []).map(item => ({ ...item, text: pick(item.text, item.textEn) })),
      topics: (p.topics || []).map(topic => ({
        ...topic,
        title: pick(topic.title, topic.titleEn),
        summary: pick(topic.summary, topic.summaryEn),
        points: pick(topic.points, topic.pointsEn)
      })),
      timeline: (p.timeline || []).map(event => ({
        ...event,
        title: pick(event.title, event.titleEn),
        description: pick(event.description, event.descriptionEn),
        category: pick(event.category, event.categoryEn)
      })),
      sources
    }
  };
}

export function localizeFocusLine(line) {
  if (!line) return line;
  return { ...line, text: pick(line.text, line.textEn) };
}
