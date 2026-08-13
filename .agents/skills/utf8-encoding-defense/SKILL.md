---
name: utf8-encoding-defense
description: 自動防禦與修復 DEV_LOG.md 及專案檔案的 UTF-8 編碼亂碼問題。當使用者提及「亂碼」、「編碼」、「DEV_LOG 亂碼」、「修復亂碼」、「UTF-8」、「U+FFFD」或需要安全追加開發日誌時自動觸發。
metadata:
  type: procedural
---

# UTF-8 Encoding Defense & Recovery Skill

本 Skill 旨在解決 Windows CLI (PowerShell / CMD) 或 Node.js 檔案讀寫時，因預設系統編碼（ANSI/Big5/Windows-950）不一致而導致的 `DEV_LOG.md` 及核心 Markdown/JSON 檔案出現 `\uFFFD` (``) 亂碼問題。

---

## 核心防衛原則 (Preventive SOP)

### 1. 禁止在 Windows CLI 中直接使用 `>>` 或 `>` 追加內容
PowerShell 預設重定向會使用 Big5 或 UTF-16LE 寫入 UTF-8 檔案，造成不可逆的位元組截斷。
- **❌ 禁忌命令**：
  ```powershell
  echo "新增日誌" >> DEV_LOG.md
  ```
- **✅ 安全寫入命令 (Node.js 跨平台一字線)**：
  ```bash
  node -e "fs.appendFileSync('DEV_LOG.md', '\n新增日誌\n', 'utf8')"
  ```
- **✅ 安全寫入命令 (PowerShell utf8)**：
  ```powershell
  "新增日誌" | Out-File -FilePath DEV_LOG.md -Encoding utf8 -Append
  ```

### 2. Node.js 檔案讀寫強制指定 `'utf8'`
所有自動化腳本或核心處理器必須明確傳遞 `utf8` 編碼：
```javascript
import fs from 'fs';
const content = fs.readFileSync('DEV_LOG.md', 'utf8');
fs.writeFileSync('DEV_LOG.md', content, 'utf8');
```

---

## 亂碼自動偵測與確效 (Automated Guard)

專案內建 UTF-8 門禁檢測腳本 `scripts/check-utf8.js`，已整合至 `npm test` 中。
每當執行測試或提交前檢驗時，系統會自動掃描 `DEV_LOG.md`、`README.md`、`AGENTS.md` 及 `package.json` 是否包含 `U+FFFD` (``)。

執行手動檢驗命令：
```bash
node scripts/check-utf8.js
```

---

## 亂碼自動復原 SOP (Recovery Workflow)

當發現檔案已不幸產生亂碼（即包含 `\uFFFD`）時，請依照以下步驟恢復：

1. **搜尋全全歷史 Commit 尋找乾淨基準點**：
   ```bash
   node -e "const {execSync} = require('child_process'); const commits = execSync('git log --oneline DEV_LOG.md').toString().trim().split('\n'); commits.forEach(c => { const hash = c.split(' ')[0]; try { const content = execSync('git show ' + hash + ':DEV_LOG.md').toString('utf8'); const count = (content.match(/\uFFFD/g) || []).length; console.log(hash + ': U+FFFD count = ' + count); } catch(e){} });"
   ```
2. **提取最後一次 U+FFFD count = 0 的 Commit 哈希值 (如 `<HASH>`)**。
3. **提取現有 working tree 中最新撰寫且無亂碼的前 N 行最新日誌**。
4. **將「最新日誌」與 `<HASH>:DEV_LOG.md` 進行拼合並以 UTF-8 儲存**。
5. **運行 `node scripts/check-utf8.js` 驗證 0 亂碼成功**。
