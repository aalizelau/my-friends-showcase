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
  if (f.lifeUpdate) fm.lifeUpdate = f.lifeUpdate;
  if (f.note) fm.note = f.note;
  fm.interactions = (f.interactions ?? []).map(it => ({
    id: it.id, date: it.date, type: it.type ?? "", note: it.note ?? "", lifeUpdate: it.lifeUpdate ?? ""
  }));
  const p = f.profile;
  if (p && p.now) {
    const prof = {
      now: p.now.map(n => ({ label: n.label, value: n.value, detail: n.detail, sources: n.sources ?? [] })),
      recent: p.recent ?? "",
      recentSources: p.recentSources ?? []
    };
    // 我們之間（友誼高光）——只在有內容時輸出
    if (p.relationship && (p.relationship.summary || p.relationship.points?.length)) {
      prof.relationship = { summary: p.relationship.summary ?? "", points: p.relationship.points ?? [], sources: p.relationship.sources ?? [] };
    }
    // 下次可以聊/一起做（單一清單）——只在非空時輸出
    if (p.todo?.length) prof.todo = p.todo.map(t => ({ text: t.text, sources: t.sources ?? [] }));
    prof.topics = (p.topics ?? []).map(t => ({ title: t.title, summary: t.summary, points: t.points ?? [], sources: t.sources ?? [] }));
    prof.timeline = (p.timeline ?? []).map(e => ({ date: e.date, title: e.title, description: e.description, category: e.category, source: e.source }));
    fm.profile = prof;
  }
  return fm;
}

function toBody(f) {
  const sources = f.profile?.sources ?? [];
  const blocks = sources.map(s => {
    const meta = [`date: ${s.date}`, `label: ${s.label}`];
    if (s.archive) meta.push("archive: true");
    return `### ${s.id}\n${meta.join(" · ")}\n\n${(s.text ?? "").trim()}`;
  });
  return blocks.length ? `## Sources · 原始記錄\n\n${blocks.join("\n\n")}\n` : `## Sources · 原始記錄\n`;
}

export function friendToMarkdown(f) {
  return `---\n${emitMap(toFrontmatter(f), "").join("\n")}\n---\n\n${toBody(f)}`;
}
