import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { WorkDir } from '../config/config.js';
import { resolveWorkspacePath, assertSafePath } from './workspace.js';

test('assertSafePath', async (t) => {
  const root = '/var/www/app';

  await t.test('allows strictly identical path', () => {
    assert.doesNotThrow(() => assertSafePath(root, '/var/www/app'));
  });

  await t.test('allows nested valid paths', () => {
    assert.doesNotThrow(() => assertSafePath(root, '/var/www/app/src/index.js'));
  });

  await t.test('rejects traversal outside root', () => {
    assert.throws(() => assertSafePath(root, '/var/www/app/../other'), /Path outside workspace boundary/);
  });

  await t.test('rejects absolute paths outside root', () => {
    assert.throws(() => assertSafePath(root, '/etc/passwd'), /Path outside workspace boundary/);
  });

  await t.test('rejects symlink-like prefix traversal (e.g. /var/www/app-secrets)', () => {
    assert.throws(() => assertSafePath(root, '/var/www/app-secrets/key.pem'), /Path outside workspace boundary/);
  });
});

test('resolveWorkspacePath', async (t) => {
  await t.test('resolves relative paths within WorkDir', () => {
    assert.strictEqual(resolveWorkspacePath('foo.txt'), path.resolve(WorkDir, 'foo.txt'));
    assert.strictEqual(resolveWorkspacePath('foo/bar.txt'), path.resolve(WorkDir, 'foo/bar.txt'));
  });

  await t.test('rejects absolute paths', () => {
    assert.throws(() => resolveWorkspacePath('/etc/passwd'), /Path outside workspace boundary/);
  });

  await t.test('rejects traversal attempts', () => {
    assert.throws(() => resolveWorkspacePath('../foo'), /Path outside workspace boundary/);
    assert.throws(() => resolveWorkspacePath('foo/../../bar'), /Path outside workspace boundary/);
  });
});
