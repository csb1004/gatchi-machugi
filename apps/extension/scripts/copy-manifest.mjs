import { cp, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const extensionDirectory = resolve(scriptDirectory, "..");
const distDirectory = resolve(extensionDirectory, "dist");

await mkdir(distDirectory, { recursive: true });
await cp(resolve(extensionDirectory, "manifest.json"), resolve(distDirectory, "manifest.json"));
await cp(resolve(extensionDirectory, "src", "popup.html"), resolve(distDirectory, "popup.html"));
await cp(resolve(extensionDirectory, "assets", "icons"), resolve(distDirectory, "icons"), { recursive: true });
