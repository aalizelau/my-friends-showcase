# Inner Circle

一個以朋友為中心的私人關係手帳。可以新增朋友、記錄生活近況，並把每次見面、通話或訊息保存成互動時間線。

## 開啟方式

需要 Node.js（零第三方依賴）。在專案目錄啟動本地伺服器：

```bash
node server.mjs
```

然後前往 `http://localhost:4173`。（可用 `PORT=xxxx node server.mjs` 改埠。）

## 朋友收藏板

- 首頁預設 **Tube** 環繞相簿，**Ring** 是橫向轉盤，**Stamps** 是朋友郵票收藏板；固定淺色，不顯示搜尋、關係分類、宣傳區塊或頁尾。
- 舊有 `relation` 資料暫時保留在後端，前端不顯示或要求選擇；新增朋友使用 `community` 作為相容預設值。
- 每位朋友的頭像是一張可拖曳的郵票；拖曳放開後有輕微慣性，位置限制在板內。
- **Organise** 排成置中的行列；**Shuffle** 重新散落位置與角度，不會更換朋友或頭像配對。
- 點選郵票會置中放大，其他頭像模糊；可開啟原有朋友手帳。點空白處或按 Escape 退出，回到原位置，不另外顯示退出按鈕。
- 有既存筆記的朋友會優先出現在收藏板。現有 10 位朋友在專注模式會顯示個人化文字泡泡，文案只取材於日常興趣、相處方式與價值觀；泡泡不再顯示附註文字，但保留螢幕閱讀器的非原話說明。空白檔案不會套用通用人設。
- 泡泡文案與來源 ID 獨立保存在 `focus-lines.mjs`，不修改朋友原始記錄；原筆記變動後可手動更新文案。所需來源被刪除或清空時，不顯示該文案。
- 鍵盤：Tab 選取、方向鍵移動（Shift 加大步幅）、Enter／空白鍵專注查看、Escape 返回。
- 支援窄螢幕及系統「減少動態效果」。郵票位置只保留於本次開啟，不寫入朋友資料。

## 環繞相簿

Tube 沿用 `redesign-friends-tube` 的圓筒排列、左右拖曳、方向按鈕與播放／暫停；點選朋友開啟手帳。手帳與對話框開啟、切換到 Stamps 或畫面不可見時停止動畫。系統設定減少動態效果時預設暫停。兩個檢視共用朋友與頭像配對，保留手寫名字。

圓筒實作改編自 matdn/helmet 的 ImageTube，以原生 JavaScript 和 CSS 3D 實作，不使用外部 CDN。原分支的參考證據保存在 `docs/tube-reference/`；其中截圖與 QA 記錄只描述合併前的設計。

## 橫向轉盤

Ring 沿用 `viscose-carousel` 的橫向大圓弧、慣性與吸附。左右拖曳、捲動或使用方向按鈕轉動；點選側邊頭像置中，再點中央頭像開啟手帳。使用相同朋友與頭像（未分配圖片的朋友沿用 SVG 頭像），只顯示手寫名字。支援鍵盤、減少動態效果；閒置、隱藏、手帳開啟或離開 Ring 時停止動畫，不啟用原分支的直向全螢幕模式。

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
node --test scripts/verify-stamp-board.mjs  # 收藏板佈局、互動狀態與無障礙行為測試
node --test scripts/verify-simplified-ui.mjs  # 精簡介面啟動、新增朋友與分類資料保留測試
node scripts/verify-tube.mjs  # 圓筒動畫、減少動態、拖曳與空結果測試
node --test scripts/verify-carousel.mjs  # 橫向轉盤幾何、輸入與動畫生命週期測試
```
