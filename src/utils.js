/**
 * @module anchor/utils
 */

/**
 * Returns `true` if a given view node is the anchor element.
 *
 * @param {module:engine/view/node~Node} node
 * @returns {Boolean}
 */
export function isAnchorElement(node) {
  return node.is('attributeElement') && !!node.getCustomProperty('anchor');
}

/**
 * Creates anchor {@link module:engine/view/attributeelement~AttributeElement} with the provided `id` attribute.
 *
 * @param {String} id
 * @returns {module:engine/view/attributeelement~AttributeElement}
 */
export function createAnchorElement(name, writer) {
  const anchorElement = writer.createAttributeElement('a', { id: name }, { priority: 5 });
  writer.addClass("ck-anchor", anchorElement);
  writer.setCustomProperty('anchor', true, anchorElement);

  return anchorElement;
}
