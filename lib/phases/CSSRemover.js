const PurgeCSS = require("purgecss");

class CSSRemover {
  constructor({ log, pristine }) {
    this.log = log;
    this.pristine = pristine;
  }

  async isPristine() {
    return await this.pristine();
  }

  async process(page) {
    const source = await page.content();
    let buffer = "";

    const stylesheets = await page.$$("style");
    for (const stylesheet of stylesheets) {
      buffer += (await stylesheet.evaluate(s => s.innerText)) + "\n";
      await stylesheet.evaluate(n => n.parentNode.removeChild(n));
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
}

module.exports = CSSRemover;
