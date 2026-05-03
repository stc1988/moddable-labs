import {} from "piu/MC";
import Timeline from "piu/Timeline";
import SpriteSheetPlayer from "spriteSheetPlayer";

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
class SpriteSheetAppBehavior extends Behavior {
  onCreate(application) {
    this.animating = false;
    this.index = 0;
    this.startX = 0;
    this.startY = 0;
    this.title = new Label(null, {
      left: 0,
      right: 0,
      top: 0,
      height: 32,
      string: SPRITES[0].name,
      style: titleStyle,
    });
    this.viewport = new Container(null, {
      width: VIEWPORT_WIDTH,
      height: FRAME_HEIGHT,
      clip: true,
    });
    this.player = this.createPlayer(this.index, SPRITE_X_OFFSET);
    this.viewport.add(this.player);
    this.layout(application);
    application.add(this.title);
    application.add(this.viewport);
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
    if (Math.abs(dx) < 42) return;
    if (Math.abs(dx) < Math.abs(dy) * 1.5) return;

    const direction = dx < 0 ? 1 : -1;
    this.slideTo(application, this.index + direction, direction);
  }

  onFinished(application) {
    if (!this.animating) return;

    this.viewport.remove(this.oldPlayer);
    this.player = this.newPlayer;
    this.oldPlayer = null;
    this.newPlayer = null;
    this.animating = false;
  }

  onTimeChanged(application) {
    if (this.animating) this.timeline.seekTo(application.time);
  }

  createPlayer(index, left) {
    return new SpriteSheetPlayer(
      {
        sprites: SPRITES,
        state: SPRITES[index].name,
        frameWidth: FRAME_WIDTH,
        frameHeight: FRAME_HEIGHT,
        frameDuration: FRAME_DURATION,
      },
      { left },
    );
  }

  slideTo(application, index, direction) {
    let nextIndex = index;
    if (nextIndex < 0) nextIndex = SPRITES.length - 1;
    else if (nextIndex >= SPRITES.length) nextIndex = 0;
    if (nextIndex === this.index) return;

    const width = this.viewport.width;
    const oldPlayer = this.player;
    const newPlayer = this.createPlayer(
      nextIndex,
      direction * width + SPRITE_X_OFFSET,
    );

    this.animating = true;
    this.index = nextIndex;
    this.oldPlayer = oldPlayer;
    this.newPlayer = newPlayer;
    this.title.string = SPRITES[nextIndex].name;
    this.viewport.add(newPlayer);

    this.timeline = new Timeline()
      .to(
        oldPlayer,
        { x: -direction * width + SPRITE_X_OFFSET },
        SLIDE_DURATION,
        Math.quadEaseOut,
        0,
      )
      .to(
        newPlayer,
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
