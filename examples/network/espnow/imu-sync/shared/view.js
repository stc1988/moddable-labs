/*
 * Adapted from Moddable SDK examples/drivers/sensors/bmi270/bounce.
 * Copyright (c) 2016-2026 Moddable Tech, Inc.
 * Licensed under CC BY 4.0: https://creativecommons.org/licenses/by/4.0/
 */

import Resource from "Resource";
import Poco from "commodetto/Poco";
import parseBMF from "commodetto/parseBMF";
import parseBMP from "commodetto/parseBMP";
import config from "mc/config";

export default class BounceView {
  constructor(role) {
    this.render = new Poco(screen, {
      rotation: config.rotation ?? screen.rotation,
      displayListLength: 8192,
    });
    this.font = parseBMF(new Resource("OpenSans-Semibold-18.bf4"));
    this.ball = parseBMP(new Resource("ball-color.bmp"));
    this.alpha = parseBMP(new Resource("ball-alpha.bmp"));
    this.top = this.font.height * 3;
    this.width = this.render.width - this.ball.width;
    this.height = this.render.height - this.top - this.ball.height;
    if (this.width <= 0 || this.height <= 0)
      throw new Error("Display too small for bounce");
    this.role = role;
    this.black = this.render.makeColor(0, 0, 0);
    this.gray = this.render.makeColor(48, 48, 48);
    this.white = this.render.makeColor(255, 255, 255);
    this.bar = this.render.makeColor(96, 128, 160);
    this.render.begin();
    this.render.fillRectangle(
      this.black,
      0,
      0,
      this.render.width,
      this.render.height,
    );
    this.render.end();
  }

  show(snapshot, status) {
    const { render, font } = this;
    const width = render.width;
    render.begin(0, 0, width, this.top);
    render.fillRectangle(this.gray, 0, 0, width, this.top);
    render.drawText(
      `IMU ${this.role} / ${status}`,
      font,
      this.white,
      4,
      0,
      width - 8,
    );
    for (const [index, axis] of ["x", "y", "z"].entries()) {
      const value = snapshot.accelerometer[axis];
      const left = Math.floor((index * width) / 3);
      const right = Math.floor(((index + 1) * width) / 3);
      const cellWidth = right - left;
      const center = left + (cellWidth >> 1);
      const y = font.height;
      const barWidth = Math.round(
        Math.max(-1, Math.min(1, value)) * (cellWidth >> 1),
      );
      render.fillRectangle(
        this.bar,
        center + Math.min(0, barWidth),
        y,
        Math.abs(barWidth),
        font.height,
      );
      render.drawText(
        `${axis.toUpperCase()} ${value.toFixed(2)} g`,
        font,
        this.white,
        left + 4,
        y,
        cellWidth - 8,
      );
    }
    render.drawText(
      `#${snapshot.sequence}  ${this.mac}`,
      font,
      this.white,
      4,
      font.height * 2,
      width - 8,
    );
    render.end();
    const x = Math.round(snapshot.ball.x * this.width);
    const y = this.top + Math.round(snapshot.ball.y * this.height);
    const w = this.ball.width;
    const h = this.ball.height;
    if (this.x !== undefined) {
      render.begin(this.x, this.y, w, h);
      render.fillRectangle(this.black, this.x, this.y, w, h);
      render.end();
    }
    render.begin(x, y, w, h);
    render.fillRectangle(this.black, x, y, w, h);
    render.drawMasked(this.ball, x, y, 0, 0, w, h, this.alpha, 0, 0);
    render.end();
    this.x = x;
    this.y = y;
  }
}
