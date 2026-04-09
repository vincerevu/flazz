import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import { KnowledgeSearchProvider } from './knowledge_search.js';
import { RunsSearchProvider } from './runs_search.js';
import fs from 'fs';
import fsp from 'fs/promises';
import { Readable } from 'stream';

test('KnowledgeSearchProvider', async (t) => {
  const provider = new KnowledgeSearchProvider();

  t.afterEach(() => {
    mock.restoreAll();
  });

  await t.test('returns empty when no knowledge dir', async () => {
    mock.method(fs, 'existsSync', () => false);
    const results = await provider.search('test', 10);
    assert.deepEqual(results, []);
  });

  await t.test('matches filename successfully', async () => {
    mock.method(fs, 'existsSync', () => true);
    mock.method(fsp, 'readdir', async () => {
      return [{ name: 'test-note.md', isDirectory: () => false, isFile: () => true }];
    });
    mock.method(fs, 'createReadStream', () => {
      return Readable.from(['# Header\n', 'Some preview content\n']);
    });

    const results = await provider.search('test', 10);
    assert.equal(results.length, 1);
    assert.equal(results[0].title, 'test-note');
    assert.equal(results[0].preview, 'Some preview content');
  });

  await t.test('matches content successfully', async () => {
    mock.method(fs, 'existsSync', () => true);
    mock.method(fsp, 'readdir', async () => {
      return [{ name: 'other.md', isDirectory: () => false, isFile: () => true }];
    });
    mock.method(fs, 'createReadStream', () => {
      return Readable.from(['No match here\n', 'But query is here in this line\n']);
    });

    const results = await provider.search('query', 10);
    assert.equal(results.length, 1);
    assert.equal(results[0].title, 'other');
    assert.ok(results[0].preview.includes('But query is here in this line'));
  });
});

test('RunsSearchProvider', async (t) => {
  const provider = new RunsSearchProvider();

  t.afterEach(() => {
    mock.restoreAll();
  });

  await t.test('returns empty when no runs dir', async () => {
    mock.method(fs, 'existsSync', () => false);
    const results = await provider.search('test', 10);
    assert.deepEqual(results, []);
  });

  await t.test('ignores non-copilot agent', async () => {
    mock.method(fs, 'existsSync', () => true);
    mock.method(fsp, 'readdir', async () => {
      return [{ name: 'run1.jsonl', isDirectory: () => false, isFile: () => true }];
    });
    mock.method(fs, 'createReadStream', () => {
      return Readable.from([
        JSON.stringify({ agentName: 'researcher' }) + '\n'
      ]);
    });

    const results = await provider.search('test', 10);
    assert.equal(results.length, 0);
  });

  await t.test('matches title successfully', async () => {
    mock.method(fs, 'existsSync', () => true);
    mock.method(fsp, 'readdir', async () => {
      return [{ name: 'run2.jsonl', isDirectory: () => false, isFile: () => true }];
    });
    mock.method(fs, 'createReadStream', () => {
      return Readable.from([
        JSON.stringify({ agentName: 'copilot' }) + '\n',
        JSON.stringify({ type: 'message', message: { role: 'user', content: 'test query' } }) + '\n'
      ]);
    });

    const results = await provider.search('test', 10);
    assert.equal(results.length, 1);
    assert.equal(results[0].title, 'test query');
    assert.equal(results[0].preview, 'test query');
  });
});
