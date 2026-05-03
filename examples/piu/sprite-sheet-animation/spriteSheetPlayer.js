class SpriteSheetPlayerBehavior extends Behavior {
  onCreate(container, data) {
    this.data = data;
    this.sprites = data.sprites;
    this.sprite =
      data.sprite ?? this.findSprite(data.state) ?? this.sprites?.[0];
    this.frameDuration = data.frameDuration;
    this.runner = new Content(null, {
      width: data.frameWidth,
      height: data.frameHeight,
      skin: this.createSkin(this.sprite),
    });
    container.add(this.runner);
  }

  onDisplaying(container) {
    container.duration = this.sprite.frames * this.frameDuration;
    container.interval = 16;
    container.loop = true;
    container.time = 0;
    container.start();
  }

  onTimeChanged(container) {
    this.runner.variant =
      Math.floor(container.time / this.frameDuration) % this.sprite.frames;
  }

  createSkin(sprite) {
    return new Skin({
      texture: new Texture(sprite.path),
      x: 0,
      y: 0,
      width: this.data.frameWidth,
      height: this.data.frameHeight,
      variants: this.data.frameWidth,
    });
  }

  findSprite(state) {
    return this.sprites?.find((sprite) => sprite.name === state);
  }

  setSprite(container, sprite) {
    if (!sprite || sprite === this.sprite) return;

    this.sprite = sprite;
    this.runner.skin = this.createSkin(sprite);
    this.runner.variant = 0;
    this.onDisplaying(container);
  }

  setState(container, state) {
    this.setSprite(container, this.findSprite(state));
  }
}

const SpriteSheetPlayer = Container.template(($) => ({
  width: $.frameWidth,
  height: $.frameHeight,
  Behavior: SpriteSheetPlayerBehavior,
}));

export default SpriteSheetPlayer;
