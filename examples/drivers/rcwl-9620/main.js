import Distance from "embedded:sensor/Ultrasonic-Distance/RCWL9620";
import Timer from "timer";

const sensor = new Distance({ sensor: device.I2C.default });
Timer.delay(1000);

Timer.repeat(() => {
  const sample = sensor.sample();
  if (sample) {
    trace(`Distance:${sample}\n`);
  }
}, 1000);
