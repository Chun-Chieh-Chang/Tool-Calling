#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { loadRegistry, getToolById } from "./core/registry.js";
import { createJob, getJob, cancelJob, listJobs, getStats } from "./core/job-manager.js";
import { 
  searchAllSkills, 
  installSkill, 
  isSkillCliAvailable 
} from "./core/skill-discovery.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const telemetryPromise = import("./core/telemetry.js").catch(() => null);

async function getTelemetry() {
  const mod = await telemetryPromise;
  return mod || null;
}

const server = new McpServer(
  { name: "tool-calling-mcp", version: "2.0.0" },
  { capabilities: { tools: {} } }
);

server.tool(
  "list_tools",
  "列出所有已註冊的工具（可依分類過濾）",
  { category: z.string().optional().describe("依分類過濾（可選）") },
  async (args) => {
    try {
      const tools = loadRegistry().tools;
      let filtered = tools;
      if (args.category) {
        const cat = args.category.toLowerCase().trim();
        filtered = tools.filter(
          (t) => t.category?.toLowerCase().includes(cat) || cat.includes(t.category?.toLowerCase() || "")
        );
      }
      const result = filtered.map((t) => ({
        id: t.id, name: t.name, category: t.category,
        description: t.description?.slice(0, 200), status: t.status,
      }));
      return { content: [{ type: "text", text: JSON.stringify({ total: result.length, tools: result }, null, 2) }] };
    } catch (err) {
      return server.createToolError(`列出工具失敗: ${err.message}`);
    }
  }
);

server.tool(
  "search_tools",
  "搜尋工具（支援自然語言查詢與分類過濾；預設使用融合引擎，含誠實訊號）",
  {
    query: z.string().min(1).describe("搜尋查詢（例如 '我要做簡報'）"),
    category: z.string().optional().describe("依分類過濾"),
    topK: z.number().min(1).max(50).optional().describe("回傳前 K 筆（預設 5）"),
    mode: z.enum(["auto", "lexical", "agent"]).optional().describe(
      "檢索模式：auto（預設，融合 L2 + agent-retrieval，含誠實訊號）／lexical（只用 L2 關鍵字）／agent（只用 agent-retrieval 四維度）"
    ),
  },
  async (args) => {
    try {
      const tools = loadRegistry().tools;
      const telemetry = await getTelemetry();
      const telemetryStats = telemetry?.getTelemetryStats() || {};

      if (args.mode === "lexical") {
        // 純 L2 關鍵字（舊行為，供調試）
        const { search } = await import("./core/search-engine.js");
        const results = search(tools, args.query, {
          topK: args.topK || 5,
          category: args.category,
          telemetryStats,
        });
        const output = results.map((r) => ({
          id: r.tool.id, name: r.tool.name, category: r.tool.category,
          description: (r.tool.description || "").slice(0, 300), score: r.score,
          matchLevel: r.matchLevel, advantages: r.tool.advantages || [],
        }));
        return { content: [{ type: "text", text: JSON.stringify({
          total: output.length, mode: "lexical", results: output,
        }, null, 2) }] };
      }

      if (args.mode === "agent") {
        // 純 agent-retrieval（供調試）
        const { agentRetrieve } = await import("./core/agent-retrieval.js");
        const r = agentRetrieve(tools, args.query, { topK: args.topK || 5 });
        const output = r.topK.map((x) => ({
          id: x.id, name: x.name, category: x.category,
          score: x.score, confidence: x.confidence,
          triggerHit: x.triggerHit || null, reasons: x.reasons,
          perDimension: x.perDimension,
        }));
        return { content: [{ type: "text", text: JSON.stringify({
          total: output.length, mode: "agent",
          decision: r.decision, fallbackHint: r.fallbackHint,
          matched: r.matched, totalCandidates: r.totalCandidates,
          results: output,
        }, null, 2) }] };
      }

      // 預設 auto：融合 L2 + agent-retrieval
      const { retrieve } = await import("./core/retrieval-fusion.js");
      const r = retrieve(tools, args.query, {
        topK: args.topK || 5,
        category: args.category,
        telemetryStats,
      });
      const output = r.results.map((x) => ({
        id: x.id, name: x.name, category: x.category,
        description: x.description,
        score: x.score, matchLevel: x.matchLevel, source: x.source,
        confidence: x.confidence ?? null,
        reasons: x.reasons,
      }));
      return { content: [{ type: "text", text: JSON.stringify({
        total: output.length,
        mode: "auto (fusion)",
        decision: r.decision,
        confidence: r.confidence,
        fallbackHint: r.fallbackHint,
        source: r.source,
        agentConsistentCount: r.agentConsistentCount,
        l2Leads: r.l2Leads,
        matched: r.matched,
        totalCandidates: r.totalCandidates,
        results: output,
      }, null, 2) }] };
    } catch (err) {
      return server.createToolError(`搜尋失敗: ${err.message}`);
    }
  }
);

server.tool(
  "get_tool_detail",
  "取得指定工具的完整註冊資訊",
  { tool_id: z.string().min(1).describe("工具 ID") },
  async (args) => {
    const tool = getToolById(args.tool_id);
    if (!tool) {
      return { content: [{ type: "text", text: JSON.stringify({ error: `找不到工具: ${args.tool_id}` }) }], isError: true };
    }
    return { content: [{ type: "text", text: JSON.stringify(tool, null, 2) }] };
  }
);

// === Async Job Execution (Phase 5) ===

server.tool(
  "run_tool_async",
  "提交工具執行任務至背景作業系統",
  {
    tool_id: z.string().min(1).describe("工具 ID"),
    args: z.array(z.string()).optional().describe("引數陣列"),
    timeout_seconds: z.number().min(10).max(600).optional().describe("超時秒數（預設 120）"),
  },
  async (args) => {
    const toolId = args.tool_id;
    const toolArgs = args.args || [];
    const tool = getToolById(toolId);
    if (!tool) {
      return { content: [{ type: "text", text: JSON.stringify({ error: `找不到工具: ${toolId}` }) }], isError: true };
    }
    const { installTool } = await import("./core/installer.js");
    const targetPath = join(__dirname, ".temp");
    const { job_id } = createJob({ tool_id: toolId, args: toolArgs, tool, targetPath, timeout_seconds: args.timeout_seconds });
    const { executeJob } = await import("./core/job-manager.js");
    executeJob(job_id); // fire and forget — caller polls via get_job_status
    const telemetry = await getTelemetry();
    if (telemetry) telemetry.recordTrace(toolId, toolArgs, -1, 0, "Job started");
    return { content: [{ type: "text", text: JSON.stringify({ job_id, status: "pending", message: "使用 get_job_status 查詢進度" }, null, 2) }] };
  }
);

server.tool(
  "get_job_status",
  "查詢作業執行狀態與結果",
  { job_id: z.string().min(1).describe("作業 ID") },
  async (args) => {
    const job = getJob(args.job_id);
    if (!job) return { content: [{ type: "text", text: JSON.stringify({ error: `找不到作業: ${args.job_id}` }) }], isError: true };
    return { content: [{ type: "text", text: JSON.stringify({
      job_id: job.job_id, tool_id: job.tool_id, status: job.status,
      exit_code: job.exit_code, stdout: job.stdout?.slice(0, 5000),
      stderr: job.stderr?.slice(0, 2000), error: job.error,
      duration_ms: job.duration_ms, created_at: job.created_at, completed_at: job.completed_at,
    }, null, 2) }] };
  }
);

server.tool(
  "cancel_job",
  "取消進行中的作業",
  { job_id: z.string().min(1).describe("作業 ID") },
  async (args) => {
    const result = cancelJob(args.job_id);
    return { content: [{ type: "text", text: JSON.stringify(result) }], isError: !result.success };
  }
);

server.tool(
  "list_jobs",
  "列出近期作業記錄",
  {
    limit: z.number().min(1).max(50).optional().describe("數量（預設 20）"),
    status: z.enum(["pending", "running", "completed", "failed", "cancelled", "timeout"]).optional(),
    tool_id: z.string().optional(),
  },
  async (args) => {
    const jobs = listJobs({ limit: args.limit || 20, status: args.status, tool_id: args.tool_id });
    return { content: [{ type: "text", text: JSON.stringify({
      total: jobs.length,
      jobs: jobs.map((j) => ({ job_id: j.job_id, tool_id: j.tool_id, status: j.status, created_at: j.created_at, completed_at: j.completed_at, duration_ms: j.duration_ms })),
    }, null, 2) }] };
  }
);

server.tool(
  "get_job_stats",
  "取得作業統計資訊",
  {},
  async () => {
    return { content: [{ type: "text", text: JSON.stringify(getStats(), null, 2) }] };
  }
);

// === Skill Discovery Tools (Phase 6) ===

server.tool(
  "find_skill",
  "搜尋 AI Agent Skills（支援 skills.sh 與 GitHub 多來源聚合）",
  {
    query: z.string().min(1).describe("搜尋關鍵字（例如 'pdf', 'typescript testing', 'ppt'）"),
    limit: z.number().min(1).max(50).optional().describe("回傳結果數量上限（預設 10）"),
  },
  async (args) => {
    try {
      if (!isSkillCliAvailable()) {
        return { 
          content: [{ 
            type: "text", 
            text: JSON.stringify({ 
              success: false, 
              error: "npx skills CLI 暫時不可用",
              hint: "請確保已安裝 Node.js 和 npx" 
            }) 
          }],
          isError: true 
        };
      }

      const skills = await searchAllSkills(args.query, args.limit || 10);
      
      return { 
        content: [{ 
          type: "text", 
          text: JSON.stringify({ 
            success: true, 
            count: skills.length,
            query: args.query,
            skills: skills.map(s => ({
              id: s.id,
              name: s.name,
              description: s.description,
              source: s.source,
              url: s.url,
              installs: s.installs,
              tags: s.tags,
              score: s.score
            }))
          }, null, 2) 
        }] 
      };
    } catch (err) {
      return server.createToolError(`搜尋技能失敗: ${err.message}`);
    }
  }
);

server.tool(
  "install_skill",
  "安裝 AI Agent Skill",
  {
    skill_id: z.string().min(1).describe("技能 ID（格式：owner/repo@skill-name 或完整 URL）"),
    global: z.boolean().optional().describe("是否全域安裝（預設 false）"),
    agent: z.string().optional().describe("指定目標 Agent（例如 'claude-code', 'cursor'）"),
  },
  async (args) => {
    try {
      const result = await installSkill(args.skill_id, {
        global: args.global || false,
        agent: args.agent || null
      });

      return { 
        content: [{ 
          type: "text", 
          text: JSON.stringify(result, null, 2) 
        }] 
      };
    } catch (err) {
      return server.createToolError(`安裝技能失敗: ${err.message}`);
    }
  }
);

async function main() {
  try {
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error("[MCP] Tool-Calling MCP v2.0 已啟動 (STDIO)");
    console.error("[MCP] Async job system enabled");
  } catch (err) {
    console.error("[MCP] 啟動失敗:", err.message);
    process.exit(1);
  }
}

main();
