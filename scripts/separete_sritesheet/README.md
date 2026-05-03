# Sprite Sheet Separator

`index.js` splits `examples/assets/image/spritesheet.webp` into one PNG strip per animation row. The output strips are prepared for Piu `Texture` + `Skin.variants` animation: every frame is placed into an equal-size transparent cell, with the sprite centered horizontally and aligned to a shared baseline.

## Requirements

- Node.js
- `sips` for reading source image dimensions on macOS
- `ffmpeg` for decoding WebP and optional PNG recompression

## Basic Usage

Generate the default row PNGs into `examples/assets/image`:

```sh
node scripts/separete_sritesheet/index.js
```

Preview the planned output without writing files:

```sh
node scripts/separete_sritesheet/index.js --dry-run
```

Generate optimized row PNGs, overwriting the default row PNGs:

```sh
node scripts/separete_sritesheet/index.js --optimize --out examples/assets/image
```

Generate optimized row PNGs into a separate directory:

```sh
node scripts/separete_sritesheet/index.js --optimize --out examples/assets/image/optimized
```

## Options

- `--input <path>`: Source spritesheet. Defaults to `examples/assets/image/spritesheet.webp`.
- `--out <path>`: Output directory. Defaults to `examples/assets/image`.
- `--frame-width <px>`: Fixed output cell width. Defaults to `rowHeight + 48`.
- `--gap <px>`: Maximum transparent column gap to merge into one detected sprite. Defaults to `16`.
- `--optimize`: Auto-size the output cell width from detected sprite bounds. This also enables PNG recompression.
- `--padding <px>`: Extra horizontal padding added when `--optimize` computes the cell width. Defaults to `10`.
- `--compress`: Recompress generated PNG files with `ffmpeg` without changing cell width.
- `--dry-run`: Print the planned output and offsets without writing files.
- `--help`: Print command help.

## Output Rows

The source image is expected to contain these rows, in order:

```text
01_idle.png
02_run_right.png
03_run_left.png
04_waving.png
05_jumping.png
06_failed.png
07_waiting.png
08_running.png
09_review.png
```

The script derives row height from `sourceHeight / 9`.

## What Optimization Does

`--optimize` keeps the visual sprite pixels intact. It does not scale the artwork or quantize colors.

The optimization pipeline is:

1. Decode the source WebP to RGBA with `ffmpeg`.
2. For each row, scan alpha values column by column to detect visible sprite ranges.
3. Compute each sprite's visible bounding box from non-transparent pixels.
4. Find the widest sprite across all rows.
5. Compute a shared cell width as `roundUp(maxSpriteWidth + padding, 8)`.
6. Render every sprite into that equal-size transparent cell, centered horizontally and aligned to a shared bottom baseline.
7. Write one PNG strip per row.
8. Recompress each generated PNG with `ffmpeg -compression_level 9 -pred mixed`.

This reduces file size and Piu resource size primarily by removing unused transparent horizontal space from every frame. Because Piu `Skin.variants` uses the horizontal offset between equal cells, the output cell width must match the app's `FRAME_WIDTH` and the skin's `variants` value.

For example, the optimized assets currently use `176x208` cells, so the Piu skin should use:

```js
const FRAME_WIDTH = 176;

const runnerSkin = new Skin({
  texture: new Texture("08_running.png"),
  x: 0,
  y: 0,
  width: FRAME_WIDTH,
  height: 208,
  variants: FRAME_WIDTH,
});
```

Then advance frames with:

```js
content.variant = frame;
```

## Notes

- `--frame-width` overrides the auto-sized width from `--optimize`.
- If a sprite is split into multiple detected pieces, increase `--gap`.
- If neighboring sprites merge into one detected piece, decrease `--gap`.
- The script only creates image assets. It does not generate comparison HTML.
