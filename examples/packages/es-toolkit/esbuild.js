import { build } from "esbuild";
import { execSync } from "node:child_process";

try {
  // いったんメインプログラムの型チェックとビルドはtscで実施する
  execSync("tsc", { stdio: "inherit" });
  //   execSync('tsc --noEmit', { stdio: 'inherit' });

  //   await build({
  //     entryPoints: ['src/main.ts'],
  //     bundle: false,
  //     minify: false,
  //     format: 'esm',
  //     outdir: 'build',
  //     loader: { '.ts': 'ts' }
  //   });

  // 依存関係(es-toolkit)のビルド
  await build({
    entryPoints: ["src/lib/es-toolkit/index.js"],
    bundle: true,
    minify: false,
    treeShaking: true,
    format: "esm",
    outfile: "build/lib/es-toolkit.js",
  });

  console.log("Build successful!");
} catch (error) {
  console.error("Build failed:", error);
  process.exit(1);
}
