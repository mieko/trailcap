const { Console } = require("console");
const png = require("pngjs");
const fs = require("fs");

const puppeteer = require("puppeteer");

const Session = require("./Session.js");
const NodeRemover = require("./phases/NodeRemover.js");
const AttributeRemover = require("./phases/AttributeRemover.js");
const ClassRemover = require("./phases/ClassRemover.js");
const CSSRemover = require("./phases/CSSRemover.js");
const HTMLMinifier = require("./phases/HTMLMinifier.js");

const phaseMap = {
  node: NodeRemover,
  attr: AttributeRemover,
  class: ClassRemover,
  css: CSSRemover,
  html: HTMLMinifier
};

class Disector {
  constructor(source, { name, headless, phases, deviceNames }) {
    this.source = source;
    this.name = name;
    this.headless = headless;
    this.phases = phases;
    this.deviceNames = deviceNames;

    this.browser_ = null;
    this.sessions = [];

    this.console = new Console({
      stdout: process.stderr,
      stderr: process.stderr
    });

    this.diffCount = 0;
  }

  log(...args) {
    this.console.log(...args);
  }

  async browser() {
    if (!this.browser_) {
      /* Magic to try to make Chrome/macOS be deterministic */
      this.browser_ = await puppeteer.launch({
        headless: this.headless,
        args: [
          "--disable-background-timer-throttling",
          "--disable-backgrounding-occluded-windows",
          "--disable-default-apps",
          "--disable-device-discovery-notifications",
          "--disable-renderer-backgrounding",
          "--disable-translate",
          "--disable-gpu"
        ]
      });
    }

    return this.browser_;
  }

  async close() {
    const browser = await this.browser();
    await browser.close();
  }

  primarySession() {
    return this.sessions[0];
  }

  auxSessions() {
    return this.sessions.slice(1);
  }

  diffReport(report) {
    let msg = report.result ? " ✅  " : " 🛑  ";
    msg += `${this.name} `;

    msg += `${report.deviceName.slice(0, 20).padEnd(20, ' ')}: ${report.description} `;

    if (! report.result) {
      if (report.sameSize) {
        msg +=  `(${report.pixelDiff} pixels diff)`
      } else {
        const pristineSize = `${report.pristine.width}x${report.pristine.height}`;
        const actualSize = `${report.screenshot.width}x${report.screenshot.height}`;
        msg += `(bad size, expected , ${pristineSize}, got ${actualSize})`
      }

      this.diffCount += 1;

      const diffFile = `diff-${this.diffCount}.png`;

      if (report.diff) {
        // fs.writeFileSync(diffFile, PNG.sync.write(report.diff));
      } else if (report.diffSize) {
        // fs.writeFileSync(diffFile, PNG.sync.write(report.screenshot));
      }

      msg += ` → ${diffFile}`;
    }

    this.log(msg);
  }

  async isPristine(description) {
    const initialResult = await this.primarySession().isPristine(description);

    if (!initialResult) {
      return false;
    }

    const source = await this.primarySession().content();
    const auxResults = this.auxSessions().map(async s => {
      await s.setContent(source);
      return s.isPristine(description);
    });

    const auxPassed = await Promise.all(auxResults);

    return auxPassed.indexOf(false) === -1;
  }

  async startPhase(name, ...args) {
    if (this.phases.map(p => p.toLowerCase()).includes(name.toLowerCase())) {
      this.log(` == starting phase: ${name} ==`);

      const phaseClass = phaseMap[name];

      if (! phaseClass) {
        console.warn("Skipping unknown phase: ", name);
        return;
      }

      const context = {
        log: (...args) => this.log(name, ...args),
        pristine: async (...args) => await this.isPristine(...args)
      };

      const phase = new phaseClass(context);
      await phase.process(...args);

      this.log(" == phase exit pristine check ==", await this.isPristine());
    }
  }

  async process() {
    this.sessions = await Promise.all(
      this.deviceNames.map(async dn => {
        const session = new Session(dn, await this.browser());
        session.setDiffReport((...args) => this.diffReport(...args));
        await session.initialize(this.source);
        await session.capturePristine();
        return session;
      })
    );

    const page = this.primarySession().page;

    const root = await page.$(":root");
    await this.startPhase("node", root);
    await this.startPhase("attr", root);
    await this.startPhase("class", root);
    await this.startPhase("css", page);
    await this.startPhase("html", page);

    const source = await page.content();
    this.log(" == Final pristine check ==", await this.isPristine("final check"));

    return source;
  }
}

module.exports = Disector;
