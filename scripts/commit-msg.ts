import { readFileSync } from "node:fs";
import { checkCommitPrefix } from "../packages/core/src/index";

// git's commit-msg hook contract: argv[2] is the path to the file holding
// the commit message under construction (COMMIT_EDITMSG or equivalent).
export function extractSubject(messageText: string): string {
  for (const rawLine of messageText.split("\n")) {
    // Trim a trailing \r for CRLF safety, per the Design.
    const line = rawLine.replace(/\r$/, "");
    // Deliberately NOT stripping lines starting with "#" as comments: git's
    // own comment character is "#", but our valid subjects also start with
    // "#" (the "#12: ..." prefix form), so a naive comment-strip would
    // delete exactly the subjects we want to accept.
    if (line.trim() !== "") return line;
  }
  return "";
}

export function runCommitMsgHook(messageFilePath: string | undefined): number {
  if (!messageFilePath) {
    console.error("commit-msg: no message file path given (expected argv[2])");
    return 1;
  }

  let messageText: string;
  try {
    messageText = readFileSync(messageFilePath, "utf8");
  } catch (err) {
    console.error(`commit-msg: could not read "${messageFilePath}": ${(err as Error).message}`);
    return 1;
  }

  const subject = extractSubject(messageText);
  const decision = checkCommitPrefix(subject);

  if (decision.action === "block") {
    // Precedent: docs/design/09-security.md:131 writes the block message to
    // stderr.
    console.error(decision.message);
    // Exit 1, not 2: CLAIM-9.3 and CONTRIBUTING.md:228 both say "non-zero". Exit
    // 2 is the Claude-Code PreToolUse convention (09-security.md:131) — a
    // different enforcement surface from this git hook.
    return 1;
  }

  return 0;
}

if (import.meta.main) {
  process.exit(runCommitMsgHook(process.argv[2]));
}
