// Authored UI copy inspired by existing notes, never verbatim quotations.
// Kept separate from the source records; update these lines when the notes change.
export const FOCUS_LINES = {
  "1": {
    text: "有咩煩惱就講啦，我聽住。安慰未必叻，幫你分析下應該得。😏",
    sources: ["2026-08-26"],
    inspiration: "理性直率、幽默，也願意聆聽朋友。"
  },
  "2": {
    text: "比起一大班人熱鬧，我更鍾意兩個人慢慢傾。生活點過，想留返畀自己揀。",
    sources: ["archive", "2026-08-25"],
    inspiration: "重視自由、自我認知與一對一的深度關係。"
  },
  "3": {
    text: "食好啲，慢慢嚟。有咩需要幫手就講，我做到嘅會幫。",
    sources: ["archive"],
    inspiration: "低調平和、喜歡食物，以實際行動照顧朋友。"
  },
  "5": {
    text: "有新作品就發我看看呀！聊設計、聊音樂都行，最好再加一點 jazz。說好了就準時見！",
    sources: ["2026-08-26"],
    inspiration: "熱愛創作與 jazz、鼓勵朋友，也重視守時守約。"
  },
  "6": {
    text: "幾時得閒？我陪你玩星露谷呀！時差唔緊要，夾到時間就一齊玩啦 ☀️",
    sources: ["archive", "2025-09"],
    inspiration: "像小太陽般溫暖，主動陪伴，也會遷就朋友的時區。"
  },
  "7": {
    text: "有什麼就慢慢說，我陪你一起想辦法。下一個十年，也要一起長大呀。",
    sources: ["us"],
    inspiration: "長年的陪伴、耐心安慰，珍惜一起長大的友誼。"
  },
  "8": {
    text: "現實係要搵食啦，但你肯試已經好勁。又有咩新嘢想搞？講嚟聽下 💪",
    sources: ["2026-08"],
    inspiration: "務實看待工作，同時會為朋友勇於嘗試打氣。"
  },
  "17": {
    text: "空間點做可以一齊拆解，我有啲 resources 可以 share。搞掂之後，想留返啲時間望下星。",
    sources: ["archive"],
    inspiration: "樂於分享建築資源，也喜歡物理、天文與手作。"
  },
  "19": {
    text: "先睇手上有幾多 data 同資源，再傾 AI 做到幾多啦。Career 都係，拆開啲選擇慢慢分析。",
    sources: ["2026-08"],
    inspiration: "重視現實資源與數據，會深入討論職涯選擇。"
  },
  "22": {
    text: "通知可以閂，朋友唔想斷線。下次帶相機行山，慢慢傾下近況啦。",
    sources: ["2025-12-15"],
    inspiration: "珍惜持續聯絡，喜歡攝影與行山，也保護自己的注意力。"
  }
};

export function hasProfileNotes(friend) {
  return Boolean(friend?.profile?.sources?.some(source => source.text?.trim()));
}

export function focusLineFor(friend) {
  if (!hasProfileNotes(friend)) return null;
  const line = FOCUS_LINES[friend.id];
  if (!line) return null;
  const available = new Set(friend.profile.sources.filter(source => source.text?.trim()).map(source => source.id));
  return line.sources.every(id => available.has(id)) ? line : null;
}

// Keep recorded friends visible, then use spare avatar slots for blank profiles.
export function selectBoardFriends(friends, capacity, random = Math.random) {
  const shuffled = [...friends];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled.sort((a, b) => Number(hasProfileNotes(b)) - Number(hasProfileNotes(a))).slice(0, capacity);
}
