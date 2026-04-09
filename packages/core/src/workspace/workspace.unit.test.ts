import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';

const WorkDir = path.resolve('mock-workspace');

function assertSafeRelPath(relPath: string): void {
  if (path.isAbsolute(relPath)) {
    throw new Error('Absolute paths are not allowed');
  }
  if (relPath.includes('..')) {
    throw new Error('Path traversal (..) is not allowed');
  }
  const normalized = path.normalize(relPath);
  if (normalized.includes('..') || path.isAbsolute(normalized)) {
    throw new Error('Invalid path');
  }
}

function resolveWorkspacePath(relPath: string): string {
  if (relPath === '') {
    return WorkDir;
  }
  assertSafeRelPath(relPath);
  const resolved = path.resolve(WorkDir, relPath);
  if (!resolved.startsWith(WorkDir + path.sep) && resolved !== WorkDir) {
    throw new Error('Path outside workspace boundary');
  }
  return resolved;
}

test('assertSafeRelPath', async (t) => {
  await t.test('allows valid relative paths', () => {
    assert.doesNotThrow(() => assertSafeRelPath('foo/bar.txt'));
    assert.doesNotThrow(() => assertSafeRelPath('foo'));
    assert.doesNotThrow(() => assertSafeRelPath('foo/bar/baz.txt'));
  });

  await t.test('rejects absolute paths', () => {
    assert.throws(() => assertSafeRelPath('/etc/passwd'), /Absolute paths are not allowed|Invalid path/);
  });

  await t.test('rejects path traversal', () => {
    assert.throws(() => assertSafeRelPath('../foo'), /Path traversal \(\.\.\) is not allowed|Invalid path/);
    assert.throws(() => assertSafeRelPath('foo/../../bar'), /Path traversal \(\.\.\) is not allowed|Invalid path/);
  });
});

test('resolveWorkspacePath', async (t) => {
  await t.test('resolves empty string to WorkDir', () => {
    assert.equal(resolveWorkspacePath(''), WorkDir);
  });

  await t.test('resolves relative paths within WorkDir', () => {
    const expected = path.resolve(WorkDir, 'foo/bar.txt');
    assert.equal(resolveWorkspacePath('foo/bar.txt'), expected);
  });

  await t.test('rejects absolute paths', () => {
    assert.throws(() => resolveWorkspacePath('/etc/passwd'), /Absolute paths are not allowed|Invalid path/);
  });

  await t.test('rejects traversal attempts', () => {
    assert.throws(() => resolveWorkspacePath('../foo'), /Path traversal \(\.\.\) is not allowed|Invalid path/);
  });
});
