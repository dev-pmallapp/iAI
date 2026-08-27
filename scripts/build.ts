import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const repoRoot = join(import.meta.dir, "..");

const DOCS_TARGETS = new Set(["iai-skills", "iai-agents", "iai-references"]);

interface TargetInfo {
  name: string;
  dir: string;
}

function discoverPackageTargets(): TargetInfo[] {
  const packagesDir = join(repoRoot, "packages");
  const entries = readdirSync(packagesDir, { withFileTypes: true }).filter((e) =>
    e.isDirectory(),
  );
  const targets: TargetInfo[] = [];
  for (const entry of entries) {
    const pkgJsonPath = join(packagesDir, entry.name, "package.json");
    if (!existsSync(pkgJsonPath)) continue;
    const pkg = JSON.parse(readFileSync(pkgJsonPath, "utf8"));
    if (typeof pkg.name === "string") {
      targets.push({ name: pkg.name, dir: entry.name });
    }
  }
  return targets;
}

function usage(validNames: string[]): void {
  console.error("build: unknown target");
  console.error("build: valid targets are:");
  for (const name of validNames) console.error(`  - ${name}`);
}

async function buildAll(): Promise<number> {
  const proc = Bun.spawn(["tsc", "-b", "tsconfig.json"], {
    cwd: repoRoot,
    stdout: "inherit",
    stderr: "inherit",
  });
  return await proc.exited;
}

async function buildPackage(dir: string): Promise<number> {
  const proc = Bun.spawn(["tsc", "-b", "tsconfig.json"], {
    cwd: join(repoRoot, "packages", dir),
    stdout: "inherit",
    stderr: "inherit",
  });
  return await proc.exited;
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const filterIndex = args.indexOf("--filter");

  if (filterIndex === -1) {
    process.exit(await buildAll());
  }

  const target = args[filterIndex + 1];
  const packageTargets = discoverPackageTargets();
  const validNames = [
    ...packageTargets.map((t) => t.name),
    ...DOCS_TARGETS,
  ];

  if (!target) {
    usage(validNames);
    process.exit(1);
  }

  if (DOCS_TARGETS.has(target)) {
    console.log(
      `build: ${target} is a docs target with no build file; validation happens via skill-lint`,
    );
    process.exit(0);
  }

  const match = packageTargets.find((t) => t.name === target);
  if (!match) {
    usage(validNames);
    process.exit(1);
  }

  process.exit(await buildPackage(match.dir));
}

main();
