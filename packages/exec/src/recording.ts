// A recording port: wraps any Port and captures every argv it is asked to run.
//
// THIS IS THE SEAM #321 ATTACHES TO, and the reason the port had to exist
// before the mutation recorder rather than after it. Because every mutating
// command leaves packages/core/src/gh as a `readonly string[]` and the port is
// the only consumer, wrapping the port captures ALL of them -- with no edit to
// the 22 sites where the literal "gh" is argv[0], and no possibility of a
// seventh operation family being added and silently missed.
//
// IT RECORDS THE ATTEMPT, NOT THE SUCCESS. That is deliberate and it is the
// property #320's fake forge depends on. If a fake refuses a duplicate the way
// GitHub's milestone endpoint does, a recorder that logged only successful
// calls would report "the second run made no mutation" when what actually
// happened is "the second run tried and was refused". That is a skill shadowed
// by its own test double -- the S1.5 shadowing trap one layer out -- and it
// would make the harness pass for the wrong reason.

import type { ExecResult, Port } from "./port";

export interface RecordedCall {
  readonly argv: readonly string[];
  readonly exitCode: number;
}

export interface RecordingPort extends Port {
  /** Every argv the port was ASKED to run, in order, including refused ones. */
  readonly calls: readonly RecordedCall[];
  /** Drop the record without replacing the port. Used between run 1 and run 2. */
  reset(): void;
}

export function createRecordingPort(inner: Port): RecordingPort {
  const calls: RecordedCall[] = [];
  return {
    get calls() {
      return calls;
    },
    reset() {
      calls.length = 0;
    },
    async run(argv: readonly string[]): Promise<ExecResult> {
      const result = await inner.run(argv);
      // Recorded AFTER the call so the exit code is known, but recorded
      // unconditionally -- a refusal and a failure are both attempts.
      calls.push({ argv: [...argv], exitCode: result.exitCode });
      return result;
    },
  };
}
