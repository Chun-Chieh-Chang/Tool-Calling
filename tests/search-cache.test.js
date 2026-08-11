import test from 'node:test';
import assert from 'node:assert/strict';
import { search } from '../core/search-engine.js';

test('search cache is isolated by registry content version', () => {
  const firstRegistry = [
    {
      id: 'cache-alpha',
      name: 'cache registry test',
      status: 'active',
      category: '開發工具',
      language: 'javascript',
      triggers: ['cache registry test'],
      description: 'First registry entry used for cache isolation testing.'
    }
  ];
  const secondRegistry = [
    {
      id: 'cache-beta',
      name: 'cache registry test',
      status: 'active',
      category: '開發工具',
      language: 'javascript',
      triggers: ['cache registry test'],
      description: 'Second registry entry used for cache isolation testing.'
    }
  ];

  const firstResults = search(firstRegistry, 'cache registry test');
  const secondResults = search(secondRegistry, 'cache registry test');

  assert.equal(firstResults[0].tool.id, 'cache-alpha');
  assert.equal(secondResults[0].tool.id, 'cache-beta');
});
