[根目錄](../../CLAUDE.md) > [scripts](../) > **Github規則更新**

# GitHub 規則添加 - 代理規則追加工具

## 模塊職責

通過 GitHub API 讀取倉庫中的規則檔案（Surge、Clash 等代理規則），在已有內容基礎上追加新規則並提交更新。附帶一個基於 commit 活動的熱力圖小組件。

## 入口與啓動

- **App 入口**：`index.tsx` -- 單檔案應用，包含首頁（選擇 + 總覽 + 瀏覽 + 目前位置灰字小列）、使用者設定頁（多帳號）、歷史紀錄頁和規則編輯器
- **Intent 入口**：`intent.tsx` -- 分享菜單 / 快捷指令後台追加規則，無界面
- **小組件入口**：`widget.tsx` -- Small / Medium / Large 三種尺寸，展示配置 path 下檔案的 commit 熱力圖

## 對外接口

### GitHub API 調用

- `GET /repos/{owner}/{repo}/contents/{path}` -- 獲取檔案列表
- `GET /repos/{owner}/{repo}/contents/{filePath}` -- 獲取檔案內容（Base64）
- `PUT /repos/{owner}/{repo}/contents/{filePath}` -- 更新檔案（附帶 SHA）
- `GET /repos/{owner}/{repo}/commits?path={path}&since=...` -- 小組件資料源，拉取近一年該路徑的 commit 歷史

## 關鍵依賴與配置

- **多帳號**：`Storage.get("rules_accounts")` 存儲 `[{ username, token }]`（Add Rules 使用者設定頁管理：頭像快取 `rules_avatars`、首頁選擇草稿 `rules_home_draft`；v2.0.1 拿掉自動清空開關，永遠保留上次選擇）；舊版單帳號 `github_config` 第一次打開自動遷移成多帳號列表
- **GitHub 配置**：`github_config` 存儲 `{ token, owner, repo, path, branch }`，App 每次切換選擇後同步回寫，供 Widget / Intent 共用；舊版缺 `branch` 時自動回退 `main`
- **歷史紀錄**：`Storage.get("github_rules_history")` 存儲最近 10 筆已編輯檔案 `{ platform, username, owner, repo, gistId, gistTitle, branch, path, name, editedAt, ruleCount }`，打開檔案與提交成功時都會刷新到最前面
- **後台追加目標**：`Storage.get("github_intent_target")` 存儲 `{ filePath, ruleType, platform, username, owner, repo, gistId, gistTitle, branch }`，在使用者設定頁「後台追加」一節用挑選器選好（像首頁一樣選用戶 / 平台 / 倉庫 / 檔案），僅 `intent.tsx` 使用（無界面，故須預先配好）；舊版只存 `{ filePath, ruleType }` 的目標照舊兼容，缺的欄位回退到 `github_config`
- **認證**：GitHub Personal Access Token；API 請求統一使用 `Authorization: Bearer` + `X-GitHub-Api-Version: 2022-11-28`
- **編解碼**：`Data.fromBase64String` / `Data.fromRawString` 處理檔案內容 Base64 轉換
- **小組件刷新**：配置保存、規則提交成功後調用 `Widget.reloadUserWidgets()` 主動觸發刷新

## 資料模型

```typescript
interface Config { token: string; owner: string; repo: string; path: string; branch: string }
type IntentTarget = { filePath: string; ruleType: string; platform: 'github'|'gist'; username: string; owner: string; repo: string; gistId: string; gistTitle: string; branch: string }   // 後台追加目標（v2.0.1 擴充）
type AppendResult = { ok: boolean; message: string; added: number; skipped: number }
interface FileItem { id: string; name: string; path: string; sha: string }
type ContributionDay = { date: string; count: number; level: 0|1|2|3|4 }
type ContributionWeek = ContributionDay[]
```

## 工作流程

### 規則追加
1. 首頁先選用戶、平台（GitHub / Gist）、倉庫或 Gist（清單按更新時間分頁拉取）
2. 下方照舊瀏覽檔案夾與檔案（Gist 直接列出檔案），點檔案進編輯器
3. 編輯器逐條改規則、新增單條、批量追加（Add Rules 式：同一類型 + 多行內容）；類型下拉是 Add Rules 的 17 種固定類型（`DOMAIN` / `DOMAIN-SUFFIX` / `DOMAIN-KEYWORD` / `DOMAIN-WILDCARD` / `IP-CIDR` / `IP-CIDR6` / `GEOIP` / `USER-AGENT` / `URL-REGEX` / `SCRIPT` / `PROTOCOL` / `DEST-PORT` / `DOMAIN-SET` / `SUBNET` / `CELLULAR-RADIO` / `IP-ASN` / `HOSTNAME-TYPE`），也可手輸自訂類型
4. Diff 預覽後提交：倉庫走 Contents API PUT（附 SHA），Gist 走 Gist API PATCH
5. 首頁「總覽」顯示當前用戶（頭像）、平台、倉庫與檔案夾 / 檔案數；歷史紀錄只走右上角歷史按鈕進完整歷史紀錄頁（左滑刪除、清空），首頁不展示最近編輯卡片（v2.0.2 拿掉）

### 後台追加（分享菜單 / 快捷指令）

前提：在使用者設定頁「後台追加」一節用挑選器選好 **目標檔案**（像首頁一樣選用戶 / 平台 / 倉庫 / 檔案，選完代入顯示藍字檔名 + 灰字 `用戶/平台•擁有者/倉庫/路徑`（v2.0.4 格式；例：`KristenYT/Gist•Emby 分流規則/Emby.list`）與 **規則類型**（彈框選 17 種固定類型，預設 `DOMAIN-SUFFIX`）；intent 會用目標所屬帳號的 Token 與倉庫提交，Gist 目標走 Gist API PATCH。

1. **分享菜單**：Safari 等 App 裡選中文字或分享網頁 → Scripting → 本腳本
2. **快捷指令**：**Run Script** 動作（後台執行、無 UI），可配合個人自動化定時觸發；結果通過 `Script.exit(Intent.text(...))` 返回，便於串接後續動作
3. `services/rule_append.ts` 逐行解析輸入：
   - 已帶大寫類型前綴的完整規則行 → 原樣保留
   - URL → 取主機名（剝離協議 / 路徑 / 查詢 / 端口 / 用戶資訊 / `www.` 前綴）
   - 其它文本 → 視作域名套用預設類型；不含 `.`、含空格或為註釋 / 空行的一概跳過
4. 與現有內容按「類型,值」比對去重（忽略行尾註釋），只追加新增項
5. 結果發本地通知：成功靜默（`interruptionLevel: "passive"`），失敗才提醒

**保護措施**：缺配置、未設目標檔案、解析不出規則時直接短路，不發任何請求也不產生空 commit；PUT 失敗如實回報。

> `intent` 環境**沒有界面**，`intent.tsx` 與 `services/rule_append.ts` 中絕不可調用 `Dialog.*` / `Navigation.present` —— 無 UI 環境下彈窗會永遠掛起，自動化就此卡死。交互式的逐條編輯與 Diff 確認仍只在 `index.tsx` 提供。

### 小組件
1. 讀取 `github_config`，可通過 Widget Parameter 以 JSON 形式臨時覆蓋（支持 `branch` 字段）
2. 調用 `/commits?sha={branch}&path=...` 拉取近 371 天的 commit，最多 10 頁 (1000 條)
3. **尺寸與時段映射**（每個尺寸按各自時段內的"單日最高值"做四分位重算顏色強度；統一採用 GitHub 原生 7 行×N 列 橫向佈局）：
   - **Small** → 當月（自然月），格子 9pt × 4~6 列，展示本月提交 / 活躍 / 連續
   - **Medium** → 近半年（26 周），格子 8pt × ~27 列，展示近半年提交 / 活躍 / 連續 / 單日最高 / 最近活躍
   - **Large** → 本年 1 月 1 日到**今天**（end 截到今天避免未來空格），自適應 cellSize（>30 周用 4.5pt，否則 8pt），頂部 4 項大數字 + 主熱力圖 + 底部 3 行說明
4. Level 規則：`count=0 → level 0`；`ratio = count/maxInPeriod`，`>0.75 → 4`，`>0.5 → 3`，`>0.25 → 2`，其餘正數 → 1

## 測試與質量

- `tests/github-rule-append.regression.mjs`（在倉庫根用 `node` 運行，需 `node_modules/.bin` 在 PATH 上）：
  覆蓋 `textToRuleLines` 的三種輸入形態、去重後只追加新增項、全部重複時不產生空 commit、
  缺配置 / 未設目標檔案 / 解析為空時不發請求、PUT 失敗如實回報。
  離線跑：注入 `Storage` / `Data` / `fetch` 樁，不觸碰真實 GitHub API。
- App 內的交互式編輯與小組件仍靠手動驗證。

## 相關檔案清單

```
scripts/Github規則更新/
  index.tsx                    # 主應用（配置 + 主操作）
  intent.tsx                   # 分享菜單 / 快捷指令後台追加入口（無 UI）
  widget.tsx                   # Small/Medium/Large 熱力圖小組件
  types.ts                     # ContributionDay / ContributionWeek
  script.json                  # 腳本元資料
  services/
    commit_api.ts              # 拉取 commits 並聚合為 weeks
    rule_append.ts             # 無界面追加規則邏輯層（解析 / 去重 / 提交）
  components/
    heatmap_grid.tsx           # 純展示組件：渲染 weeks 網格
  utils/
    colors.ts                  # GitHub 官方配色 (light/dark × 5 級)
    widget_config.ts           # 讀取 github_config + Widget.parameter 覆蓋
```

## 變更記錄 (Changelog)

| 日期 | 操作 | 說明 |
|------|------|------|
| 2026-08-13 | 新增 | 支持後台運行：新增 `intent.tsx` + `services/rule_append.ts`，可從分享菜單或快捷指令「Run Script」無界面追加規則（自動解析域名 / URL、按「類型,值」去重、結果發本地通知並返回給快捷指令）；配置頁新增「後台追加」目標檔案與規則類型；`script.json` 聲明 `Text` / `URLs` 輸入類型；新增 `tests/github-rule-append.regression.mjs`（v1.1.0） |
| 2026-11-07 | 更新 | v2.0.0（改名重發）：改名 GitHub 規則添加（檔名 GitHub_Add_Rules.scripting，script.json name/version/icon/color/author/description 更新；icon 回到原版 `list.bullet`，顏色 #808793（截圖那個灰，六點取樣平均值），作者 `原作者：@sssLucasss`，remoteResource 先拿掉等 Kristen 之後自己加遠端）；全站多語言（簡中／繁中／英文），新增 `components/i18n.ts`（Toolkit 同款 t(繁體, 簡體, 英文)，多來源語言判斷），index/intent/widget/services 介面字串全包 t()，繁中欄位取現有字串原樣；Storage key 與 github_config 同步不動；localizedNames：en「GitHub Add Rules」、zh 簡體名「GitHub 规则添加」。 |
| 2026-11-07 | 更新 | v2.0.0 補：修清單名字繁中介面顯示簡體 — App 的 localizedNames 只有一個 "zh" 欄位不分簡繁，zh 填簡體會讓繁中介面也顯示簡體；補上 zh-Hant／zh-Hans／zh-TW／zh-HK／zh-MO／zh-CN／zh-SG 分流，zh 改回繁體當 fallback；localizedDescriptions 也同樣補 zh-Hant／zh-Hans。版本維持 2.0.0。 |
| 2026-11-07 | 更新 | v2.0.8：全檔 8 處 navigationTitle 全部改 `navigationBarTitleDisplayMode="inline"`；補齊之前遺漏的 5 處（選擇目標檔案、新增／編輯規則、確認提交、批量追加、檔案頁）。 |
| 2026-11-07 | 更新 | v2.0.7：刷新按鈕改放正中間（HStack 兩邊各一個 Spacer；四處）；新規則重複判斷：`isDuplicateRule` 比對類型（不分大小寫）＋值（完全相同），新增／編輯重複時 `Dialog.alert` 提示並留在表單，批量追加跳過重複的、只加新的，全部重複則不存入；後台追加不彈窗，維持現有去重。 |
| 2026-11-07 | 更新 | v2.0.6：目前位置的「上級」改成「上一層」（只有首頁有這顆按鈕）；「重新整理倉庫／Gist 清單」改成「刷新倉庫／Gist 清單」，改成 HStack + Spacer + borderless 靠右小按鈕（首頁＋目標挑選器都改）。 |
| 2026-11-07 | 更新 | v2.0.5：倉庫／Gist 的 Picker 在清單沒載好前先顯示「載入中…」，等清單載好再掛上 Picker（修剛打開時選擇倉庫卡片特別大的問題；`listsLoading` 初始改 true，沒帳號時記得關掉）；歷史紀錄頁標題改 `navigationBarTitleDisplayMode="inline"` 放頂置中。 |
| 2026-11-07 | 更新 | v2.0.4：首頁標題改 `navigationBarTitleDisplayMode="inline"`，不再是大標題（跟設定頁一樣小字）；後台追加目標小字路徑改成 `用戶/平台•倉庫或標題/路徑`（例：`KristenYT/Gist•Emby 分流規則/Emby.list`）。 |
| 2026-11-07 | 修復 | v2.0.3：修 2.0.2 整個灰屏——`index.tsx` 目前位置那一列用了 `<Divider />`，但 import 清單裡沒有 `Divider`，裝置上一跑就 ReferenceError、整個首頁渲染失敗變空白灰屏（esbuild 不會抓沒 import 的識別字）。修法：import 補 `Divider` 一行；打包檢查加一道「JSX 元件 vs import 清單」對照，全檔掃過確認無其他缺漏。 |
| 2026-11-07 | 更新 | v2.0.2：首頁「最近編輯」卡片整個拿掉（歷史紀錄本身與歷史頁保留，只走右上角入口）；新增／編輯規則表單刪掉「類型」手打輸入框，只留 17 種規則類型彈框（自訂類型入口隨之取消）；修 v2.0.1 的 bug：目前位置同一列兩顆 Button 點按會混淆，點上級也回根目錄——改成 borderless + 各佔一半寬 + 中間 Divider（Toolkit Fork 卡片驗證過的寫法）；後台追加目標小字路徑加上用戶與平台（`用戶 · 平台 · 擁有者/倉庫 · 路徑`）。 |
| 2026-11-07 | 更新 | v2.0.1：後台追加目標檔案改成像首頁一樣的挑選器（選用戶 / 平台 / 倉庫 / 檔案，代入顯示藍字檔名 + 灰字倉庫 · 路徑），規則類型改成 17 種彈框；intent 按目標的帳號 / 倉庫 / Gist 提交（Gist 走 PATCH）；首頁「目前位置」刷新拿掉，上級 / 返回根目錄改成灰字小列；設定頁改名「使用者設定」並拿掉自動清空開關；檔案列表檔案夾藍字、單一檔案白字（`foregroundStyle="label"`）；全腳本繁中化（opencc s2t + 台灣寫法修正：設定、檔案、後台、網路、資訊、預設）。 |
| 2026-11-07 | 合併 | v2.0.0：以規則更新為主，合併 Github_Add_Rules（v1.2.6）：設定頁改為多帳號（頭像、Token 驗證、拖移排序、退出自動清空、後台追加保留）；首頁先選用戶 / 平台 / 倉庫或 Gist，下方保留檔案夾與檔案瀏覽，並支持 Gist 檔案編輯提交；首頁加總覽與最近編輯，右上角歷史紀錄與設定按鈕；歷史紀錄最多 10 筆，點進重進編輯；規則編輯器類型下拉改成 Add Rules 的 17 種固定類型，並加批量追加 |
| 2026-05-11 | 增強 | 新增熱力圖小組件（Small/Medium/Large），展示配置 path 下的 commit 活動；App 在保存配置 / 提交規則成功後觸發 Widget 刷新 |
| 2026-03-30 | 初始化 | 首次生成模塊文檔 |
