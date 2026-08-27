import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

// Dry-run by default; --apply is required to touch disk. Mirrors
// docs/design/09-security.md:361 ("Dry-run by default … --apply is required
// to touch disk") and CONTRIBUTING.md:229 ("never installed without
// --apply").
//
// This is the interim install path for the commit-msg hook. The documented
// destination (bun run packages/installer/src/cli.ts install-git-hooks
// --apply, per CONTRIBUTING.md:225) does not exist yet — docs/design/stories/9.md
// puts installer CLI behaviour explicitly out of scope for this story.

export function hookScript(commitMsgScriptPath: string): string {
  return `#!/bin/sh\nexec bun "${commitMsgScriptPath}" "$1"\n`;
}

// git's default comment character is `#`, and every valid subject in this repo
// starts with `#`. On the editor path (`git commit` with no -m), git applies
// `cleanup=strip` AFTER the editor and BEFORE the hook, which deletes the
// subject line as a comment and aborts with "Aborting commit due to empty
// commit message" — the hook never runs, and a perfectly valid subject is
// destroyed at authorship. `-m` and `-F` use `cleanup=whitespace` and are
// unaffected, which is why this has gone unnoticed.
//
// Setting core.commentChar to anything else fixes it. We warn rather than set
// it: this script's remit is the hook, and silently rewriting a user's git
// config is the kind of side effect docs/design/09-security.md:361 exists to
// prevent.
export function commentCharWarning(commentChar: string | undefined): string | undefined {
  if (commentChar !== undefined && commentChar !== "#") return undefined;
  return [
    "install-git-hooks: WARNING core.commentChar is '#', which is also the first",
    "install-git-hooks:         character of every valid subject in this repo.",
    "install-git-hooks:         `git commit` via an editor will strip the subject",
    "install-git-hooks:         and abort before the hook ever runs.",
    "install-git-hooks:         Fix with: git config core.commentChar ';'",
  ].join("\n");
}

export interface InstallResult {
  hookPath: string;
  wrote: boolean;
  backedUpTo: string | undefined;
}

export function installCommitMsgHook(repoRoot: string, apply: boolean): InstallResult {
  const hooksDir = join(repoRoot, ".git", "hooks");
  const hookPath = join(hooksDir, "commit-msg");
  const commitMsgScriptPath = join(repoRoot, "scripts", "commit-msg.ts");
  const contents = hookScript(commitMsgScriptPath);

  let backedUpTo: string | undefined;
  if (existsSync(hookPath)) {
    const existing = readFileSync(hookPath, "utf8");
    if (existing !== contents) {
      backedUpTo = `${hookPath}.iai-backup-${Date.now()}`;
    }
  }

  if (!apply) {
    console.log(`install-git-hooks: dry run (pass --apply to write)`);
    console.log(`install-git-hooks: would write ${hookPath}`);
    if (backedUpTo) console.log(`install-git-hooks: would back up existing hook to ${backedUpTo}`);
    console.log(`install-git-hooks: would chmod ${hookPath} to 0o755`);
    return { hookPath, wrote: false, backedUpTo };
  }

  mkdirSync(hooksDir, { recursive: true });
  if (backedUpTo) {
    const existing = readFileSync(hookPath, "utf8");
    writeFileSync(backedUpTo, existing, "utf8");
    console.log(`install-git-hooks: backed up existing hook to ${backedUpTo}`);
  }
  writeFileSync(hookPath, contents, "utf8");
  chmodSync(hookPath, 0o755);
  console.log(`install-git-hooks: wrote ${hookPath}`);

  return { hookPath, wrote: true, backedUpTo };
}

function readCommentChar(repoRoot: string): string | undefined {
  const proc = Bun.spawnSync(["git", "config", "--get", "core.commentChar"], { cwd: repoRoot });
  if (proc.exitCode !== 0) return undefined;
  const value = new TextDecoder().decode(proc.stdout).trim();
  return value === "" ? undefined : value;
}

function main(): void {
  const repoRoot = join(import.meta.dir, "..");
  const apply = process.argv.includes("--apply");
  installCommitMsgHook(repoRoot, apply);

  const warning = commentCharWarning(readCommentChar(repoRoot));
  if (warning) console.warn(warning);
}

if (import.meta.main) {
  main();
}
