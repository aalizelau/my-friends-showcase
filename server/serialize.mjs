// 序列化：friend 物件 → md 檔（parser 的逆運算）。migrate 與寫入層共用。
// 契約見 docs/profile-schema.md。frontmatter 放結構化資料 + 衍生摘要；body 放原始 sources。

const isPrimitive = v => v === null || ["string", "number", "boolean"].includes(typeof v);
const scalar = v => (v === null ? "null" : typeof v === "string" ? JSON.stringify(v) : String(v));

function emitMap(obj, pad) {
  const lines = [];
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined) continue;
    if (Array.isArray(v)) {
      if (v.length === 0) lines.push(`${pad}${k}: []`);
      else if (v.every(isPrimitive)) lines.push(`${pad}${k}: [${v.map(scalar).join(", ")}]`);
      else {
        lines.push(`${pad}${k}:`);
        for (const item of v) lines.push(...emitSeqItem(item, pad + "  "));
      }
    } else if (v !== null && typeof v === "object") {
      lines.push(`${pad}${k}:`);
      lines.push(...emitMap(v, pad + "  "));
    } else {
      lines.push(`${pad}${k}: ${scalar(v)}`);
    }
  }
  return lines;
}

function emitSeqItem(item, pad) {
  const cont = pad + "  ";
  const mapLines = emitMap(item, cont);
  const first = mapLines[0].slice(cont.length); // 首鍵放到 "- " 那行
  return [`${pad}- ${first}`, ...mapLines.slice(1)];
}

// frontmatter：刻意控制欄位與順序；丟掉 interests；profile.sources 改放 body
function toFrontmatter(f) {
  const fm = { id: f.id, name: f.name, nickname: f.nickname ?? "", relation: f.relation };
  if (f.birthday) fm.birthday = f.birthday;
  if (f.birthYear != null) fm.birthYear = f.birthYear;
  fm.avatar = f.avatar ?? 0;
  if (f.nicknameEn) fm.nicknameEn = f.nicknameEn;
  if (f.lifeUpdate) fm.lifeUpdate = f.lifeUpdate;
  if (f.lifeUpdateEn) fm.lifeUpdateEn = f.lifeUpdateEn;
  if (f.note) fm.note = f.note;
  if (f.noteEn) fm.noteEn = f.noteEn;
  // tags（興趣標籤）：可重生視圖，身分列以純文字顯示；只在非空時輸出
  if (Array.isArray(f.tags) && f.tags.length) fm.tags = f.tags;
  if (Array.isArray(f.tagsEn) && f.tagsEn.length) fm.tagsEn = f.tagsEn;
  fm.interactions = (f.interactions ?? []).map(it => ({
    id: it.id, date: it.date, type: it.type ?? "", note: it.note ?? "", lifeUpdate: it.lifeUpdate ?? ""
  }));
  const p = f.profile;
  if (p && p.now) {
    const en = (obj, key) => obj[`${key}En`] != null && obj[`${key}En`] !== "" ? { [`${key}En`]: obj[`${key}En`] } : {};
    const prof = {
      now: p.now.map(n => ({ label: n.label, ...en(n, "label"), value: n.value, ...en(n, "value"), detail: n.detail, ...en(n, "detail"), sources: n.sources ?? [] })),
      recent: p.recent ?? "",
      ...en(p, "recent"),
      recentSources: p.recentSources ?? []
    };
    // 我們之間（友誼高光）——只在有內容時輸出
    if (p.relationship && (p.relationship.summary || p.relationship.points?.length)) {
      const r = p.relationship;
      prof.relationship = { summary: r.summary ?? "", ...en(r, "summary"), points: r.points ?? [], ...(Array.isArray(r.pointsEn) ? { pointsEn: r.pointsEn } : {}), sources: r.sources ?? [] };
    }
    // 下次可以聊/一起做（單一清單）——只在非空時輸出
    if (p.todo?.length) prof.todo = p.todo.map(item => ({ text: item.text, ...en(item, "text"), sources: item.sources ?? [] }));
    prof.topics = (p.topics ?? []).map(topic => ({
      title: topic.title, ...en(topic, "title"), summary: topic.summary, ...en(topic, "summary"),
      points: topic.points ?? [], ...(Array.isArray(topic.pointsEn) ? { pointsEn: topic.pointsEn } : {}),
      sources: topic.sources ?? []
    }));
    prof.timeline = (p.timeline ?? []).map(e => ({
      date: e.date, title: e.title, ...en(e, "title"), description: e.description, ...en(e, "description"),
      category: e.category, ...en(e, "category"), source: e.source
    }));
    fm.profile = prof;
  }
  return fm;
}

function toBody(f) {
  const sources = f.profile?.sources ?? [];
  const blocks = sources.map(s => {
    const meta = [`date: ${s.date}`, `label: ${s.label}`];
    if (s.labelEn) meta.push(`labelEn: ${s.labelEn}`);
    if (s.archive) meta.push("archive: true");
    const zh = (s.text ?? "").trim();
    const enText = (s.textEn ?? "").trim();
    const body = enText ? `${zh}\n\n===en===\n\n${enText}` : zh;
    return `### ${s.id}\n${meta.join(" · ")}\n\n${body}`;
  });
  return blocks.length ? `## Sources · 原始記錄\n\n${blocks.join("\n\n")}\n` : `## Sources · 原始記錄\n`;
}

export function friendToMarkdown(f) {
  return `---\n${emitMap(toFrontmatter(f), "").join("\n")}\n---\n\n${toBody(f)}`;
}
