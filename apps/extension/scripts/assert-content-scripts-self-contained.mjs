import { readFileSync } from "node:fs";
import { join } from "node:path";

const contentScriptEntries = ["appBridge.js", "contentScript.js"];
const importOrExportPattern = /^\s*(?:import|export)\b/m;

for (const entry of contentScriptEntries) {
  const builtScript = readFileSync(join("dist", entry), "utf8");

  if (importOrExportPattern.test(builtScript)) {
    throw new Error(`${entry} must be self-contained because Chrome content_scripts are not loaded as ES modules.`);
  }
}
