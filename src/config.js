const path = require('path');
const os = require('os');
const fs = require('fs');

// Enforce strict process umask so any file/directory created by default is user-only
try {
  process.umask(0o077);
} catch (_) {}

function createConfig(envOverrides = {}) {
  const HOME = envOverrides.HOME || process.env.HOME || os.homedir();
  const GEMINI_DIR = envOverrides.GEMINI_DIR || process.env.GEMINI_DIR || path.join(HOME, '.gemini');
  const PROFILES_DIR = envOverrides.AGY_PROFILES_DIR || process.env.AGY_PROFILES_DIR || path.join(GEMINI_DIR, 'profiles');
  const AUTH_FILE = envOverrides.AGY_AUTH_FILE || process.env.AGY_AUTH_FILE || path.join(GEMINI_DIR, 'antigravity-cli', 'antigravity-oauth-token');
  const PENDING_FILE = path.join(PROFILES_DIR, '.pending_profile');
  const ACTIVE_FILE = path.join(PROFILES_DIR, '.active_profile');

  const ACP_AUTH_FILE = envOverrides.ACP_AUTH_FILE || process.env.ACP_AUTH_FILE || path.join(GEMINI_DIR, 'antigravity-acp', 'acp_token.json');
  const ACP_PROFILES_DIR = path.join(PROFILES_DIR, '.acp');
  const ACP_VERIFIED_FILE = envOverrides.ACP_VERIFIED_FILE || process.env.ACP_VERIFIED_FILE || path.join(HOME, '.pi', 'agent', 'antigravity-bridge', 'acp-auth-verified.json');

  return {
    HOME,
    GEMINI_DIR,
    PROFILES_DIR,
    AUTH_FILE,
    PENDING_FILE,
    ACTIVE_FILE,
    ACP_AUTH_FILE,
    ACP_PROFILES_DIR,
    ACP_VERIFIED_FILE,
  };
}

const defaultConfig = createConfig();

function ensureDirectories(cfg = defaultConfig) {
  try {
    if (!fs.existsSync(cfg.PROFILES_DIR)) {
      fs.mkdirSync(cfg.PROFILES_DIR, { recursive: true, mode: 0o700 });
    } else {
      fs.chmodSync(cfg.PROFILES_DIR, 0o700);
    }
    if (!fs.existsSync(cfg.ACP_PROFILES_DIR)) {
      fs.mkdirSync(cfg.ACP_PROFILES_DIR, { recursive: true, mode: 0o700 });
    } else {
      fs.chmodSync(cfg.ACP_PROFILES_DIR, 0o700);
    }
  } catch (_) {}
}

module.exports = {
  ...defaultConfig,
  createConfig,
  ensureDirectories,
};
