import { copyFile, mkdir } from "node:fs/promises";

await mkdir(new URL("../dist/", import.meta.url), { recursive: true });
for (const file of ["sw.js", "apple-touch-icon.png", "icon-512.png"]) {
  await copyFile(new URL(`../${file}`, import.meta.url), new URL(`../dist/${file}`, import.meta.url));
}

// 立绘模式 sprites (v372; small chibi since v373) are loaded at runtime by relative URL, so Vite does not bundle them.
await mkdir(new URL("../dist/sprites/", import.meta.url), { recursive: true });
for (const mood of ["cold", "shy", "angry", "smirk", "love", "smug", "sad", "surprised"]) {
  const file = `sprites/guqiyan_${mood}.webp`;
  await copyFile(new URL(`../${file}`, import.meta.url), new URL(`../dist/${file}`, import.meta.url));
}

// 感知互动 modules are loaded by a runtime import() from a classic <script>, so Vite does not bundle them.
await mkdir(new URL("../dist/src/", import.meta.url), { recursive: true });
for (const file of ["src/sense-interaction.js", "src/sense-bridge.js", "src/math.js"]) {
  await copyFile(new URL(`../${file}`, import.meta.url), new URL(`../dist/${file}`, import.meta.url));
}

console.log("static PWA files copied to dist");
