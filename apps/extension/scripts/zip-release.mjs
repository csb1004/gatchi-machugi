import { execFile } from "node:child_process";
import { access, copyFile, mkdir, readFile, rm } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const extensionDirectory = resolve(scriptDirectory, "..");
const distDirectory = resolve(extensionDirectory, "dist");
const releaseDirectory = resolve(extensionDirectory, "release");
const zipPath = resolve(releaseDirectory, "gatchi-machugi-extension.zip");
const packageJson = JSON.parse(await readFile(resolve(extensionDirectory, "package.json"), "utf8"));
const versionedZipPath = resolve(releaseDirectory, `gatchi-machugi-extension-v${packageJson.version}.zip`);

await mkdir(releaseDirectory, { recursive: true });
await rm(zipPath, { force: true });
await rm(versionedZipPath, { force: true });

if (process.platform === "win32") {
  await execFileAsync("powershell", [
    "-NoLogo",
    "-NoProfile",
    "-Command",
    `$ErrorActionPreference = 'Stop'; Compress-Archive -Path (Join-Path '${distDirectory}' '*') -DestinationPath '${zipPath}' -Force`
  ]);
} else {
  await execFileAsync("zip", ["-r", zipPath, "."], { cwd: distDirectory });
}

await access(zipPath);
await copyFile(zipPath, versionedZipPath);
await access(versionedZipPath);
