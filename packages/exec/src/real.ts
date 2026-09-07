// The real implementation: the one place in this repository that launches a
// forge command.
//
// `execFile`, never `exec`. docs/design/09-security.md:190 --
// "execFile(cmd, args) with an argument array has no shell to inject into."
// The argv arrives already split, so nothing here builds a command string and
// there is no interpolation site to get wrong.

import { execFile } from "node:child_process";
import { checkArgv, type ExecResult, type Port } from "./port";

/** Bound every launch. An unbounded child is a denial of service against the
 *  run that spawned it, and `NEVER-31.8`'s lesson stands: a hang is not a
 *  throw, and no try/catch catches a process that never exits. */
export const DEFAULT_TIMEOUT_MS = 30_000;

/** Cap what a child may return. `gh` with a wide `--json` over a large
 *  repository can produce megabytes, and the caller's context window is the
 *  real constraint. */
export const DEFAULT_MAX_BUFFER_BYTES = 8 * 1024 * 1024;

export interface RealPortOptions {
  readonly cwd?: string;
  readonly timeoutMs?: number;
  readonly maxBufferBytes?: number;
  readonly env?: NodeJS.ProcessEnv;
}

/** A refusal is reported as a result, not thrown.
 *
 *  Exit code 126 is the shell's own "found but not executable" code, which is
 *  exactly what a refused argv is. The caller reads one shape whether the
 *  process ran or was never allowed to. */
export const REFUSED_EXIT_CODE = 126;

/** Read the exit code off an execFile error without widening `undefined` to a
 *  number. `error.code` is a NUMBER for a normal non-zero exit and a STRING
 *  for a spawn failure ("ENOENT", "ETIMEDOUT"), so the type test is doing real
 *  work rather than satisfying the compiler. A spawn failure is reported as 1:
 *  the command did not run, which is a failure, and inventing a distinct code
 *  here would collide with a real exit status. */
export function exitCodeOf(error: unknown): number {
  if (error === null || error === undefined) return 0;
  const code = (error as { code?: unknown }).code;
  return typeof code === "number" ? code : 1;
}

export function createRealPort(options: RealPortOptions = {}): Port {
  const timeout = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxBuffer = options.maxBufferBytes ?? DEFAULT_MAX_BUFFER_BYTES;

  return {
    run(argv: readonly string[]): Promise<ExecResult> {
      const check = checkArgv(argv);
      if (!check.ok) {
        return Promise.resolve({
          exitCode: REFUSED_EXIT_CODE,
          stdout: "",
          stderr: check.refusal.message,
        });
      }

      const [file, ...args] = argv as string[];
      return new Promise<ExecResult>((resolve) => {
        execFile(
          file as string,
          args,
          {
            cwd: options.cwd,
            timeout,
            maxBuffer,
            env: options.env,
            // No `shell` option. Its absence is the security property; adding
            // it would reintroduce exactly the injection surface the argv
            // array exists to remove.
          },
          (error, stdout, stderr) => {
            // A NON-ZERO EXIT IS NOT AN EXCEPTION. `gh` exits non-zero for
            // ordinary, expected outcomes -- 404 on a missing issue, 403 on a
            // rate limit -- and references/gh-error-handling.md's whole
            // taxonomy is built on reading those codes. Throwing here would
            // force every caller into a try/catch to learn a number the
            // callee already had.
            const code = exitCodeOf(error);
            resolve({ exitCode: code, stdout: String(stdout), stderr: String(stderr) });
          },
        );
      });
    },
  };
}
