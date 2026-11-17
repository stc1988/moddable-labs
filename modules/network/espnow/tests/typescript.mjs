import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// Use the same TypeScript compiler as mcconfig; no generated files live in the repo.
export async function readTypeScript(sourceURL) {
  const directory = await mkdtemp(join(tmpdir(), "espnow-test-"));
  try {
    const config = join(directory, "tsconfig.json");
    await writeFile(
      config,
      JSON.stringify({
        files: [fileURLToPath(sourceURL)],
        compilerOptions: {
          target: "esnext",
          module: "esnext",
          noCheck: true,
          outDir: directory,
          rootDir: dirname(fileURLToPath(sourceURL)),
          types: [],
        },
      }),
    );
    execFileSync("tsc", ["-p", config], { stdio: "pipe" });
    return await readFile(
      join(directory, `${basename(sourceURL.pathname, ".ts")}.js`),
      "utf8",
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}
