const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { createConfig } = require('../src/config');
const { ProfileManager } = require('../src/core/profile-manager');

function setupTestEnvironment() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agy-test-pm-'));
  const cfg = createConfig({
    HOME: tmpDir,
    GEMINI_DIR: path.join(tmpDir, '.gemini'),
    AGY_PROFILES_DIR: path.join(tmpDir, '.gemini', 'profiles'),
    AGY_AUTH_FILE: path.join(tmpDir, '.gemini', 'antigravity-cli', 'antigravity-oauth-token'),
    ACP_AUTH_FILE: path.join(tmpDir, '.gemini', 'antigravity-acp', 'acp_token.json'),
    ACP_VERIFIED_FILE: path.join(tmpDir, '.pi', 'agent', 'antigravity-bridge', 'acp-auth-verified.json'),
  });

  const pm = new ProfileManager(cfg);

  const cleanup = () => {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch (_) {}
  };

  return { pm, cfg, tmpDir, cleanup };
}

test('validateProfileName accepts valid names and rejects invalid/traversal', () => {
  const { pm, cleanup } = setupTestEnvironment();
  try {
    assert.equal(pm.validateProfileName('work-profile'), 'work-profile');
    assert.equal(pm.validateProfileName('account_123'), 'account_123');

    assert.throws(() => pm.validateProfileName(''), /required/);
    assert.throws(() => pm.validateProfileName('   '), /required/);
    assert.throws(() => pm.validateProfileName('.hidden'), /cannot start with/);
    assert.throws(() => pm.validateProfileName('-flag'), /cannot start with/);
    assert.throws(() => pm.validateProfileName('../escape'), /cannot start with/);
    assert.throws(() => pm.validateProfileName('bad/slash'), /Invalid profile name/);
    assert.throws(() => pm.validateProfileName('name with spaces'), /Invalid profile name/);
    assert.throws(() => pm.validateProfileName('acp'), /reserved name/);
    assert.throws(() => pm.validateProfileName('a'.repeat(65)), /must not exceed 64 characters/);
  } finally {
    cleanup();
  }
});

test('resolveProfilePath throws on path traversal attempts', () => {
  const { pm, cfg, cleanup } = setupTestEnvironment();
  try {
    assert.throws(() => {
      pm.resolveProfilePath(cfg.PROFILES_DIR, '../../.bashrc');
    }, /cannot start with/);

    assert.throws(() => {
      pm.resolveProfilePath(cfg.PROFILES_DIR, 'sub/dir');
    }, /Invalid profile name/);
  } finally {
    cleanup();
  }
});

test('saveProfile and switchProfile successfully manage tokens', () => {
  const { pm, cfg, cleanup } = setupTestEnvironment();
  try {
    // 1. Simulate an active CLI token
    const tokenObj = {
      token: {
        access_token: 'act-123',
        refresh_token: 'ref-123',
        expiry: new Date(Date.now() + 3600000).toISOString(),
      },
      id_token_email: 'tester@example.com',
      auth_method: 'consumer',
    };
    fs.mkdirSync(path.dirname(cfg.AUTH_FILE), { recursive: true });
    fs.writeFileSync(cfg.AUTH_FILE, JSON.stringify(tokenObj));

    // Also simulate ACP token
    fs.mkdirSync(path.dirname(cfg.ACP_AUTH_FILE), { recursive: true });
    fs.writeFileSync(cfg.ACP_AUTH_FILE, JSON.stringify({ refresh_token: 'acp-ref-123' }));

    // 2. Save profile
    const saveRes = pm.saveProfile('tester-profile');
    assert.equal(saveRes.name, 'tester-profile');
    assert.equal(saveRes.hasAcp, true);

    // Verify files created with 0600 mode
    const savedPath = path.join(cfg.PROFILES_DIR, 'tester-profile');
    const savedAcp = path.join(cfg.ACP_PROFILES_DIR, 'tester-profile');
    assert.ok(fs.existsSync(savedPath));
    assert.ok(fs.existsSync(savedAcp));
    assert.equal(fs.statSync(savedPath).mode & 0o777, 0o600);
    assert.equal(fs.statSync(savedAcp).mode & 0o777, 0o600);

    // Verify state
    const state = pm.getProfiles();
    assert.equal(state.active, 'tester-profile');
    assert.equal(state.profiles.length, 1);
    assert.equal(state.profiles[0].email, 'tester@example.com');
    assert.equal(state.profiles[0].hasAcp, true);

    // 3. Switch to profile
    const switchRes = pm.switchProfile('tester-profile');
    assert.equal(switchRes.name, 'tester-profile');
    assert.equal(switchRes.hasAcp, true);

    assert.ok(fs.existsSync(cfg.AUTH_FILE));
    assert.ok(fs.existsSync(cfg.ACP_AUTH_FILE));

    // Switching to non-existent profile throws
    assert.throws(() => pm.switchProfile('non-existent'), /not found/);
  } finally {
    cleanup();
  }
});

test('addProfile clears active and creates pending profile with backup', () => {
  const { pm, cfg, cleanup } = setupTestEnvironment();
  try {
    // Simulate unsaved active token
    fs.mkdirSync(path.dirname(cfg.AUTH_FILE), { recursive: true });
    fs.writeFileSync(cfg.AUTH_FILE, JSON.stringify({ token: { refresh_token: 'unsaved' } }));

    pm.addProfile('new-user');

    assert.equal(pm.getPending(), 'new-user');
    assert.ok(!fs.existsSync(cfg.AUTH_FILE));

    // Check backup was created
    const profileFiles = fs.readdirSync(cfg.PROFILES_DIR).filter(f => !f.startsWith('.'));
    assert.ok(profileFiles.some(f => f.startsWith('backup-')));
  } finally {
    cleanup();
  }
});

test('pending profile automatically finishes sync on next loadState', () => {
  const { pm, cfg, cleanup } = setupTestEnvironment();
  try {
    pm.addProfile('pending-sync-account');
    assert.equal(pm.getPending(), 'pending-sync-account');

    // User completes login via browser, AUTH_FILE is created
    fs.mkdirSync(path.dirname(cfg.AUTH_FILE), { recursive: true });
    fs.writeFileSync(
      cfg.AUTH_FILE,
      JSON.stringify({ token: { refresh_token: 'synced-ref' }, id_token_email: 'pending@done.com' })
    );

    const state = pm.loadState();
    assert.equal(state.active, 'pending-sync-account');
    assert.equal(state.pending, null);
    assert.ok(fs.existsSync(path.join(cfg.PROFILES_DIR, 'pending-sync-account')));
  } finally {
    cleanup();
  }
});

test('renameProfile and deleteProfile work correctly', () => {
  const { pm, cfg, cleanup } = setupTestEnvironment();
  try {
    // Create token and profile
    fs.mkdirSync(path.dirname(cfg.AUTH_FILE), { recursive: true });
    fs.writeFileSync(cfg.AUTH_FILE, JSON.stringify({ token: { refresh_token: 'ref-a' }, id_token_email: 'a@example.com' }));
    pm.saveProfile('alpha');

    // Rename
    pm.renameProfile('alpha', 'beta');
    assert.ok(!fs.existsSync(path.join(cfg.PROFILES_DIR, 'alpha')));
    assert.ok(fs.existsSync(path.join(cfg.PROFILES_DIR, 'beta')));

    const stateAfterRename = pm.getProfiles();
    assert.equal(stateAfterRename.active, 'beta');
    assert.equal(stateAfterRename.profiles[0].name, 'beta');

    // Renaming to already existing name throws
    fs.writeFileSync(path.join(cfg.PROFILES_DIR, 'gamma'), '{}');
    assert.throws(() => pm.renameProfile('beta', 'gamma'), /already exists/);

    // Delete
    const delRes = pm.deleteProfile('beta');
    assert.equal(delRes.name, 'beta');
    assert.equal(delRes.wasActive, true);

    assert.ok(!fs.existsSync(path.join(cfg.PROFILES_DIR, 'beta')));
    // Since it was active, active tokens are cleared
    assert.ok(!fs.existsSync(cfg.AUTH_FILE));
    assert.equal(pm.getActiveProfile(), null);

    // Deleting non-existent throws
    assert.throws(() => pm.deleteProfile('does-not-exist'), /does not exist/);
  } finally {
    cleanup();
  }
});

test('saveAcpProfile saves current ACP credentials', () => {
  const { pm, cfg, cleanup } = setupTestEnvironment();
  try {
    // When no ACP token exists, throws
    assert.throws(() => pm.saveAcpProfile('target-profile'), /does not exist/);

    // Create CLI profile first
    fs.mkdirSync(cfg.PROFILES_DIR, { recursive: true });
    fs.writeFileSync(path.join(cfg.PROFILES_DIR, 'target-profile'), '{}');

    // When ACP token exists, saves
    fs.mkdirSync(path.dirname(cfg.ACP_AUTH_FILE), { recursive: true });
    fs.writeFileSync(cfg.ACP_AUTH_FILE, JSON.stringify({ refresh_token: 'acp-test' }));

    const saved = pm.saveAcpProfile('target-profile');
    assert.equal(saved, 'target-profile');
    assert.ok(fs.existsSync(path.join(cfg.ACP_PROFILES_DIR, 'target-profile')));
  } finally {
    cleanup();
  }
});

test('single pass loadState auto-syncs refreshed token and ACP token', () => {
  const { pm, cfg, cleanup } = setupTestEnvironment();
  try {
    // Create a saved profile
    fs.mkdirSync(cfg.PROFILES_DIR, { recursive: true });
    fs.writeFileSync(
      path.join(cfg.PROFILES_DIR, 'my-account'),
      JSON.stringify({ token: { refresh_token: 'match-token', access_token: 'old-access' } })
    );

    // Active auth token was refreshed by CLI with new access_token
    fs.mkdirSync(path.dirname(cfg.AUTH_FILE), { recursive: true });
    fs.writeFileSync(
      cfg.AUTH_FILE,
      JSON.stringify({ token: { refresh_token: 'match-token', access_token: 'new-access' } })
    );

    // ACP token was also refreshed
    fs.mkdirSync(path.dirname(cfg.ACP_AUTH_FILE), { recursive: true });
    fs.writeFileSync(
      cfg.ACP_AUTH_FILE,
      JSON.stringify({ refresh_token: 'acp-new' })
    );

    const state = pm.loadState();
    assert.equal(state.active, 'my-account');

    // Verify saved profile was synced with new content
    const updatedRaw = fs.readFileSync(path.join(cfg.PROFILES_DIR, 'my-account'), 'utf8');
    const updatedData = JSON.parse(updatedRaw);
    assert.equal(updatedData.token.access_token, 'new-access');

    // Verify ACP profile was auto-captured
    const acpSaved = fs.readFileSync(path.join(cfg.ACP_PROFILES_DIR, 'my-account'), 'utf8');
    assert.equal(JSON.parse(acpSaved).refresh_token, 'acp-new');
  } finally {
    cleanup();
  }
});

test('switchProfile auto-backs up unsaved active session to prevent data loss', () => {
  const { pm, cfg, cleanup } = setupTestEnvironment();
  try {
    // 1. Create a saved profile 'target-profile'
    fs.mkdirSync(cfg.PROFILES_DIR, { recursive: true });
    fs.writeFileSync(
      path.join(cfg.PROFILES_DIR, 'target-profile'),
      JSON.stringify({ token: { refresh_token: 'target-ref' } })
    );

    // 2. Simulate an unsaved active token in AUTH_FILE
    fs.mkdirSync(path.dirname(cfg.AUTH_FILE), { recursive: true });
    fs.writeFileSync(
      cfg.AUTH_FILE,
      JSON.stringify({ token: { refresh_token: 'unsaved-active-ref' } })
    );

    // 3. Switch to 'target-profile'
    pm.switchProfile('target-profile');

    // 4. Verify that a backup was automatically created in PROFILES_DIR
    const files = fs.readdirSync(cfg.PROFILES_DIR);
    const backupFiles = files.filter(f => f.startsWith('backup-'));
    assert.equal(backupFiles.length, 1);

    const backupContent = JSON.parse(fs.readFileSync(path.join(cfg.PROFILES_DIR, backupFiles[0]), 'utf8'));
    assert.equal(backupContent.token.refresh_token, 'unsaved-active-ref');
  } finally {
    cleanup();
  }
});

test('addProfile throws if profile already exists', () => {
  const { pm, cfg, cleanup } = setupTestEnvironment();
  try {
    fs.mkdirSync(cfg.PROFILES_DIR, { recursive: true });
    fs.writeFileSync(path.join(cfg.PROFILES_DIR, 'existing'), '{}');

    assert.throws(() => pm.addProfile('existing'), /already exists/);
  } finally {
    cleanup();
  }
});

test('saveAcpProfile throws if CLI profile does not exist', () => {
  const { pm, cfg, cleanup } = setupTestEnvironment();
  try {
    fs.mkdirSync(path.dirname(cfg.ACP_AUTH_FILE), { recursive: true });
    fs.writeFileSync(cfg.ACP_AUTH_FILE, JSON.stringify({ refresh_token: 'acp-ref' }));

    assert.throws(() => pm.saveAcpProfile('non-existent-cli'), /does not exist/);
  } finally {
    cleanup();
  }
});
