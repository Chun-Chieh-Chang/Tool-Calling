#!/usr/bin/env node
/**
 * 文件數字門禁：README 與 AGENTS.md 宣稱的工具數必須等於實際筆數。
 *
 * 🔴 為什麼需要：2026-10-02 診斷發現工具數同時有三個版本
 *   （README 725 / AGENTS.md 731 / 實際 736）。AGENTS.md 由
 *   `npm run agents:init` 自動同步，README 沒有機制——本門禁補上。
 *   文件標記格式若有調整，請同步修改這裡的 regex。
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');

const registry = JSON.parse(readFileSync(path.join(ROOT, 'registry', 'tools.json'), 'utf8'));
const actual = registry.tools.length;

const failures = [];

const readme = readFileSync(path.join(ROOT, 'README.md'), 'utf8');
const mReadme = readme.match(/(\d+)\s*個頂尖開源/);
if (!mReadme) {
  failures.push('README.md 找不到「N 個頂尖開源」工具數標記');
} else if (Number(mReadme[1]) !== actual) {
  failures.push(`README.md 宣稱 ${mReadme[1]} 個工具，實際為 ${actual}（請更新 README 工具數段落，或跑 npm run agents:init 同步 AGENTS.md）`);
}

const agents = readFileSync(path.join(ROOT, 'AGENTS.md'), 'utf8');
const mAgents = agents.match(/工具庫規模:\s*(\d+)\s*個工具/);
if (!mAgents) {
  failures.push('AGENTS.md 找不到「工具庫規模: N 個工具」標記');
} else if (Number(mAgents[1]) !== actual) {
  failures.push(`AGENTS.md 宣稱 ${mAgents[1]} 個工具，實際為 ${actual}（跑 npm run agents:init 重新生成）`);
}

if (failures.length > 0) {
  console.error('❌ [Doc Stats Guard] 文件數字與 registry 不一致：');
  for (const f of failures) console.error(`  · ${f}`);
  process.exit(1);
}
console.log(`✅ [Doc Stats Guard] README / AGENTS.md 工具數 = 實際 ${actual} 筆`);
