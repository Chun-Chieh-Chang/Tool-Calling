import { loadRegistry, saveRegistry } from '../core/registry.js';

const API_KEY = process.env.AGNES_API_KEY;
if (!API_KEY) {
  console.error('Error: AGNES_API_KEY environment variable is missing.');
  console.error('Please set it using: $env:AGNES_API_KEY="your-key" (Windows) or export AGNES_API_KEY="your-key" (Mac/Linux)');
  process.exit(1);
}
const API_URL = 'https://apihub.agnes-ai.com/v1/chat/completions';
const MODEL = 'agnes-2.0-flash';
const CONCURRENCY = 5;

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function enrichTool(tool) {
  const prompt = `You are a technical AI assistant that enriches tool metadata for a registry.
Here is the tool context:
Name: ${tool.name}
Description: ${tool.description}
URL: ${tool.url}
Topics/Capabilities: ${tool.capabilities ? tool.capabilities.join(', ') : 'none'}
Existing Triggers: ${tool.triggers ? tool.triggers.join(', ') : 'none'}

Your task is to enrich the metadata and output ONLY a valid JSON object (without Markdown formatting) with these exact fields:
1. "description": A professional summary (under 100 chars). If the original contains "待補充描述" or is too short, write a new one by guessing its purpose from the Name and URL.
2. "useCase": A 1-sentence concrete scenario where this tool is highly useful.
3. "advantages": Array of 2 to 3 specific technical or functional advantages.
4. "negativeConstraints": Array of 1 to 3 scenarios where this tool should NOT be used.
5. "triggers": Array of at least 2 relevant trigger keywords. Keep good existing ones and add new ones if < 2.

Output ONLY the raw JSON object starting with { and ending with }.`;

  try {
    const res = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${API_KEY}`
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.2
      })
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`API Error ${res.status}: ${errText}`);
    }

    const data = await res.json();
    let content = data.choices[0].message.content.trim();
    
    // Clean up potential markdown formatting
    if (content.startsWith('```')) {
      content = content.replace(/^```json/, '').replace(/^```/, '').replace(/```$/, '').trim();
    }

    const enriched = JSON.parse(content);

    if (enriched.description) tool.description = enriched.description;
    if (enriched.useCase) tool.useCase = enriched.useCase;
    if (Array.isArray(enriched.advantages) && enriched.advantages.length > 0) tool.advantages = enriched.advantages;
    if (Array.isArray(enriched.negativeConstraints) && enriched.negativeConstraints.length > 0) tool.negativeConstraints = enriched.negativeConstraints;
    if (Array.isArray(enriched.triggers) && enriched.triggers.length >= 2) tool.triggers = enriched.triggers;

    // Validate if completely enriched
    if (
      tool.description && !tool.description.includes('待補充描述') &&
      tool.useCase &&
      tool.advantages?.length > 0 &&
      tool.negativeConstraints?.length > 0 &&
      tool.triggers?.length >= 2
    ) {
      tool.status = 'active';
    }
    
    return true;
  } catch (err) {
    console.error(`\x1b[31m[Error] Failed to enrich ${tool.id}:\x1b[0m`, err.message);
    return false;
  }
}

async function main() {
  console.log('\x1b[36m開始批次處理工具資料...\x1b[0m');
  const registry = loadRegistry();
  
  // Find tools that need enrichment
  const toolsToEnrich = registry.tools.filter(tool => {
    return (
      tool.status === 'experimental' ||
      !tool.useCase ||
      !tool.advantages || tool.advantages.length === 0 ||
      !tool.negativeConstraints || tool.negativeConstraints.length === 0 ||
      (tool.description && tool.description.includes('待補充描述')) ||
      !tool.triggers || tool.triggers.length < 2
    );
  });

  console.log(`共找到 \x1b[33m${toolsToEnrich.length}\x1b[0m 個工具需要補齊資料。`);

  let successCount = 0;
  
  // Process in chunks to respect concurrency
  for (let i = 0; i < toolsToEnrich.length; i += CONCURRENCY) {
    const chunk = toolsToEnrich.slice(i, i + CONCURRENCY);
    console.log(`處理批次 ${Math.floor(i / CONCURRENCY) + 1} / ${Math.ceil(toolsToEnrich.length / CONCURRENCY)}...`);
    
    const results = await Promise.all(chunk.map(async (tool) => {
      console.log(`  -> 正在處理: ${tool.name} (${tool.id})`);
      const success = await enrichTool(tool);
      return success;
    }));

    successCount += results.filter(Boolean).length;
    
    // Save state after each chunk
    saveRegistry(registry);
    
    // Delay between chunks to avoid rate limiting
    if (i + CONCURRENCY < toolsToEnrich.length) {
      await delay(2000);
    }
  }

  console.log(`\n\x1b[32m處理完成！成功補齊 ${successCount}/${toolsToEnrich.length} 個工具。\x1b[0m`);
}

main().catch(err => {
  console.error('\x1b[31m[Fatal Error]\x1b[0m', err);
  process.exit(1);
});
