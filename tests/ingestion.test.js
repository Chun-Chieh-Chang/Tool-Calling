import test from 'node:test';
import assert from 'node:assert/strict';
import { INGESTION_PIPELINES, listIngestionSources, planIngestion } from '../core/ingestion.js';

// 最小假工具庫：足以讓融合引擎跑起來，且離線可測
const TOOLS = [
  { id: 'pdf2md', name: 'Pdf2Md', category: '文件生產力', status: 'active',
    description_zh: '把 PDF 轉成 Markdown，保留表格與公式',
    description: 'Convert PDF to Markdown',
    triggers: ['pdf 轉 markdown', 'pdf 轉檔'], capabilities: ['pdf', 'markdown'],
    install: { method: 'pip', command: 'pip install pdf2md' }, language: 'Python' },
  { id: 'crawlee', name: 'Crawlee', category: '瀏覽器自動化', status: 'active',
    description_zh: '抓取網頁內容並轉成乾淨的 Markdown',
    description: 'Web scraping and crawling',
    triggers: ['網頁爬蟲', '爬網頁'], capabilities: ['crawler'],
    install: { method: 'npm' }, language: 'TypeScript' },
  { id: 'whisper', name: 'Whisper', category: '音訊', status: 'active',
    description_zh: '把語音或會議錄音轉成文字逐字稿',
    description: 'Speech to text',
    triggers: ['語音轉文字', '逐字稿'], capabilities: ['asr'],
    install: { method: 'pip' }, language: 'Python' },
];

test('ingestion: 列出支援的素材類型', () => {
  const list = listIngestionSources();
  assert.ok(list.length >= 5, '至少應有 pdf/web/audio/video/book');
  for (const s of list) {
    assert.ok(s.key && s.label, `${s.key} 應有 key 與 label`);
    assert.ok(s.stageCount >= 2, `${s.key} 應有 2 個以上階段`);
  }
});

test('ingestion: 每條管線的階段都帶可用的 query', () => {
  for (const [key, def] of Object.entries(INGESTION_PIPELINES)) {
    assert.ok(def.stages.length >= 2, `${key} 應有 2 個以上階段`);
    for (const s of def.stages) {
      assert.ok(s.key && s.label, `${key} 的階段缺少 key/label`);
      assert.ok(typeof s.query === 'string' && s.query.length > 4, `${key}.${s.key} 缺少 query`);
    }
  }
});

test('ingestion: 不支援的素材類型回傳 null', () => {
  assert.equal(planIngestion(TOOLS, 'carrier-pigeon'), null);
  assert.equal(planIngestion(TOOLS, ''), null);
  assert.equal(planIngestion(TOOLS, undefined), null);
});

test('ingestion: pdf 管線第一步選到 PDF 轉檔工具（大小寫不敏感）', () => {
  const p = planIngestion(TOOLS, 'PDF');
  assert.ok(p);
  assert.equal(p.sourceType, 'pdf', '應正規化為小寫 key');
  assert.equal(p.stages[0].key, 'parse');
  assert.equal(p.stages[0].recommendedTool?.id, 'pdf2md');
});

test('ingestion: 每個階段回傳工具或明確標註找不到（不硬湊）', () => {
  const p = planIngestion(TOOLS, 'audio');
  for (const s of p.stages) {
    if (s.recommendedTool) {
      assert.equal(s.warning, null);
      assert.ok(s.recommendedTool.id);
    } else {
      assert.ok(s.warning, '找不到工具時應給 warning，不能靜默留空');
    }
  }
});

test('ingestion: 找不到工具時管線仍完整（不崩潰）', () => {
  const junk = [{ id: 'zzz', name: 'Zzz', category: '其他', status: 'active',
    description_zh: '完全無關的工具', description: 'unrelated', triggers: ['qqq'] }];
  const p = planIngestion(junk, 'pdf');
  assert.ok(p, '管線本身不應因找不到工具而崩潰');
  assert.equal(p.stages.length, p.totalSteps);
  assert.ok(p.stages.some((s) => s.warning));
});

test('ingestion: 產生 ASCII 流程圖與摘要', () => {
  const p = planIngestion(TOOLS, 'web');
  assert.ok(typeof p.asciiPipeline === 'string');
  assert.ok(p.asciiPipeline.includes('Data Flow'), '流程圖應含資料流標記');
  assert.ok(p.summary.length > 0);
});

test('ingestion: topK 控制備選數量', () => {
  const few = planIngestion(TOOLS, 'pdf', { topK: 1 });
  const more = planIngestion(TOOLS, 'pdf', { topK: 3 });
  assert.equal(few.stages[0].alternatives.length, 0);
  assert.ok(more.stages[0].alternatives.length >= 1);
});

test('ingestion: 各階段的 query 彼此不同（管線不是同一步重複）', () => {
  for (const [key, def] of Object.entries(INGESTION_PIPELINES)) {
    const qs = def.stages.map((s) => s.query);
    assert.equal(new Set(qs).size, qs.length, `${key} 有重複的階段 query`);
  }
  // 階段 key 也不能重複，否則 UI 會顯示兩個同名步驟
  for (const [key, def] of Object.entries(INGESTION_PIPELINES)) {
    const ks = def.stages.map((s) => s.key);
    assert.equal(new Set(ks).size, ks.length, `${key} 有重複的階段 key`);
  }
});
