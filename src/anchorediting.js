/**
 * @module anchor/anchorediting
 */

import Plugin from '@ckeditor/ckeditor5-core/src/plugin';
import AnchorCommand from './anchorcommand';
import UnanchorCommand from './unanchorcommand';
import { createAnchorElement } from './utils';
import bindTwoStepCaretToAttribute from '@ckeditor/ckeditor5-engine/src/utils/bindtwostepcarettoattribute';
import findAnchorRange from './findanchorrange';

const HIGHLIGHT_CLASS = 'ck-anchor_selected';

/**
 * The anchor engine feature.
 *
 * It introduces the `anchorId="ck"` attribute in the model which renders to the view as a `<a id="ck">` element
 * as well as `'anchor'` and `'unanchor'` commands.
 *
 * @extends module:core/plugin~Plugin
 */
export default class AnchorEditing extends Plugin {
	/**
	 * @inheritDoc
	 */
  static get pluginName() {
    return 'AnchorEditing';
  }

	/**
	 * @inheritDoc
	 */
  constructor(editor) {
    super(editor);

    editor.config.define('anchor', {
      addTargetToExternalAnchors: false
    });
  }

	/**
	 * @inheritDoc
	 */
  init() {
    const editor = this.editor;
    const locale = editor.locale;

    // Allow anchor attribute on all inline nodes.
    editor.model.schema.extend('$text', { allowAttributes: 'anchorId' });

    editor.conversion.for('dataDowncast')
      .attributeToElement({ model: 'anchorId', view: createAnchorElement });

    editor.conversion.for('editingDowncast')
      .attributeToElement({
        model: 'anchorId', view: (id, writer) => {
          return createAnchorElement(id, writer);
        }
      });

    editor.conversion.for('upcast')
      .elementToAttribute({
        view: {
          name: 'a',
          attributes: {
            id: true
          }
        },
        model: {
          key: 'anchorId',
          value: viewElement => viewElement.getAttribute('id')
        }
      });

    // Create anchoring commands.
    editor.commands.add('anchor', new AnchorCommand(editor));
    editor.commands.add('unanchor', new UnanchorCommand(editor));

    // Enable two-step caret movement for `anchorId` attribute.
    bindTwoStepCaretToAttribute({
      view: editor.editing.view,
      model: editor.model,
      emitter: this,
      attribute: 'anchorId',
      locale
    });

    // Setup highlight over selected anchor.
    this._setupAnchorHighlight();

    // Change the attributes of the selection in certain situations after the anchor was inserted into the document.
    this._enableInsertContentSelectionAttributesFixer();
  }

	/**
	 * Adds a visual highlight style to a anchor in which the selection is anchored.
	 * Together with two-step caret movement, they indicate that the user is typing inside the anchor.
	 *
	 * Highlight is turned on by adding the `.ck-anchor_selected` class to the anchor in the view:
	 *
	 * * The class is removed before the conversion has started, as callbacks added with the `'highest'` priority
	 * to {@link module:engine/conversion/downcastdispatcher~DowncastDispatcher} events.
	 * * The class is added in the view post fixer, after other changes in the model tree were converted to the view.
	 *
	 * This way, adding and removing the highlight does not interfere with conversion.
	 *
	 * @private
	 */
  _setupAnchorHighlight() {
    const editor = this.editor;
    const view = editor.editing.view;
    const highlightedAnchors = new Set();

    // Adding the class.
    view.document.registerPostFixer(writer => {
      const selection = editor.model.document.selection;
      let changed = false;

      if (selection.hasAttribute('anchorId')) {
        const modelRange = findAnchorRange(selection.getFirstPosition(), selection.getAttribute('anchorId'), editor.model);
        const viewRange = editor.editing.mapper.toViewRange(modelRange);

        // There might be multiple `a` elements in the `viewRange`, for example, when the `a` element is
        // broken by a UIElement.
        for (const item of viewRange.getItems()) {
          if (item.is('a') && !item.hasClass(HIGHLIGHT_CLASS)) {
            writer.addClass(HIGHLIGHT_CLASS, item);
            highlightedAnchors.add(item);
            changed = true;
          }
        }
      }

      return changed;
    });

    // Removing the class.
    editor.conversion.for('editingDowncast').add(dispatcher => {
      // Make sure the highlight is removed on every possible event, before conversion is started.
      dispatcher.on('insert', removeHighlight, { priority: 'highest' });
      dispatcher.on('remove', removeHighlight, { priority: 'highest' });
      dispatcher.on('attribute', removeHighlight, { priority: 'highest' });
      dispatcher.on('selection', removeHighlight, { priority: 'highest' });

      function removeHighlight() {
        view.change(writer => {
          for (const item of highlightedAnchors.values()) {
            writer.removeClass(HIGHLIGHT_CLASS, item);
            highlightedAnchors.delete(item);
          }
        });
      }
    });
  }

	/**
	 * Starts listening to {@link module:engine/model/model~Model#event:insertContent} and corrects the model
	 * selection attributes if the selection is at the end of a anchor after inserting the content.
	 *
	 * The purpose of this action is to improve the overall UX because the user is no longer "trapped" by the
	 * `anchorId` attribute of the selection and they can type a "clean" (`anchorId`–less) text right away.
	 *
	 * @private
	 */
  _enableInsertContentSelectionAttributesFixer() {
    const editor = this.editor;
    const model = editor.model;
    const selection = model.document.selection;

    model.on('insertContent', () => {
      const nodeBefore = selection.anchor.nodeBefore;
      const nodeAfter = selection.anchor.nodeAfter;

      // NOTE: ↰ and ↱ represent the gravity of the selection.

      // The only truly valid case is:
      //
      //		                                 ↰
      //		...<$text anchorId="foo">INSERTED[]</$text>
      //
      // If the selection is not "trapped" by the `anchorId` attribute after inserting, there's nothing
      // to fix there.
      if (!selection.hasAttribute('anchorId')) {
        return;
      }

      // Filter out the following case where a anchor with the same id (e.g. <a id="foo">INSERTED</a>) is inserted
      // in the middle of an existing anchor:
      //
      // Before insertion:
      //		                       ↰
      //		<$text anchorId="foo">l[]ink</$text>
      //
      // Expected after insertion:
      //		                               ↰
      //		<$text anchorId="foo">lINSERTED[]ink</$text>
      //
      if (!nodeBefore) {
        return;
      }

      // Filter out the following case where the selection has the "anchorId" attribute because the
      // gravity is overridden and some text with another attribute (e.g. <b>INSERTED</b>) is inserted:
      //
      // Before insertion:
      //
      //		                       ↱
      //		<$text anchorId="foo">[]anchor</$text>
      //
      // Expected after insertion:
      //
      //		                                                          ↱
      //		<$text bold="true">INSERTED</$text><$text anchorId="foo">[]anchor</$text>
      //
      if (!nodeBefore.hasAttribute('anchorId')) {
        return;
      }

      // Filter out the following case where a anchor is a inserted in the middle (or before) another anchor
      // (different URLs, so they will not merge). In this (let's say weird) case, we can leave the selection
      // attributes as they are because the user will end up writing in one anchor or another anyway.
      //
      // Before insertion:
      //
      //		                       ↰
      //		<$text anchorId="foo">l[]ink</$text>
      //
      // Expected after insertion:
      //
      //		                                                             ↰
      //		<$text anchorId="foo">l</$text><$text anchorId="bar">INSERTED[]</$text><$text anchorId="foo">ink</$text>
      //
      if (nodeAfter && nodeAfter.hasAttribute('anchorId')) {
        return;
      }

      // Make the selection free of anchor-related model attributes.
      // All anchor-related model attributes start with "anchor". That includes not only "anchorId"
      // but also all decorator attributes (they have dynamic names).
      model.change(writer => {
        [...model.document.selection.getAttributeKeys()]
          .filter(name => name.startsWith('anchor'))
          .forEach(name => writer.removeSelectionAttribute(name));
      });
    }, { priority: 'low' });
  }
}
