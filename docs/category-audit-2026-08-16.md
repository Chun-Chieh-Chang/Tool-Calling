# 工具庫分類全面稽核報告

> **稽核日期**:2026-08-16
> **稽核範圍**:registry/tools.json 全部 585 個工具 × 22 個分類
> **稽核方法**:啟發式關鍵字交叉比對 + 逐工具人工語義審查 + 分類規則原始碼審查
> **狀態**:✅ 已執行完畢(2026-08-16,經用戶確認 T1+T2 修正 + 兩項分類慣例)

---

## 一、執行摘要

| 指標 | 數量 |
|---|---|
| 稽核工具總數 | 585 |
| 實際修正(已執行) | **255**(T1=91 + T2=164) |
| T3 低信心(保留原分類) | 14 |
| 分類規則缺陷(reclassify-tools.js,已修正) | 8 項 |
| 分類體系設計問題(已確立慣例) | 4 項 |
| 驗證門禁 | npm test 75/75 ✓、validate 100/100 ✓、check-mece ✓ |

**核心結論**:誤分類並非隨機,而是 `scripts/reclassify-tools.js` 的 regex 規則有 8 項系統性缺陷,導致特定族群的工具被成批錯置。已由「scroll-world 事件」(規則 `/\b(3d|...)\b/` 匹配任何含 3d 的描述)驗證根因。

---

## 二、分類規則缺陷(reclassify-tools.js)

### R1.【嚴重】UI/UX 規則含 `agents` 關鍵字
- 位置:`scripts/reclassify-tools.js:69`
- 規則:`/\b(impeccable|agents|design-system|figma-plugin|web-design-guideline)\b/i`
- 影響:UI/UX設計 30 個工具中 15 個描述含 "agent",凡「for AI agents」的任何工具都被吸入 UI/UX設計
- 受害例:`fff`(檔案搜尋)、`lean-ctx`(token 壓縮)、`gitnexus`(程式碼知識圖譜)、`cocoindex`(索引引擎)、`destructivecommandguard`(命令防護)
- 修正:移除 `agents`,僅保留明確設計工具名稱

### R2.【嚴重】3D 規則 `/\b3d\b/` 過於寬鬆
- 位置:`scripts/reclassify-tools.js:204`
- 影響:scroll-world(3D 落地頁)誤入 3D工程繪圖
- 修正:改為 `cad|freecad|openscad|blender|bim|text-to-cad|3d model(ing)?|3d asset`,排除 landing page 語境

### R3.【嚴重】語言名稱 → 學習資源
- 位置:`scripts/reclassify-tools.js:148` — `/\b(typescript|javascript|python|rust|go)\b/i` → 學習資源
- 影響:任何提及程式語言的工具都會被判為學習資源(`scrapy`、`beautifulsoup4` 即因此誤置)
- 修正:刪除此規則,學習資源改用 `tutorial|course|roadmap|curriculum|handbook|面試|interview`

### R4.【中】`analytics` → 行銷
- 位置:`scripts/reclassify-tools.js:197`
- 影響:`ossie`(Apache 分析元資料標準)誤入行銷
- 修正:行銷規則移除 `analytics`,改用 `marketing|seo|social media|crm|advertisement`

### R5.【中】`memory|knowledge` → 知識管理 優先級不足(80)
- 影響:與 `agent`(90)規則衝突,導致 agent 記憶工具散落 AI 框架/AI 代理(mem0、cognee、supermemory、claude-mem…)
- 修正:優先級提升至 95,並確立「agent 記憶/RAG/知識圖譜 → 知識管理」慣例

### R6.【中】爬蟲規則只匹配 `crawl|scrape` 動詞,漏掉名詞形態
- 影響:`scrapy`、`beautifulsoup4`、`crawlee` 散落 學習資源/測試與自動化
- 修正:增加 `scraper|crawler|spider|puppeteer|headless`

### R7.【低】`api|sdk|integration` → API 整合 過寬
- 影響:`moviebox-tui`(影片串流 TUI)、`xlsxtohtmlconverter`(文件轉換)誤入
- 修正:增加排除條件,或降優先級至 70

### R8.【低】預設 fallback = 開發工具,形成 catch-all
- 影響:開發工具 94 個中含大量 skill 集合、3D 工具、金融工具、ML 框架
- 修正:無匹配時應標記為「待人工覆核」而非自動歸入開發工具

---

## 三、分類體系設計問題

### D1. 分類軸混雜(違反 MECE 單一劃分軸原則)
現有 22 分類同時混用兩種軸:
- **領域軸**:金融與投資、行銷、3D工程繪圖、研究、圖標與視覺資源
- **功能軸**:AI 框架、AI 代理、開發工具、瀏覽器自動化、測試與自動化

**建議慣例(不新增分類,現有架構可容納)**:**領域優先**——工具若屬特定領域(金融/行銷/3D/研究),先歸領域分類;否則依功能歸類。

### D2. AI 框架 vs AI 代理 邊界未定義
兩分類合計 256 個工具,邊界浮動導致同類工具隨機分布。

**建議定義**:
- **AI 框架** = 建構用的「積木」:LLM SDK/模型/推論引擎/訓練框架/agent 建構庫(langchain、llamafactory、sglang、smolagents、tensorflow)
- **AI 代理** = 可直接使用的「成品」:agent 本體/agent harness/skill 與 plugin 集合/agent 平台(codex、autogpt、Claude skills 系列)

### D3. 開發工具淪為垃圾桶分類(94 個)
含 8 個 skill 集合、3D 工具(threejs、imgtothree)、ML 框架(tensorflow、opencv)、金融工具(yfinance)。依 D1/D2 慣例梳理後可降至約 60 個真正泛用開發工具。

### D4. 行銷分類瀕臨空置(僅 1 個,且還是誤置的 ossie)
依領域優先慣例,`marketingskills`、`openreply`、`crm` 應移入,可恢復至 4 個。

---

## 四、T1 高信心錯置(89 個)— 明顯錯誤,建議直接修正

### 4.1 圖標庫誤置(7 個)
| ID | 現分類 | 建議 | 理由 |
|---|---|---|---|
| phosphor-icons | 開發工具 | 圖標與視覺資源 | 圖標庫本體 |
| remixicon | 開發工具 | 圖標與視覺資源 | 圖標庫本體 |
| bootstrap-icons | 開發工具 | 圖標與視覺資源 | 圖標庫本體 |
| material-design-icons | 開發工具 | 圖標與視覺資源 | 圖標庫本體 |
| fluentui-system-icons | 開發工具 | 圖標與視覺資源 | 圖標庫本體 |
| radix-ui-icons | UI/UX設計 | 圖標與視覺資源 | 圖標庫本體 |
| ant-design-icons | UI/UX設計 | 圖標與視覺資源 | 圖標庫本體 |

### 4.2 爬蟲/瀏覽器自動化誤置(9 個)
| ID | 現分類 | 建議 | 理由 |
|---|---|---|---|
| scrapy | 學習資源 | 瀏覽器自動化 | 爬蟲框架 |
| beautifulsoup4 | 學習資源 | 瀏覽器自動化 | HTML 解析/爬蟲生態 |
| crawlee | 測試與自動化 | 瀏覽器自動化 | 爬蟲框架 |
| crawl4ai | AI 框架 | 瀏覽器自動化 | 爬蟲框架 |
| firecrawl | AI 框架 | 瀏覽器自動化 | 網頁擷取 API |
| firecrawl-skills | AI 框架 | 瀏覽器自動化 | 爬蟲技能 |
| firecrawl-cli-skills | UI/UX設計 | 瀏覽器自動化 | 爬蟲技能(R1 受害) |
| ego-lite | AI 代理 | 瀏覽器自動化 | agent 瀏覽器 |
| browser-harness | AI 框架 | 瀏覽器自動化 | 瀏覽器自動化框架 |
| browser-act-automation | AI 框架 | 瀏覽器自動化 | 瀏覽器自動化 CLI |

### 4.3 文件/簡報工具誤置(14 個)
| ID | 現分類 | 建議 | 理由 |
|---|---|---|---|
| aippt | AI 框架 | 文件生產力 | PPT 生成 |
| officecli | AI 代理 | 文件生產力 | Office 自動化 |
| officecli-officecli | AI 框架 | 文件生產力 | Office 生成 |
| markitdown | AI 框架 | 文件生產力 | 文件轉 Markdown |
| pdf2md-agent-skill | AI 框架 | 文件生產力 | 文件轉 Markdown |
| llmsherpa | AI 框架 | 文件生產力 | PDF 結構化解析 |
| nblm2pptx | AI 框架 | 文件生產力 | PDF→PPTX |
| codex-ppt-skill | AI 框架 | 文件生產力 | PPT 生成 |
| zarazhangrui-frontend-slides | AI 框架 | 文件生產力 | 簡報生成 |
| presentation-report-preflight | AI 框架 | 文件生產力 | 簡報前置 |
| guizang-ppt-skill | 多媒體生成 | 文件生產力 | HTML 簡報 |
| data-to-html | 開發工具 | 文件生產力 | 資料轉 HTML |
| exceltohtml | 開發工具 | 文件生產力 | Excel 轉換 |
| excel-to-html | 開發工具 | 文件生產力 | Excel 轉換 |
| xlsxtohtmlconverter | API 整合 | 文件生產力 | XLSX 轉換 |

### 4.4 影片/音訊/多媒體誤置(11 個)
| ID | 現分類 | 建議 | 理由 |
|---|---|---|---|
| ai-short-video-engine | AI 代理 | 影片 | 短視頻生成 |
| moneyprinterturbo | AI 框架 | 影片 | 視頻生成 |
| seedance-20 | 開發工具 | 影片 | AI 影視管線 |
| story-to-handdrawn-video | AI 代理 | 影片 | 手繪動畫生成 |
| moviebox-tui | API 整合 | 影片 | 串流 TUI |
| comfyui | API 整合 | 多媒體生成 | 擴散模型 GUI |
| comfyui-mcp | 影片 | 多媒體生成 | ComfyUI 控制平面 |
| imaginairy | AI 框架 | 多媒體生成 | AI 影像生成套件 |
| gc-minimal-zine-poster | 開發工具 | 多媒體生成 | 海報圖像生成 |
| easyvoice | 多媒體生成 | 音訊 | TTS 工具 |
| voicebox | 多媒體生成 | 音訊 | 語音工作室 |

### 4.5 3D 工具誤置(6 個)
| ID | 現分類 | 建議 | 理由 |
|---|---|---|---|
| blender | 影片 | 3D工程繪圖 | 3D 建模套件 |
| cadquery | 學習資源 | 3D工程繪圖 | CAD 腳本框架 |
| text-to-cad | AI 代理 | 3D工程繪圖 | CAD 生成技能 |
| imgtothree | 開發工具 | 3D工程繪圖 | 圖轉 3D 模型 |
| img2threejs | AI 框架 | 3D工程繪圖 | 圖轉 3D 模型 |
| trellis2 | 多媒體生成 | 3D工程繪圖 | 3D 資產生成 |

### 4.6 金融領域誤置(9 個)
| ID | 現分類 | 建議 | 理由 |
|---|---|---|---|
| daily-stock-analysis | AI 框架 | 金融與投資 | 股票分析系統 |
| tradingagents | AI 框架 | 金融與投資 | 交易 agent |
| ai-trader | AI 框架 | 金融與投資 | 交易平台 |
| hkuds-vibe-trading | AI 框架 | 金融與投資 | 交易系統 |
| agent-vibe-trading-personal | AI 代理 | 金融與投資 | 個人交易 agent |
| qlib | 研究 | 金融與投資 | 量化平台 |
| yfinance | 開發工具 | 金融與投資 | 金融數據庫 |
| ai-berkshire | 開發工具 | 金融與投資 | 價投研究 |
| financial-services | 開發工具 | 金融與投資 | 金融分析 |

### 4.7 學習資源誤置(雙向,13 個)
| ID | 現分類 | 建議 | 理由 |
|---|---|---|---|
| tensorflow | 開發工具 | AI 框架 | ML 框架 |
| opencv | 開發工具 | AI 框架 | CV 庫 |
| supervision | 學習資源 | AI 框架 | CV 工具庫 |
| posthog | 學習資源 | 數據分析 | 產品分析平台 |
| terax-ai | 學習資源 | 開發工具 | AI 開發工作區 |
| ohmyzsh | 學習資源 | 開發工具 | zsh 框架 |
| javaguide | AI 代理 | 學習資源 | 面試指南 |
| ai-agent-book | AI 代理 | 學習資源 | 書籍 |
| hugging-multi-agent | AI 代理 | 學習資源 | 教學 |
| agents-course | AI 框架 | 學習資源 | HF 課程 |
| ai-engineering-from-scratch | UI/UX設計 | 學習資源 | 教學指南(R1 受害) |
| generative-ai-for-beginners | 多媒體生成 | 學習資源 | 課程 |
| freecodecamp | UI/UX設計 | 學習資源 | 程式課程(R1 受害) |

### 4.8 AI 模型/推論引擎誤置(8 個)
| ID | 現分類 | 建議 | 理由 |
|---|---|---|---|
| kimi-k3 | 開發工具 | AI 框架 | LLM 模型 |
| h3-c | 開發工具 | AI 框架 | 推論引擎 |
| warp | 開發工具 | AI 框架 | 推論引擎 |
| rapid-mlx | 基礎設施 | AI 框架 | 本地推論 |
| weathernext | 開發工具 | AI 框架 | 氣象模型 |
| glm-5 | AI 代理 | AI 框架 | LLM 模型本體 |
| step-37-flash | 開發工具 | AI 框架 | LLM 模型 |
| minimax-h3 | 多媒體生成 | AI 框架 | 通用 LLM |

### 4.9 其他明顯錯置(12 個)
| ID | 現分類 | 建議 | 理由 |
|---|---|---|---|
| openai-agents-js | 音訊 | AI 框架 | 多代理 SDK |
| rag-anything | 影片 | 知識管理 | RAG 框架 |
| anthropic-cybersecurity-skills | AI 框架 | 安全性 | 資安技能 |
| cybersecurity-skills | AI 框架 | 安全性 | 資安技能 |
| claude-code-cybersecurity-skill | AI 框架 | 安全性 | 資安技能 |
| code-review-skill | 安全性 | 開發工具 | 代碼審查 |
| maigret | 開發工具 | 安全性 | OSINT |
| dopamine | AI 代理 | 安全性 | iOS 越獄 |
| ossie | 行銷 | 數據分析 | 分析元資料標準 |
| fff | UI/UX設計 | 開發工具 | 檔案搜尋(R1 受害) |
| next.js | API 整合 | UI/UX設計 | React 框架 |
| tailwindcss | 開發工具 | UI/UX設計 | CSS 框架 |

---

## 五、T2 中信心錯置(102 個)— 一致性統一,建議修正

### 5.1 Skill/Plugin 集合統一 → AI 代理(38 個)
依 D2 慣例(agent 生態的 skill/plugin/subagent 集合 → AI 代理):

`anthropic-claude-skills`、`claude-skills`、`awesome-agent-skills-VoltAgent`、`baoyu-skills`、`agent-toolkit`、`tapestry-skills-for-claude-code`、`caveman`、`virgiliojr94-book-to-skill`、`book-skill-generator`、`obsidian-skills`、`i-have-adhd`、`adhd`、`skills`(Google)、`hermesskill`、`oh-my-hermes-rlaope`、`oh-my-hermes-salomondiei08`、`awesome-claude-skills`、`awesome-claude-code-subagents`、`awesome-codex-subagents`、`claude-code-debug-mode`、`claude-plugins-official`、`first-principles-skill`、`mermaid-syntax-skill`、`agent-skills-manager`、`sequential-thinking-skill`、`gstack`、`slavingia-skills`、`awesome-openclaw-skills`、`huggingface-skills`、`microsoft-official-skills`、`nvidia-skills`、`claudemd`、`codex-plugin-cc`、`agentic-awesome-skills`、`ponytail`、`claude-for-legal`、`claude-legal-skill`、`taiwan-claude-legal`(現多為 AI 框架/開發工具/UI/UX設計)

### 5.2 記憶/RAG/知識圖譜統一 → 知識管理(19 個)
依 R5 慣例:

`graphify`(資料庫)、`code-graph-rag`(資料庫)、`codebase-memory-mcp`(資料庫)、`claude-mem`(AI 框架)、`mem0`(AI 框架)、`cognee`(AI 代理)、`memmy-agent`(AI 代理)、`supermemory`(AI 代理)、`optmem`(AI 代理)、`tencentdb-agent-memory`(AI 框架)、`memos-MemTensor`(AI 框架)、`memos`(文件生產力)、`claude-obsidian`(AI 框架)、`khoj`(AI 框架)、`context-hub`(AI 代理)、`context-hub-skill`(AI 代理)、`antigravity-notebooklm-mcp`(API 整合)、`khunotebooklmmcp`(AI 代理)、`notebooklm-skill-PleasePrompto`(AI 框架)、`gitnexus`(UI/UX)、`codegraph`(UI/UX)、`cocoindex`(UI/UX)、`context7`(AI 框架)

### 5.3 Coding Agent 統一 → AI 代理(9 個)
依 D2 慣例(成品 agent → AI 代理,與 codex/agnescode/openhole 一致):

`aider`、`openhands`、`oh-my-pi`、`nousresearch-hermes-coding-agent`、`gemini-cli`(現 AI 框架)、`goose`、`qwenpaw`(現 AI 框架)、`jcode`、`deepseek-harness`、`deepseek-harness-desktop`

### 5.4 Agent 建構庫統一 → AI 框架(9 個)
`eigenflux-arena`、`labs-oo-agents`、`axisagentic`、`avernet`、`smolagents`(現開發工具)、`harness-sdk`(現 API 整合)、`langgraph`(現 AI 代理)、`ruflo`(現 UI/UX)、`lingbot-map`(現影片)

### 5.5 文字去 AI 味工具統一 → 文件生產力(9 個)
`humanizer`(AI 代理)、`humanizer-zh`(AI 框架)、`humanizer-zh-tw`、`stop-slop`、`ai-flavor-remover`、`no-ai-slop`(開發工具)、`remove-ai-flavor-writing-skill`(AI 框架)、`shuorenhua`、`de-ai-prompt-enhancer-writer-booster-skill`(AI 代理)

### 5.6 挑選性其他 T2(其餘)
| ID | 現分類 | 建議 | 理由 |
|---|---|---|---|
| awesome-notebooklm-prompts | AI 框架 | 文件生產力 | 簡報提示詞 |
| claude-world-notebooklm | AI 框架 | 文件生產力 | 內容工作流 |
| ghost | 開發工具 | 文件生產力 | 內容發佈平台 |
| video-use | AI 代理 | 影片 | 視頻剪輯自動化 |
| openmontage | AI 代理 | 影片 | 影片製作系統 |
| stable-diffusion-webui-localization-zhtw | AI 框架 | 多媒體生成 | SD 生態 |
| runcomfy-intent-skills | API 整合 | 多媒體生成 | ComfyUI 技能 |
| doany-comfyui-skills | AI 代理 | 多媒體生成 | ComfyUI 技能 |
| book2skills | AI 框架 | 金融與投資 | 投資技能(領域優先) |
| kronos | 數據分析 | 金融與投資 | 金融時序模型 |
| pandas-ai | AI 代理 | 數據分析 | 數據對話分析 |
| marketingskills | AI 框架 | 行銷 | 行銷工具箱 |
| openreply | API 整合 | 行銷 | 社群自動化 |
| last30days-skill-cn | AI 框架 | 研究 | 中文研究報告 |
| mathmodelagent | AI 代理 | 研究 | 研究論文生成 |
| claude-opus-5md / opus-5md / systempromptsleaks / claude-system-prompt / system-prompts-and-models-of-ai-tools | AI 框架×3/AI 代理×2 | 研究 | 洩漏提示詞研究(與 cl4r1t4s 一致) |
| awesome / awesome-python / awesome-mac | 研究 | 學習資源 | 精選清單 |
| karpathy-llm-wiki | AI 框架 | 學習資源 | 教學資源 |
| claude-code-best-practice / claude-code-guide / workbuddyguide | AI 框架 | 學習資源 | 使用指南 |
| ai-engineering-from-scratch-zh | AI 代理 | 學習資源 | 課程 |
| deeptutor | 開發工具 | 學習資源 | 學習導師 |
| howtheytest | 知識管理 | 學習資源 | 精選資源 |
| llms-from-scratch | 開發工具 | 學習資源 | 書籍 |
| theremotefreelancer | 開發工具 | 學習資源 | 求職資源 |
| code-review-graph | 學習資源 | 開發工具 | 代碼審查工具 |
| headroom | AI 框架 | 開發工具 | token 壓縮 |
| rtk | AI 代理 | 開發工具 | token 壓縮 |
| open-code-review | AI 框架 | 開發工具 | 代碼審查 |
| cockpit-tools | AI 代理 | 開發工具 | IDE 帳號管理 |
| cc-switch | AI 框架 | 開發工具 | 供應商管理器 |
| lean-ctx | UI/UX設計 | 開發工具 | token 壓縮(R1 受害) |
| destructivecommandguard | UI/UX設計 | 開發工具 | 命令防護(R1 受害) |
| prime-agent / paperclip / firstmate | 開發工具 | AI 代理 | agent 平台 |
| executor | AI 代理 | API 整合 | API 呼叫層 |
| qu-integration-skills | UI/UX設計 | API 整合 | API 技能(R1 受害) |
| tdd | AI 代理 | 測試與自動化 | TDD 工作流 |
| kane-cli | 開發工具 | 測試與自動化 | 測試生成 |
| web-quality-skills | AI 框架 | 測試與自動化 | Lighthouse 品質 |
| trailofbits-skills | 開發工具 | 安全性 | 資安技能 |
| threejs | 開發工具 | 3D工程繪圖 | 3D 圖形庫 |
| fanqiang | 學習資源 | 基礎設施 | 代理工具聚合 |
| ontology-ontio | 學習資源 | 基礎設施 | 區塊鏈協議 |
| open-saas | 基礎設施 | 開發工具 | SaaS 樣板 |
| best-deals-bot | 基礎設施 | 瀏覽器自動化 | 比價爬蟲 |
| anime / animejs-v4-ai-guidelines / gsap-skills / oil-motion | 影片×2/開發工具×2 | UI/UX設計 | 網頁動畫 |
| codex-dream-skin | 開發工具 | UI/UX設計 | 主題外觀 |
| impeccable / designmd / figma-generate-library | 圖標與視覺資源 | UI/UX設計 | 設計系統(非圖標) |
| design-md-chrome | AI 框架 | UI/UX設計 | 樣式擷取 |
| frontend-design / emil-design-skills / ui-ux-pro-max-skill / ui-ux-pro-max-skill-cn / premium-frontend-ui-skill / openai-figma-implement-skill / archify / lanshu-animated-architecture-diagram | AI 代理×5/AI 框架×1/圖標×1 | UI/UX設計 | 設計技能 |
| geolibre | 基礎設施 | 數據分析 | GIS 分析 |
| ontology-playground / ontology | 開發工具 | 知識管理 | 本體論工具 |

---

## 六、T3 低信心(14 個)— 需用戶裁決,預設不動

| ID | 現分類 | 可能歸屬 | 說明 |
|---|---|---|---|
| ruview | AI 框架 | 基礎設施/研究 | WiFi 感測硬體,無理想分類 |
| worldmonitor | AI 代理 | 研究 | 情報儀表板 |
| crm | AI 代理 | 行銷 | agentic CRM |
| gnome-orca | 開發工具 | UI/UX設計 | 螢幕閱讀器(無障礙) |
| dbskill | AI 代理 | 數據分析 | 商業診斷技能 |
| reader3 | 文件生產力 | 知識管理 | RAG 閱讀 |
| ai-job-search | AI 框架 | AI 代理 | 求職框架 |
| knowledge-work-plugins | AI 框架 | 文件生產力 | 知識工作者插件 |
| gpt-5-6-instruct | AI 框架 | 研究/安全性 | 越獄提示詞 |
| conversation-steganography | AI 框架 | 安全性 | LLM 隱寫術 |
| 996-icu | 開發工具 | 學習資源 | 勞權倡議文件 |
| linux | 開發工具 | 基礎設施 | 核心原始碼 |
| exercises-dataset | 影片 | (無理想分類) | 健身資料集 |
| heilcheng-awesome-agent-skills | AI 代理 | 學習資源 | 教學目錄 |

---

## 七、修正執行方案(✅ 已全部完成 2026-08-16)

1. ✅ **批次修正** `registry/tools.json` + 同步 `registry/tracked-repos.json`(255 項)
2. ✅ **修正分類規則** `scripts/reclassify-tools.js`(R1–R8,並改為 dry-run 建議模式,避免未來覆蓋人工修正)
3. ✅ **新增分類慣例文件** `docs/category-conventions.md`(記錄 D1/D2 決議)
4. ✅ **重新生成** `docs/knowledge-graph.html`
5. ✅ **執行三項門禁**:`npm test`(75/75)、`node cli.js validate`(100/100)、`node scripts/check-mece.js`
6. ✅ 更新 DEV_LOG.md

**修正後分類分布**(255 項搬移,總計 585):
AI 代理 119、AI 框架 77、開發工具 54、文件生產力 51、學習資源 46、UI/UX設計 35、知識管理 31、金融與投資 25、影片 23、瀏覽器自動化 16、圖標與視覺資源 16、研究 14、安全性 13、多媒體生成 13、3D工程繪圖 10、音訊 9、測試與自動化 8、API 整合 8、數據分析 7、基礎設施 5、資料庫 3、行銷 2

---

*本報告由分類全面稽核產生,資料快照:registry/tools.json @ 2026-08-16(scroll-world 已修正後)*
