class ClassRemover {
  constructor({ log, pristine }) {
    this.log = log;
    this.pristine = pristine;
  }

  async process(node) {
    const classAttribute = await node.evaluate(e => e.getAttribute("class"));

    if (classAttribute) {
      let classes = classAttribute.match(/\S+/g) || [];
      for (const candidate of classes) {
        const without = classes.filter(c => c !== candidate);
        await node.evaluate(
          (e, w) => e.setAttribute("class", w),
          without.join(" ")
        );
        if (await this.pristine(`rm attr ${candidate}`)) {
          classes = without;
        } else {
          await node.evaluate(
            (e, c) => e.setAttribute("class", c),
            classes.join(" ")
          );
        }
      }
    }

    for (const child of await node.$$(":scope > *")) {
      await this.process(child);
    }
  }
}

module.exports = ClassRemover;
