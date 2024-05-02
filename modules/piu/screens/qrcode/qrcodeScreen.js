import { BaseScreenBehavior } from "behaviors";

const labelStyle = new Style({
  font: "OpenSans-Regular-24",
  color: "black",
});

class QrCodeScreenBehavior extends BaseScreenBehavior {
  onCreate(container, data) {
    super.onCreate(container, data);
    this.data = data;

    const column = new Column(null, {});
    let qrSize = Math.min(this.data.width, this.data.height) * 0.8;

    // show labels if exists
    if (data.labels) {
      for (const label of data.labels) {
        column.add(
          new Label(null, {
            string: label,
            style: labelStyle,
          })
        );
      }
      qrSize -= 20 * data.labels.length;
    }

    // show QRCode
    column.add(
      new QRCode(null, {
        width: qrSize,
        height: qrSize,
        skin: {
          fill: "white",
          stroke: "black",
        },
        string: this.data.string,
        maxVersion: 10,
      })
    );

    container.add(column);
  }
}

const QrCodeScreen = Container.template(($) => ({
  top: 0,
  bottom: 0,
  left: 0,
  right: 0,
  skin: new Skin({
    fill: "white",
  }),
  Behavior: QrCodeScreenBehavior,
}));

export default QrCodeScreen;
