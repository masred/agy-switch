import fs from "node:fs";
import path from "node:path";
import os from "node:os";

// Enforce strict process umask
try {
  process.umask(0o077);
} catch (_) {}

const HOME = os.homedir();
const ACP_BASE_DIR = path.join(HOME, ".gemini", "antigravity-acp");
const ACP_AUTH_FILE = path.join(ACP_BASE_DIR, "acp_token.json");
const PROFILES_DIR = path.join(HOME, ".gemini", "profiles");
const ACP_PROFILES_DIR = path.join(PROFILES_DIR, ".acp");

// Store IPC state inside secure user-scoped directory instead of world-writable /tmp
const STATE_DIR = path.join(ACP_BASE_DIR, ".state");
const STATE_FILE = path.join(STATE_DIR, "acp-auth-state.json");
const CALLBACK_FILE = path.join(STATE_DIR, "acp-callback.txt");

interface Args {
  profile: string;
  email?: string;
  timeoutSec: number;
}

function validateProfileName(name: string): string {
  if (!name || typeof name !== "string") {
    throw new Error("Profile name is required.");
  }
  const trimmed = name.trim();
  if (!/^[a-zA-Z0-9_-]+$/.test(trimmed)) {
    throw new Error(`Invalid profile name '${name}'. Profile names must contain only letters, numbers, hyphens, or underscores.`);
  }
  if (trimmed.startsWith(".") || trimmed.startsWith("-")) {
    throw new Error("Profile name cannot start with '.' or '-'.");
  }
  return trimmed;
}

function parseArgs(): Args {
  const args = process.argv.slice(2);
  let profile = "";
  let email = "";
  let timeoutSec = 300;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--profile" && args[i + 1]) {
      profile = args[++i];
    } else if (args[i] === "--email" && args[i + 1]) {
      email = args[++i];
    } else if (args[i] === "--timeout" && args[i + 1]) {
      timeoutSec = parseInt(args[++i], 10);
    }
  }

  if (!profile) {
    console.error("Usage: bun run acp-auth-helper.ts --profile <name> [--email <email>] [--timeout <sec>]");
    process.exit(1);
  }

  const validProfile = validateProfileName(profile);
  return { profile: validProfile, email, timeoutSec };
}

async function loadAcpProviderModules() {
  const providerBasePath = path.join(
    HOME,
    ".pi",
    "agent",
    "npm",
    "node_modules",
    "pi-antigravity-acp-provider",
    "src",
    "acp"
  );

  const headlessPath = path.join(providerBasePath, "headless-oauth.js");
  const connectionPath = path.join(providerBasePath, "connection.js");
  const antigravityPath = path.join(providerBasePath, "antigravity.js");

  if (!fs.existsSync(headlessPath) || !fs.existsSync(connectionPath)) {
    throw new Error(
      `Could not locate pi-antigravity-acp-provider at ${providerBasePath}. Please ensure the Pi Antigravity provider is installed.`
    );
  }

  const { HeadlessOAuthRelay } = await import(headlessPath);
  const { AntigravityAcpConnection } = await import(connectionPath);
  const { clearAntigravityCredentials } = await import(antigravityPath);

  return { HeadlessOAuthRelay, AntigravityAcpConnection, clearAntigravityCredentials };
}

async function main() {
  const { profile, email, timeoutSec } = parseArgs();

  // Ensure state directories exist with mode 0700
  if (!fs.existsSync(STATE_DIR)) {
    fs.mkdirSync(STATE_DIR, { recursive: true, mode: 0o700 });
  } else {
    fs.chmodSync(STATE_DIR, 0o700);
  }

  console.log(`[ACP-AUTH] Starting auth flow for profile: '${profile}' (email: ${email || "any"})`);

  // Clean state files
  try { if (fs.existsSync(STATE_FILE)) fs.unlinkSync(STATE_FILE); } catch (_) {}
  try { if (fs.existsSync(CALLBACK_FILE)) fs.unlinkSync(CALLBACK_FILE); } catch (_) {}

  const { HeadlessOAuthRelay, AntigravityAcpConnection, clearAntigravityCredentials } =
    await loadAcpProviderModules();

  clearAntigravityCredentials();

  const relay = new HeadlessOAuthRelay();
  const connection = new AntigravityAcpConnection({
    cwd: process.cwd(),
    env: relay.env,
  });

  try {
    const init = await connection.initialize();
    const method = init.authMethods?.find((candidate: any) =>
      /log\s*in\s+with\s+google|google\s+account|oauth-personal/iu.test(
        `${candidate.id} ${candidate.name}`
      )
    );

    if (!method) {
      throw new Error("Antigravity ACP did not advertise Google login");
    }

    let authError: Error | null = null;
    const authPromise = connection.authenticate(
      { methodId: method.id },
      undefined,
      timeoutSec * 1000
    );

    authPromise.catch((err: Error) => {
      authError = err;
      console.log(`[ACP-AUTH] Auth rejection: ${err.message}`);
    });

    const captured = await relay.waitForAuthorization();

    // Attach login_hint if email is specified
    let finalAuthUrl = captured.url;
    if (email) {
      const u = new URL(captured.url);
      u.searchParams.set("login_hint", email);
      finalAuthUrl = u.toString();
    }

    const stateData = {
      profile,
      email,
      url: finalAuthUrl,
      redirectUrl: captured.redirectUrl.toString(),
      state: captured.state,
      status: "WAITING_FOR_USER",
      timestamp: Date.now(),
    };

    fs.writeFileSync(STATE_FILE, JSON.stringify(stateData, null, 2), { mode: 0o600 });

    console.log(`\n======================================================`);
    console.log(`AUTH_URL_READY: ${finalAuthUrl}`);
    console.log(`REDIRECT_LISTENER: ${captured.redirectUrl.toString()}`);
    console.log(`STATE_FILE: ${STATE_FILE}`);
    console.log(`======================================================\n`);

    // Poll for callback file or auth completion
    const startTime = Date.now();
    const deadline = startTime + timeoutSec * 1000;

    let authDone = false;
    authPromise
      .then(() => {
        authDone = true;
      })
      .catch(() => {});

    while (!authDone && Date.now() < deadline) {
      if (authError) {
        throw authError;
      }

      // Check if callback file was provided
      if (fs.existsSync(CALLBACK_FILE)) {
        const callbackVal = fs.readFileSync(CALLBACK_FILE, "utf8").trim();
        if (callbackVal) {
          console.log(`[ACP-AUTH] Found manual callback in ${CALLBACK_FILE}: relaying...`);
          try {
            await relay.forwardCallback(callbackVal, captured);
            console.log(`[ACP-AUTH] Forwarded callback successfully.`);
          } catch (err: any) {
            console.error(`[ACP-AUTH] Failed to forward callback: ${err.message}`);
          } finally {
            try { fs.unlinkSync(CALLBACK_FILE); } catch (_) {}
          }
        }
      }

      await new Promise((r) => setTimeout(r, 500));
    }

    if (!authDone) {
      throw new Error(`Authentication timed out after ${timeoutSec} seconds.`);
    }

    console.log(`[ACP-AUTH] Authentication approved! Creating new session to commit tokens...`);
    try {
      await connection.newSession(process.cwd());
    } catch (e: any) {
      console.log(`[ACP-AUTH] newSession note: ${e.message}`);
    }

    // Verify ACP token exists
    if (!fs.existsSync(ACP_AUTH_FILE)) {
      throw new Error(`Expected ACP token at ${ACP_AUTH_FILE} not found after authentication.`);
    }

    const acpRaw = fs.readFileSync(ACP_AUTH_FILE, "utf8");
    const acpJson = JSON.parse(acpRaw);
    if (!acpJson.refresh_token) {
      throw new Error(`ACP token file does not contain a refresh_token.`);
    }

    // Save to ACP profile directory with strict permissions
    if (!fs.existsSync(ACP_PROFILES_DIR)) {
      fs.mkdirSync(ACP_PROFILES_DIR, { recursive: true, mode: 0o700 });
    }

    const targetPath = path.join(ACP_PROFILES_DIR, profile);
    fs.writeFileSync(targetPath, acpRaw, { mode: 0o600 });

    fs.writeFileSync(
      STATE_FILE,
      JSON.stringify({ ...stateData, status: "SUCCESS", finishedAt: Date.now() }, null, 2),
      { mode: 0o600 }
    );

    console.log(`\nAUTH_SUCCESS: Successfully authenticated and saved ACP profile for '${profile}'!`);
  } finally {
    try { relay.dispose(); } catch (_) {}
    try { await connection.close(); } catch (_) {}
  }
}

main().catch((err) => {
  console.error(`\nAUTH_ERROR: ${err.message}`);
  try {
    fs.writeFileSync(
      STATE_FILE,
      JSON.stringify({ status: "ERROR", error: err.message }, null, 2),
      { mode: 0o600 }
    );
  } catch (_) {}
  process.exit(1);
});
