import { copyFile, mkdir } from "node:fs/promises";

await mkdir(new URL("../dist/", import.meta.url), { recursive: true });
for (const file of ["sw.js", "apple-touch-icon.png", "icon-512.png"]) {
  await copyFile(new URL(`../${file}`, import.meta.url), new URL(`../dist/${file}`, import.meta.url));
}

// 立绘模式 sprites (v372) are loaded at runtime by relative URL, so Vite does not bundle them.
await mkdir(new URL("../dist/sprites/", import.meta.url), { recursive: true });
for (const mood of ["cold", "shy", "angry", "smirk"]) {
  const file = `sprites/guqiyan_${mood}.webp`;
  await copyFile(new URL(`../${file}`, import.meta.url), new URL(`../dist/${file}`, import.meta.url));
}

console.log("static PWA files copied to dist");
