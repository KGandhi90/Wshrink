const vscode = require('vscode');
const { shorten } = require('./transformer');

const WOLFRAM_EXTENSIONS = new Set(['.wl', '.m', '.nb']);

/**
 * @param {string} fileName
 * @returns {boolean}
 */
function isWolframFile(fileName) {
	const dotIndex = fileName.lastIndexOf('.');
	if (dotIndex === -1) {
		return false;
	}
	const ext = fileName.slice(dotIndex).toLowerCase();
	return WOLFRAM_EXTENSIONS.has(ext);
}

/**
 * @param {vscode.ExtensionContext} context
 */
function activate(context) {
	context.subscriptions.push(
		vscode.workspace.onWillSaveTextDocument((event) => {
			const { document } = event;

			if (!isWolframFile(document.fileName)) {
				return;
			}

			const originalText = document.getText();
			const shortenedText = shorten(originalText);
			const charsSaved = originalText.length - shortenedText.length;

			const fullRange = new vscode.Range(
				document.positionAt(0),
				document.positionAt(originalText.length)
			);
			const edit = new vscode.WorkspaceEdit();
			edit.replace(document.uri, fullRange, shortenedText);

			event.waitUntil(
				vscode.workspace.applyEdit(edit).then((success) => {
					if (success) {
						vscode.window.setStatusBarMessage(
							`WolframShrink: ${charsSaved} chars saved`
						);
					}
				})
			);
		})
	);
}

function deactivate() {}

module.exports = {
	activate,
	deactivate
};
