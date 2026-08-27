import { afterAll, describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { commentCharWarning, hookScript, installCommitMsgHook } from "../scripts/install-git-hooks";

const tempDirs: string[] = [];

function makeTempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "iai-hooks-"));
  tempDirs.push(dir);
  return dir;
}

afterAll(() => {
  for (const dir of tempDirs) rmSync(dir, { recursive: true, force: true });
});

describe("hookScript", () => {
  test("execs bun against the commit-msg script with the message path", () => {
    const script = hookScript("/repo/scripts/commit-msg.ts");
    expect(script.startsWith("#!/bin/sh\n")).toBe(true);
    expect(script).toContain('exec bun "/repo/scripts/commit-msg.ts" "$1"');
  });
});

describe("commentCharWarning", () => {
  // The trap: git's default comment character is `#`, and every valid subject
  // in this repo starts with `#`. On the editor path git strips the subject as
  // a comment before the hook runs.
  test("warns when core.commentChar is unset", () => {
    expect(commentCharWarning(undefined)).toContain("core.commentChar");
  });

  test("warns when core.commentChar is explicitly '#'", () => {
    const warning = commentCharWarning("#");
    expect(warning).toBeDefined();
    expect(warning).toContain("git config core.commentChar");
  });

  test("stays silent when core.commentChar is something else", () => {
    expect(commentCharWarning(";")).toBeUndefined();
    expect(commentCharWarning("//")).toBeUndefined();
  });
});

describe("installCommitMsgHook", () => {
  test("dry run reports the target and writes nothing", () => {
    const repoRoot = makeTempDir();
    const result = installCommitMsgHook(repoRoot, false);

    expect(result.wrote).toBe(false);
    expect(existsSync(result.hookPath)).toBe(false);
    expect(existsSync(join(repoRoot, ".git", "hooks"))).toBe(false);
  });

  test("--apply creates the hooks directory and writes an executable hook", () => {
    const repoRoot = makeTempDir();
    const result = installCommitMsgHook(repoRoot, true);

    expect(result.wrote).toBe(true);
    expect(existsSync(result.hookPath)).toBe(true);
    expect(result.backedUpTo).toBeUndefined();
  });

  test("--apply backs up an existing hook whose contents differ", () => {
    const repoRoot = makeTempDir();
    installCommitMsgHook(repoRoot, true);
    Bun.write(join(repoRoot, ".git", "hooks", "commit-msg"), "#!/bin/sh\necho different\n");

    const result = installCommitMsgHook(repoRoot, true);
    expect(result.backedUpTo).toBeDefined();
    expect(existsSync(result.backedUpTo ?? "")).toBe(true);
  });

  test("--apply is idempotent and does not back up an identical hook", () => {
    const repoRoot = makeTempDir();
    installCommitMsgHook(repoRoot, true);
    const second = installCommitMsgHook(repoRoot, true);

    expect(second.wrote).toBe(true);
    expect(second.backedUpTo).toBeUndefined();
  });
});
