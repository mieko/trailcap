const puppeteer = require("puppeteer");
const pixelmatch = require("pixelmatch");
const { PNG } = require("pngjs");

const deviceList = {
  ...puppeteer.devices,
  Desktop: {
    name: "Desktop",
    viewport: {
      width: 1200,
      height: 1024,
      deviceScaleFactor: 2,
      isMobile: false,
      hasTouch: false,
      isLandscape: false
    }
  }
};

class Session {
  constructor(deviceName, browser) {
    this.browser = browser;
    this.deviceName = deviceName;
    this.deviceProfile = deviceList[deviceName];
    this.pristine = null;
    this.diffReport = () => null;
  }

  setDiffReport(cb) {
    this.diffReport = cb;
  }

  async initialize(content = null) {
    this.page = await this.browser.newPage();

    if (this.deviceProfile.userAgent) {
      await this.page.emulate(this.deviceProfile);
    } else {
      await this.page.setViewport(this.deviceProfile.viewport);
    }

    if (content !== null) {
      await this.setContent(content);
    }
  }

  async close() {
    if (this.page) {
      await this.page.close();
    }
  }

  async settle(timeout = 32) {
    /* Non-deterministic otherwise.  Defaults to two frames, + an animation frame. */
    await new Promise(resolve => {
      setTimeout(resolve, timeout);
    });

    await this.page.evaluate(() => {
      return new Promise(resolve => {
        window.setTimeout(resolve, 32);
      });
    });

    await this.page.evaluate(() => {
      return new Promise(resolve => {
        window.requestAnimationFrame(resolve);
      });
    });
  }

  async content() {
    return await this.page.content();
  }

  async setContent(content) {
    await this.page.setContent(content, { waitUntil: "load" });
    await this.settle();
  }

  async captureScreenshot(settleTime = 32) {
    await this.settle(this.page, settleTime);

    const screenshotData = await this.page.screenshot({ fullPage: true });
    return PNG.sync.read(screenshotData);
  }

  async isPristine(description) {
    const screenshot = await this.captureScreenshot(1000);
    const sameSize = screenshot.width === this.pristine.width &&
      screenshot.height === this.pristine.height;

    const { width, height } = this.pristine;

    let diffPng = null;
    let pixelDiff = null;

    if (sameSize) {
      let diffPng = new PNG({ width, height });
      pixelDiff = pixelmatch(
        this.pristine.data,
        screenshot.data,
        diffPng.data,
        width,
        height,
        { threshold: 0.0 }
      );
    } else {
      pixelDiff = Math.abs(screenshot.width * screenshot.height - width * height);
      diffPng = null;
    }

    const result = sameSize && pixelDiff === 0;

    this.diffReport({
      session: this,

      deviceName: this.deviceName,
      description: description,

      result: result,
      sameSize: sameSize,
      pixelDiff: pixelDiff,

      pristine: this.pristine,
      screenshot: screenshot,
      diff: diffPng,
    });

    return result;
  }

  async capturePristine() {
    /* "appear" animations, etc */
    this.pristine = await this.captureScreenshot(500);
  }
}

module.exports = Session;
