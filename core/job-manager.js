/**
 * @module core/job-manager
 * Minimal async job execution system.
 */

import { spawn } from 'node:child_process';
import { join } from 'node:path';

// Job states
export const JOB_STATUS = {
  PENDING: 'pending',
  RUNNING: 'running',
  COMPLETED: 'completed',
  FAILED: 'failed',
  CANCELLED: 'cancelled',
  TIMEOUT: 'timeout',
};

const DEFAULT_TIMEOUT_SECONDS = 120;
const MAX_TIMEOUT_SECONDS = 600;

const jobs = new Map();

function generateId() {
  return `job_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export function createJob(params) {
  const { tool_id, args, tool, targetPath, timeout_seconds } = params;
  const timeoutMs = Math.min(
    (timeout_seconds || DEFAULT_TIMEOUT_SECONDS) * 1000,
    MAX_TIMEOUT_SECONDS * 1000
  );

  const job = {
    job_id: generateId(),
    tool_id,
    args: args || [],
    tool,
    targetPath,
    status: JOB_STATUS.PENDING,
    created_at: new Date().toISOString(),
    started_at: null,
    completed_at: null,
    timeout_ms: timeoutMs,
    exit_code: null,
    stdout: '',
    stderr: '',
    error: null,
    duration_ms: null,
  };

  jobs.set(job.job_id, job);
  return { job_id: job.job_id };
}

export async function executeJob(job_id) {
  const job = jobs.get(job_id);
  if (!job) throw new Error(`Job not found: ${job_id}`);

  job.status = JOB_STATUS.RUNNING;
  job.started_at = new Date().toISOString();

  const { buildDockerArgs } = await import('./sandbox.js');
  const { image, dockerArgs } = buildDockerArgs(
    job.tool,
    join(job.targetPath, job.tool_id),
    job.args.length > 0 ? job.args : ['--help']
  );

  const child = spawn('docker', dockerArgs, {
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  return new Promise((resolve) => {
    let timedOut = false;

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGTERM');
    }, job.timeout_ms);

    child.stdout.on('data', (d) => { job.stdout += d.toString(); });
    child.stderr.on('data', (d) => { job.stderr += d.toString(); });

    child.on('close', (code) => {
      clearTimeout(timer);
      job.exit_code = code;
      job.duration_ms = Date.now() - new Date(job.started_at).getTime();

      if (timedOut) {
        job.status = JOB_STATUS.TIMEOUT;
        job.error = `Timed out after ${job.timeout_ms / 1000}s`;
      } else if (code === 0) {
        job.status = JOB_STATUS.COMPLETED;
      } else {
        job.status = JOB_STATUS.FAILED;
      }
      job.completed_at = new Date().toISOString();
      resolve();
    });

    child.on('error', (err) => {
      clearTimeout(timer);
      job.error = err.message;
      job.status = JOB_STATUS.FAILED;
      job.completed_at = new Date().toISOString();
      resolve();
    });
  });
}

export function getJob(job_id) {
  return jobs.get(job_id) || null;
}

export function cancelJob(job_id) {
  const job = jobs.get(job_id);
  if (!job) return { success: false, message: 'Job not found' };
  if (job.status === JOB_STATUS.COMPLETED || job.status === JOB_STATUS.FAILED) {
    return { success: false, message: 'Job already finished' };
  }
  job.status = JOB_STATUS.CANCELLED;
  job.error = 'Cancelled by user';
  job.completed_at = new Date().toISOString();
  return { success: true };
}

export function listJobs(options = {}) {
  let result = Array.from(jobs.values());
  if (options.status) result = result.filter((j) => j.status === options.status);
  if (options.tool_id) result = result.filter((j) => j.tool_id === options.tool_id);
  result.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  return result.slice(0, options.limit || 20);
}

export function getStats() {
  const all = Array.from(jobs.values());
  const byStatus = {};
  all.forEach((j) => { byStatus[j.status] = (byStatus[j.status] || 0) + 1; });
  return {
    total: all.length,
    pending: byStatus[JOB_STATUS.PENDING] || 0,
    running: byStatus[JOB_STATUS.RUNNING] || 0,
    completed: byStatus[JOB_STATUS.COMPLETED] || 0,
    failed: byStatus[JOB_STATUS.FAILED] || 0,
    cancelled: byStatus[JOB_STATUS.CANCELLED] || 0,
    timeout: byStatus[JOB_STATUS.TIMEOUT] || 0,
  };
}
