import test from 'node:test';
import assert from 'node:assert/strict';
import {
  JOB_STATUS,
  createJob,
  getJob,
  cancelJob,
  listJobs,
  getStats,
} from '../core/job-manager.js';

test('job manager - create job returns job_id', () => {
  const result = createJob({
    tool_id: 'test-tool',
    args: ['--help'],
    tool: { id: 'test-tool', language: 'javascript' },
    targetPath: '/tmp/test',
  });
  assert.ok(result.job_id);
  assert.equal(typeof result.job_id, 'string');
  assert.ok(result.job_id.startsWith('job_'));
});

test('job manager - job created with pending status', () => {
  const { job_id } = createJob({
    tool_id: 'offline-tool',
    tool: { id: 'offline-tool', language: 'javascript' },
    targetPath: '/tmp/offline',
  });
  const job = getJob(job_id);
  assert.ok(job);
  assert.equal(job.status, JOB_STATUS.PENDING);
  assert.equal(job.tool_id, 'offline-tool');
  assert.equal(job.timeout_ms, 120000);
});

test('job manager - custom timeout works', () => {
  const { job_id } = createJob({
    tool_id: 'fast-tool',
    tool: { id: 'fast-tool' },
    targetPath: '/tmp/fast',
    timeout_seconds: 30,
  });
  const job = getJob(job_id);
  assert.equal(job.timeout_ms, 30000);
});

test('job manager - max timeout enforced (600s)', () => {
  const { job_id } = createJob({
    tool_id: 'long-tool',
    tool: { id: 'long-tool' },
    targetPath: '/tmp/long',
    timeout_seconds: 999,
  });
  const job = getJob(job_id);
  assert.equal(job.timeout_ms, 600000);
});

test('job manager - list jobs returns array', () => {
  createJob({ tool_id: 'tool-a', tool: { id: 'tool-a' }, targetPath: '/tmp/a' });
  createJob({ tool_id: 'tool-b', tool: { id: 'tool-b' }, targetPath: '/tmp/b' });
  const jobs = listJobs({ limit: 10 });
  assert.ok(Array.isArray(jobs));
  assert.equal(jobs.length >= 2, true);
});

test('job manager - list jobs filters by tool_id', () => {
  createJob({ tool_id: 'unique-tool-xyz', tool: { id: 'unique-tool-xyz' }, targetPath: '/tmp/xyz' });
  const jobs = listJobs({ tool_id: 'unique-tool-xyz', limit: 10 });
  assert.equal(jobs.length, 1);
  assert.equal(jobs[0].tool_id, 'unique-tool-xyz');
});

test('job manager - get stats returns summary', () => {
  const stats = getStats();
  assert.ok(stats.total >= 0);
  assert.ok(typeof stats.pending === 'number');
  assert.ok(typeof stats.running === 'number');
  assert.ok(typeof stats.completed === 'number');
});

test('job manager - cancel pending job', () => {
  const { job_id } = createJob({
    tool_id: 'cancel-test',
    tool: { id: 'cancel-test' },
    targetPath: '/tmp/cancel',
  });
  const result = cancelJob(job_id);
  assert.equal(result.success, true);
  const job = getJob(job_id);
  assert.equal(job.status, JOB_STATUS.CANCELLED);
  assert.ok(job.error.includes('Cancelled'));
});

test('job manager - cancel non-existent job fails', () => {
  const result = cancelJob('nonexistent-job-id');
  assert.equal(result.success, false);
  assert.ok(result.message.includes('not found'));
});

test('job manager - cancel completed job fails', () => {
  const { job_id } = createJob({
    tool_id: 'complete-test',
    tool: { id: 'complete-test' },
    targetPath: '/tmp/complete',
  });
  const job = getJob(job_id);
  job.status = JOB_STATUS.COMPLETED;
  job.completed_at = new Date().toISOString();
  const result = cancelJob(job_id);
  assert.equal(result.success, false);
  assert.ok(result.message.includes('already finished'));
});

test('job manager - job not found returns null', () => {
  const job = getJob('nonexistent-job');
  assert.equal(job, null);
});
