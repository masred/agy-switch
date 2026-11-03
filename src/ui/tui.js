const readline = require('readline');
const { profileManager } = require('../core/profile-manager');
const { formatExpiry } = require('../core/token-decoder');
const { c, padRight, truncate, stringWidth, stripAnsi } = require('../utils/ansi');

class TUI {
  constructor(manager = null) {
    this.manager = manager || profileManager;
    this.selectedIndex = 0;
    this.scrollOffset = 0;

    this.statusMessage = '';
    this.statusType = 'info'; // 'info' | 'success' | 'warn' | 'error'
    this.statusTimer = null;

    // Modal state: null | { type: string, input: string, target?: string, error?: string }
    this.modal = null;

    this.profiles = [];
    this.active = null;
    this.pending = null;
    this.hasUnsavedActive = false;

    this.running = false;
  }

  start() {
    if (!process.stdin.isTTY || !process.stdout.isTTY) {
      console.error('TUI mode requires an interactive TTY terminal.');
      process.exit(1);
    }

    this.running = true;

    // Setup terminal: alternate buffer, clear screen, hide cursor
    process.stdout.write('\x1b[?1049h\x1b[H\x1b[2J\x1b[?25l');

    readline.emitKeypressEvents(process.stdin);
    if (process.stdin.setRawMode) {
      process.stdin.setRawMode(true);
    }

    this.onKeypress = (str, key) => this.handleKey(str, key);
    this.onResize = () => this.render();

    process.stdin.on('keypress', this.onKeypress);
    process.stdout.on('resize', this.onResize);

    const cleanup = () => {
      this.cleanupTerminal();
      process.exit(0);
    };

    process.on('SIGINT', cleanup);
    process.on('SIGTERM', cleanup);
    process.on('exit', () => this.cleanupTerminal());

    this.refreshData();
    this.render();
  }

  cleanupTerminal() {
    if (!this.running) return;
    this.running = false;
    process.stdout.write('\x1b[?25h\x1b[?1049l');
  }

  setStatus(msg, type = 'info', timeoutMs = 4000) {
    this.statusMessage = msg;
    this.statusType = type;
    if (this.statusTimer) clearTimeout(this.statusTimer);
    if (timeoutMs > 0) {
      this.statusTimer = setTimeout(() => {
        this.statusMessage = '';
        this.render();
      }, timeoutMs);
    }
  }

  refreshData() {
    const res = this.manager.getProfiles();
    this.profiles = res.profiles;
    this.active = res.active;
    this.pending = res.pending;
    this.hasUnsavedActive = res.hasUnsavedActive;

    if (this.selectedIndex >= this.profiles.length) {
      this.selectedIndex = Math.max(0, this.profiles.length - 1);
    }
  }

  handleKey(str, key) {
    if (!key) return;

    // Global Quit
    if (key.ctrl && key.name === 'c') {
      this.cleanupTerminal();
      process.exit(0);
    }

    // Modal Handling
    if (this.modal) {
      this.handleModalKey(str, key);
      this.render();
      return;
    }

    const rows = process.stdout.rows || 24;
    const contentH = Math.max(5, rows - 11);

    // Normal Navigation
    switch (key.name) {
      case 'up':
      case 'k':
        if (this.profiles.length > 0) {
          this.selectedIndex = (this.selectedIndex - 1 + this.profiles.length) % this.profiles.length;
          this.adjustScroll(contentH);
          this.render();
        }
        break;

      case 'down':
      case 'j':
        if (this.profiles.length > 0) {
          this.selectedIndex = (this.selectedIndex + 1) % this.profiles.length;
          this.adjustScroll(contentH);
          this.render();
        }
        break;

      case 'pageup':
        if (this.profiles.length > 0) {
          this.selectedIndex = Math.max(0, this.selectedIndex - contentH);
          this.adjustScroll(contentH);
          this.render();
        }
        break;

      case 'pagedown':
        if (this.profiles.length > 0) {
          this.selectedIndex = Math.min(this.profiles.length - 1, this.selectedIndex + contentH);
          this.adjustScroll(contentH);
          this.render();
        }
        break;

      case 'home':
        this.selectedIndex = 0;
        this.adjustScroll(contentH);
        this.render();
        break;

      case 'end':
        this.selectedIndex = Math.max(0, this.profiles.length - 1);
        this.adjustScroll(contentH);
        this.render();
        break;

      case 'return':
      case 'enter':
      case 'space':
        if (this.profiles.length > 0) {
          const selected = this.profiles[this.selectedIndex];
          try {
            const res = this.manager.switchProfile(selected.name);
            this.refreshData();
            const acpMsg = res.hasAcp ? ' [CLI+ACP]' : ' [CLI only; run /agy auth in Pi for ACP]';
            this.setStatus(`✓ Switched to '${selected.name}'${acpMsg}. Restart agy or /reload Pi.`, res.hasAcp ? 'success' : 'warn', 6000);
          } catch (err) {
            this.setStatus(`Error: ${err.message}`, 'error');
          }
          this.render();
        }
        break;

      case 'a':
        this.modal = { type: 'add', input: '', error: '' };
        this.render();
        break;

      case 's':
        this.modal = { type: 'save', input: '', error: '' };
        this.render();
        break;

      case 'r':
        if (this.profiles.length > 0) {
          const sel = this.profiles[this.selectedIndex];
          this.modal = { type: 'rename', target: sel.name, input: sel.name, error: '' };
          this.render();
        }
        break;

      case 'd':
      case 'x':
      case 'delete':
        if (this.profiles.length > 0) {
          const sel = this.profiles[this.selectedIndex];
          this.modal = { type: 'delete', target: sel.name };
          this.render();
        }
        break;

      case 'q':
      case 'escape':
        this.cleanupTerminal();
        process.exit(0);
        break;

      case 'question':
      case 'h':
        this.modal = { type: 'help' };
        this.render();
        break;
    }
  }

  adjustScroll(contentH) {
    if (this.selectedIndex < this.scrollOffset) {
      this.scrollOffset = this.selectedIndex;
    } else if (this.selectedIndex >= this.scrollOffset + contentH) {
      this.scrollOffset = this.selectedIndex - contentH + 1;
    }
    const maxOffset = Math.max(0, this.profiles.length - contentH);
    this.scrollOffset = Math.max(0, Math.min(this.scrollOffset, maxOffset));
  }

  handleModalKey(str, key) {
    if (key.name === 'escape') {
      this.modal = null;
      return;
    }

    if (this.modal.type === 'help') {
      if (['return', 'enter', 'space', 'q', 'escape'].includes(key.name)) {
        this.modal = null;
      }
      return;
    }

    if (this.modal.type === 'post_add') {
      if (['return', 'enter', 'space', 'q', 'escape'].includes(key.name)) {
        const pendingName = this.pending;
        this.modal = null;
        this.cleanupTerminal();
        console.log(`\n${c.bold}${c.cyan}=== Setup Ready for Account: '${pendingName}' ===${c.reset}`);
        console.log(`1. Run ${c.bold}${c.cyan}agy${c.reset} in your terminal.`);
        console.log(`2. Complete the Google browser sign-in.`);
        console.log(`3. Credentials will automatically be saved as profile '${c.bold}${pendingName}${c.reset}'.\n`);
        process.exit(0);
      }
      return;
    }

    if (this.modal.type === 'delete') {
      if (str === 'y' || str === 'Y' || key.name === 'return') {
        try {
          const { wasActive } = this.manager.deleteProfile(this.modal.target);
          this.refreshData();
          const activeNote = wasActive ? ' (Active session was cleared)' : '';
          this.setStatus(`✓ Deleted profile '${this.modal.target}'${activeNote}.`, 'success');
        } catch (err) {
          this.setStatus(`Error: ${err.message}`, 'error');
        }
        this.modal = null;
      } else if (str === 'n' || str === 'N' || key.name === 'escape') {
        this.modal = null;
      }
      return;
    }

    // Text Input for Add / Save / Rename
    if (key.name === 'return' || key.name === 'enter') {
      const val = this.modal.input.trim();
      if (!val) {
        this.modal.error = 'Profile name cannot be empty.';
        return;
      }

      try {
        if (this.modal.type === 'add') {
          this.manager.addProfile(val);
          this.refreshData();
          this.modal = { type: 'post_add', target: val };
          return;
        } else if (this.modal.type === 'save') {
          this.manager.saveProfile(val);
          this.refreshData();
          this.setStatus(`✓ Saved current session as profile '${val}'.`, 'success');
          this.modal = null;
        } else if (this.modal.type === 'rename') {
          this.manager.renameProfile(this.modal.target, val);
          this.refreshData();
          this.setStatus(`✓ Renamed profile '${this.modal.target}' to '${val}'.`, 'success');
          this.modal = null;
        }
      } catch (err) {
        this.modal.error = err.message;
      }
      return;
    }

    if (key.name === 'backspace') {
      this.modal.input = this.modal.input.slice(0, -1);
      this.modal.error = '';
      return;
    }

    // Accept valid profile name characters: letters, numbers, hyphens, underscores
    if (str && /^[a-zA-Z0-9_-]$/.test(str)) {
      if (this.modal.input.length < 64) {
        this.modal.input += str;
        this.modal.error = '';
      }
    } else if (str && /^[\x20-\x7E]$/.test(str)) {
      this.modal.error = 'Only letters, numbers, hyphens, and underscores are allowed.';
    }
  }

  render() {
    const cols = Math.max(40, process.stdout.columns || 80);
    const rows = Math.max(15, process.stdout.rows || 24);

    const buf = [];
    const push = line => buf.push(line + '\x1b[K'); // clear to end of line on each row

    // Cursor home (no flicker)
    buf.push('\x1b[H');

    // 1. Header Box
    const headerTitle = `🚀 AGY ACCOUNT SWITCHER `;
    const headerSub = ` Google Account Switcher for Antigravity CLI`;
    const innerW = Math.max(10, cols - 4);

    push(`${c.cyan}╭${'─'.repeat(cols - 2)}╮${c.reset}`);
    const hText = `${c.bold}${c.brightWhite}${headerTitle}${c.reset}${c.dim}${headerSub}${c.reset}`;
    push(`${c.cyan}│${c.reset} ${padRight(hText, innerW)} ${c.cyan}│${c.reset}`);
    push(`${c.cyan}╰${'─'.repeat(cols - 2)}╯${c.reset}`);

    let currentY = 3;

    // 2. Pending Notice (if exists)
    if (this.pending) {
      const pMsg = `⏳ PENDING LOGIN: '${this.pending}' is waiting for Google sign-in. Run 'agy' in terminal.`;
      push(`${c.yellow}╭${'─'.repeat(cols - 2)}╮${c.reset}`);
      push(`${c.yellow}│${c.reset} ${padRight(c.bold + c.yellow + pMsg + c.reset, innerW)} ${c.yellow}│${c.reset}`);
      push(`${c.yellow}╰${'─'.repeat(cols - 2)}╯${c.reset}`);
      currentY += 3;
    }

    // 3. Main Area: Split or Single View
    const contentH = Math.max(4, rows - currentY - 5);
    this.adjustScroll(contentH);

    const isSplit = cols >= 74;
    const listW = isSplit ? Math.min(38, Math.floor(cols * 0.42)) : cols - 2;
    const detailW = isSplit ? cols - listW - 5 : 0;

    if (isSplit) {
      const scrollUpIndicator = this.scrollOffset > 0 ? `${c.brightYellow}▲${c.reset}` : ' ';
      const scrollDownIndicator = (this.scrollOffset + contentH < this.profiles.length) ? `${c.brightYellow}▼${c.reset}` : ' ';

      const leftHeader = ` Profile List (${this.profiles.length}) ${scrollUpIndicator}`;
      const rightHeader = ` Profile Details `;

      push(`${c.blue}╭${'─'.repeat(listW)}┬${'─'.repeat(detailW)}╮${c.reset}`);
      push(`${c.blue}│${c.bold}${c.brightCyan}${padRight(leftHeader, listW)}${c.reset}${c.blue}│${c.bold}${c.brightCyan}${padRight(rightHeader, detailW)}${c.reset}${c.blue}│${c.reset}`);
      push(`${c.blue}├${'─'.repeat(listW)}┼${'─'.repeat(detailW)}┤${c.reset}`);

      const selProfile = this.profiles[this.selectedIndex] || null;

      for (let i = 0; i < contentH; i++) {
        const itemIdx = this.scrollOffset + i;
        let leftCol = '';

        if (itemIdx < this.profiles.length) {
          const p = this.profiles[itemIdx];
          const isSelected = itemIdx === this.selectedIndex;
          const isCurrentActive = p.active;

          const cursor = isSelected ? `${c.brightCyan}▶${c.reset}` : ' ';
          const badge = isCurrentActive ? `${c.brightGreen}● [ACTIVE]${c.reset}` : `${c.gray}○         ${c.reset}`;
          const maxNameLen = Math.max(6, listW - 14);
          const pName = truncate(p.name, maxNameLen);

          if (isSelected) {
            leftCol = ` ${cursor} ${c.bold}${c.brightWhite}${c.bgDarkGray}${padRight(pName, maxNameLen)}${c.reset} ${badge}`;
          } else {
            leftCol = ` ${cursor} ${padRight(pName, maxNameLen)} ${badge}`;
          }
        } else if (this.profiles.length === 0 && i === 1) {
          leftCol = `  ${c.dim}(No profiles saved)${c.reset}`;
        }

        let rightCol = '';
        if (selProfile) {
          switch (i) {
            case 0:
              rightCol = ` ${c.bold}Name:${c.reset}        ${c.brightCyan}${selProfile.name}${c.reset}`;
              break;
            case 1:
              rightCol = ` ${c.bold}Email:${c.reset}       ${selProfile.email ? c.brightWhite + selProfile.email + c.reset : c.dim + '(Not specified in token)' + c.reset}`;
              break;
            case 2:
              rightCol = ` ${c.bold}Status:${c.reset}      ${selProfile.active ? c.brightGreen + '● Active' + c.reset : c.gray + '○ Inactive' + c.reset}`;
              break;
            case 3:
              rightCol = ` ${c.bold}Auth Type:${c.reset}   ${selProfile.authMethod}`;
              break;
            case 4:
              rightCol = ` ${c.bold}CLI Token:${c.reset}   ${selProfile.hasRefreshToken ? c.green + 'Available (Auto-renew)' + c.reset : c.yellow + 'None' + c.reset}`;
              break;
            case 5:
              rightCol = ` ${c.bold}ACP Token:${c.reset}   ${selProfile.hasAcp ? c.green + 'Available (Synced)' + c.reset : c.yellow + 'Missing (run /agy auth in Pi)' + c.reset}`;
              break;
            case 6:
              rightCol = ` ${c.bold}Expiry:${c.reset}      ${formatExpiry(selProfile.expiry)}`;
              break;
            case 7:
              rightCol = ` ${c.bold}CLI File:${c.reset}    ${c.dim}~/.gemini/profiles/${selProfile.name}${c.reset}`;
              break;
            case 8:
              rightCol = ` ${c.bold}ACP File:${c.reset}    ${selProfile.hasAcp ? c.dim + '~/.gemini/profiles/.acp/' + selProfile.name + c.reset : c.yellow + '(Not linked yet)' + c.reset}`;
              break;
            case 9:
              rightCol = ` ${c.dim}Press ${c.bold}[Enter]${c.reset}${c.dim} to switch. Restart agy or /reload Pi.${c.reset}`;
              break;
          }
        } else if (this.profiles.length === 0 && i === 1) {
          rightCol = ` ${c.yellow}Press [a] to add a new Google account.${c.reset}`;
        }

        push(`${c.blue}│${c.reset}${padRight(leftCol, listW)}${c.blue}│${c.reset}${padRight(rightCol, detailW)}${c.blue}│${c.reset}`);
      }

      const bottomIndicator = scrollDownIndicator !== ' ' ? `──${scrollDownIndicator}──` : '─────';
      const bottomListBorder = '─'.repeat(Math.max(0, listW - bottomIndicator.length)) + bottomIndicator;
      push(`${c.blue}╰${bottomListBorder}┴${'─'.repeat(detailW)}╯${c.reset}`);
    } else {
      // Single column layout
      push(`${c.blue}╭${'─'.repeat(listW)}╮${c.reset}`);
      for (let i = 0; i < contentH; i++) {
        const itemIdx = this.scrollOffset + i;
        let line = '';
        if (itemIdx < this.profiles.length) {
          const p = this.profiles[itemIdx];
          const isSelected = itemIdx === this.selectedIndex;
          const cursor = isSelected ? `${c.brightCyan}▶${c.reset}` : ' ';
          const badge = p.active ? `${c.brightGreen}● [ACTIVE]${c.reset}` : `${c.gray}○${c.reset}`;
          const emailPart = p.email ? ` ${c.dim}(${p.email})${c.reset}` : '';
          const maxLen = Math.max(6, listW - 16);
          line = ` ${cursor} ${padRight(truncate(p.name + emailPart, maxLen), maxLen)} ${badge}`;
        }
        push(`${c.blue}│${c.reset}${padRight(line, listW)}${c.blue}│${c.reset}`);
      }
      push(`${c.blue}╰${'─'.repeat(listW)}╯${c.reset}`);
    }

    // 4. Status Message Line
    let statusFormatted = ' ';
    if (this.statusMessage) {
      if (this.statusType === 'success') {
        statusFormatted = `${c.bold}${c.green}${this.statusMessage}${c.reset}`;
      } else if (this.statusType === 'error') {
        statusFormatted = `${c.bold}${c.red}${this.statusMessage}${c.reset}`;
      } else if (this.statusType === 'warn') {
        statusFormatted = `${c.bold}${c.yellow}${this.statusMessage}${c.reset}`;
      } else {
        statusFormatted = `${c.cyan}${this.statusMessage}${c.reset}`;
      }
    }
    push(` ${statusFormatted}`);

    // 5. Keybinding Action Bar
    const keyActions = [
      `${c.bold}[↑/↓/j/k]${c.reset} Move`,
      `${c.bold}[Enter]${c.reset} Switch`,
      `${c.bold}[a]${c.reset} Add`,
      `${c.bold}[s]${c.reset} Save`,
      `${c.bold}[r]${c.reset} Rename`,
      `${c.bold}[d]${c.reset} Delete`,
      `${c.bold}[?]${c.reset} Help`,
      `${c.bold}[q]${c.reset} Quit`,
    ].join('  ');

    push(`${c.dim} ${keyActions}${c.reset}`);

    // 6. Draw Modal Dialog if Active
    if (this.modal) {
      this.drawModal(cols, rows, buf);
    }

    process.stdout.write(buf.join('\n'));
  }

  drawModal(cols, rows, buf) {
    const modalW = Math.min(62, Math.max(30, cols - 6));
    let modalTitle = '';
    let modalBody = [];

    if (this.modal.type === 'add') {
      modalTitle = ' + Add New Google Account ';
      modalBody = [
        'Enter profile name for the new account:',
        `> ${c.bold}${c.brightCyan}${this.modal.input}${c.reset}_`,
      ];
      if (this.modal.error) {
        modalBody.push(`${c.red}⚠ ${this.modal.error}${c.reset}`);
      } else {
        modalBody.push('');
      }
      modalBody.push(`${c.dim}[Enter] Confirm  [Esc] Cancel${c.reset}`);
    } else if (this.modal.type === 'save') {
      modalTitle = ' 💾 Save Current Session ';
      modalBody = [
        'Enter profile name to save active token as:',
        `> ${c.bold}${c.brightCyan}${this.modal.input}${c.reset}_`,
      ];
      if (this.modal.error) {
        modalBody.push(`${c.red}⚠ ${this.modal.error}${c.reset}`);
      } else {
        modalBody.push('');
      }
      modalBody.push(`${c.dim}[Enter] Save  [Esc] Cancel${c.reset}`);
    } else if (this.modal.type === 'rename') {
      modalTitle = ` ✏ Rename Profile '${this.modal.target}' `;
      modalBody = [
        'Enter new profile name:',
        `> ${c.bold}${c.brightCyan}${this.modal.input}${c.reset}_`,
      ];
      if (this.modal.error) {
        modalBody.push(`${c.red}⚠ ${this.modal.error}${c.reset}`);
      } else {
        modalBody.push('');
      }
      modalBody.push(`${c.dim}[Enter] Rename  [Esc] Cancel${c.reset}`);
    } else if (this.modal.type === 'delete') {
      modalTitle = ` 🗑 Delete Profile `;
      modalBody = [
        `Are you sure you want to delete '${c.bold}${this.modal.target}${c.reset}'?`,
        '',
        `${c.bold}${c.red}[y] Confirm Delete${c.reset}   ${c.dim}[n / Esc] Cancel${c.reset}`,
      ];
    } else if (this.modal.type === 'post_add') {
      modalTitle = ` ✓ Setup Ready for '${this.modal.target}' `;
      modalBody = [
        'Next Steps to Authenticate:',
        `1. Press ${c.bold}[Enter]${c.reset} to exit agy-switch.`,
        `2. Run ${c.bold}${c.cyan}agy${c.reset} in your terminal.`,
        '3. Complete the Google login in your browser.',
        `4. Credentials will automatically save as '${c.bold}${this.modal.target}${c.reset}'!`,
        '',
        `${c.bold}[Enter / q] Exit to Terminal${c.reset}`,
      ];
    } else if (this.modal.type === 'help') {
      modalTitle = ' ℹ agy-switch Keybindings ';
      modalBody = [
        `${c.bold}↑ / ↓ / j / k${c.reset}  : Navigate profile list`,
        `${c.bold}PgUp / PgDn${c.reset}    : Jump page up / down`,
        `${c.bold}Home / End${c.reset}     : Jump to top / bottom`,
        `${c.bold}Enter / Space${c.reset}  : Switch active Google account`,
        `${c.bold}a${c.reset}              : Add new Google account profile`,
        `${c.bold}s${c.reset}              : Save current session as a profile`,
        `${c.bold}r${c.reset}              : Rename selected profile`,
        `${c.bold}d / x${c.reset}          : Delete selected profile`,
        `${c.bold}q / Esc${c.reset}        : Exit agy-switch`,
        '',
        `${c.dim}Press any key to close this help window.${c.reset}`,
      ];
    }

    const modalH = modalBody.length + 2;
    const startY = Math.max(2, Math.floor((rows - modalH) / 2));
    const startX = Math.max(2, Math.floor((cols - modalW) / 2));

    let overlay = [];
    overlay.push(`\x1b[${startY};${startX}H${c.bgBlue}${c.brightWhite}╭${'─'.repeat(Math.max(0, modalW - 2))}╮${c.reset}`);

    const headerPad = Math.max(0, modalW - 4 - stringWidth(modalTitle));
    const headerLine = ` ${c.bold}${modalTitle}${c.reset}${' '.repeat(headerPad)} `;
    overlay.push(`\x1b[${startY + 1};${startX}H${c.bgBlue}${c.brightWhite}│${c.reset}${c.bgBlack}${headerLine}${c.bgBlue}${c.brightWhite}│${c.reset}`);
    overlay.push(`\x1b[${startY + 2};${startX}H${c.bgBlue}${c.brightWhite}├${'─'.repeat(Math.max(0, modalW - 2))}┤${c.reset}`);

    modalBody.forEach((bLine, idx) => {
      const y = startY + 3 + idx;
      const bPad = Math.max(0, modalW - 4 - stringWidth(bLine));
      const rowContent = ` ${bLine}${' '.repeat(bPad)} `;
      overlay.push(`\x1b[${y};${startX}H${c.bgBlue}${c.brightWhite}│${c.reset}${c.bgBlack}${rowContent}${c.bgBlue}${c.brightWhite}│${c.reset}`);
    });

    const endY = startY + 3 + modalBody.length;
    overlay.push(`\x1b[${endY};${startX}H${c.bgBlue}${c.brightWhite}╰${'─'.repeat(Math.max(0, modalW - 2))}╯${c.reset}`);

    buf.push(overlay.join(''));
  }
}

module.exports = { TUI };
