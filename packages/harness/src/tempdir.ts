// Disposable directories, in one place.
//
// FIVE COPIES OF THIS EXISTED. packages/core/test/commit-prefix.test.ts:11-15,
// test/lint.test.ts:11-15, test/skill-lint.test.ts:34-38,
// test/claim-lint.test.ts:25-29 and test/install-git-hooks.test.ts:9-13 were
// the identical five-line body with a different prefix string, each with its
// own `afterAll` teardown. #319 collapses them.
//
// THIS MODULE LAUNCHES NOTHING. It is fs only, deliberately: it is imported by
// test files across two packages, and a module that could spawn would make
// every one of them a process launcher for the purposes of #318's case 12.
// Running git is fixture-repo.ts's job, and it does it through the Port.

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/** A pool of temp directories with one teardown. Create one per suite; call
 *  `cleanup()` from `afterAll`.
 *
 *  `rmSync` is `force: true` so teardown of a directory a test already removed
 *  is not itself a failure -- a teardown that can fail turns one red test into
 *  two and hides which was the real one. */
export interface TempDirs {
  create(prefix: string): string;
  cleanup(): void;
  readonly created: readonly string[];
}

export function createTempDirs(): TempDirs {
  const dirs: string[] = [];
  return {
    get created() {
      return dirs;
    },
    create(prefix: string): string {
      const dir = mkdtempSync(join(tmpdir(), prefix.endsWith("-") ? prefix : `${prefix}-`));
      dirs.push(dir);
      return dir;
    },
    cleanup(): void {
      for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
      dirs.length = 0;
    },
  };
}
