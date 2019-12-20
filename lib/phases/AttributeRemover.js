class AttributeRemover {
  constructor({ log, pristine }) {
    this.log = log;
    this.pristine = pristine;
  }

  async isPristine() {
    return await this.pristine();
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
  async process(node) {
    const attributes = await node.evaluate(n => {
      let names = [];
      for (const { name, value } of n.attributes) {
        names.push([name, value]);
      }
      return names;
    });

    const tagName = await node.evaluate(n => n.tagName);

    for (const [name, value] of attributes) {
      if (await this.isAttributeBlacklisted(tagName, name, value)) {
        this.log("blacklisted attribute: ", tagName, name, value);
        continue;
      }

      await node.evaluate((n, a) => n.removeAttribute(a), name);

      this.log("checking attribute: ", name, "=", value);
      if (await this.isPristine()) {
        this.log("  removed");
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

    for (const child of await node.$$(":scope > *")) {
      await this.process(child);
    }
  }
}

module.exports = AttributeRemover;
