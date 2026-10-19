#!/usr/bin/env bash
# .claude/hooks/medharness-no-hand-edits.sh
# Keep the agent to `medharness item`: it checks the schema before it writes, a hand edit does not.
case "$(jq -r '.tool_input.file_path // empty')" in
  */DHF/items/*) echo "Change DHF items with medharness item create|update, not by editing the file." >&2; exit 2 ;;
esac
