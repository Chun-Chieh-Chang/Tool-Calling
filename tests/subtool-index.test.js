import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSubToolIndex, subToolTokenize } from '../core/subtool-index.js';
import { agentRetrieve } from '../core/agent-retrieval.js';

test('subToolTokenize：中英混合斷詞、連字號拆細與功能詞過濾', () => {
  const tokens = subToolTokenize('使用 oracle-to-postgres 工具進行資料庫遷移');
  assert.ok(tokens.includes('oracle-to-postgres'));
  assert.ok(tokens.includes('oracle'));
  assert.ok(tokens.includes('postgres'));
  assert.ok(tokens.includes('資料'));
  assert.ok(tokens.includes('料庫'));
  assert.ok(!tokens.includes('的工'), '不應包含功能詞 bigram');
});

test('subtool-index：有效覆蓋率需扣掉專用工具基準', () => {
  const tools = [
    {
      id: 'dedicated-cad',
      name: 'Dedicated CAD',
      category: '3D工程繪圖',
      language: 'python',
      status: 'active',
      triggers: ['cadquery', '3d cad'],
      capabilities: ['參數化 3D CAD 齒輪建模', '齒輪繪圖與工程匯出'],
      description: '參數化 3D CAD 腳本框架',
      description_zh: '參數化 3D CAD 腳本框架，支援齒輪與機械零件建模',
      useCase: '製作 3D 齒輪模型',
      install: { method: 'pip' },
    },
    {
      id: 'mega-collection',
      name: 'Mega Collection',
      category: '開發工具',
      language: 'other',
      status: 'active',
      triggers: ['mega skills'],
      capabilities: ['通用技能集合'],
      description: '各種開發技能集合',
      description_zh: '涵蓋多種工程與分析技能的集合',
      useCase: '多領域任務',
      install: { method: 'git' },
      subTools: [
        {
          name: 'cad-helper',
          description: 'CAD helper',
          description_zh: '參數化 3D CAD 齒輪建模輔助',
        },
        {
          name: 'vector-eval',
          description: 'Vector DB Evaluation',
          description_zh: '專門評估向量資料庫檢索品質與召回率指標',
        },
      ],
    },
  ];

  const idx = buildSubToolIndex(tools);
  const qCad = idx.prepareQuery('參數化 3D CAD 齒輪建模');
  const dedicatedCad = idx.bestDedicatedCoverage(qCad.tokens, qCad.norm);
  const collectionCad = idx.coverageOf('mega-collection', qCad.tokens, qCad.norm, 2);
  assert.ok(dedicatedCad > 0.5, '專用工具應覆蓋此查詢');
  assert.equal(Math.max(0, collectionCad - dedicatedCad), 0, '專用工具已覆蓋時集合有效覆蓋率應為 0');

  const qVec = idx.prepareQuery('評估向量資料庫檢索品質');
  const dedicatedVec = idx.bestDedicatedCoverage(qVec.tokens, qVec.norm);
  const collectionVec = idx.coverageOf('mega-collection', qVec.tokens, qVec.norm, 2);
  assert.ok(collectionVec - dedicatedVec > 0.5, '專用工具未覆蓋時集合應取得高有效覆蓋率');
});

test('subtool-index：單詞巧合防禦（minHits >= 2）', () => {
  const tools = [
    {
      id: 'skill-pack',
      name: 'Skill Pack',
      category: 'AI 代理',
      language: 'other',
      status: 'active',
      triggers: ['skill pack'],
      capabilities: ['技能包'],
      description: '技能包',
      useCase: '多領域技能',
      install: { method: 'git' },
      subTools: [
        {
          name: 'meeting-scheduler',
          description: 'Schedule meetings',
          description_zh: '自動預約會議室與行事曆排程',
        },
      ],
    },
  ];

  const idx = buildSubToolIndex(tools);
  const q = idx.prepareQuery('預約牙醫洗牙');
  const singleHitCov = idx.coverageOf('skill-pack', q.tokens, q.norm, 1);
  const guardedCov = idx.coverageOf('skill-pack', q.tokens, q.norm, 2);
  assert.ok(singleHitCov > 0, '未設防禦時單詞「預約」會產生覆蓋率');
  assert.equal(guardedCov, 0, 'minHits=2 時單詞巧合必須歸零');
});

test('agentRetrieve：整合 subtool-index 後可正確召回子功能對應的集合工具', () => {
  const tools = [
    {
      id: 'unrelated-tool',
      name: 'Unrelated Tool',
      category: '開發工具',
      language: 'python',
      status: 'active',
      triggers: ['lint code'],
      capabilities: ['程式碼靜態檢查'],
      description: 'Code linter',
      useCase: '檢查語法錯誤',
      install: { method: 'pip' },
    },
    {
      id: 'collection-pack',
      name: 'Collection Pack',
      category: 'AI 代理',
      language: 'other',
      status: 'active',
      triggers: ['collection pack'],
      capabilities: ['多領域技能集合'],
      description: 'Multi-domain skill pack',
      useCase: '多領域自動化任務',
      install: { method: 'git' },
      subTools: [
        {
          name: 'vector-bench',
          description: 'Vector benchmark',
          description_zh: '專門評估向量資料庫檢索品質與召回率指標的工具',
        },
      ],
    },
  ];

  const res = agentRetrieve(tools, '我要評估向量資料庫的檢索品質', { topK: 2, wiki: null });
  assert.equal(res.topK[0]?.id, 'collection-pack');
  assert.ok(res.topK[0].confidence >= 0.35, `期望高置信度，實得 ${res.topK[0].confidence}`);
});
