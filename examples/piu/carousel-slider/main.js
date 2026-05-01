import {} from "piu/MC";
import Timeline from "piu/Timeline";

const SLIDES = [
  { path: "slide-1.cs", title: "Sun" },
  { path: "slide-2.cs", title: "Leaf" },
  { path: "slide-3.cs", title: "Wave" },
  { path: "slide-4.cs", title: "Hill" },
];

const backgroundSkin = new Skin({ fill: "#f6f2e9" });
const cardSkin = new Skin({
  fill: "#ffffff",
  stroke: "#2e3438",
  borders: { left: 2, right: 2, top: 2, bottom: 2 },
});
const dotSkin = new Skin({ fill: ["#c8c2b5", "#2e3438"] });

const titleStyle = new Style({
  font: "OpenSans-Regular-24",
  color: "#2e3438",
  horizontal: "center",
  vertical: "middle",
});

const countStyle = new Style({
  font: "OpenSans-Regular-24",
  color: "#5b625f",
  horizontal: "center",
  vertical: "middle",
});

class DotBehavior extends Behavior {
  onCreate(content, data) {
    this.data = data;
    content.state = data.active ? 1 : 0;
  }

  onUpdate(content, index) {
    content.state = this.data.index === index ? 1 : 0;
  }
}

const Dot = Content.template(($) => ({
  width: 12,
  height: 12,
  skin: dotSkin,
  Behavior: DotBehavior,
}));

class SlideCardBehavior extends Behavior {
  onCreate(container, data) {
    this.data = data;
    container.add(
      new Image(null, {
        left: 0,
        right: 0,
        top: 0,
        bottom: 0,
        path: data.path,
      }),
    );
  }
}

const SlideCard = Container.template(($) => ({
  width: 240,
  height: 150,
  skin: cardSkin,
  Behavior: SlideCardBehavior,
}));

class CarouselBehavior extends Behavior {
  onCreate(application) {
    this.index = 0;
    this.animating = false;
    this.startX = 0;
    this.startY = 0;
    this.build(application);
  }

  build(application) {
    application.empty();

    const slide = SLIDES[this.index];
    this.dots = new Row(null, {
      top: 8,
      height: 16,
    });
    for (let i = 0; i < SLIDES.length; i++) {
      this.dots.add(
        new Dot({ index: i, active: i === this.index }, { left: i ? 8 : 0 }),
      );
    }
    this.title = new Label(null, {
      left: 0,
      right: 0,
      height: 30,
      string: slide.title,
      style: titleStyle,
    });
    this.viewport = new Container(null, {
      top: 8,
      width: 240,
      height: 150,
      clip: true,
      contents: [new SlideCard(slide, { left: 0 })],
    });
    this.count = new Label(null, {
      top: 6,
      left: 0,
      right: 0,
      height: 24,
      string: this.countText(),
      style: countStyle,
    });

    application.add(
      new Column(null, {
        left: 0,
        right: 0,
        top: 10,
        bottom: 8,
        contents: [this.title, this.viewport, this.dots, this.count],
      }),
    );
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
    let index = this.index + direction;
    if (index < 0) index = SLIDES.length - 1;
    else if (index >= SLIDES.length) index = 0;

    this.slideTo(application, index, direction);
  }

  onFinished(application) {
    if (!this.animating) return;

    this.viewport.remove(this.oldCard);
    this.animating = false;
  }

  onTimeChanged(application) {
    if (this.timeline) this.timeline.seekTo(application.time);
  }

  slideTo(application, index, direction) {
    const width = this.viewport.width;
    const oldCard = this.viewport.first;
    const newCard = new SlideCard(SLIDES[index], { left: direction * width });

    this.animating = true;
    this.oldCard = oldCard;
    this.index = index;
    this.title.string = SLIDES[index].title;
    this.count.string = this.countText();
    this.dots.distribute("onUpdate", index);
    this.viewport.add(newCard);

    this.timeline = new Timeline()
      .to(oldCard, { x: -direction * width }, 350, Math.quadEaseOut, 0)
      .to(newCard, { x: 0 }, 350, Math.quadEaseOut, -350);

    application.duration = this.timeline.duration;
    application.time = 0;
    application.start();
  }

  countText() {
    return `${this.index + 1} / ${SLIDES.length}`;
  }
}

const CarouselApp = Application.template(($) => ({
  active: true,
  skin: backgroundSkin,
  Behavior: CarouselBehavior,
}));

export default function () {
  return new CarouselApp(null, {
    commandListLength: 4096,
    displayListLength: 4096,
    touchCount: 1,
  });
}
