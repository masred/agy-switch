const fs = require('fs');
const path = require('path');
const { profileManager } = require('../core/profile-manager');
const { TUI } = require('../ui/tui');
const { c } = require('../utils/ansi');
const packageJson = require('../../package.json');

function cmdList(manager = profileManager) {
  const { profiles, active, pending, hasUnsavedActive } = manager.getProfiles();

  console.log(`${c.bold}Google Account Profiles in ${c.cyan}${manager.cfg.PROFILES_DIR}${c.reset}:`);
  if (profiles.length === 0) {
    console.log(`  ${c.yellow}(No profiles saved yet. Run 'agy-switch' or 'agy-switch add <name>')${c.reset}`);
  } else {
    // Find max name length for clean tabular padding
    const maxNameLen = Math.max(14, ...profiles.map(p => p.name.length));
    const maxEmailLen = Math.max(18, ...profiles.map(p => (p.email || '').length));

    for (const p of profiles) {
      const acpStatus = p.hasAcp ? `${c.dim}[CLI+ACP]${c.reset}` : `${c.yellow}[CLI only]${c.reset}`;
      const emailCol = p.email ? `${c.cyan}${p.email.padEnd(maxEmailLen)}${c.reset}` : `${c.gray}${'(no email)'.padEnd(maxEmailLen)}${c.reset}`;
      const nameCol = p.name.padEnd(maxNameLen);

      if (p.active) {
        console.log(`  ${c.green}● ${nameCol}  ${emailCol}  ${c.bold}[ACTIVE]${c.reset}  ${acpStatus}`);
      } else {
        console.log(`  ${c.gray}○${c.reset} ${nameCol}  ${emailCol}            ${acpStatus}`);
      }
    }
  }

  if (hasUnsavedActive) {
    console.log(`\n  ${c.yellow}! Current active session is not saved as a profile.${c.reset}`);
    console.log(`    Run '${c.cyan}agy-switch save <name>${c.reset}' to save it.`);
  }

  if (pending) {
    console.log(`\n  ${c.yellow}⏳ Pending Setup: Profile '${c.bold}${pending}${c.reset}${c.yellow}' waiting for Google browser sign-in.${c.reset}`);
    console.log(`     Run '${c.cyan}agy${c.reset}' in your terminal to complete authentication.`);
  }
}

function cmdJson(manager = profileManager) {
  const { profiles, active, pending } = manager.getProfiles();

  const jsonProfiles = profiles.map(p => ({
    name: p.name,
    email: p.email,
    active: p.active,
    authMethod: p.authMethod,
    expiry: p.expiry,
    hasRefreshToken: p.hasRefreshToken,
    hasAcp: p.hasAcp,
    mtime: p.mtime,
  }));

  console.log(JSON.stringify({ active: active || '', pending: pending || '', profiles: jsonProfiles }));
}

function cmdCurrent(manager = profileManager) {
  const active = manager.getActiveProfile();
  if (active) {
    console.log(active);
  } else {
    console.error(`${c.yellow}(No active profile detected or unsaved session)${c.reset}`);
    process.exit(1);
  }
}

function cmdSwitch(name, manager = profileManager) {
  if (!name) {
    console.error(`${c.red}Error: Profile name required.${c.reset}`);
    console.error(`Usage: ${c.cyan}agy-switch <profile-name>${c.reset} or ${c.cyan}agy-switch switch <profile-name>${c.reset}`);
    process.exit(1);
  }

  try {
    const { hasAcp } = manager.switchProfile(name);
    console.log(`${c.green}✓ Switched active Google account to '${c.bold}${name}${c.reset}${c.green}'.${c.reset}`);
    if (hasAcp) {
      console.log(`${c.green}✓ Synced both Antigravity CLI and ACP tokens.${c.reset}`);
    } else {
      console.log(`${c.yellow}⚠ Notice: ACP token not found for '${name}'. Authenticate ACP to link credentials.${c.reset}`);
    }
    console.log(`${c.dim}ℹ Restart any running agy instance or reload your ACP client for the changes to apply.${c.reset}`);
  } catch (err) {
    console.error(`${c.red}Error: ${err.message}${c.reset}`);
    process.exit(1);
  }
}

function cmdAdd(name, manager = profileManager) {
  if (!name) {
    console.error(`${c.red}Error: Profile name required.${c.reset}`);
    console.error(`Usage: ${c.cyan}agy-switch add <profile-name>${c.reset}`);
    process.exit(1);
  }

  try {
    manager.addProfile(name);
    console.log(`\n${c.bold}${c.cyan}=== Prepared Setup for New Account: '${name}' ===${c.reset}`);
    console.log(`1. Exit any running agy instance (${c.dim}Ctrl+D Ctrl+D${c.reset}).`);
    console.log(`2. Run ${c.bold}${c.cyan}agy${c.reset} in your terminal.`);
    console.log(`3. Complete the Google browser login prompt.`);
    console.log(`4. The credentials will automatically be saved as profile '${c.bold}${name}${c.reset}'.\n`);
  } catch (err) {
    console.error(`${c.red}Error: ${err.message}${c.reset}`);
    process.exit(1);
  }
}

function cmdSave(name, manager = profileManager) {
  if (!name) {
    console.error(`${c.red}Error: Profile name required.${c.reset}`);
    console.error(`Usage: ${c.cyan}agy-switch save <profile-name>${c.reset}`);
    process.exit(1);
  }

  try {
    const { hasAcp } = manager.saveProfile(name);
    console.log(`${c.green}✓ Successfully saved active credentials as profile '${c.bold}${name}${c.reset}${c.green}'.${c.reset}`);
    if (hasAcp) {
      console.log(`${c.green}✓ Saved both CLI and ACP credentials.${c.reset}`);
    } else {
      console.log(`${c.dim}ℹ Note: No ACP credentials detected to save for this profile.${c.reset}`);
    }
  } catch (err) {
    console.error(`${c.red}Error: ${err.message}${c.reset}`);
    process.exit(1);
  }
}

function cmdSaveAcp(name, manager = profileManager) {
  try {
    const saved = manager.saveAcpProfile(name);
    console.log(`${c.green}✓ Saved active ACP credentials for profile '${c.bold}${saved}${c.reset}${c.green}'.${c.reset}`);
  } catch (err) {
    console.error(`${c.red}Error: ${err.message}${c.reset}`);
    process.exit(1);
  }
}

function cmdDelete(name, manager = profileManager) {
  if (!name) {
    console.error(`${c.red}Error: Profile name required.${c.reset}`);
    console.error(`Usage: ${c.cyan}agy-switch delete <profile-name>${c.reset}`);
    process.exit(1);
  }

  try {
    const { wasActive } = manager.deleteProfile(name);
    const activeNote = wasActive ? ' (Active session was cleared)' : '';
    console.log(`${c.green}✓ Deleted profile '${c.bold}${name}${c.reset}${c.green}'${activeNote}.${c.reset}`);
  } catch (err) {
    console.error(`${c.red}Error: ${err.message}${c.reset}`);
    process.exit(1);
  }
}

function cmdRename(oldName, newName, manager = profileManager) {
  if (!oldName || !newName) {
    console.error(`${c.red}Error: Old and new profile names required.${c.reset}`);
    console.error(`Usage: ${c.cyan}agy-switch rename <old-name> <new-name>${c.reset}`);
    process.exit(1);
  }

  try {
    manager.renameProfile(oldName, newName);
    console.log(`${c.green}✓ Renamed profile '${c.bold}${oldName}${c.reset}${c.green}' to '${c.bold}${newName}${c.reset}${c.green}'.${c.reset}`);
  } catch (err) {
    console.error(`${c.red}Error: ${err.message}${c.reset}`);
    process.exit(1);
  }
}

function cmdCompletion(shellType = 'bash') {
  const completionFile = shellType === 'zsh'
    ? path.join(__dirname, '..', '..', 'completions', '_agy-switch')
    : path.join(__dirname, '..', '..', 'completions', 'agy-switch.bash');

  if (fs.existsSync(completionFile)) {
    console.log(fs.readFileSync(completionFile, 'utf8'));
  } else {
    console.error(`${c.red}Completion file not found: ${completionFile}${c.reset}`);
    process.exit(1);
  }
}

function cmdVersion() {
  console.log(`agy-switch v${packageJson.version}`);
}

function cmdHelp() {
  console.log(`${c.bold}${c.cyan}agy-switch${c.reset} v${packageJson.version} - Google Account Switcher TUI & CLI for Antigravity CLI (agy) & ACP Bridge\n`);
  console.log(`${c.bold}USAGE:${c.reset}`);
  console.log(`  ${c.cyan}agy-switch${c.reset}                      Launch interactive TUI application`);
  console.log(`  ${c.cyan}agy-switch <name>${c.reset}               Directly switch to <name>`);
  console.log(`  ${c.cyan}agy-switch switch <name>${c.reset}        Directly switch to <name>`);
  console.log(`  ${c.cyan}agy-switch list${c.reset}                 List all saved profiles (CLI, ACP, and Email)`);
  console.log(`  ${c.cyan}agy-switch current${c.reset}              Print current active profile name`);
  console.log(`  ${c.cyan}agy-switch add <name>${c.reset}           Prepare login for a new account`);
  console.log(`  ${c.cyan}agy-switch save <name>${c.reset}          Save current active session (CLI & ACP) as a profile`);
  console.log(`  ${c.cyan}agy-switch save-acp [name]${c.reset}     Save current ACP credentials to a profile`);
  console.log(`  ${c.cyan}agy-switch delete <name>${c.reset}        Delete a saved profile`);
  console.log(`  ${c.cyan}agy-switch rename <old> <new>${c.reset}   Rename a profile`);
  console.log(`  ${c.cyan}agy-switch json${c.reset}                 Output profile data in JSON`);
  console.log(`  ${c.cyan}agy-switch sync${c.reset}                 Sync pending logins or refreshed tokens`);
  console.log(`  ${c.cyan}agy-switch completion [bash|zsh]${c.reset} Output shell completion script`);
  console.log(`  ${c.cyan}agy-switch --version${c.reset}            Print version`);
  console.log(`  ${c.cyan}agy-switch help${c.reset}                 Show this help message\n`);
  console.log(`${c.bold}TUI KEYBINDINGS:${c.reset}`);
  console.log(`  ${c.bold}↑ / ↓ / j / k${c.reset}  Navigate profiles`);
  console.log(`  ${c.bold}PgUp / PgDn${c.reset}    Jump page up / down`);
  console.log(`  ${c.bold}Home / End${c.reset}     Jump to top / bottom`);
  console.log(`  ${c.bold}Enter / Space${c.reset}  Switch to selected account`);
  console.log(`  ${c.bold}a${c.reset}              Add new account`);
  console.log(`  ${c.bold}s${c.reset}              Save current session`);
  console.log(`  ${c.bold}r${c.reset}              Rename selected profile`);
  console.log(`  ${c.bold}d / x${c.reset}          Delete selected profile`);
  console.log(`  ${c.bold}?${c.reset}              Toggle help dialog`);
  console.log(`  ${c.bold}q / Esc${c.reset}        Quit`);
}

function runCLI() {
  const args = process.argv.slice(2);
  const cmd = args[0] || '';

  if (!cmd) {
    if (process.stdout.isTTY && process.stdin.isTTY) {
      new TUI().start();
      return;
    } else {
      cmdList();
      return;
    }
  }

  switch (cmd) {
    case 'tui':
      new TUI().start();
      break;

    case 'list':
    case 'ls':
      cmdList();
      break;

    case 'json':
      cmdJson();
      break;

    case 'current':
    case 'status':
    case 'whoami':
      cmdCurrent();
      break;

    case 'switch':
      cmdSwitch(args[1]);
      break;

    case 'add':
    case 'new':
      cmdAdd(args[1]);
      break;

    case 'save':
      cmdSave(args[1]);
      break;

    case 'save-acp':
      cmdSaveAcp(args[1]);
      break;

    case 'delete':
    case 'rm':
    case 'remove':
      cmdDelete(args[1]);
      break;

    case 'rename':
    case 'mv':
      cmdRename(args[1], args[2]);
      break;

    case 'sync':
    case 'auto-sync':
      profileManager.sync();
      cmdList();
      break;

    case 'completion':
      cmdCompletion(args[1]);
      break;

    case '--version':
    case '-v':
      cmdVersion();
      break;

    case 'help':
    case '--help':
    case '-h':
      cmdHelp();
      break;

    default:
      // Direct profile switch shortcut: `agy-switch <profile>`
      try {
        const resolvedPath = profileManager.resolveProfilePath(profileManager.cfg.PROFILES_DIR, cmd);
        if (fs.existsSync(resolvedPath)) {
          cmdSwitch(cmd);
          return;
        }
      } catch (_) {}

      console.error(`${c.red}Unknown command or profile: '${cmd}'${c.reset}\n`);
      cmdHelp();
      process.exit(1);
  }
}

module.exports = {
  runCLI,
  cmdList,
  cmdJson,
  cmdCurrent,
  cmdSwitch,
  cmdAdd,
  cmdSave,
  cmdSaveAcp,
  cmdDelete,
  cmdRename,
  cmdCompletion,
  cmdVersion,
  cmdHelp,
};
