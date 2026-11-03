const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { createConfig } = require('../src/config');
const { ProfileManager } = require('../src/core/profile-manager');
const { cmdList, cmdJson, cmdCurrent, cmdSwitch, cmdDelete, cmdVersion } = require('../src/cli/commands');
const pkg = require('../package.json');

function setupTestCli() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agy-test-cli-'));
  const cfg = createConfig({
    HOME: tmpDir,
    GEMINI_DIR: path.join(tmpDir, '.gemini'),
    AGY_PROFILES_DIR: path.join(tmpDir, '.gemini', 'profiles'),
    AGY_AUTH_FILE: path.join(tmpDir, '.gemini', 'antigravity-cli', 'antigravity-oauth-token'),
    ACP_AUTH_FILE: path.join(tmpDir, '.gemini', 'antigravity-acp', 'acp_token.json'),
  });

  const pm = new ProfileManager(cfg);

  const cleanup = () => {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch (_) {}
  };

  return { pm, cfg, tmpDir, cleanup };
}

test('cmdJson prints valid JSON matching state structure', () => {
  const { pm, cfg, cleanup } = setupTestCli();
  try {
    // Add dummy profile
    fs.mkdirSync(cfg.PROFILES_DIR, { recursive: true });
    fs.writeFileSync(
      path.join(cfg.PROFILES_DIR, 'test-profile'),
      JSON.stringify({ token: { refresh_token: 'r1' }, id_token_email: 'tester@domain.com' })
    );

    let stdoutData = '';
    const origLog = console.log;
    console.log = (msg) => { stdoutData += msg; };

    try {
      cmdJson(pm);
    } finally {
      console.log = origLog;
    }

    const parsed = JSON.parse(stdoutData);
    assert.equal(parsed.profiles.length, 1);
    assert.equal(parsed.profiles[0].name, 'test-profile');
    assert.equal(parsed.profiles[0].email, 'tester@domain.com');
  } finally {
    cleanup();
  }
});

test('cmdList formats profiles with email', () => {
  const { pm, cfg, cleanup } = setupTestCli();
  try {
    fs.mkdirSync(cfg.PROFILES_DIR, { recursive: true });
    fs.writeFileSync(
      path.join(cfg.PROFILES_DIR, 'alpha'),
      JSON.stringify({ token: { refresh_token: 'r1' }, id_token_email: 'alpha@domain.com' })
    );

    let output = '';
    const origLog = console.log;
    console.log = (msg) => { output += msg + '\n'; };

    try {
      cmdList(pm);
    } finally {
      console.log = origLog;
    }

    assert.match(output, /alpha/);
    assert.match(output, /alpha@domain\.com/);
  } finally {
    cleanup();
  }
});

test('cmdCurrent outputs active profile', () => {
  const { pm, cfg, cleanup } = setupTestCli();
  try {
    fs.mkdirSync(path.dirname(cfg.AUTH_FILE), { recursive: true });
    fs.writeFileSync(cfg.AUTH_FILE, JSON.stringify({ token: { refresh_token: 'r1' } }));
    pm.saveProfile('active-one');

    let output = '';
    const origLog = console.log;
    console.log = (msg) => { output += msg; };

    try {
      cmdCurrent(pm);
    } finally {
      console.log = origLog;
    }

    assert.equal(output.trim(), 'active-one');
  } finally {
    cleanup();
  }
});

test('cmdSwitch switches active account', () => {
  const { pm, cfg, cleanup } = setupTestCli();
  try {
    fs.mkdirSync(path.dirname(cfg.AUTH_FILE), { recursive: true });
    fs.writeFileSync(cfg.AUTH_FILE, JSON.stringify({ token: { refresh_token: 'r1' } }));
    pm.saveProfile('target-acc');

    let output = '';
    const origLog = console.log;
    console.log = (msg) => { output += msg + '\n'; };

    try {
      cmdSwitch('target-acc', pm);
    } finally {
      console.log = origLog;
    }

    assert.match(output, /Switched active Google account to 'target-acc'/);
  } finally {
    cleanup();
  }
});

test('cmdDelete deletes profile and prints active note if applicable', () => {
  const { pm, cfg, cleanup } = setupTestCli();
  try {
    fs.mkdirSync(path.dirname(cfg.AUTH_FILE), { recursive: true });
    fs.writeFileSync(cfg.AUTH_FILE, JSON.stringify({ token: { refresh_token: 'r1' } }));
    pm.saveProfile('to-del');

    let output = '';
    const origLog = console.log;
    console.log = (msg) => { output += msg + '\n'; };

    try {
      cmdDelete('to-del', pm);
    } finally {
      console.log = origLog;
    }

    assert.match(output, /Deleted profile 'to-del'/);
    assert.match(output, /Active session was cleared/);
  } finally {
    cleanup();
  }
});

test('cmdVersion outputs package version', () => {
  let output = '';
  const origLog = console.log;
  console.log = (msg) => { output += msg; };

  try {
    cmdVersion();
  } finally {
    console.log = origLog;
  }

  assert.equal(output, `agy-switch v${pkg.version}`);
});
