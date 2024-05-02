export class BaseScreenBehavior extends Behavior {
  onCreate(container, data) {
    this.data = data;
    const screen = global.screen;
    this.data.width = screen.width;
    this.data.height = screen.height;
    this.data.rotation = screen.rotation;
  }
}
