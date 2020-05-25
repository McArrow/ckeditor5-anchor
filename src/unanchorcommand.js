/**
 * @module anchor/unanchorcommand
 */

import Command from '@ckeditor/ckeditor5-core/src/command';
import findAnchorRange from './findanchorrange';

/**
 * The unanchor command. It is used by the {@link module:anchor/anchor~Anchor anchor plugin}.
 *
 * @extends module:core/command~Command
 */
export default class UnanchorCommand extends Command {
	/**
	 * @inheritDoc
	 */
  refresh() {
    this.isEnabled = this.editor.model.document.selection.hasAttribute('anchorId');
  }

	/**
	 * Executes the command.
	 *
	 * When the selection is collapsed, it removes the `anchorId` attribute from each node with the same `anchorId` attribute value.
	 * When the selection is non-collapsed, it removes the `anchorId` attribute from each node in selected ranges.
	 *
	 * # Decorators
	 *
	 * If {@link module:anchor/anchor~AnchorConfig#decorators `config.anchor.decorators`} is specified,
	 * all configured decorators are removed together with the `anchorId` attribute.
	 *
	 * @fires execute
	 */
  execute() {
    const editor = this.editor;
    const model = this.editor.model;
    const selection = model.document.selection;
    const anchorCommand = editor.commands.get('anchor');

    model.change(writer => {
      // Get ranges to unanchor.
      const rangesToUnanchor = selection.isCollapsed ?
        [findAnchorRange(selection.getFirstPosition(), selection.getAttribute('anchorId'), model)] : selection.getRanges();

      // Remove `anchorId` attribute from specified ranges.
      for (const range of rangesToUnanchor) {
        writer.removeAttribute('anchorId', range);
        // If there are registered custom attributes, then remove them during unanchor.
        if (anchorCommand) {
          for (const manualDecorator of anchorCommand.manualDecorators) {
            writer.removeAttribute(manualDecorator.id, range);
          }
        }
      }
    });
  }
}
