#!/usr/bin/env bash
set -e

INSTALL_DIR="${HOME}/.local/bin"
SCRIPT_SRC="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/bin/agy-switch"

mkdir -p "$INSTALL_DIR"

chmod +x "$SCRIPT_SRC"
ln -sf "$SCRIPT_SRC" "$INSTALL_DIR/agy-switch"

echo "✓ Installed agy-switch to $INSTALL_DIR/agy-switch"

# Install completions if directory exists
if [ -d "$HOME/.zsh/completions" ]; then
  cp "$(dirname "${BASH_SOURCE[0]}")/completions/_agy-switch" "$HOME/.zsh/completions/_agy-switch"
  echo "✓ Installed zsh completion to $HOME/.zsh/completions/_agy-switch"
fi

echo "Done! Ensure $INSTALL_DIR is in your PATH."
