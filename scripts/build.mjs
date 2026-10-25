// Bundles the content script and copies static files into dist/.
// --watch rebuilds on change; --zip also writes claimcheck-<version>.zip.
import { cp, mkdir, readFile, rm } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import * as esbuild from "esbuild";

const watch = process.argv.includes("--watch");
const zip = process.argv.includes("--zip");

await rm("dist", { recursive: true, force: true });
await mkdir("dist", { recursive: true });
await cp("src/manifest.json", "dist/manifest.json");
await cp("icons", "dist/icons", { recursive: true });
await cp("src/options", "dist/options", { recursive: true });

const options = {
  entryPoints: ["src/content.js"],
  bundle: true,
  format: "iife",
  target: ["chrome120", "firefox128"],
  outfile: "dist/content.js",
  logLevel: "info",
};

if (watch) {
  const ctx = await esbuild.context(options);
  await ctx.watch();
} else {
  await esbuild.build(options);
  if (zip) {
    const { version } = JSON.parse(await readFile("src/manifest.json", "utf8"));
    const name = `claimcheck-${version}.zip`;
    await rm(name, { force: true });
    // tar ships with Windows 10+, macOS and Linux and can write zip files.
    execFileSync("tar", ["-a", "-c", "-f", `../${name}`, "."], { cwd: "dist" });
    console.log(`Wrote ${name}`);
  }
}
