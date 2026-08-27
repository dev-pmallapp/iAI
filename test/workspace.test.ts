import { describe, expect, test } from "bun:test";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const repoRoot = join(import.meta.dir, "..");

function parseBuildTargetNames(): string[] {
  const architecture = readFileSync(join(repoRoot, "ARCHITECTURE.md"), "utf8");
  const lines = architecture.split("\n");
  const headingIndex = lines.findIndex((line) => line.trim() === "## Build Targets");
  if (headingIndex === -1) {
    throw new Error("ARCHITECTURE.md has no '## Build Targets' section");
  }

  const names: string[] = [];
  let sawHeaderRow = false;
  for (const line of lines.slice(headingIndex + 1)) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("|")) {
      if (sawHeaderRow) break;
      continue;
    }
    const cells = trimmed
      .slice(1, -1)
      .split("|")
      .map((cell) => cell.trim());

    if (!sawHeaderRow) {
      sawHeaderRow = true;
      continue;
    }
    if (cells.every((cell) => /^-+$/.test(cell))) continue;

    const target = cells[0];
    if (target) names.push(target);
  }
  return names;
}

describe("workspace invariants", () => {
  test("every packages/*/package.json name appears in ARCHITECTURE.md's Build Targets table", () => {
    const targetNames = parseBuildTargetNames();
    expect(targetNames.length).toBeGreaterThan(0);

    const packagesDir = join(repoRoot, "packages");
    const packageDirs = readdirSync(packagesDir, { withFileTypes: true }).filter(
      (entry) => entry.isDirectory(),
    );

    for (const dir of packageDirs) {
      const pkg = JSON.parse(
        readFileSync(join(packagesDir, dir.name, "package.json"), "utf8"),
      );
      expect(targetNames).toContain(pkg.name);
    }
  });
});
