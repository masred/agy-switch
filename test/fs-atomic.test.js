const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { writeFileAtomic, copyFileAtomic, safeUnlinkSync } = require('../src/utils/fs-atomic');

test('writeFileAtomic writes content atomically with 0o600 permissions', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agy-test-fs-'));
  const targetFile = path.join(tmpDir, 'test-token.json');

  try {
    writeFileAtomic(targetFile, JSON.stringify({ token: 'abc' }), { mode: 0o600 });
    assert.ok(fs.existsSync(targetFile));

    const content = fs.readFileSync(targetFile, 'utf8');
    assert.deepEqual(JSON.parse(content), { token: 'abc' });

    // Verify file mode
    const stat = fs.statSync(targetFile);
    const mode = stat.mode & 0o777;
    assert.equal(mode, 0o600);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('copyFileAtomic copies file preserving content and enforcing permissions', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agy-test-fs-'));
  const srcFile = path.join(tmpDir, 'src.json');
  const destFile = path.join(tmpDir, 'dest.json');

  try {
    fs.writeFileSync(srcFile, '{"hello":"world"}');
    copyFileAtomic(srcFile, destFile, 0o600);

    assert.ok(fs.existsSync(destFile));
    assert.equal(fs.readFileSync(destFile, 'utf8'), '{"hello":"world"}');

    const stat = fs.statSync(destFile);
    assert.equal(stat.mode & 0o777, 0o600);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('safeUnlinkSync unlinks file safely and ignores non-existent files', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agy-test-fs-'));
  const f = path.join(tmpDir, 'to-delete.txt');

  try {
    fs.writeFileSync(f, 'data');
    assert.equal(safeUnlinkSync(f), true);
    assert.ok(!fs.existsSync(f));

    // Calling again does not throw
    assert.equal(safeUnlinkSync(f), false);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
