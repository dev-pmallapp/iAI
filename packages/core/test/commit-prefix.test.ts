import { afterAll, describe, expect, test } from "bun:test";
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { checkCommitPrefix } from "../src/guards/commit-prefix";

const repoRoot = join(import.meta.dir, "../../..");

const tempDirs: string[] = [];

function makeTempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "iai-commit-prefix-"));
  tempDirs.push(dir);
  return dir;
}

afterAll(() => {
  for (const dir of tempDirs) rmSync(dir, { recursive: true, force: true });
});

describe("checkCommitPrefix", () => {
  test('checkCommitPrefix accepts "#9: add workspace scaffold" (case 7 fixture)', () => {
    const result = checkCommitPrefix("#9: add workspace scaffold");
    expect(result.action).toBe("allow");
  });

  test('checkCommitPrefix accepts "#1: x"', () => {
    expect(checkCommitPrefix("#1: x").action).toBe("allow");
  });

  test("checkCommitPrefix accepts a large issue number", () => {
    expect(checkCommitPrefix("#999999999: x").action).toBe("allow");
  });

  test('checkCommitPrefix rejects "add workspace scaffold" (no prefix)', () => {
    expect(checkCommitPrefix("add workspace scaffold").action).toBe("block");
  });

  test('checkCommitPrefix rejects "#9 add workspace scaffold" (no colon)', () => {
    expect(checkCommitPrefix("#9 add workspace scaffold").action).toBe("block");
  });

  test('checkCommitPrefix rejects "# 9: x" (space after #)', () => {
    expect(checkCommitPrefix("# 9: x").action).toBe("block");
  });

  test('checkCommitPrefix rejects "#9:" (no message)', () => {
    expect(checkCommitPrefix("#9:").action).toBe("block");
  });

  test('checkCommitPrefix rejects "#9: " (whitespace-only message)', () => {
    expect(checkCommitPrefix("#9: ").action).toBe("block");
  });

  test("checkCommitPrefix rejects the empty string", () => {
    expect(checkCommitPrefix("").action).toBe("block");
  });

  test("checkCommitPrefix accepts the Merge exemption", () => {
    expect(checkCommitPrefix("Merge branch 'x'").action).toBe("allow");
  });

  test("checkCommitPrefix accepts the fixup! exemption", () => {
    expect(checkCommitPrefix("fixup! #9: x").action).toBe("allow");
  });

  test("checkCommitPrefix accepts the squash! exemption", () => {
    expect(checkCommitPrefix("squash! #9: x").action).toBe("allow");
  });

  test("checkCommitPrefix accepts the Revert exemption", () => {
    expect(checkCommitPrefix('Revert "#9: x"').action).toBe("allow");
  });

  test("checkCommitPrefix rejects Revert without a literal quote", () => {
    // The regex requires a literal '"' after "Revert "; git always generates
    // the quoted form, so this is deliberately strict.
    expect(checkCommitPrefix("Revert #9: x").action).toBe("block");
  });

  test("checkCommitPrefix rejects the owner/repo#9: x form", () => {
    // CONTRIBUTING.md:206 documents a variant regex that accepts an optional
    // "owner/repo" prefix so a public-repo commit can reference an issue in
    // a private repo. The adopted regex (docs/design/03-workflow.md:462)
    // drops that form. This is a deliberate adjudication, not an oversight
    // — reconciling the two documents is routed to #14 under ISC-6.
    expect(checkCommitPrefix("owner/repo#9: x").action).toBe("block");
  });

  test("checkCommitPrefix block Decision.message contains the offending subject verbatim", () => {
    const subject = "add workspace scaffold";
    const result = checkCommitPrefix(subject);
    expect(result.action).toBe("block");
    expect(result.message).toContain(subject);
  });

  test('checkCommitPrefix returns action "allow" for a matching subject', () => {
    expect(checkCommitPrefix("#9: add workspace scaffold").action).toBe("allow");
  });

  test('checkCommitPrefix returns action "block" for a failing subject', () => {
    expect(checkCommitPrefix("add workspace scaffold").action).toBe("block");
  });

  test("checkCommitPrefix rejects a subject that only matches after the first line", () => {
    // Proves the guard is anchored (^) and does not scan past the first
    // line looking for a match.
    expect(checkCommitPrefix("\n#9: x").action).toBe("block");
  });
});

describe("checkCommitPrefix commit-msg hook integration (case 24)", () => {
  async function run(cmd: string[], cwd: string): Promise<{ exitCode: number; combined: string }> {
    const proc = Bun.spawn(cmd, { cwd, stdout: "pipe", stderr: "pipe" });
    const [stdout, stderr, exitCode] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
      proc.exited,
    ]);
    return { exitCode, combined: stdout + stderr };
  }

  test("checkCommitPrefix hook: rejected commit leaves the tree untouched, corrected retry succeeds, exemption survives a real commit", async () => {
    const dir = makeTempDir();

    await run(["git", "init", "-q"], dir);
    await run(["git", "config", "user.email", "iai-test@example.com"], dir);
    await run(["git", "config", "user.name", "iAI Test"], dir);

    const hookPath = join(dir, ".git", "hooks", "commit-msg");
    const commitMsgScriptPath = join(repoRoot, "scripts", "commit-msg.ts");
    mkdirSync(join(dir, ".git", "hooks"), { recursive: true });
    writeFileSync(hookPath, `#!/bin/sh\nexec bun "${commitMsgScriptPath}" "$1"\n`, "utf8");
    chmodSync(hookPath, 0o755);

    writeFileSync(join(dir, "seed.txt"), "seed\n", "utf8");
    await run(["git", "add", "seed.txt"], dir);
    const seedCommit = await run(["git", "commit", "-m", "#12: seed initial commit"], dir);
    expect(seedCommit.exitCode).toBe(0);

    const shaBefore = await run(["git", "rev-parse", "HEAD"], dir);
    expect(shaBefore.exitCode).toBe(0);

    writeFileSync(join(dir, "feature.txt"), "feature\n", "utf8");
    await run(["git", "add", "feature.txt"], dir);
    const diffBefore = await run(["git", "diff", "--cached"], dir);

    const offendingSubject = "bad subject with no prefix";
    const badCommit = await run(["git", "commit", "-m", offendingSubject], dir);

    // What this test actually proves about "untouched": a non-zero
    // commit-msg hook causes git itself to abort before any commit object
    // is written, so the working tree and index are guaranteed by git, not
    // by our hook. What our hook must prove is that IT does not itself
    // mutate anything, that it exits non-zero, and that the same staged
    // change can be retried immediately with no cleanup step.
    expect(badCommit.exitCode).not.toBe(0);
    expect(badCommit.combined).toContain(offendingSubject);

    const diffAfterBad = await run(["git", "diff", "--cached"], dir);
    expect(diffAfterBad.combined).toBe(diffBefore.combined);

    const shaAfterBad = await run(["git", "rev-parse", "HEAD"], dir);
    expect(shaAfterBad.combined).toBe(shaBefore.combined);

    const goodSubject = "#12: add the commit-prefix guard";
    const goodCommit = await run(["git", "commit", "-m", goodSubject], dir);
    expect(goodCommit.exitCode).toBe(0);

    const shaAfterGood = await run(["git", "rev-parse", "HEAD"], dir);
    expect(shaAfterGood.combined).not.toBe(shaBefore.combined);

    const log = await run(["git", "log", "-1", "--pretty=%s"], dir);
    expect(log.combined.trim()).toBe(goodSubject);

    writeFileSync(join(dir, "another.txt"), "another\n", "utf8");
    await run(["git", "add", "another.txt"], dir);
    const exemptionCommit = await run(["git", "commit", "-m", "fixup! #12: add the commit-prefix guard"], dir);
    expect(exemptionCommit.exitCode).toBe(0);
  });
});
