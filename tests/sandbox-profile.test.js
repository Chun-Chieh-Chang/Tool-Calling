import test from 'node:test';
import assert from 'node:assert/strict';
import { buildDockerArgs, resolveSandboxProfile } from '../core/sandbox.js';

function networkModeFromArgs(dockerArgs) {
  const index = dockerArgs.indexOf('--network');
  return index === -1 ? null : dockerArgs[index + 1];
}

test('sandbox profile defaults to safe offline execution', () => {
  const tool = {
    id: 'offline-tool',
    language: 'javascript',
    sandbox: {}
  };

  const profile = resolveSandboxProfile(tool);
  const { dockerArgs } = buildDockerArgs(tool, 'D:/tmp/offline-tool', ['node', '--version']);

  assert.equal(profile.name, 'safe-offline');
  assert.equal(profile.allowsNetwork, false);
  assert.equal(networkModeFromArgs(dockerArgs), 'none');
});

test('sandbox profile allows explicit networked runtime execution', () => {
  const tool = {
    id: 'networked-tool',
    language: 'javascript',
    sandbox: {
      profile: 'networked-runtime'
    }
  };

  const profile = resolveSandboxProfile(tool);
  const { dockerArgs } = buildDockerArgs(tool, 'D:/tmp/networked-tool', ['node', '--version']);

  assert.equal(profile.name, 'networked-runtime');
  assert.equal(profile.allowsNetwork, true);
  assert.equal(networkModeFromArgs(dockerArgs), 'bridge');
});
