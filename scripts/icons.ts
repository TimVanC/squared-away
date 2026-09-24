// Renders public/icons/icon.svg to the PNG sizes the PWA and iOS need.
// Usage: npx tsx scripts/icons.ts
import sharp from "sharp";
import { readFileSync } from "fs";

const svg = readFileSync("public/icons/icon.svg");
const outputs: [string, number][] = [
  ["public/icons/apple-touch-icon.png", 180],
  ["public/icons/favicon-32.png", 32],
  ["public/icons/icon-192.png", 192],
  ["public/icons/icon-512.png", 512],
];

async function main() {
  for (const [file, size] of outputs) {
    await sharp(svg, { density: 384 }).resize(size, size).png().toFile(file);
    console.log(`${file} (${size}px)`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
