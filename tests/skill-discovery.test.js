import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

const CACHE_FILE = join(homedir(), '.tool-calling', 'skills-cache', 'skills.json');

test('skill-discovery - listSkills returns array', async () => {
  const { listSkills } = await import('../core/skill-discovery.js');
  
  const skills = listSkills();
  assert.ok(Array.isArray(skills));
});

test('skill-discovery - isSkillCliAvailable returns boolean', async () => {
  const { isSkillCliAvailable } = await import('../core/skill-discovery.js');
  
  const available = isSkillCliAvailable();
  assert.ok(typeof available === 'boolean');
});

test('skill-discovery - listSkills returns array', async () => {
  const { listSkills } = await import('../core/skill-discovery.js');
  
  const skills = listSkills();
  assert.ok(Array.isArray(skills));
});

test('skill-discovery - isSkillCliAvailable returns boolean', async () => {
  const { isSkillCliAvailable } = await import('../core/skill-discovery.js');
  
  const available = isSkillCliAvailable();
  assert.ok(typeof available === 'boolean');
});

// Cleanup cache after tests
test.after(() => {
  if (existsSync(CACHE_FILE)) {
    unlinkSync(CACHE_FILE);
  }
});
