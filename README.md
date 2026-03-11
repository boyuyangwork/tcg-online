# TCG Online

一個基於 Node.js 與 WebSockets 開發的線上實時卡牌對戰 (TCG) 平台。支援即時狀態同步、拖曳互動以及自訂 CSV 牌組匯入功能。

## 核心功能

* **即時對戰系統**：基於 WebSockets 達成極低延遲的雙人連線對戰。
* **觀戰模式**：支援第三方玩家以「觀戰」身分加入房間，實時同步雙方盤面狀態。
* **卡牌互動與區域管理**：實作了完整的 TCG 區域架構（手牌、牌組、墓地、除外區、場地與額外牌組），並支援直覺的 Drag & Drop 拖曳操作。
* **自訂牌組匯入**：玩家可透過 CSV 檔案快速匯入牌組。
* **實用對戰工具**：內建洗牌、抽牌、檢索、硬幣投擲與 Token 召喚等功能。
* **共用筆記**：房間內建 Shared Note，方便玩家即時溝通或紀錄狀態。

## 技術棧

* **前端**：HTML5, CSS3 (Dark Theme), Vanilla JavaScript (Drag and Drop API)
* **後端**：Node.js, `ws` (WebSocket Server)

## 專案結構

```text
.
├── index.html          # 前端主程式（包含 UI 結構、樣式與客戶端連線邏輯）
├── server.js           # WebSocket 伺服器核心邏輯與房間狀態管理
├── package.json        # 專案依賴與執行腳本配置
└── deck-example.csv    # 範例牌組匯入檔

```

## 快速開始

### 本地端運行

本專案已配置標準的套件管理。請確保你的電腦已安裝 Node.js。

1. 安裝依賴套件：

```bash
npm install

```

2. 啟動 WebSocket 伺服器：

```bash
npm start

```

3. 在瀏覽器中開啟前端介面：
直接打開 `index.html` (或透過 VS Code Live Server 等工具執行)，伺服器預設連線位置為 `ws://localhost:8080`。

### 內網穿透 (遠端連線)

若要讓其他網路環境的玩家連線，可以使用 Cloudflare Tunnel：

```bash
cloudflared tunnel --url http://localhost:8080

```

成功啟動後，將終端機顯示的 `wss://...` 網址 (例如 `wss://accomplished-nancy-summaries-income.trycloudflare.com` ) 輸入到網頁的 Server 欄位即可進行遠端對戰。

## 牌組匯入格式 (CSV)

請準備包含以下標題的 CSV 檔案：

* `baseId`：卡片唯一編號。
* `name`：卡片名稱。
* `img`：卡片圖片 URL (選填)。
* `deckType`：卡片所屬區域，可填入 `main` (主牌組)、`side` (備牌)、`extra` (額外牌組)。

## 授權條款

本專案採用 [MIT License](https://www.google.com/search?q=./LICENSE) 授權。

