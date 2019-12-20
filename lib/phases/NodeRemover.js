class NodeRemover {
  constructor({ log, pristine }) {
    this.log = log;
    this.pristine = pristine;
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

  async process(node) {
    const isRoot = await node.evaluate(n => n.parentNode === n.ownerDocument);
    let removed = false;

    /* can't remove root element */
    if (!isRoot) {
      await this.removeNode(node);

      if (await this.pristine(`rm node <${node._remoteObject.description}>`)) {
        removed = true;
      } else {
        await this.reinsertNode(node);
      }
    }

    if (!removed) {
      for (const child of await node.$$(":scope > *")) {
        await this.process(child);
      }
    }
  }
}

module.exports = NodeRemover;
