_agy_switch_completions() {
  local cur prev
  cur="${COMP_WORDS[COMP_CWORD]}"
  prev="${COMP_WORDS[COMP_CWORD-1]}"

  local commands="tui switch list current add save delete rename json sync completion help"
  local pdir="${HOME}/.gemini/profiles"
  local profiles=""
  if [ -d "$pdir" ]; then
    profiles=$(find "$pdir" -maxdepth 1 -type f ! -name ".*" -exec basename {} \; 2>/dev/null)
  fi

  if [ "$COMP_CWORD" -eq 1 ]; then
    COMPREPLY=( $(compgen -W "${commands} ${profiles}" -- "$cur") )
  elif [ "$COMP_CWORD" -eq 2 ]; then
    case "$prev" in
      switch|delete|rm|remove|rename|mv)
        COMPREPLY=( $(compgen -W "${profiles}" -- "$cur") )
        ;;
      completion)
        COMPREPLY=( $(compgen -W "bash zsh" -- "$cur") )
        ;;
    esac
  fi
}

complete -F _agy_switch_completions agy-switch
