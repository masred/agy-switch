const fs = require('fs');
const path = require('path');

/**
 * Atomically writes data to a file using a temporary file and rename.
 * Guarantees readers never observe a truncated or half-written file.
 */
function writeFileAtomic(filePath, data, options = {}) {
  const mode = options.mode !== undefined ? options.mode : 0o600;
  const encoding = options.encoding || 'utf8';
  const dir = path.dirname(filePath);

  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  }

  const tmpPath = path.join(dir, `.${path.basename(filePath)}.tmp.${process.pid}.${Date.now()}_${Math.random().toString(36).slice(2, 8)}`);

  try {
    fs.writeFileSync(tmpPath, data, { mode, encoding });
    // Explicitly chmod to overcome system umask variations
    try {
      fs.chmodSync(tmpPath, mode);
    } catch (_) {}
    fs.renameSync(tmpPath, filePath);
  } catch (err) {
    try {
      if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
    } catch (_) {}
    throw err;
  }
}

/**
 * Atomically copies a file to destination with specific permissions.
 */
function copyFileAtomic(srcPath, destPath, mode = 0o600) {
  const content = fs.readFileSync(srcPath);
  writeFileAtomic(destPath, content, { mode });
}

/**
 * Safely deletes a file if it exists, ignoring ENOENT.
 */
function safeUnlinkSync(filePath) {
  try {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      return true;
    }
  } catch (err) {
    if (err.code !== 'ENOENT') throw err;
  }
  return false;
}

module.exports = {
  writeFileAtomic,
  copyFileAtomic,
  safeUnlinkSync,
};
