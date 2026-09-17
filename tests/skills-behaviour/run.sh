#!/bin/bash
# S4 behaviour runs: one fresh, isolated Claude Code session per skill × case × language.
# Usage: tests/skills-behaviour/run.sh <max-usd-per-run> <skill>/<case>.<lang> [...]
# Each run gets a workspace outside the repo with only .claude/skills/<skill> (that language) and the
# artifacts of THAT case — a case gets no input another case holds (S5 R2).
# OUT sets the output dir (default: the S4 runs); RUN_TAG suffixes the log, for repeated attempts of one variant.
# Stops before the next run once one costs more than the cap.
set -u
ROOT=$(cd "$(dirname "$0")/../.." && pwd -P)
OUT=${OUT:-"$ROOT/.agent-state/company-v1/s4/runs"}
mkdir -p "$OUT" && OUT=$(cd "$OUT" && pwd -P)   # absolute: the log is written after cd into the workspace
CAP=$1; shift
MODEL=claude-sonnet-5

for spec in "$@"; do
  skill=${spec%%/*}; rest=${spec#*/}; case_name=${rest%.*}; lang=${rest##*.}
  case_dir="$ROOT/tests/skills-behaviour/cases/$skill/$case_name"
  task="$case_dir/task.$lang.md"
  [ -f "$task" ] || { echo "no task file: $task"; exit 2; }
  [ -d "$case_dir/artifacts" ] || { echo "no artifacts dir: $case_dir/artifacts"; exit 2; }
  # The input gate decides whether this run is worth starting at all (S5 R8): a corrupt patch, an empty
  # file, a hash that does not match or a file the case never declared stops the batch instead of
  # producing a record of the model reasoning about broken input.
  node "$ROOT/scripts/artifacts.mjs" "$case_dir" || exit 3
  ws=$(mktemp -d "${TMPDIR:-/tmp}/skill-run-XXXXXX") && ws=$(cd "$ws" && pwd -P)
  src="$ROOT/skills/$lang/$skill"; [ -d "$src" ] || src="$ROOT/skills/$skill"   # układ dwujęzyczny albo jednojęzyczny
  [ -d "$src" ] || { echo "no skill directory: $skill"; exit 2; }
  mkdir -p "$ws/.claude/skills" && cp -R "$src" "$ws/.claude/skills/" && cp -R "$case_dir/artifacts" "$ws/"
  log="$OUT/$skill.$case_name.$lang${RUN_TAG:+.$RUN_TAG}.jsonl"
  cd "$ws" && [ "$(pwd -P)" = "$ws" ] && \
    perl -e 'alarm 900; exec @ARGV' claude -p "$(cat "$task")" --model "$MODEL" \
      --setting-sources project --strict-mcp-config --mcp-config '{"mcpServers":{}}' --no-session-persistence \
      --tools "Read,Glob,Grep" \
      --output-format stream-json --verbose < /dev/null > "$log" 2> "$log.err"
  code=$?
  cd "$ROOT"
  cost=$(python3 -c '
import json,sys
cost=None
for line in open(sys.argv[1]):
    try: e=json.loads(line)
    except ValueError: continue
    if e.get("type")=="result": cost=e.get("total_cost_usd")
print(cost if cost is not None else "none")' "$log")
  echo "$spec exit=$code cost_usd=$cost workspace=$ws"
  if [ "$cost" = none ] || python3 -c 'import sys; sys.exit(0 if float(sys.argv[1]) > float(sys.argv[2]) else 1)' "$cost" "$CAP"; then
    echo "STOP: cost $cost is missing or above the cap $CAP; remaining runs not started"
    exit 3
  fi
done
