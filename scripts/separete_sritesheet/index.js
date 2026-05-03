#!/usr/bin/env node

const { execFileSync, spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const zlib = require("node:zlib");

const rows = [
  "idle",
  "run_right",
  "run_left",
  "waving",
  "jumping",
  "failed",
  "waiting",
  "running",
  "review",
];

const repoRoot = path.resolve(__dirname, "../..");
const defaultInput = path.join(
  repoRoot,
  "examples/assets/image/spritesheet.webp",
);
const defaultOutDir = path.join(repoRoot, "examples/assets/image");

function usage() {
  console.log(`Usage:
  node scripts/separete_sritesheet/index.js [options]

Options:
  --input <path>        Source spritesheet. Default: examples/assets/image/spritesheet.webp
  --out <path>          Output directory. Default: examples/assets/image
  --frame-width <px>    Source and output frame width. Default: rowHeight + 48
  --gap <px>            Maximum transparent column gap to merge. Default: 16
  --optimize            Auto-size cells from detected sprite bounds
  --padding <px>        Extra horizontal cell padding for --optimize. Default: 10
  --compress            Re-compress generated PNG files with ffmpeg
  --dry-run             Print the planned slices without writing files
  --help                Show this help

Output:
  PNG files with transparent backgrounds. Sprites are detected from alpha
  columns, then re-centered inside equal cells so Piu can animate them with
  Skin variants.

Rows:
  ${rows.join(", ")}
`);
}

function parseArgs(argv) {
  const options = {
    input: defaultInput,
    outDir: defaultOutDir,
    frameWidth: undefined,
    gap: 16,
    optimize: false,
    padding: 10,
    compress: false,
    dryRun: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--help" || arg === "-h") {
      options.help = true;
    } else if (arg === "--dry-run") {
      options.dryRun = true;
    } else if (arg === "--input") {
      options.input = path.resolve(argv[++i] || "");
    } else if (arg === "--out") {
      options.outDir = path.resolve(argv[++i] || "");
    } else if (arg === "--frame-width") {
      options.frameWidth = Number(argv[++i]);
      if (!Number.isInteger(options.frameWidth) || options.frameWidth <= 0) {
        throw new Error("--frame-width must be a positive integer.");
      }
    } else if (arg === "--gap") {
      options.gap = Number(argv[++i]);
      if (!Number.isInteger(options.gap) || options.gap < 0) {
        throw new Error("--gap must be a non-negative integer.");
      }
    } else if (arg === "--optimize") {
      options.optimize = true;
      options.compress = true;
    } else if (arg === "--padding") {
      options.padding = Number(argv[++i]);
      if (!Number.isInteger(options.padding) || options.padding < 0) {
        throw new Error("--padding must be a non-negative integer.");
      }
    } else if (arg === "--compress") {
      options.compress = true;
    } else {
      throw new Error(`Unknown option: ${arg}`);
    }
  }

  return options;
}

function getImageSize(input) {
  const output = execFileSync(
    "sips",
    ["-g", "pixelWidth", "-g", "pixelHeight", input],
    {
      encoding: "utf8",
    },
  );
  const width = output.match(/pixelWidth:\s*(\d+)/);
  const height = output.match(/pixelHeight:\s*(\d+)/);

  if (!width || !height) {
    throw new Error(
      `Could not read image dimensions from sips output:\n${output}`,
    );
  }

  return {
    width: Number(width[1]),
    height: Number(height[1]),
  };
}

function requireCommand(command) {
  try {
    execFileSync(command, ["-version"], { stdio: "ignore" });
  } catch {
    throw new Error(`Required command not found: ${command}`);
  }
}

function readRgba(input, width, height) {
  const result = spawnSync(
    "ffmpeg",
    [
      "-hide_banner",
      "-loglevel",
      "error",
      "-i",
      input,
      "-f",
      "rawvideo",
      "-pix_fmt",
      "rgba",
      "-",
    ],
    {
      encoding: "buffer",
      maxBuffer: width * height * 4 + 1024,
    },
  );

  if (result.status !== 0) {
    throw new Error(
      `ffmpeg failed while decoding ${input}:\n${result.stderr.toString()}`,
    );
  }

  const expected = width * height * 4;
  if (result.stdout.length !== expected) {
    throw new Error(
      `Expected ${expected} RGBA bytes, received ${result.stdout.length}.`,
    );
  }

  return result.stdout;
}

function hasAlphaInColumn(pixels, sheetWidth, x, y0, height) {
  let offset = (y0 * sheetWidth + x) * 4 + 3;
  for (let y = 0; y < height; y += 1, offset += sheetWidth * 4) {
    if (pixels[offset] !== 0) return true;
  }
  return false;
}

function spriteRanges(pixels, sheetWidth, y0, height, gap) {
  const ranges = [];
  let start = -1;
  let lastAlpha = -1;

  for (let x = 0; x < sheetWidth; x += 1) {
    if (hasAlphaInColumn(pixels, sheetWidth, x, y0, height)) {
      if (start < 0) start = x;
      lastAlpha = x;
    } else if (start >= 0 && x - lastAlpha > gap) {
      ranges.push({ minX: start, maxX: lastAlpha });
      start = -1;
      lastAlpha = -1;
    }
  }

  if (start >= 0) ranges.push({ minX: start, maxX: lastAlpha });
  return ranges;
}

function frameBounds(pixels, sheetWidth, range, y0, frameHeight) {
  let minX = range.maxX;
  let minY = frameHeight;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < frameHeight; y += 1) {
    let offset = ((y0 + y) * sheetWidth + range.minX) * 4 + 3;
    for (let x = range.minX; x <= range.maxX; x += 1, offset += 4) {
      if (pixels[offset] === 0) continue;
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
  }

  if (maxX < 0) return null;
  return { minX, minY, maxX, maxY };
}

function detectRowFrames(pixels, size, rowHeight, gap, rowIndex, name) {
  const y0 = rowIndex * rowHeight;
  const ranges = spriteRanges(pixels, size.width, y0, rowHeight, gap);
  const frames = [];

  for (let index = 0; index < ranges.length; index += 1) {
    const bounds = frameBounds(
      pixels,
      size.width,
      ranges[index],
      y0,
      rowHeight,
    );
    if (bounds) frames.push({ index, y0, bounds });
  }

  if (!frames.length) {
    throw new Error(`No sprites found in row ${rowIndex + 1} (${name}).`);
  }

  return frames;
}

function spriteWidth(frame) {
  return frame.bounds.maxX - frame.bounds.minX + 1;
}

function spriteHeight(frame) {
  return frame.bounds.maxY - frame.bounds.minY + 1;
}

function rowPlan(frames, rowHeight, frameWidth, rowIndex, name, outDir) {
  const targetCenter = (frameWidth - 1) / 2;
  const bottoms = frames.map((frame) => frame.bounds.maxY);
  const targetBottom = Math.max(...bottoms);

  for (const frame of frames) {
    frame.dx = Math.round(targetCenter - (spriteWidth(frame) - 1) / 2);
    frame.dy = targetBottom - spriteHeight(frame) + 1;
  }

  return {
    index: rowIndex,
    name,
    frameWidth,
    frameHeight: rowHeight,
    frames,
    targetCenter,
    targetBottom,
    output: path.join(
      outDir,
      `${String(rowIndex + 1).padStart(2, "0")}_${name}.png`,
    ),
  };
}

function roundUp(value, multiple) {
  return Math.ceil(value / multiple) * multiple;
}

function writeUInt32(buffer, offset, value) {
  buffer.writeUInt32BE(value >>> 0, offset);
}

function crc32(buffer) {
  let crc = 0xffffffff;
  for (let i = 0; i < buffer.length; i += 1) {
    crc ^= buffer[i];
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data = Buffer.alloc(0)) {
  const name = Buffer.from(type);
  const chunk = Buffer.alloc(12 + data.length);
  writeUInt32(chunk, 0, data.length);
  name.copy(chunk, 4);
  data.copy(chunk, 8);
  writeUInt32(chunk, 8 + data.length, crc32(Buffer.concat([name, data])));
  return chunk;
}

function encodePng(width, height, rgba) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  writeUInt32(ihdr, 0, width);
  writeUInt32(ihdr, 4, height);
  ihdr[8] = 8;
  ihdr[9] = 6;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y += 1) {
    const outOffset = y * (stride + 1);
    raw[outOffset] = 0;
    rgba.copy(raw, outOffset + 1, y * stride, (y + 1) * stride);
  }

  return Buffer.concat([
    signature,
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", zlib.deflateSync(raw)),
    pngChunk("IEND"),
  ]);
}

function renderRow(pixels, sheetWidth, plan) {
  const outputWidth = plan.frames.length * plan.frameWidth;
  const output = Buffer.alloc(outputWidth * plan.frameHeight * 4);

  plan.frames.forEach((frame, outFrameIndex) => {
    for (let y = frame.bounds.minY; y <= frame.bounds.maxY; y += 1) {
      for (let x = frame.bounds.minX; x <= frame.bounds.maxX; x += 1) {
        const tx =
          outFrameIndex * plan.frameWidth + frame.dx + x - frame.bounds.minX;
        const ty = frame.dy + y - frame.bounds.minY;
        const src = ((frame.y0 + y) * sheetWidth + x) * 4;
        const alpha = pixels[src + 3];
        if (alpha === 0) continue;

        const dst = (ty * outputWidth + tx) * 4;
        output[dst] = pixels[src];
        output[dst + 1] = pixels[src + 1];
        output[dst + 2] = pixels[src + 2];
        output[dst + 3] = alpha;
      }
    }
  });

  return encodePng(outputWidth, plan.frameHeight, output);
}

function compressPng(file) {
  const temp = path.join(
    "/private/tmp",
    `${path.basename(file, ".png")}-${process.pid}.png`,
  );
  const result = spawnSync(
    "ffmpeg",
    [
      "-hide_banner",
      "-loglevel",
      "error",
      "-y",
      "-i",
      file,
      "-compression_level",
      "9",
      "-pred",
      "mixed",
      temp,
    ],
    { encoding: "utf8" },
  );

  if (result.status !== 0) {
    if (fs.existsSync(temp)) fs.unlinkSync(temp);
    throw new Error(
      `ffmpeg failed while compressing ${file}:\n${result.stderr}`,
    );
  }

  const before = fs.statSync(file).size;
  const after = fs.statSync(temp).size;
  if (after < before) {
    fs.renameSync(temp, file);
    return { before, after };
  }

  fs.unlinkSync(temp);
  return { before, after: before };
}

function formatBytes(size) {
  if (size < 1024) return `${size} B`;
  return `${Math.round(size / 1024)}K`;
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    usage();
    return;
  }

  if (!fs.existsSync(options.input)) {
    throw new Error(`Input file does not exist: ${options.input}`);
  }

  requireCommand("ffmpeg");

  const size = getImageSize(options.input);
  if (size.height % rows.length !== 0) {
    throw new Error(
      `Image height ${size.height}px cannot be divided evenly into ${rows.length} rows.`,
    );
  }

  const rowHeight = size.height / rows.length;
  const pixels = readRgba(options.input, size.width, size.height);
  const detectedRows = rows.map((name, index) =>
    detectRowFrames(pixels, size, rowHeight, options.gap, index, name),
  );
  const maxSpriteWidth = Math.max(
    ...detectedRows.flatMap((frames) => frames.map(spriteWidth)),
  );
  const frameWidth =
    options.frameWidth ||
    (options.optimize
      ? roundUp(maxSpriteWidth + options.padding, 8)
      : rowHeight + 48);
  const plan = rows.map((name, index) =>
    rowPlan(
      detectedRows[index],
      rowHeight,
      frameWidth,
      index,
      name,
      options.outDir,
    ),
  );

  console.log(`Source: ${options.input}`);
  console.log(`Size: ${size.width}x${size.height}`);
  console.log(`Rows: ${rows.length}`);
  console.log(`Output frame: ${frameWidth}x${rowHeight}`);
  console.log(`Merge gap: ${options.gap}`);
  console.log(`Optimize: ${options.optimize ? "yes" : "no"}`);
  console.log(`Compress: ${options.compress ? "yes" : "no"}`);
  console.log("");

  for (const row of plan) {
    const offsets = row.frames
      .map((frame) => `${frame.index}:${frame.dx},${frame.dy}`)
      .join(" ");
    console.log(
      `${row.name}: ${row.frames.length} frames, center=${row.targetCenter}, bottom=${row.targetBottom}, offsets=[${offsets}] -> ${row.output}`,
    );
  }

  if (options.dryRun) return;

  fs.mkdirSync(options.outDir, { recursive: true });
  for (const row of plan) {
    fs.writeFileSync(row.output, renderRow(pixels, size.width, row));
  }

  if (options.compress) {
    let before = 0;
    let after = 0;
    for (const row of plan) {
      const result = compressPng(row.output);
      before += result.before;
      after += result.after;
    }
    console.log("");
    console.log(
      `Compressed PNGs: ${formatBytes(before)} -> ${formatBytes(after)}`,
    );
  }

  console.log("");
  console.log(`Wrote ${plan.length} files to ${options.outDir}`);
}

try {
  main();
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
