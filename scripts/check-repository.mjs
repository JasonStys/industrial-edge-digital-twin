/**
 * @file check-repository.mjs
 * @brief Enforces repository structure, headers, internal links, pinned actions, and naming policy.
 * @details Main variables: repositoryRoot, failures, codeFiles, markdownFiles, and reportPath.
 */

import { access, readdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath, URL } from "node:url";

const repositoryRoot = fileURLToPath(new URL("../", import.meta.url));
const failures = [];
const skippedDirectories = new Set([
  ".git",
  "build",
  "build-release",
  "dist",
  "node_modules",
  "reports",
]);
const codeExtensions = new Set([".cpp", ".hpp", ".html", ".js", ".mjs", ".ts"]);

/** Walk repository files while excluding generated dependencies and build output. */
async function walk(directory) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (skippedDirectories.has(entry.name)) continue;
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await walk(fullPath)));
    else files.push(fullPath);
  }
  return files;
}

const files = await walk(repositoryRoot);
const codeFiles = files.filter((file) => codeExtensions.has(path.extname(file)));
const markdownFiles = files.filter((file) => path.extname(file) === ".md");

for (const file of codeFiles) {
  const source = await readFile(file, "utf8");
  const openingLines = source.split(/\r?\n/u).slice(0, 6).join("\n");
  if (!/(?:\/\*\*|<!--|\/\/)/u.test(openingLines)) {
    failures.push(`${path.relative(repositoryRoot, file)} lacks a file header comment`);
  }
}

const requiredDocs = [
  "README.md",
  "docs/architecture.md",
  "docs/big-o.md",
  "docs/file-reference.md",
  "docs/plant-model.md",
  "docs/safety-and-security.md",
  "docs/testing.md",
  "docs/reports/validation-report.md",
  "docs/generated/symbol-index.md",
  "docs/openapi.yaml",
];
for (const relative of requiredDocs) {
  await access(path.join(repositoryRoot, relative)).catch(() =>
    failures.push(`missing ${relative}`),
  );
}

for (const file of markdownFiles) {
  const source = await readFile(file, "utf8");
  const linkPattern = /\[[^\]]+\]\(([^)]+)\)/gu;
  for (const match of source.matchAll(linkPattern)) {
    const target = match[1]?.split("#", 1)[0];
    if (target === undefined || target === "" || /^(?:https?:|mailto:)/u.test(target)) continue;
    const decoded = decodeURIComponent(target.replace(/^<|>$/gu, ""));
    const resolved = path.resolve(path.dirname(file), decoded);
    if (!resolved.startsWith(repositoryRoot)) {
      failures.push(
        `${path.relative(repositoryRoot, file)} links outside the repository: ${target}`,
      );
      continue;
    }
    await access(resolved).catch(() =>
      failures.push(`${path.relative(repositoryRoot, file)} has broken link: ${target}`),
    );
  }
}

const workflowFiles = files.filter((file) =>
  file.includes(`${path.sep}.github${path.sep}workflows${path.sep}`),
);
for (const file of workflowFiles) {
  const source = await readFile(file, "utf8");
  for (const match of source.matchAll(/^\s*-?\s*uses:\s*([^\s#]+)/gmu)) {
    if (!/@[0-9a-f]{40}$/u.test(match[1] ?? "")) {
      failures.push(
        `${path.relative(repositoryRoot, file)} contains an unpinned action: ${match[1]}`,
      );
    }
  }
}

const packageJson = JSON.parse(await readFile(path.join(repositoryRoot, "package.json"), "utf8"));
for (const section of ["dependencies", "devDependencies"]) {
  for (const [name, version] of Object.entries(packageJson[section] ?? {})) {
    if (typeof version !== "string" || /^[~^*]|\b(?:latest|next)\b/u.test(version)) {
      failures.push(`${section}.${name} must use an exact version`);
    }
  }
}

// Construct protected names from fragments so the public repository does not contain the names itself.
const protectedPatterns = [new RegExp(["op", "to"].join("") + "\\s*" + "22", "iu")];
for (const file of files) {
  const info = await stat(file);
  if (info.size > 2_000_000 || path.extname(file) === ".lock") continue;
  const source = await readFile(file, "utf8").catch(() => "");
  if (protectedPatterns.some((pattern) => pattern.test(source))) {
    failures.push(`${path.relative(repositoryRoot, file)} contains a protected employer reference`);
  }
}

const report = {
  checkedAt: "generated-during-validation",
  checks: {
    codeFilesWithHeaders: codeFiles.length,
    markdownFilesChecked: markdownFiles.length,
    pinnedWorkflowFiles: workflowFiles.length,
    requiredDocuments: requiredDocs.length,
  },
  failures,
  passed: failures.length === 0,
};
await writeFile(
  path.join(repositoryRoot, "reports", "repository-validation.json"),
  `${JSON.stringify(report, null, 2)}\n`,
  "utf8",
);

if (failures.length > 0) {
  process.stderr.write(`${failures.join("\n")}\n`);
  process.exitCode = 1;
} else {
  process.stdout.write(`Repository policy passed across ${files.length} files.\n`);
}
