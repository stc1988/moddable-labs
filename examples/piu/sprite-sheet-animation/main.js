import {} from "piu/MC";
import Timeline from "piu/Timeline";

const FRAME_WIDTH = 176;
const FRAME_HEIGHT = 208;
const FRAME_DURATION = 150;
const VIEWPORT_WIDTH = 208;
const SPRITE_X_OFFSET = Math.floor((VIEWPORT_WIDTH - FRAME_WIDTH) / 2);
const SLIDE_DURATION = 350;

const SPRITES = [
  { name: "idle", path: "01_idle.png", frames: 6 },
  { name: "run right", path: "02_run_right.png", frames: 8 },
  { name: "run left", path: "03_run_left.png", frames: 8 },
  { name: "waving", path: "04_waving.png", frames: 4 },
  { name: "jumping", path: "05_jumping.png", frames: 5 },
  { name: "failed", path: "06_failed.png", frames: 8 },
  { name: "waiting", path: "07_waiting.png", frames: 6 },
  { name: "running", path: "08_running.png", frames: 6 },
  { name: "review", path: "09_review.png", frames: 6 },
];

const backgroundSkin = new Skin({ fill: "#eef3ee" });
const titleStyle = new Style({
  font: "OpenSans-Regular-24",
  color: "#2e3438",
  horizontal: "center",
  vertical: "middle",
});
const runnerSkins = SPRITES.map(
  (sprite) =>
    new Skin({
      texture: new Texture(sprite.path),
      x: 0,
      y: 0,
      width: FRAME_WIDTH,
      height: FRAME_HEIGHT,
      variants: FRAME_WIDTH,
    }),
);

const Runner = Content.template(($) => ({
  width: FRAME_WIDTH,
  height: FRAME_HEIGHT,
  skin: runnerSkins[$.index],
}));

class SpriteSheetAppBehavior extends Behavior {
  onCreate(application) {
    this.animating = false;
    this.startX = 0;
    this.startY = 0;
    this.spriteIndex = 0;
    this.title = new Label(null, {
      left: 0,
      right: 0,
      top: 0,
      height: 32,
      string: SPRITES[this.spriteIndex].name,
      style: titleStyle,
    });
    this.viewport = new Container(null, {
      width: VIEWPORT_WIDTH,
      height: FRAME_HEIGHT,
      clip: true,
    });
    this.runner = new Runner(
      { index: this.spriteIndex },
      { left: SPRITE_X_OFFSET },
    );
    this.viewport.add(this.runner);
    this.layout(application);
    application.add(this.title);
    application.add(this.viewport);
  }

  onDisplaying(application) {
    this.startSprite(application);
  }

  onTouchBegan(application, id, x, y, ticks) {
    application.captureTouch(id, x, y, ticks);
    this.startX = x;
    this.startY = y;
  }

  onTouchEnded(application, id, x, y) {
    if (this.animating) return;

    const dx = x - this.startX;
    const dy = y - this.startY;
    if (Math.abs(dx) < 42 || Math.abs(dx) < Math.abs(dy) * 1.5) return;

    const direction = dx < 0 ? 1 : -1;
    let spriteIndex = this.spriteIndex + direction;
    if (spriteIndex < 0) spriteIndex = SPRITES.length - 1;
    else if (spriteIndex >= SPRITES.length) spriteIndex = 0;

    this.slideTo(application, spriteIndex, direction);
  }

  onFinished(application) {
    if (!this.animating) return;

    this.viewport.remove(this.oldRunner);
    this.runner = this.newRunner;
    this.oldRunner = null;
    this.newRunner = null;
    this.animating = false;
    this.startSprite(application);
  }

  onTimeChanged(application) {
    if (this.animating) {
      this.timeline.seekTo(application.time);
      return;
    }

    this.runner.variant =
      Math.floor(application.time / FRAME_DURATION) %
      SPRITES[this.spriteIndex].frames;
  }

  startSprite(application) {
    application.duration = SPRITES[this.spriteIndex].frames * FRAME_DURATION;
    application.interval = 16;
    application.loop = true;
    application.time = 0;
    application.start();
  }

  slideTo(application, spriteIndex, direction) {
    const width = this.viewport.width;
    const oldRunner = this.runner;
    const newRunner = new Runner(
      { index: spriteIndex },
      { left: direction * width + SPRITE_X_OFFSET },
    );

    this.animating = true;
    this.oldRunner = oldRunner;
    this.newRunner = newRunner;
    this.spriteIndex = spriteIndex;
    this.title.string = SPRITES[spriteIndex].name;
    this.viewport.add(newRunner);

    this.timeline = new Timeline()
      .to(
        oldRunner,
        { x: -direction * width + SPRITE_X_OFFSET },
        SLIDE_DURATION,
        Math.quadEaseOut,
        0,
      )
      .to(
        newRunner,
        { x: SPRITE_X_OFFSET },
        SLIDE_DURATION,
        Math.quadEaseOut,
        -SLIDE_DURATION,
      );

    application.duration = this.timeline.duration;
    application.loop = false;
    application.time = 0;
    application.start();
  }

  onMeasureHorizontally(application, width) {
    this.layout(application, width, application.height);
    return width;
  }

  onMeasureVertically(application, height) {
    this.layout(application, application.width, height);
    return height;
  }

  onResize(application) {
    this.layout(application);
  }

  layout(application, width = application.width, height = application.height) {
    if (!this.viewport) return;

    this.viewport.x = Math.floor((width - VIEWPORT_WIDTH) / 2);
    this.viewport.y = Math.max(
      this.title.y + this.title.height,
      Math.floor((height - FRAME_HEIGHT) / 2) + 12,
    );
  }
}

const SpriteSheetApp = Application.template(($) => ({
  active: true,
  skin: backgroundSkin,
  Behavior: SpriteSheetAppBehavior,
}));

export default function () {
  return new SpriteSheetApp(null, {
    commandListLength: 4096,
    displayListLength: 4096,
    touchCount: 1,
  });
}
