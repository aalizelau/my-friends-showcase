# Inner Circle

一個以朋友為中心的私人關係手帳。可以新增朋友、記錄生活近況，並把每次見面、通話或訊息保存成互動時間線。

## 開啟方式

需要 Node.js（零第三方依賴）。在專案目錄啟動本地伺服器：

```bash
node server.mjs
```

然後前往 `http://localhost:4173`。（可用 `PORT=xxxx node server.mjs` 改埠。）

## 環繞相簿

首頁預設用立體圓筒展示朋友：左右拖曳、捲動或使用箭頭轉動，點選頭像開啟原本的朋友詳情。可暫停自動旋轉，並保留卡片／列表檢視、搜尋和關係篩選。系統設定減少動態效果時，預設不自動旋轉。朋友和頭像沿用原分支的隨機分配；新增的朋友也會立即加入可見名單。

視覺參考 [Matis Dene 的 helmet / ImageTube](https://github.com/matdn/helmet)（原專案標示 MIT），以 CSS 3D 和原生 JavaScript 改寫圓筒排列與慣性，不新增 React、Three.js 或外部 CDN。暖紙色、粉彩相片卡及手繪頭像沿用 Inner Circle 的設計。原始參考、獨立幾何基準與驗證記錄保存在 `docs/tube-reference/`。

## 資料

每位朋友一個 Markdown 檔，存在 `data/friends/<id>.md`，只留在本機、不會上傳。
檔案格式（frontmatter + body）見 [docs/profile-schema.md](docs/profile-schema.md)。

- 讀取：伺服器每次請求即時讀取 md，**編輯 md 後免重啟**。
- 寫入：從介面新增朋友/片段會由伺服器**原子寫回** md（先寫暫存檔再 rename）。
- 建議把 `data/` 放進（私有的）git 版本控制，就有免費的歷史、diff 與還原。

## API

| 方法 | 路徑 | 說明 |
|---|---|---|
| GET | `/api/friends` | 全部朋友 |
| GET | `/api/friends/:id` | 單一朋友 |
| POST | `/api/friends` | 新增朋友（`{name, nickname?, relation, birthday?}`；id/avatar 由伺服器決定） |
| POST | `/api/friends/:id/sources` | 新增一條原始記錄（`{text, label?, date?}`；id 由日期產生並去重） |
| PATCH | `/api/friends/:id/sources/:sid` | 手動編輯一條原始記錄（`{text, label?, date?}`；保留 id/archive） |
| DELETE | `/api/friends/:id` | 刪除朋友（軟刪到 `data/trash`，可復原） |

## 腳本

```bash
node scripts/migrate.mjs        # 一次性：JSON → md（初始遷移，資料來源已移除，僅存參考）
node scripts/verify-roundtrip.mjs  # 測試：serialize(parse(md)) 與原檔逐位元組相同
node scripts/verify-tube.mjs       # 測試：動畫生命週期、減少動態、拖曳與單一／空結果
```
