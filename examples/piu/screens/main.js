import {} from "piu/MC";
import QrCodeScreen from "qrcodeScreen";
import ProfileScreen from "profileScreen";

const SCREENS = [
  {
    screen: ProfileScreen,
    model: {
      path: "profile.cs",
      labels: ["STC", "@stc1988"],
    },
  },
  {
    screen: QrCodeScreen,
    model: {
      string: "https://twitter.com/stc1988",
      labels: ["Follow me on X", "@stc1988"],
    },
  },
];

class ScreenAppBehavior extends Behavior {
  onCreate(application, data) {
    this.data = data;
    this.index = 0;
    application.defer("doSwitchScreen");
  }
  onDisplaying(application) {
    // for M5stack
    if (global.button) {
      global.button.a.onChanged = function () {
        if (this.read()) {
          application.delegate("prevScreen");
        }
      };
      global.button.c.onChanged = function () {
        if (this.read()) {
          application.delegate("nextScreen");
        }
      };
    } else if (global.Host?.Button?.a) {
      new global.Host.Button.c({
        onPush(value) {
          if (value) application.delegate("prevScreen");
        },
      });
      new global.Host.Button.a({
        onPush(value) {
          if (value) application.delegate("nextScreen");
        },
      });
    }
  }
  onTouchEnded(content, id, x, y, ticks) {
    const width = global.screen.width;
    const height = global.screen.height;

    if (width >= height) {
      // Landscape or Square
      if (x <= width * 0.2) {
        application.delegate("prevScreen");
      } else if (x >= width * 0.8) {
        application.delegate("nextScreen");
      }
    } else {
      // Vertical
      if (y <= height * 0.2) {
        application.delegate("prevScreen");
      } else if (y >= height * 0.8) {
        application.delegate("nextScreen");
      }
    }
  }
  prevScreen(application) {
    this.index -= 1;
    if (this.index < 0) this.index = SCREENS.length - 1;
    application.defer("doSwitchScreen");
  }
  nextScreen(application) {
    this.index += 1;
    if (this.index >= SCREENS.length) this.index = 0;
    application.defer("doSwitchScreen");
  }

  doSwitchScreen(application) {
    if (application.length) application.remove(application.first);
    application.purge();
    application.add(new SCREENS[this.index].screen(SCREENS[this.index].model));
  }
}

const ScreenApp = Application.template(($) => ({
  active: true,
  Behavior: ScreenAppBehavior,
}));

export default function () {
  return new ScreenApp(null, {
    commandListLength: 4096,
    displayListLength: 4096,
    touchCount: 1,
  });
}
