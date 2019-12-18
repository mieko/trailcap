const fs = require("fs");
const puppeteer = require("puppeteer");
const pixelmatch = require("pixelmatch");
const PurgeCSS = require("purgecss");
const { Console } = require("console");
const { PNG } = require("pngjs");
const { minify } = require("html-minifier");
const yargs = require("yargs");

class Disector {
  constructor(filename, { dump, verbose, diff, headless, phases }) {
    this.dump = dump;
    this.verbose = verbose;
    this.diff = diff;
    this.headless = headless;
    this.phases = phases;

    this.source = fs.readFileSync(filename, "utf8");
    this.browser_ = null;

    this.pristine = null;

    this.stats = {
      renders: 0,
      nodesProcessed: 0,
      nodesRemoved: 0,
      attributesProcessed: 0,
      attributesRemoved: 0,
      classesProcessed: 0,
      classesRemoved: 0,

      inputSize: this.source.length,
      pristine: false
    };

    this.console = new Console({
      stdout: process.stderr,
      stderr: process.stderr
    });
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
    if (this.browser_) {
      await this.browser_.close();
    }
  }

  async settle(page, timeout = 32) {
    /* Non-deterministic otherwise.  Defaults to two frames, + an animation frame. */
    await new Promise(resolve => {
      setTimeout(resolve, timeout);
    });

    await page.evaluate(() => {
      return new Promise(resolve => {
        window.requestAnimationFrame(resolve);
      });
    });
  }

  async loadPage(content, deviceName) {
    const browser = await this.browser();
    const page = await browser.newPage();

    if (deviceName) {
      const deviceProfile = puppeteer.devices[deviceName];
      await page.emulate(deviceProfile);
    }

    if (content) {
      await page.setContent(content, { waitUntil: "load" });
    }

    await this.settle(page);
    return page;
  }

  dumpScreenshot(screenshot, filename, { announce } = { announce: false }) {
    if (announce) {
      this.log("screenshot: ", filename);
    }

    fs.writeFileSync(filename, PNG.sync.write(screenshot));
  }

  async captureScreenshot(page) {
    await this.settle(page);

    this.stats.renders++;
    const screenshotData = await page.screenshot({ fullPage: true });
    const result = PNG.sync.read(screenshotData);

    if (this.dump) {
      this.dumpScreenshot(result, `snap-${this.stats.renders}.png`, {
        announce: false
      });

      const htmlData = await page.content();
      fs.writeFileSync(`snap-${this.stats.renders}.html`, htmlData);
    }

    return result;
  }

  async capturePristine() {
    const page = await this.loadPage(this.source, "iPhone X");

    /* "appear" animations, etc */
    await this.settle(page, 1000);

    this.pristine = await this.captureScreenshot(page);

    if (this.diff || this.dump) {
      this.dumpScreenshot(this.pristine, "pristine.png");
    }

    await page.close();
  }

  async isPristine(page) {
    const screenshot = await this.captureScreenshot(page);

    if (
      screenshot.width !== this.pristine.width ||
      screenshot.height !== this.pristine.height
    ) {
      if (this.verbose) {
        this.log(
          `  dimension diff: ` +
            `${this.pristine.width}x${this.pristine.height}` +
            ` vs ${screenshot.width}x${screenshot.height}`
        );
      }

      if (this.diff) {
        this.dumpScreenshot(
          screenshot,
          `diff-${this.stats.renders}-badsize.png`
        );
      }

      return false;
    }

    let diffPng = null;
    if (this.diff) {
      const { width, height } = this.pristine;
      diffPng = new PNG({ width, height });
    }

    const pixelDiff = pixelmatch(
      this.pristine.data,
      screenshot.data,
      diffPng ? diffPng.data : null,
      this.pristine.width,
      this.pristine.height,
      { threshold: 0.0 }
    );

    if (this.verbose) {
      this.log("  pixelDiff: ", pixelDiff);
    }

    if (diffPng && pixelDiff !== 0) {
      this.dumpScreenshot(diffPng, `diff-${this.stats.renders}.png`);
    }

    return pixelDiff === 0;
  }

  async childrenOf(node) {
    return await node.$$(":scope > *");
  }

  async reinsertNode(node) {
    const parent = node._savedParent;
    const nextSibling = node._savedNextSibling;

    if (nextSibling) {
      await parent.evaluate(
        (p, n, sib) => p.insertBefore(n, sib),
        node,
        nextSibling
      );
    } else {
      await parent.evaluate((p, n) => p.appendChild(n), node);
    }
  }

  async removeNode(node) {
    node._savedParent = await node.getProperty("parentNode");
    node._savedNextSibling = await node.getProperty("nextSibling");

    await node.evaluate(n => n.parentNode.removeChild(n));
  }

  async deNode(node, page) {
    const isRoot = await node.evaluate(n => n.parentNode === n.ownerDocument);
    let removed = false;

    /* can't remove root element */
    if (!isRoot) {
      this.log("checking element: ", node._remoteObject.description);
      await this.removeNode(node);

      if (await this.isPristine(page)) {
        this.log("  removed");
        this.stats.nodesRemoved++;
        removed = true;
      } else {
        await this.reinsertNode(node);
      }
    }

    if (!removed) {
      const children = await this.childrenOf(node);
      for (const child of children) {
        await this.deNode(child, page);
      }
    }
  }

  async purgeCss(_root, page) {
    const source = await page.content();
    let buffer = "";

    const stylesheets = await page.$$("style");
    for (const stylesheet of stylesheets) {
      buffer += await stylesheet.evaluate(s => s.innerText);
      await this.removeNode(stylesheet);
    }

    const pc = new PurgeCSS({
      content: [
        {
          raw: source,
          extension: "html"
        }
      ],
      css: [
        {
          raw: buffer
        }
      ],
      keyframes: true,
      fontFace: true
    });

    const result = pc.purge();

    const head = await page.$("head");
    await head.evaluate((h, buffer) => {
      const ss = h.ownerDocument.createElement("style");
      ss.setAttribute("injected", "true");

      ss.innerText = buffer;
      h.appendChild(ss);
    }, result[0].css);
  }

  async minify(_root, page) {
    const source = await page.content();
    const processed = minify(source, {
      collapseBooleanAttributes: true,
      collapseWhitespace: true,
      continueOnParseError: true,
      decodeEntities: true,
      html5: true,
      minifyCSS: true,
      removeAttributeQuotes: true,
      removeComments: true,
      removeEmptyAttributes: true,
      removeOptionalTags: true,
      removeRedundantAttributes: true,
      sortAttributes: true,
      sortClassName: true
    });
    await page.setContent(processed, { waitUntil: "load" });
  }

  async isAttributeBlacklisted(tagName, attributeName, attributeValue) {
    tagName = tagName.toLowerCase();
    attributeName = attributeName.toLowerCase();

    if (tagName === "svg" && ["width", "height"].includes(attributeName)) {
      return true;
    }

    return false;
  }

  /* Remove attributes that don't contribute to the rendered result */
  async deAttribute(node, page) {
    const attributes = await node.evaluate(n => {
      let names = [];
      for (const { name, value } of n.attributes) {
        names.push([name, value]);
      }
      return names;
    });

    const tagName = await node.evaluate(n => n.tagName);

    for (const [name, value] of attributes) {
      this.stats.attributesProcessed++;

      if (await this.isAttributeBlacklisted(tagName, name, value)) {
        this.log("blacklisted attribute: ", tagName, name, value);
        continue;
      }

      await node.evaluate((n, a) => n.removeAttribute(a), name);

      this.log("checking attribute: ", name, "=", value);
      if (await this.isPristine(page)) {
        this.log("  removed");
        this.stats.attributesRemoved++;
      } else {
        await node.evaluate(
          (n, k, v) => {
            n.setAttribute(k, v);
          },
          name,
          value || ""
        );
      }
    }

    const children = await this.childrenOf(node);
    for (const child of children) {
      await this.deAttribute(child, page);
    }
  }

  async deClass(node, page) {
    const classAttribute = await node.evaluate(e => e.getAttribute("class"));

    if (classAttribute) {
      let classes = classAttribute.match(/\S+/g) || [];
      for (const candidate of classes) {
        this.log("checking class: ", candidate);
        this.stats.classesProcessed++;

        const without = classes.filter(c => c !== candidate);
        await node.evaluate(
          (e, w) => e.setAttribute("class", w),
          without.join(" ")
        );
        if (await this.isPristine(page)) {
          this.log("  removed");
          this.stats.classesRemoved++;
          classes = without;
        } else {
          await node.evaluate(
            (e, c) => e.setAttribute("class", c),
            classes.join(" ")
          );
        }
      }
    }

    const children = await this.childrenOf(node);
    for (const child of children) {
      await this.deClass(child, page);
    }
  }

  async startPhase(name, root, page, fn = null) {
    if (this.phases.map(p => p.toLowerCase()).includes(name.toLowerCase())) {
      this.log(`starting phase: ${name}`);

      await this.settle(page);

      if (fn === null) {
        fn = async () => {
          await this[name](root, page);
        };
      }

      await fn();
      await this.settle(page);

      this.stats[`${name}Size`] = (await page.content()).length;
    }
  }

  async process() {
    await this.capturePristine();

    const page = await this.loadPage(this.source, "iPhone X");
    const root = await page.$(":root");

    await this.startPhase("deNode", root, page);
    await this.startPhase("deAttribute", root, page);
    await this.startPhase("deClass", root, page);
    await this.startPhase("purgeCss", root, page);
    await this.startPhase("minify", root, page);

    const source = await page.content();
    const resultPage = await this.loadPage(source, "iPhone X");
    this.stats.pristine = await this.isPristine(resultPage);

    console.log(source);
    this.log(this.stats);
  }
}

const main = async yargs => {
  const argv = yargs
    .boolean(["verbose", "dump", "diff", "show"])
    .alias("V", "verbose")
    .alias("d", "dump")
    .alias("D", "diff")
    .alias("s", "show")
    .array("phase")
    .default("phase", ["deNode", "deAttribute"])
    .alias("p", "phase")
    .nargs("phase", 1)
    .help("h")
    .alias("h", "help").argv;

  const disector = new Disector(argv._[0], {
    verbose: argv.verbose,
    dump: argv.dump,
    diff: argv.diff,
    headless: !argv.show,
    phases: argv.phase
  });
  await disector.process();
  await disector.close();
};

(async () => {
  main(yargs);
})();
