#!/usr/bin/env bun
/** Build the static HSCON site in root/dist and optionally serve it locally. */
import { cp, mkdir, rm, writeFile } from "node:fs/promises";
import { networkInterfaces } from "node:os";
import { join, relative, resolve, sep } from "node:path";

const root = resolve(import.meta.dir, "..");
const out = join(root, "dist");
const entries = ["index.html", "connections/index.html", "pitch/index.html", "session/index.html", "wordle/index.html", "cup-toss/index.html"];

await rm(out, { recursive: true, force: true });
await mkdir(out, { recursive: true });
const result = await Bun.build({
  entrypoints: entries.map((entry) => join(root, entry)),
  outdir: out,
  minify: true,
  sourcemap: "none",
  target: "browser",
  publicPath: "./",
});
if (!result.success) {
  for (const log of result.logs) console.error(log);
  process.exit(1);
}

// Bun emits root-relative chunk references; nested pages need one ../ per level.
for (const output of result.outputs) {
  if (!output.path.endsWith(".html")) continue;
  const depth = relative(out, output.path).split(/[\\/]/).length - 1;
  if (!depth) continue;
  const html = (await Bun.file(output.path).text()).replace(/(src|href)="\.\/(chunk-)/g, `$1="${"../".repeat(depth)}$2`);
  await Bun.write(output.path, html);
}

for (const folder of ["assets", "textures", "slides"]) {
  await cp(join(root, folder), join(out, folder), { recursive: true });
}
await writeFile(join(out, ".nojekyll"), "");
console.log(`Built ${entries.length} pages into ${out}`);

if (Bun.argv.includes("--serve")) {
  const port = Number(process.env.PORT ?? 4173);
  const server = Bun.serve({
    hostname: "0.0.0.0",
    port,
    async fetch(request) {
      let path = decodeURIComponent(new URL(request.url).pathname);
      if (path.endsWith("/")) path += "index.html";
      const filePath = resolve(out, `.${sep}${path.replace(/^\/+/, "")}`);
      if (filePath !== out && !filePath.startsWith(`${out}${sep}`)) return new Response("Not found", { status: 404 });
      const file = Bun.file(filePath);
      return await file.exists() ? new Response(file) : new Response("Not found", { status: 404 });
    },
  });
  const addresses = Object.values(networkInterfaces()).flat().filter((address) => address?.family === "IPv4" && !address.internal);
  console.log(`Local: http://localhost:${server.port}/`);
  for (const address of addresses) console.log(`Network: http://${address!.address}:${server.port}/`);
  console.log("Press Ctrl+C to stop.");
}
