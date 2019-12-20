const { minify } = require("html-minifier");

class HTMLMinifier {
  constructor({ log, pristine }) {
    this.log = log;
    this.pristine = pristine;
  }

  async isPristine() {
    return await this.pristine();
  }

  async process(page) {
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
}

module.exports = HTMLMinifier;
