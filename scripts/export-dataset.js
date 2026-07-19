import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

/**
 * 匯出 Telemetry 為 SFT 格式 (OpenAI Chat ML)
 * @param {object[]} tools - 註冊表中的工具列表
 * @param {string} outputPath - 輸出的 jsonl 檔案路徑
 */
export function exportDataset(tools, outputPath) {
  const tracesFile = join(homedir(), '.tool-calling', 'traces', 'traces.jsonl');
  
  if (!existsSync(tracesFile)) {
    throw new Error('找不到軌跡檔案: ' + tracesFile);
  }

  const lines = readFileSync(tracesFile, 'utf-8').split('\n').filter(Boolean);
  const dataset = [];

  for (const line of lines) {
    try {
      const trace = JSON.parse(line);
      // 只萃取成功的執行紀錄
      if (trace.success) {
        // 因隱私因素被遮蔽的參數，無法作為有效的 SFT 訓練資料
        if (trace.args === '[REDACTED]') {
          continue;
        }

        const tool = tools.find(t => t.id === trace.toolId);
        if (!tool) continue;

        // 構建 OpenAI Chat ML 格式
        const data = {
          messages: [
            {
              role: "system",
              content: "You are a helpful AI assistant equipped with the tool-calling CLI. Use the CLI to fulfill the user's request."
            },
            {
              role: "user",
              content: `Please execute the tool "${tool.name}". Description: ${tool.description}. Arguments: ${trace.args || 'None'}`
            },
            {
              role: "assistant",
              content: `<thought>I will invoke the tool "${tool.id}" via the CLI to fulfill this request.</thought>\n\`\`\`bash\nnode cli.js invoke ${tool.id} ${trace.args}\n\`\`\``
            }
          ]
        };
        dataset.push(JSON.stringify(data));
      }
    } catch (e) {
      // 忽略錯誤行
    }
  }

  if (dataset.length === 0) {
    console.log('\x1b[33m警告:\x1b[0m 尚未有任何成功的執行軌跡可供萃取。');
    return;
  }

  writeFileSync(outputPath, dataset.join('\n'), 'utf-8');
  console.log(`\x1b[32m✓ 成功萃取 ${dataset.length} 筆資料至 ${outputPath}\x1b[0m`);
}
