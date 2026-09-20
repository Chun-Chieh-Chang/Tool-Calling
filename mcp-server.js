#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { loadRegistry, getToolById, displayText } from "./core/registry.js";
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
        description: displayText(t, 'description').slice(0, 200), status: t.status,
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
    rerank: z.boolean().optional().describe(
      "是否用 LLM 對候選做語意重排（實測 Hit@1 從 11.9% 提升到 43–48%）。預設：有 API key 時自動啟用。傳 false 可關閉以縮短延遲。"
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
          description: displayText(r.tool, 'description').slice(0, 300), score: r.score,
          matchLevel: r.matchLevel, advantages: displayText(r.tool, 'advantages'),
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

      // 預設 auto：融合 L2 + agent-retrieval（+ 可選 LLM rerank）
      const { retrieveWithRerank } = await import("./core/retrieval-fusion.js");
      const r = await retrieveWithRerank(tools, args.query, {
        topK: args.topK || 5,
        category: args.category,
        telemetryStats,
        rerank: args.rerank,
      });
      const byId = new Map(tools.map((t) => [t.id, t]));
      const output = r.results.map((x) => ({
        id: x.id, name: x.name, category: x.category,
        description: displayText(byId.get(x.id), 'description') || x.description,
        score: x.score, matchLevel: x.matchLevel, source: x.source,
        confidence: x.confidence ?? null,
        reasons: x.reasons,
      }));
      return { content: [{ type: "text", text: JSON.stringify({
        total: output.length,
        mode: r.rerank?.applied ? "auto (fusion + llm-rerank)" : "auto (fusion)",
        decision: r.decision,
        confidence: r.confidence,
        fallbackHint: r.fallbackHint,
        source: r.source,
        agentConsistentCount: r.agentConsistentCount,
        l2Leads: r.l2Leads,
        matched: r.matched,
        totalCandidates: r.totalCandidates,
        rerank: r.rerank ?? null,
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

server.tool(
  "plan_tool_chain",
  "把多步驟任務拆解成一組可搭配使用的工具鏈（走融合引擎，非單一最佳解）。" +
  "適合「抓資料然後做成簡報」這類需要多個工具接力完成的專案型需求。",
  {
    task: z.string().min(1).describe("多步驟任務描述（用『然後／接著／轉成』等連接詞分隔，例如：抓取網頁資料然後轉成簡報）"),
    topK: z.number().min(1).max(10).optional().describe("每個步驟保留幾個備選工具（預設 3）"),
  },
  async (args) => {
    try {
      const tools = loadRegistry().tools;
      const { planToolSet } = await import("./core/tool-chain.js");
      const plan = planToolSet(tools, args.task, { topK: args.topK || 3 });
      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            task: plan.task,
            totalSteps: plan.totalSteps,
            engine: plan.engine,
            asciiPipeline: plan.asciiPipeline,
            steps: plan.steps.map((s) => ({
              step: s.stepIndex,
              action: s.action,
              tool: s.recommendedTool ? {
                id: s.recommendedTool.id,
                name: s.recommendedTool.name,
                category: s.recommendedTool.category,
                useCase: displayText(
                  tools.find((t) => t.id === s.recommendedTool.id), 'useCase'
                ) || s.recommendedTool.useCase,
                install: s.recommendedTool.install,
              } : null,
              inputFormat: s.inputFormat,
              outputFormat: s.outputFormat,
              alternatives: s.alternatives,
            })),
            summary: plan.summary,
          }, null, 2),
        }],
      };
    } catch (err) {
      return server.createToolError(`工具鏈規劃失敗: ${err.message}`);
    }
  }
);

server.tool(
  "clarify_requirement",
  "需求收斂追問：當工具選用不確定時，回傳一個最能有效區分候選的問題。" +
  "使用者回答後把答案帶回本工具，可逐步收斂到正確工具。" +
  "若系統已經有高置信度答案，就不會提問（shouldAsk=false）。",
  {
    query: z.string().min(1).describe("需求描述"),
    answers: z.record(z.string()).optional().describe(
      "已回答的維度與值，例如 { language: 'Python' }、{ install: 'npm' }。" +
      "值可用 '__any__' 表示不限。"
    ),
    topK: z.number().min(2).max(20).optional().describe("納入考量的候選數（預設 5）"),
  },
  async (args) => {
    try {
      const tools = loadRegistry().tools;
      const { retrieve } = await import("./core/retrieval-fusion.js");
      const { planClarification, applyAnswer, CLARIFY_DIMENSIONS } = await import("./core/clarifier.js");

      // 1. 先把已回答的維度併進查詢，讓檢索本身也吃到這些約束
      const answers = args.answers || {};
      const suffix = Object.entries(answers)
        .filter(([, v]) => v && v !== '__any__')
        .map(([, v]) => v).join(' ');
      const query = suffix ? `${args.query} ${suffix}` : args.query;

      const r = retrieve(tools, query, { topK: args.topK || 5 });
      const byId = new Map(tools.map((t) => [t.id, t]));

      // 2. 收斂：依已回答的維度過濾候選（高置信時不做，避免誤殺）
      let candidates = r.results;
      const applied = [];
      for (const [dim, val] of Object.entries(answers)) {
        if (!CLARIFY_DIMENSIONS.some((d) => d.key === dim)) continue;
        const res = applyAnswer(candidates, tools, dim, val);
        candidates = res.candidates;
        applied.push({ dimension: dim, value: val, dropped: res.dropped });
      }

      // 3. 高置信 → 不提問，直接給答案
      const confident = r.decision === 'adopt' && (r.confidence ?? 0) >= 0.35;
      const plan = planClarification(candidates, tools, {
        asked: Object.keys(answers),
        topN: args.topK || 5,
        decision: r.decision,
      });

      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            query: args.query,
            effectiveQuery: query,
            decision: r.decision,
            confidence: r.confidence,
            // 不確定時才提問——這是本工具的核心設計
            shouldAsk: !confident && plan.shouldAsk,
            skipReason: confident ? '已達高置信度，直接給答案' : plan.reason,
            question: (!confident && plan.shouldAsk) ? {
              dimension: plan.question.key,
              label: plan.question.label,
              prompt: plan.question.question,
              options: plan.question.options.map((o) => o.value),
            } : null,
            appliedAnswers: applied,
            candidates: candidates.slice(0, args.topK || 5).map((x) => ({
              id: x.id,
              name: byId.get(x.id)?.name || x.name,
              category: x.category,
              description: displayText(byId.get(x.id), 'description').slice(0, 200),
              score: x.score,
            })),
          }, null, 2),
        }],
      };
    } catch (err) {
      return server.createToolError(`需求收斂失敗: ${err.message}`);
    }
  }
);

server.tool(
  "plan_ingestion",
  "規劃『素材 → 可用筆記』的擷取管線（LLM Wiki 的 Capture 層）。" +
  "適合「我有一堆 PDF／網頁／錄音，要怎麼變成知識庫」這類需求。",
  {
    source: z.string().min(1).describe("素材類型：pdf / web / audio / video / book"),
    topK: z.number().min(1).max(10).optional().describe("每個階段保留幾個備選工具（預設 3）"),
  },
  async (args) => {
    try {
      const tools = loadRegistry().tools;
      const { planIngestion } = await import("./core/ingestion.js");
      const plan = planIngestion(tools, args.source, { topK: args.topK || 3 });
      if (!plan) {
        return server.createToolError(
          `不支援的素材類型：${args.source}。可用：${['pdf','web','audio','video','book'].join(' / ')}`
        );
      }
      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            sourceType: plan.sourceType,
            label: plan.label,
            hint: plan.hint,
            totalSteps: plan.totalSteps,
            asciiPipeline: plan.asciiPipeline,
            stages: plan.stages.map((s) => ({
              step: s.stepIndex,
              stage: s.label,
              tool: s.recommendedTool ? {
                id: s.recommendedTool.id,
                name: s.recommendedTool.name,
                category: s.recommendedTool.category,
                install: s.recommendedTool.install,
              } : null,
              warning: s.warning,
              alternatives: s.alternatives,
            })),
            summary: plan.summary,
          }, null, 2),
        }],
      };
    } catch (err) {
      return server.createToolError(`擷取管線規劃失敗: ${err.message}`);
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
