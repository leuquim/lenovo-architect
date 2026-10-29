#!/usr/bin/env node
// Publish a built plugin from a source repo to that repo's `release` branch and pin it in this marketplace.
//
// Usage: node tools/release-plugin.mjs <source repo> [--no-push]
//
// The source repo provides plugin/release.json:
//   { "plugin": "lenovo-press", "include": ["dist"], "sources": ["src"], "built": ["dist"], "pluginDir": "plugin" }
// `sources` (default ["src"]) must not be newer than `built` (default: include).
// `pluginDir` is copied to the release root (it holds .claude-plugin/plugin.json and any launcher);
// `include` paths are copied as built. A runtime-only package.json and lockfile are generated so
// Claude Code installs the dependencies itself at plugin install (registry packages, no scripts).
import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const marketplaceRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const marketplaceFile = join(marketplaceRoot, ".claude-plugin", "marketplace.json");
const args = process.argv.slice(2);
const repo = resolve(args.find((a) => !a.startsWith("--")) ?? fail("missing source repo path"));
const push = !args.includes("--no-push");

function fail(message) {
  console.error(`release-plugin: ${message}`);
  process.exit(1);
}
const git = (cwd, ...a) => execFileSync("git", a, { cwd, encoding: "utf8" }).trim();
const newest = (path) => {
  const s = statSync(path);
  if (!s.isDirectory()) return s.mtimeMs;
  return Math.max(s.mtimeMs, ...readdirSync(path).map((e) => newest(join(path, e))));
};

// ---- checks that can refuse the release, before anything changes
const specPath = join(repo, "plugin", "release.json");
if (!existsSync(specPath)) fail(`${specPath} not found`);
const spec = JSON.parse(readFileSync(specPath, "utf8"));
const pluginDir = join(repo, spec.pluginDir ?? "plugin");
if (!existsSync(join(pluginDir, ".claude-plugin", "plugin.json"))) fail(`${pluginDir}/.claude-plugin/plugin.json not found`);
if (git(repo, "status", "--porcelain", "--untracked-files=no")) fail("source repo has uncommitted changes; commit first so the release maps to a commit");
for (const p of spec.include) if (!existsSync(join(repo, p))) fail(`include path ${p} is missing; build first`);
const sources = (spec.sources ?? ["src"]).filter((p) => existsSync(join(repo, p)));
const built = spec.built ?? spec.include;
if (sources.length) {
  const srcTime = Math.max(...sources.map((p) => newest(join(repo, p))));
  const builtTime = Math.min(...built.map((p) => newest(join(repo, p))));
  if (srcTime > builtTime) fail(`${sources.join(", ")} newer than built output (${built.join(", ")}); rebuild before releasing`);
}
const sourcePkg = JSON.parse(readFileSync(join(repo, "package.json"), "utf8"));
const sourceSha = git(repo, "rev-parse", "HEAD");
const marketplace = JSON.parse(readFileSync(marketplaceFile, "utf8"));
const entry = marketplace.plugins.find((p) => p.name === spec.plugin);
if (!entry) fail(`marketplace has no entry named ${spec.plugin}`);

// ---- assemble the release tree in a worktree of the `release` branch
const work = mkdtempSync(join(tmpdir(), "plugin-release-"));
const hasBranch = (() => {
  try { git(repo, "fetch", "-q", "origin", "release"); } catch { /* first release */ }
  try { git(repo, "rev-parse", "--verify", "-q", "origin/release"); return "origin/release"; } catch { /* none */ }
  try { git(repo, "rev-parse", "--verify", "-q", "release"); return "release"; } catch { return null; }
})();
try {
  if (hasBranch) {
    git(repo, "worktree", "add", "-B", "release", work, hasBranch);
  } else {
    git(repo, "worktree", "add", "--detach", work);
    git(work, "checkout", "--orphan", "release");
  }
  for (const e of readdirSync(work)) if (e !== ".git") rmSync(join(work, e), { recursive: true, force: true });

  cpSync(pluginDir, work, { recursive: true, filter: (src) => !src.endsWith("release.json") });
  for (const p of spec.include) cpSync(join(repo, p), join(work, p), { recursive: true });
  writeFileSync(join(work, "package.json"), JSON.stringify({
    name: sourcePkg.name,
    version: sourcePkg.version,
    private: true,
    type: sourcePkg.type ?? "module",
    dependencies: sourcePkg.dependencies ?? {},
  }, null, 2) + "\n");
  if (Object.keys(sourcePkg.dependencies ?? {}).length) {
    execFileSync("npm", ["install", "--package-lock-only", "--ignore-scripts", "--no-audit", "--no-fund"], { cwd: work, stdio: "inherit" });
  }
  writeFileSync(join(work, "RELEASE.md"), `Built release of ${spec.plugin} from ${sourceSha}. Do not edit; regenerate with lenovo-architect/tools/release-plugin.mjs.\n`);

  git(work, "add", "-A");
  if (git(work, "status", "--porcelain")) git(work, "commit", "-q", "-m", `Release ${spec.plugin} from ${sourceSha.slice(0, 12)}`);
  const releaseSha = git(work, "rev-parse", "HEAD");
  if (push) git(work, "push", "-q", "origin", "release");

  entry.source = { ...entry.source, ref: "release", sha: releaseSha };
  writeFileSync(marketplaceFile, JSON.stringify(marketplace, null, 2) + "\n");
  console.log(`${spec.plugin}: release ${releaseSha.slice(0, 12)} from source ${sourceSha.slice(0, 12)}${push ? ", pushed" : " (not pushed)"}; marketplace pinned`);
} finally {
  try { git(repo, "worktree", "remove", "--force", work); } catch { rmSync(work, { recursive: true, force: true }); }
}
