/**
 * @module telemetry-summary
 * Pre-computed rolling aggregate of telemetry data for fast read access.
 */

import { existsSync, readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getTelemetryStats } from './telemetry.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const SUMMARY_FILE = join(__dirname, '..', 'registry', 'telemetry-summary.json');

/**
 * Build pre-computed telemetry summary from raw traces.
 * Writes to registry/telemetry-summary.json for fast reads.
 */
export function buildSummary() {
  const rawStats = getTelemetryStats();
  
  const summary = {
    version: '1.0',
    generated_at: new Date().toISOString(),
    total_traces: 0,
    tools: {},
  };

  for (const [toolId, stats] of Object.entries(rawStats)) {
    summary.total_traces += stats.total;
    summary.tools[toolId] = {
      total: stats.total,
      success: stats.success,
      fail: stats.fail,
      success_rate: stats.successRate,
    };
  }

  writeFileSync(SUMMARY_FILE, JSON.stringify(summary, null, 2), 'utf8');
  return summary;
}

/**
 * Load cached summary, rebuild if missing or stale (>1 hour).
 */
export function loadSummary(forceRefresh = false) {
  if (!existsSync(SUMMARY_FILE) || forceRefresh) {
    return buildSummary();
  }

  try {
    const content = readFileSync(SUMMARY_FILE, 'utf8');
    const summary = JSON.parse(content);
    
    // Rebuild if older than 1 hour
    const generatedAt = new Date(summary.generated_at);
    const ageMs = Date.now() - generatedAt.getTime();
    if (ageMs > 60 * 60 * 1000) {
      return buildSummary();
    }
    
    return summary;
  } catch {
    return buildSummary();
  }
}

/**
 * Get telemetry stats optimized for search ranking.
 * Returns tool_id -> { total, success_rate } mapping.
 */
export function getSearchStats() {
  const summary = loadSummary();
  const stats = {};
  
  for (const [toolId, data] of Object.entries(summary.tools || {})) {
    stats[toolId] = {
      total: data.total,
      success_rate: data.success_rate,
    };
  }
  
  return stats;
}

/**
 * Invalidate cache (force rebuild on next load).
 */
export function invalidateCache() {
  try {
    if (existsSync(SUMMARY_FILE)) {
      unlinkSync(SUMMARY_FILE);
    }
  } catch {
    // File might not exist
  }
}
