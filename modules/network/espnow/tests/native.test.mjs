import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

test("native callbacks bound allocation before JS delivery, including post failure and close", () => {
  const directory = mkdtempSync(join(tmpdir(), "espnow-native-"));
  try {
    const core = readFileSync(new URL("../core.c", import.meta.url), "utf8");
    // Compile the production types, callbacks and lifetime helpers without device-only XS exports.
    const source = core.slice(
      core.indexOf("#define ESPNOW_ID_BYTES"),
      core.indexOf("void xs_espnow_radio_constructor"),
    );
    const harness = readFileSync(
      new URL("./native-harness.c", import.meta.url),
      "utf8",
    );
    const path = join(directory, "native.c");
    const binary = join(directory, "native");
    writeFileSync(path, harness.replace("// CORE", source));
    for (const version of [50100, 60100]) {
      execFileSync(
        "cc",
        [
          "-std=c11",
          "-fsanitize=address,undefined",
          `-DESP_IDF_VERSION=${version}`,
          path,
          "-o",
          binary,
        ],
        { stdio: "pipe" },
      );
      assert.match(execFileSync(binary, [], { encoding: "utf8" }), /PASS/);
    }
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
