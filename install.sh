#!/usr/bin/env bash
set -e

if ! command -v node >/dev/null 2>&1; then
  echo "Error: Node.js (>=18.0.0) is required but not found in PATH." >&2
  exit 1
fi

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
INSTALL_DIR="${HOME}/.local/bin"
SCRIPT_SRC="${REPO_DIR}/bin/agy-switch"

mkdir -p "$INSTALL_DIR"
chmod +x "$SCRIPT_SRC"
ln -sf "$SCRIPT_SRC" "$INSTALL_DIR/agy-switch"

echo "✓ Linked agy-switch to $INSTALL_DIR/agy-switch"

# Install Zsh completion if directory exists
if [ -d "$HOME/.zsh/completions" ]; then
  cp "${REPO_DIR}/completions/_agy-switch" "$HOME/.zsh/completions/_agy-switch"
  echo "✓ Installed zsh completion to $HOME/.zsh/completions/_agy-switch"
fi

# Install Bash completion if directory exists
BASH_COMP_DIR="${HOME}/.local/share/bash-completion/completions"
if [ -d "$BASH_COMP_DIR" ]; then
  cp "${REPO_DIR}/completions/agy-switch.bash" "$BASH_COMP_DIR/agy-switch"
  echo "✓ Installed bash completion to $BASH_COMP_DIR/agy-switch"
fi

echo ""
# Check PATH
case ":$PATH:" in
  *":$INSTALL_DIR:"*) ;;
  *)
    echo "⚠ Note: $INSTALL_DIR is not in your current PATH."
    echo "  Add it by running: export PATH=\"\$HOME/.local/bin:\$PATH\""
    ;;
esac

echo "✓ Setup complete! Run 'agy-switch' to launch the TUI or 'agy-switch help' for CLI commands."
