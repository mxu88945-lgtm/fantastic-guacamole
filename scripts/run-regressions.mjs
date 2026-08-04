import { readdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const directory = new URL("./", import.meta.url);
const tests = readdirSync(directory)
  .filter((name) => name.endsWith("-regression.mjs"))
  .sort();

for (const test of tests) {
  const result = spawnSync(process.execPath, [fileURLToPath(new URL(test, directory))], { stdio: "inherit" });
  if (result.status !== 0) process.exit(result.status || 1);
}

console.log(`${tests.length} regression files passed`);
