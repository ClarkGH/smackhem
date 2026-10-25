#!/usr/bin/env bash
# Mutation check: break one line on purpose and see whether a spec notices.
#
#   scripts/mutate.sh <file> <find> <replace> <spec>
#
# Replaces <find> with <replace> in <file> (literal text, must appear exactly once), runs <spec>,
# then always puts the file back, even on error or Ctrl-C.
# Prints KILLED when the spec goes red (the tests caught it, good) or SURVIVED when it stays green.
# Exit: 0 killed, 1 survived, 2 bad usage or <find> not found exactly once.
set -u

if [ "$#" -ne 4 ]; then
  echo "usage: scripts/mutate.sh <file> <find> <replace> <spec>" >&2
  exit 2
fi
file=$1 find=$2 replace=$3 spec=$4

cd "$(dirname "$0")/.." || exit 2
if [ ! -f "$file" ]; then
  echo "no such file: $file" >&2
  exit 2
fi

backup=$(mktemp)
cp "$file" "$backup"
restore() {
  cp "$backup" "$file"
  rm -f "$backup"
}
trap restore EXIT INT TERM

# Literal replace in node, so regex and shell characters in <find> mean nothing special
FIND=$find REPLACE=$replace node -e '
  const fs = require("fs");
  const [file] = process.argv.slice(1);
  const text = fs.readFileSync(file, "utf8");
  const count = text.split(process.env.FIND).length - 1;
  if (count !== 1) {
    console.error(`<find> appears ${count} times in ${file}, needs exactly 1`);
    process.exit(2);
  }
  fs.writeFileSync(file, text.replace(process.env.FIND, () => process.env.REPLACE));
' "$file" || exit 2

if pnpm exec vitest run "$spec" > /dev/null 2>&1; then
  echo "SURVIVED: $spec stayed green with that change in $file"
  exit 1
fi
echo "KILLED: $spec caught the change in $file"
exit 0
