import { build } from "esbuild";
import { execSync } from "child_process";

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

  // 依存関係(valibot)のビルド
  await build({
    entryPoints: ["src/lib/valibot/index.js"],
    bundle: true,
    minify: true,
    treeShaking: true,
    format: "esm",
    outfile: "build/lib/valibot.js",
  });

  console.log("Build successful!");
} catch (error) {
  console.error("Build failed:", error);
  process.exit(1);
}
