# TCG Online (MVP)

一個基於 Node.js 與 WebSockets 開發的線上即時卡牌對戰 (TCG) 平台。專注於提供極低延遲的連線狀態同步、直覺的拖曳互動，並支援跨平台的主流牌組格式匯入。

**Live Demo (線上試玩)**: [https://boyuyangwork.github.io/tcg-online/](https://boyuyangwork.github.io/tcg-online/)
*(注意：伺服器採用免費雲端方案，若一段時間無人使用會進入休眠。首次連線若無反應，請等待約 30~50 秒讓伺服器冷啟動即可順暢遊玩。)*

## 系統亮點與工程架構

* **雲端原生部署 (Cloud-Native)**：前端介面託管於 GitHub Pages，WebSocket 核心狀態伺服器部署於 Render，達成前後端分離的微服務基礎架構。
* **策略模式與資料管線 (Strategy Pattern & ETL)**：前端實作了智慧型檔案匯入介面。能自動識別副檔名，並將 YGOPRODeck 的 `.ydk` 格式透過批次 API 請求 (Batch Request) 即時清洗、轉換為標準 CSV 格式。
* **開放封閉原則 (Open-Closed Principle)**：將 `.ydk` 的解析與 API 負載完全卸載 (Offloading) 至客戶端瀏覽器處理，確保後端 Node.js 伺服器邏輯無需修改，專注於即時狀態同步。

## 核心功能

* **即時對戰系統**：基於 WebSockets 達成極低延遲的雙人連線對戰。
* **無縫牌組匯入**：支援原生 `.csv` 匯入，以及玩家最常用的 YGOPRODeck `.ydk` 檔案直接上傳，自動抓取卡圖與資料。
* **卡牌互動與區域管理**：實作完整的 TCG 區域架構（手牌、牌組、墓地、除外區、場地與額外牌組），支援直覺的 Drag & Drop 拖曳操作。
* **觀戰模式**：支援第三方玩家以「觀戰」身分加入房間，實時同步雙方盤面狀態。
* **實用對戰工具**：內建洗牌、抽牌、檢索、硬幣投擲與 Token 召喚等功能。
* **共用筆記**：房間內建 Shared Note，方便玩家即時溝通或紀錄狀態。

## 技術棧

* **前端 (Client)**：HTML5, CSS3 (Dark Theme), Vanilla JavaScript, YGOPRODeck API
* **後端 (Server)**：Node.js, `ws` (WebSocket Server), In-memory State Management
* **基礎設施 (Infrastructure)**：GitHub Pages (Front-end Hosting), Render (Back-end PaaS)

## 專案結構

```
├── index.html          # 前端主程式（UI 結構、API 串接與 WebSocket 連線邏輯）
├── main.js             # 前端核心邏輯（檔案解析策略、拖曳事件管理）
├── style.css           # 視覺樣式與暗色主題設定
├── server.js           # WebSocket 伺服器核心（連線分流與房間狀態管理）
├── package.json        # Node.js 專案依賴配置
└── deck-example.csv    # 範例原生牌組匯入檔
```

## 快速開始 (本地端開發)

若你想在本地端運行並修改此專案，請確保電腦已安裝 Node.js。

**1. 安裝環境依賴**
```bash
npm install
```

**2. 啟動 WebSocket 伺服器**

```bash
npm start
```

伺服器預設將運行於 `ws://localhost:8080`。

**3. 開啟前端介面**
直接使用瀏覽器開啟 `index.html`，或透過 VS Code Live Server 執行。請在網頁的 Server 欄位確認連線位址設定為本地端。

## 牌組匯入格式支援

本系統提供高度彈性的牌組匯入方案，支援以下兩種格式：

**1. YGOPRODeck 格式 (.ydk) - 推薦**
直接從 [YGOPRODeck](https://ygoprodeck.com/) 匯出 `.ydk` 檔案並上傳。系統會自動在前端解析卡片 ID，並透過官方 API 抓取對應的卡名與卡圖。

**2. 原生 CSV 格式 (.csv)**
請準備包含以下精確標題的 CSV 檔案：

* `baseId`：卡片唯一編號。
* `name`：卡片名稱。
* `img`：卡片圖片 URL (必須為公開網址)。
* `deckType`：卡片所屬區域，嚴格填入 `main` (主牌組)、`side` (備牌)、`extra` (額外牌組)。

## 授權條款

本專案採用 [MIT License](https://www.google.com/search?q=./LICENSE) 授權。
