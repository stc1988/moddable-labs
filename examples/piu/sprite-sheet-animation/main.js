import {} from "piu/MC";
import Timeline from "piu/Timeline";

const FRAME_WIDTH = 256;
const FRAME_HEIGHT = 208;
const FRAME_COUNT = 6;
const CYCLE_DURATION = 900;

const backgroundSkin = new Skin({ fill: "#eef3ee" });
const runnerTexture = new Texture("08_running.png");
const runnerSkin = new Skin({
  texture: runnerTexture,
  x: 0,
  y: 0,
  width: FRAME_WIDTH,
  height: FRAME_HEIGHT,
  variants: FRAME_WIDTH,
});

const Runner = Content.template(($) => ({
  width: FRAME_WIDTH,
  height: FRAME_HEIGHT,
  skin: runnerSkin,
}));

class SpriteSheetAppBehavior extends Behavior {
  onCreate(application) {
    this.frame = 0;
    this.runner = new Runner(null, {});
    this.layout(application);
    application.add(this.runner);
  }

  onDisplaying(application) {
    this.timeline = new Timeline().to(
      this,
      { frame: FRAME_COUNT },
      CYCLE_DURATION,
      Math.linearEase,
      0,
    );

    application.duration = this.timeline.duration;
    application.interval = 16;
    application.loop = true;
    application.time = 0;
    application.start();
  }

  onTimeChanged(application) {
    this.timeline.seekTo(application.time);
    this.runner.variant = Math.floor(this.frame) % FRAME_COUNT;
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
    if (!this.runner) return;

    this.runner.x = Math.floor((width - FRAME_WIDTH) / 2);
    this.runner.y = Math.floor((height - FRAME_HEIGHT) / 2);
  }
}

const SpriteSheetApp = Application.template(($) => ({
  skin: backgroundSkin,
  Behavior: SpriteSheetAppBehavior,
}));

export default function () {
  return new SpriteSheetApp(null, {
    commandListLength: 4096,
    displayListLength: 4096,
  });
}
