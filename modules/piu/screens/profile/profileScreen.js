import { BaseScreenBehavior } from "behaviors";
import {} from "piu/MC";

const labelStyle = new Style({
  font: "OpenSans-Regular-24",
  color: "black",
});

class ProfileScreenBehavior extends BaseScreenBehavior {
  onCreate(container, data) {
    super.onCreate(container, data);
    this.data = data;

    const layout =
      data.width > data.height ? new Row(null, {}) : new Column(null, {});
    layout.add(
      Image(null, {
        width: 150,
        height: 150,
        path: this.data.path,
      })
    );
    if (data.labels) {
      const options = data.width > data.height ? { left: 20 }:  { top: 20 }
      const column = new Column(null, options);
      for (const label of data.labels) {
        column.add(
          new Label(null, {
            string: label,
            style: labelStyle,
          })
        );
      }
      layout.add(column);
    }

    container.add(layout);
  }
}

const ProfileScreen = Container.template(($) => ({
  top: 0,
  bottom: 0,
  left: 0,
  right: 0,
  skin: new Skin({
    fill: "white",
  }),
  Behavior: ProfileScreenBehavior,
}));

export default ProfileScreen;
