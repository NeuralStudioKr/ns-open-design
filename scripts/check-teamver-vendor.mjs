import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const vendorDir = resolve(repoRoot, "vendor/teamver");
const manifestPath = resolve(vendorDir, "manifest.json");
const appSdkTgz = resolve(vendorDir, "app-sdk.tgz");
const pythonWheelDir = resolve(vendorDir, "python");
const pep427Wheels = existsSync(pythonWheelDir)
  ? readdirSync(pythonWheelDir).filter((name) => /^teamver_app_sdk-.+\.whl$/.test(name))
  : [];

const missing = [];
if (!existsSync(manifestPath)) missing.push("vendor/teamver/manifest.json");
if (!existsSync(appSdkTgz)) missing.push("vendor/teamver/app-sdk.tgz");
if (pep427Wheels.length === 0) missing.push("vendor/teamver/python/teamver_app_sdk-*.whl");

if (missing.length > 0) {
  console.error(
    [
      "Teamver SDK vendor artifacts are missing:",
      ...missing.map((p) => `  - ${p}`),
      "",
      "Run from ns-open-design repo root:",
      "  bash scripts/sync-teamver-vendor.sh",
      "",
      "This builds via ns-teamver-platform/scripts/build-ts-packages.sh and build-python-sdk.sh.",
    ].join("\n"),
  );
  process.exit(1);
}

const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
console.log(
  `teamver vendor ok (@teamver/app-sdk ${manifest["@teamver/app-sdk"]?.version}, teamver-app-sdk ${manifest["teamver-app-sdk"]?.version})`,
);
