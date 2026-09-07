// The adapter port: the ONLY route from an argv built by packages/core/src/gh
// to a running process.
//
// WHY THIS PACKAGE EXISTS AT ALL.
//
// ARCHITECTURE.md:82 states the kernel doctrine: "No host imports. No
// process.cwd(). Everything is a pure function from input to a decision object
// that an adapter applies." packages/core/src/gh/ holds to it absolutely --
// zero imports leave that directory, enforced three independent ways.
//
// FOUR CONTRACT DOCUMENTS ASSIGN THE EXECUTION TO AN ADAPTER, AND NO ADAPTER
// EVER APPLIED IT. references/gh-operations.md, references/gh-error-handling.md,
// ARCHITECTURE.md and docs/design/08-dual-target.md all name an adapter that
// runs the command. packages/adapter-claude and packages/adapter-opencode are
// 25 and 20 lines of pure Decision -> exit-code mapping and launch nothing.
//
// So no `gh` argv this repository has ever built had ever been executed before
// this package. Six operation families were tested against golden argv only.
// Ruled first build target of #293 at the gate (G3), 2026-09-07, and SHARED
// with #47's task-do (G4) -- one port, not two.
//
// WHY THE SEAM IS HERE AND NOT INSIDE gh/.
//
// There is no choke point to wrap in gh/: the literal "gh" is argv[0] at 22
// sites across 6 modules and there is no factory. But the TYPE-level choke
// point already exists -- every mutating command leaves that layer as a
// `readonly string[]`. Whatever consumes one is the true single choke point,
// so the recorder seam is designed INTO the executor rather than retrofitted
// around the builders. #321 attaches to `Port` without touching gh/ at all.

/** What a finished process yields. Deliberately the shape adapter-claude
 *  already speaks (`HookResponse`), so a decision and an execution are read
 *  the same way. */
export interface ExecResult {
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
}

/** The port. One method, one argument, no shell.
 *
 *  The argument is an ARGV ARRAY and never a string, which is the whole
 *  security property: docs/design/09-security.md:190 bans `exec` with a
 *  template literal in packages/** precisely because a shell string can be
 *  injected into and an argv array cannot. `bun run lint`'s no-exec-template
 *  rule enforces it over every package including this one. */
export interface Port {
  run(argv: readonly string[]): Promise<ExecResult>;
}

/** The executables this port will launch, closed and exhaustive.
 *
 *  A CLOSED SET, not a convenience. An open port would execute whatever an
 *  argv happened to name, and the argv comes from a layer that parses
 *  repository content. Adding an executable is a deliberate edit here, visible
 *  in review, rather than a consequence of some builder gaining a new first
 *  element. */
export const ALLOWED_EXECUTABLES: readonly string[] = ["gh", "git"];

/** Why an argv was refused. Distinct reasons, distinct phrases -- a caller
 *  must be able to tell them apart without parsing the value out of the
 *  message. references/verification.md:123-129: two messages that differ only
 *  in the value they quote are one message. */
export type PortRefusal =
  | { readonly kind: "not-an-array"; readonly message: string }
  | { readonly kind: "empty"; readonly message: string }
  | { readonly kind: "executable-not-allowed"; readonly message: string }
  | { readonly kind: "argument-not-a-string"; readonly message: string };

export type ArgvCheck = { readonly ok: true } | { readonly ok: false; readonly refusal: PortRefusal };

/** Validate before launching. PURE -- no I/O, so it is testable without a
 *  process and reusable by the fake. */
export function checkArgv(argv: unknown): ArgvCheck {
  if (!Array.isArray(argv)) {
    return {
      ok: false,
      refusal: {
        kind: "not-an-array",
        message:
          "the port takes an argv array, never a command string: a string would need a shell, " +
          "and a shell is the thing docs/design/09-security.md:190 bans",
      },
    };
  }
  if (argv.length === 0) {
    return {
      ok: false,
      refusal: {
        kind: "empty",
        message: "an empty argv names no executable, so there is nothing to run",
      },
    };
  }
  for (const part of argv) {
    if (typeof part !== "string") {
      return {
        ok: false,
        refusal: {
          kind: "argument-not-a-string",
          message:
            "every argv element must already be a string; the port never stringifies an argument, " +
            "because a silent String(value) is how an object reaches a command line as [object Object]",
        },
      };
    }
  }
  const executable = argv[0] as string;
  if (!ALLOWED_EXECUTABLES.includes(executable)) {
    return {
      ok: false,
      refusal: {
        kind: "executable-not-allowed",
        message:
          `this port launches only ${ALLOWED_EXECUTABLES.join(", ")}; refusing to run "${executable}". ` +
          "The allow-list is closed so that adding an executable is an edit here rather than a side effect",
      },
    };
  }
  return { ok: true };
}
