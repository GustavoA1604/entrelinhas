// Bumps the app version across the three places that hard-code it:
//   - package.json  ("version")
//   - src/app.js     (APP_VERSION constant, shown in the menu footer)
//   - sw.js          (CACHE_VERSION, so clients fetch fresh assets)
//
// Usage: npm run bump:version <version>   e.g. npm run bump:version 1.0.1
// The version must be plain semver (major.minor.patch).

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

const version = process.argv[2];
if (!version) {
  console.error("Usage: npm run bump:version <version>   (e.g. 1.0.1)");
  process.exit(1);
}
if (!/^\d+\.\d+\.\d+$/.test(version)) {
  console.error(`Invalid version "${version}". Expected major.minor.patch (e.g. 1.0.1).`);
  process.exit(1);
}

// Replace the first match of `pattern` in `file` with `replacement`, erroring
// loudly if the pattern is missing (so a refactor never silently skips a file).
function patch(relativePath, pattern, replacement) {
  const path = join(root, relativePath);
  const before = readFileSync(path, "utf8");
  if (!pattern.test(before)) {
    console.error(`Could not find version field in ${relativePath}. Aborting.`);
    process.exit(1);
  }
  const after = before.replace(pattern, replacement);
  writeFileSync(path, after);
  console.log(`  ${relativePath} -> ${version}`);
}

patch("package.json", /("version":\s*")\d+\.\d+\.\d+(")/, `$1${version}$2`);
patch("src/app.js", /(const APP_VERSION = ")\d+\.\d+\.\d+(")/, `$1${version}$2`);
patch("sw.js", /(const CACHE_VERSION = "entrelinhas-v)[\w.]+(")/, `$1${version}$2`);

console.log(`Bumped to ${version}.`);
