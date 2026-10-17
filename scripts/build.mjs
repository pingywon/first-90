// Builds dist/ for the Worker's static assets and stamps the one version number (package.json) everywhere.
import { readFile, writeFile, rm, cp, mkdir, readdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dist = join(root, "dist");
const { version } = JSON.parse(await readFile(join(root, "package.json"), "utf8"));

await writeFile(join(root, "src/version.js"), `export const VERSION = "${version}";\n`);

await mkdir(dist, { recursive: true });
for (const entry of await readdir(dist)) await rm(join(dist, entry), { recursive: true, force: true });
await cp(join(root, "public"), dist, { recursive: true });

for (const name of await readdir(dist)) {
  if (!name.endsWith(".html")) continue;
  const file = join(dist, name);
  await writeFile(file, (await readFile(file, "utf8")).replaceAll("{{VERSION}}", version));
}

const manifest = JSON.parse(await readFile(join(root, "samples/manifest.json"), "utf8"));
await writeFile(join(dist, "samples/index.json"), JSON.stringify(manifest.map(({ id, label, kind }) => ({ id, label, kind }))));
await writeFile(join(dist, "version.txt"), `${version}\n`);

console.log(`built dist/ for v${version}`);
