# Profile 檔案格式（md + frontmatter）

每位朋友一個檔案：`data/friends/<id>.md`。
分兩層：

- **Frontmatter（YAML）** — 結構化、可查詢/排序的資料，以及「AI 整理出的」衍生摘要。
- **Body（Markdown）** — 唯讀的原始筆記（`sources`）。這是真相；上面的摘要都是可重建的視圖。

之所以這樣切：原始筆記是長篇散文，適合放 Markdown 正文，方便閱讀、編輯、git diff；而身分欄位與帶交叉引用的摘要是結構化資料，放 frontmatter 讓後端直接解析。

## ⚠️ 更重要的分層：永久 vs 可重生

檔案位置（frontmatter/body）是次要的；真正關鍵的是**哪些資料是真相、哪些是可丟棄的視圖**。將來若定期用 AI 重新總結累積的 `sources`，**只能重寫「可重生」那層，永遠不准碰「永久」那層**。

| 層級 | 欄位 | 規則 |
|---|---|---|
| **永久・真相**（append-only，永不被覆寫） | `sources`、`interactions`、身分欄位（id/name/…） | 只由人手或明確動作新增/修改；AI 重新總結**不得**觸碰 |
| **可重生・衍生視圖**（隨時可從 sources 重建） | `tags`（興趣標籤）、`now`、`recent`、`recentSources`、`relationship`（友誼高光）、`todo`、`topics`、`timeline` | 純 AI 摘要；重新總結時整個重寫沒關係 |

`relationship`（友誼高光）和 `todo` 也是**可重生**的衍生視圖——它們是從 sources 精選/前瞻整理出來的，不是唯一真相，AI 重新總結時可以連它們一起重寫。

**正因為可重生，鐵則**：每條高光、每個 `todo` 的事實都必須在某則 `source` 的原文裡存在（靠 `sources` 欄位指向）。真相只活在 `sources`；relationship/todo 只是視圖。若某條高光/待辦在任何 source 裡都找不到對應事實，它遲早會在重新總結時消失——所以**新增高光/待辦時，必須同時把事實寫進一則 source**。

---

## Frontmatter 欄位

```yaml
id: "2"                   # string，唯一，等於檔名；由伺服器發的遞增數字編號
name: Oliver               # string，必填
nickname: Oliver · London  # string，可空
relation: close           # close | work | community
birthday: 1995-05-04      # string(YYYY-MM-DD)，可選（只有部分人有）
birthYear: 2000           # number，可選
avatar: 6                 # number，頭像調色盤索引（0–7）
lifeUpdate: …             # string，卡片/搜尋用的近況一句話
note: …                   # string，一句話備註
tags: ["籃球", "露營", …]   # string[]，興趣標籤；可另給 tagsEn 供英文介面
lifeUpdate: …             # 近況一句話；可另給 lifeUpdateEn
note: …                   # 備註；可另給 noteEn

# 衍生摘要裡的字串可加對應 *En（labelEn / valueEn / titleEn / pointsEn / textEn …）
# 英文介面會顯示 *En，中文介面用原欄位。原始 md 仍保留中文真相。

interactions:             # 「片段/moments」時間線（人手新增），可為 []
  - id: a1
    date: 2026-08-25      # YYYY-MM-DD
    type: 見面             # 見面 | 通話 | 訊息 | 一起活動 …（自由字串）
    note: …
    lifeUpdate: …         # 可空字串

profile:                  # 衍生摘要（可由 body 的 sources 重新生成）
  now:                    # 「現在」快照
    - label: 居住與身份
      value: London · UK
      detail: …
      sources: ["2024-09", "2026-06-07"]   # 對應 body 中的 source id
  recent: …               # 一句話：最近的變化
  recentSources: ["2026-08-25"]
  relationship:           # 我們之間（友誼高光）；沒有就整段省略
    summary: …            # 可空
    points: ["幫我搶酒店…", "在機場送機…"]
    sources: ["archive", "2025-12-15"]
  todo:                   # 下次可以聊/一起做（單一清單，不分類）；空就省略
    - text: 去日本看一次完整的演唱會
      sources: []
  topics:                 # 依主題整理（不再包含「我們之間」）
    - title: 家庭
      summary: …
      points: ["…", "…"]
      sources: ["archive", "2026-06-07"]
  timeline:               # 依時間整理
    - date: "2022.06"     # 顯示用日期字串（非嚴格 ISO）
      title: 儲蓄與移英準備
      description: …
      category: 移民
      source: "2022-06"   # 單一 source id
```

> `profile.now/topics/timeline` 內的 `sources`/`source` 值，都必須對應到 body 裡某個 source 的 id（就是 `### <id>` 那個 id）。UI 的「↗ 來源」跳轉靠這個對上。

## Body 格式（sources）

```markdown
## Sources · 原始記錄

### archive
date: ARCHIVE · label: 日期不詳的長期筆記 · labelEn: Undated notes · archive: true

<中文原文>

===en===

<English original>

### 2022-06
date: 2022.06 · label: 儲蓄與移英準備

<原文…>
```

**後端解析規則**

1. 以行首 `### ` 切分出每個 source block；`### ` 後第一個 token 就是 `id`。
2. 緊接標題的**下一行非空行**是 metadata：用 ` · ` 切開，每段是 `key: value`。
   - `date`（必有，archive 用字串 `ARCHIVE`）、`label`（必有）、`archive`（可選，`true`）。
3. metadata 行之後、到下一個 `### ` 之前的內容（去頭尾空白）就是 `text`。

寫回時反向組裝即可（frontmatter + `---` + body）。原子寫入建議：先寫 `.<id>.md.tmp` 再 `rename`。
