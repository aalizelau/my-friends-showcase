# Inner Circle

一個以朋友為中心的私人關係手帳。可以新增朋友、記錄生活近況，並把每次見面、通話或訊息保存成互動時間線。

## 開啟方式

需要 Node.js（零第三方依賴）。在專案目錄啟動本地伺服器：

```bash
node server.mjs
```

然後前往 `http://localhost:4173`。（可用 `PORT=xxxx node server.mjs` 改埠。）

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
```
