import "piu/MC";
import ESPNow from "espnow/queued";
import config from "mc/config";
import Timer from "timer";

const options = config.espnowSample;
const sender = options.role === "sender";
const background = new Skin({ fill: "#111827" });
const normal = new Style({
  font: "18px Open Sans",
  color: "#E5E7EB",
  horizontal: "left",
});
const title = new Style({
  font: "18px Open Sans",
  color: "#38BDF8",
  horizontal: "left",
});

function hexKey(value) {
  if (value === undefined) return undefined;
  if (!/^[0-9a-f]{32}$/i.test(value))
    throw new Error("Sample keys must be 32 hex digits");
  return Uint8Array.from({ length: 16 }, (_, index) =>
    Number.parseInt(value.slice(index * 2, index * 2 + 2), 16),
  );
}

class SampleBehavior extends Behavior {
  onCreate(_application, data) {
    this.data = data;
    this.sent = this.received = this.failed = this.sequence = 0;
    this.status = "Starting";
    this.peer = "-";
    this.signal = "-";
    this.payload = "-";
    this.lastSend = 0;
    this.waiting = undefined;
  }

  onDisplaying(_application) {
    try {
      this.lmk = hexKey(options.lmk);
      this.radio = new ESPNow({
        channel: options.channel,
        pmk: hexKey(options.pmk),
        onReceive: (event) => this.receive(event),
      });
      if (this.lmk && !options.peerId)
        throw new Error("Encrypted sample needs peerId");
      if (options.peerId) this.radio.addPeer(options.peerId, { lmk: this.lmk });
      this.data.MAC.string = `MAC ${this.radio.id}`;
      this.data.CHANNEL.string =
        "CH " +
        this.radio.info.channel +
        (this.lmk
          ? "  Encrypted unicast"
          : options.peerId
            ? "  Unicast"
            : "  Broadcast");
      this.status = sender ? "Sending every second" : "Waiting for packets";
      this.timer = Timer.repeat(() => this.tick(), 100);
    } catch (error) {
      this.status = error.message;
      this.radio?.close();
    }
    this.refresh();
  }

  tick() {
    const now = Date.now();
    if (sender && this.waiting && now - this.waiting.time > 800) {
      this.status = "No application reply";
      this.waiting = undefined;
    }
    if (sender && now - this.lastSend >= 1000 && this.radio.pending === 0) {
      this.lastSend = now;
      const sequence = ++this.sequence;
      this.waiting = { sequence, time: now };
      this.payload = `PING #${sequence}`;
      this.transmit(options.peerId, {
        sample: "espnow-screen-v1",
        kind: "ping",
        sequence,
      });
    }
    this.refresh();
  }

  receive(event) {
    this.received++;
    this.peer = event.peerId;
    this.signal = `${event.rssi} dBm / CH ${event.channel}`;
    let message;
    try {
      message = JSON.parse(String.fromArrayBuffer(event.data));
    } catch {
      this.payload = `Binary: ${event.data.byteLength} bytes`;
      this.refresh();
      return;
    }
    if (
      message?.sample !== "espnow-screen-v1" ||
      !["ping", "pong"].includes(message.kind) ||
      !Number.isInteger(message.sequence) ||
      message.sequence < 1
    )
      return;
    this.payload = `${message.kind.toUpperCase()} #${message.sequence}`;
    if (!sender && message.kind === "ping") {
      try {
        if (!this.radio.hasPeer(event.peerId)) {
          if (this.lmk) return; // Only the configured encrypted peer may receive replies.
          if (this.radio.info.peerCount >= 20)
            throw new Error("Peer table full");
          this.radio.addPeer(event.peerId);
        }
        this.transmit(event.peerId, {
          sample: "espnow-screen-v1",
          kind: "pong",
          sequence: message.sequence,
        });
      } catch (error) {
        this.failed++;
        this.status = error.message;
      }
    } else if (
      sender &&
      message.kind === "pong" &&
      this.waiting?.sequence === message.sequence &&
      (!options.peerId ||
        event.peerId === options.peerId.replaceAll(":", "").toUpperCase())
    ) {
      this.status = `Reply in ${Date.now() - this.waiting.time} ms`;
      this.waiting = undefined;
    }
    this.refresh();
  }

  transmit(peerId, message) {
    this.radio
      .send(peerId, ArrayBuffer.fromString(JSON.stringify(message)))
      .then(
        () => {
          if (!this.radio) return;
          this.sent++;
          // A send callback confirms the MAC result, not application reception.
          if (!sender) this.status = "Reply sent (MAC)";
          else if (this.waiting) this.status = "Sent (MAC), waiting reply";
          this.refresh();
        },
        (error) => {
          if (!this.radio) return;
          this.failed++;
          this.status = error.message;
          this.refresh();
        },
      );
  }

  refresh() {
    this.data.COUNTS.string = `TX ${this.sent} / RX ${this.received} / ERR ${this.failed}`;
    this.data.PEER.string = `Peer ${this.peer}`;
    this.data.SIGNAL.string = `RSSI ${this.signal}`;
    this.data.PAYLOAD.string = this.payload;
    this.data.STATUS.string = this.status;
  }

  onUndisplaying() {
    if (this.timer) Timer.clear(this.timer);
    this.timer = undefined;
    const radio = this.radio;
    this.radio = undefined;
    radio?.close();
  }
}

const SampleApplication = Application.template(($) => ({
  skin: background,
  style: normal,
  Behavior: SampleBehavior,
  contents: [
    Column($, {
      left: 10,
      right: 10,
      top: 8,
      contents: [
        Label($, {
          left: 0,
          right: 0,
          height: 30,
          style: title,
          string: sender ? "ESP-NOW / SENDER" : "ESP-NOW / RECEIVER",
        }),
        ...[
          "MAC",
          "CHANNEL",
          "COUNTS",
          "PEER",
          "SIGNAL",
          "PAYLOAD",
          "STATUS",
        ].map((anchor) =>
          Label($, { left: 0, right: 0, height: 26, anchor, string: "-" }),
        ),
      ],
    }),
  ],
}));

// Eight text rows need room for glyph drawing commands on a full-screen redraw.
// The default Poco display list is too small for the initial screen.
export default new SampleApplication(
  {},
  { displayListLength: 8192, touchCount: 0 },
);
