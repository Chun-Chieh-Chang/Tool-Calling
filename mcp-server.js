#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { loadRegistry, getToolById } from "./core/registry.js";
import { invokeInSandboxCapture } from "./core/sandbox.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const telemetryPromise = import("./core/telemetry.js").catch(() => null);

async function getTelemetry() {
  const mod = await telemetryPromise;
  return mod || null;
}

const server = new McpServer(
  {
    name: "tool-calling-mcp",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

server.tool(
  "list_tools",
  "列出所有已註冊的工具（可依分類過濾）",
  {
    category: z
      .string()
      .optional()
      .describe("依分類過濾（可選，例如 '文件生產力', '知識管理'）"),
  },
  async (args) => {
    try {
      const tools = loadRegistry().tools;
      let filtered = tools;

      if (args.category) {
        const cat = args.category.toLowerCase().trim();
        filtered = tools.filter(
          (t) =>
            t.category?.toLowerCase().includes(cat) ||
            cat.includes(t.category?.toLowerCase() || "")
        );
      }

      const result = filtered.map((t) => ({
        id: t.id,
        name: t.name,
        category: t.category,
        description: t.description?.slice(0, 200),
        status: t.status,
      }));

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({ total: result.length, tools: result }, null, 2),
          },
        ],
      };
    } catch (err) {
      return server.createToolError(`列出工具失敗: ${err.message}`);
    }
  }
);

server.tool(
  "search_tools",
  "搜尋工具（支援自然語言查詢與分類過濾），僅回傳摘要資訊作為初步意圖識別",
  {
    query: z.string().min(1).describe("搜尋查詢（支援中英文，例如 '我要做簡報'）"),
    category: z.string().optional().describe("依分類過濾（可選）"),
    topK: z.number().min(1).max(50).optional().describe("回傳前 K 筆（預設 5）"),
  },
  async (args) => {
    try {
      const { search } = await import("./core/search-engine.js");
      const tools = loadRegistry().tools;

      const telemetry = await getTelemetry();
      const telemetryStats = telemetry?.getTelemetryStats() || {};

      const results = search(tools, args.query, {
        topK: args.topK || 5,
        category: args.category,
        telemetryStats,
      });

      const output = results.map((r) => ({
        id: r.tool.id,
        name: r.tool.name,
        category: r.tool.category,
        description: r.tool.description?.slice(0, 300),
        score: r.score,
        matchLevel: r.matchLevel,
        matchedKeywords: r.matchedKeywords || [],
        useCase: r.tool.useCase || null,
        advantages: r.tool.advantages || [],
        constraints: r.tool.negativeConstraints || [],
      }));

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({ total: output.length, results: output }, null, 2),
          },
        ],
      };
    } catch (err) {
      return server.createToolError(`搜尋失敗: ${err.message}`);
    }
  }
);

server.tool(
  "get_tool_detail",
  "取得指定工具的完整註冊資訊（觸發詞、能力標籤、場景、優勢、安裝方式、禁用場景等）",
  {
    tool_id: z.string().min(1).describe("工具的唯一 ID（例如 'ppt-master'）"),
  },
  async (args) => {
    try {
      const tool = getToolById(args.tool_id);

      if (!tool) {
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({ error: `找不到工具: ${args.tool_id}` }, null, 2),
            },
          ],
          isError: true,
        };
      }

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(tool, null, 2),
          },
        ],
      };
    } catch (err) {
      return server.createToolError(`查詢工具失敗: ${err.message}`);
    }
  }
);

server.tool(
  "run_tool",
  "在 Docker 沙盒中執行指定工具（同步執行，容器執行期間 MCP 連線將等待完成）",
  {
    tool_id: z.string().min(1).describe("工具 ID"),
    args: z
      .array(z.string())
      .optional()
      .describe("傳遞給工具的引數陣列（例如 ['--help']）"),
  },
  async (args) => {
    const toolId = args.tool_id;
    const toolArgs = args.args || [];
    const startTime = Date.now();

    try {
      const tool = getToolById(toolId);
      if (!tool) {
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({ error: `找不到工具: ${toolId}` }, null, 2),
            },
          ],
          isError: true,
        };
      }

      const { installTool } = await import("./core/installer.js");
      const tempDir = join(__dirname, ".temp");
      const targetPath = installTool(tool, tempDir);

      const result = invokeInSandboxCapture(tool, targetPath, toolArgs);

      const telemetry = await getTelemetry();
      if (telemetry) {
        telemetry.recordTrace(
          toolId,
          toolArgs,
          result.exitCode,
          result.duration,
          result.error
        );
      }

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                tool_id: toolId,
                exitCode: result.exitCode,
                duration: result.duration,
                stdout: result.stdout,
                stderr: result.stderr,
                error: result.error,
              },
              null,
              2
            ),
          },
        ],
        isError: result.exitCode !== 0,
      };
    } catch (err) {
      const duration = Date.now() - startTime;
      const telemetry = await getTelemetry();
      if (telemetry) {
        telemetry.recordTrace(toolId, args.args || [], 1, duration, err.message);
      }
      return server.createToolError(`執行工具失敗: ${err.message}`);
    }
  }
);

async function main() {
  try {
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error("[MCP] Tool-Calling MCP server 已啟動 (STDIO)");
  } catch (err) {
    console.error("[MCP] 啟動失敗:", err.message);
    process.exit(1);
  }
}

main();
