# agy-switch

> Google Account Switcher TUI & CLI for Google Antigravity CLI (`agy`) and ACP Bridge.

`agy-switch` is a zero-dependency, standalone terminal application and command-line utility for managing and seamlessly switching between multiple Google accounts on [Google Antigravity CLI](https://antigravity.google) and the Agent Client Protocol (ACP) bridge.

---

## ✨ Features

- **Zero External Dependencies**: Pure standard Node.js (`fs`, `path`, `os`, `readline`, ANSI formatting).
- **Interactive TUI**: Beautiful, responsive Terminal User Interface with keyboard navigation, viewport scrolling with indicators (`▲`/`▼`), active indicators, token metadata (email, expiry, refresh token status), and modal dialogs.
- **Dual Sync (CLI + ACP)**: Synchronizes both Antigravity CLI tokens (`~/.gemini/antigravity-cli/antigravity-oauth-token`) and ACP tokens (`~/.gemini/antigravity-acp/acp_token.json`).
- **Auto-Capture & Token Healing**: Automatically captures refreshed OAuth tokens and captures newly verified ACP sessions without manual intervention.
- **Security Hardened**: Path traversal protection, atomic file swapping to prevent race conditions, explicit `0o700`/`0o600` permission enforcement, and user-isolated state files.
- **Headless & Scriptable**: First-class subcommands (`list`, `switch`, `add`, `save`, `save-acp`, `delete`, `rename`, `json`) for shell scripting and automation.
- **Shell Completions**: Built-in tab completions for Zsh and Bash.
- **Comprehensive Test Suite**: Automated tests using native `node:test` runner.

---

## 🚀 Installation

### Option 1: Quick Install (symlink)

```bash
git clone https://github.com/masred/agy-switch.git ~/labs/agy-switch
cd ~/labs/agy-switch
./install.sh
```

### Option 2: npm / bun global link

```bash
npm install -g .
# or
bun link
```

### Option 3: Manual Symlink

```bash
ln -sf ~/labs/agy-switch/bin/agy-switch ~/.local/bin/agy-switch
```

Make sure `~/.local/bin` is in your `$PATH`.

---

## 🖥️ Interactive TUI Mode

Run `agy-switch` without arguments in an interactive terminal:

```bash
agy-switch
```

### Keybindings

| Key | Action |
| --- | --- |
| `↑` / `↓` / `j` / `k` | Navigate profiles list |
| `PgUp` / `PgDn` | Jump page up / down |
| `Home` / `End` | Jump to top / bottom |
| `Enter` / `Space` | Switch active Google account |
| `a` | Add & prepare setup for a new account |
| `s` | Save current active session as a profile |
| `r` | Rename selected profile |
| `d` / `x` | Delete selected profile |
| `?` | Toggle help modal |
| `q` / `Esc` | Quit TUI |

---

## ⌨️ CLI Subcommands

You can run `agy-switch` headlessly:

| Command | Description |
| --- | --- |
| `agy-switch` | Launch interactive TUI |
| `agy-switch <name>` | Shortcut to directly switch to profile `<name>` |
| `agy-switch switch <name>` | Switch active account to profile `<name>` |
| `agy-switch list` (or `ls`) | List all saved profiles with email, CLI, and ACP status |
| `agy-switch current` (or `whoami`) | Print currently active profile name |
| `agy-switch add <name>` | Prepare and wait for browser sign-in for `<name>` |
| `agy-switch save <name>` | Save current active session (CLI & ACP) as `<name>` |
| `agy-switch save-acp [name]` | Save current ACP credentials to a profile |
| `agy-switch delete <name>` | Delete profile `<name>` |
| `agy-switch rename <old> <new>` | Rename profile `<old>` to `<new>` |
| `agy-switch json` | Output profiles and active status in JSON format |
| `agy-switch sync` | Sync pending logins or refreshed tokens |
| `agy-switch completion [bash\|zsh]` | Output shell completion script |
| `agy-switch --version` (or `-v`) | Print package version |
| `agy-switch help` | Show help information |

---

## 🧪 Testing

Run the automated test suite with Node.js built-in test runner:

```bash
npm test
```

---

## 📁 Storage Structure

`agy-switch` manages credentials cleanly under your home directory:

```text
~/.gemini/
├── antigravity-cli/
│   └── antigravity-oauth-token      # Currently active Antigravity CLI token
├── antigravity-acp/
│   └── acp_token.json               # Currently active ACP token
└── profiles/
    ├── .active_profile              # Name of currently active profile
    ├── .pending_profile             # Profile pending initial login
    ├── <profile-name>               # Saved CLI tokens
    └── .acp/
        └── <profile-name>           # Saved ACP tokens
```

---

## 📄 License

MIT © [Dwi Fitriyanto](https://github.com/masred)
