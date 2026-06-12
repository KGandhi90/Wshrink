const vscode = require('vscode');
const { shorten } = require('./transformer');

const WOLFRAM_EXTENSIONS = new Set(['.wl', '.m', '.nb']);
const STATUS_BAR_RESET_DELAY_MS = 3000;

let statusBarItem;
let statusResetTimer;
const pendingSavedChars = new Map();

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
 * @param {vscode.TextDocument} document
 * @returns {boolean}
 */
function isWolframDocument(document) {
	return document.languageId === 'wolfram' || isWolframFile(document.fileName);
}

/**
 * @param {string} text
 * @returns {{ shortenedText: string, charsSaved: number }}
 */
function getShorteningResult(text) {
	const shortenedText = shorten(text);

	return {
		shortenedText,
		charsSaved: Math.max(0, text.length - shortenedText.length)
	};
}

/**
 * @param {number} charsSaved
 */
function showSavedStatus(charsSaved) {
	if (!statusBarItem) {
		return;
	}

	if (statusResetTimer) {
		clearTimeout(statusResetTimer);
	}

	statusBarItem.text = `WolframShrink: saved ${charsSaved} chars`;
	statusBarItem.color = charsSaved > 0 ? new vscode.ThemeColor('charts.green') : undefined;
	statusBarItem.show();

	statusResetTimer = setTimeout(() => {
		statusBarItem.text = 'WolframShrink ✓';
		statusBarItem.color = undefined;
		statusBarItem.show();
		statusResetTimer = undefined;
	}, STATUS_BAR_RESET_DELAY_MS);
}

/**
 * @param {vscode.TextDocument} document
 */
async function shortenDocument(document) {
	const originalText = document.getText();
	const { shortenedText, charsSaved } = getShorteningResult(originalText);

	if (shortenedText === originalText) {
		return charsSaved;
	}

	const fullRange = new vscode.Range(
		document.positionAt(0),
		document.positionAt(originalText.length)
	);
	const edit = new vscode.WorkspaceEdit();
	edit.replace(document.uri, fullRange, shortenedText);
	await vscode.workspace.applyEdit(edit);
	return charsSaved;
}

/**
 * @param {vscode.ExtensionContext} context
 */
function activate(context) {
	statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
	statusBarItem.text = 'WolframShrink ✓';
	statusBarItem.tooltip = 'Shorten Wolfram Language files';
	statusBarItem.show();

	context.subscriptions.push(
		statusBarItem,
		new vscode.Disposable(() => {
			if (statusResetTimer) {
				clearTimeout(statusResetTimer);
				statusResetTimer = undefined;
			}
		})
	);

	context.subscriptions.push(
		vscode.workspace.onWillSaveTextDocument((event) => {
			const { document } = event;

			if (!isWolframDocument(document)) {
				return;
			}

			const originalText = document.getText();
			const { shortenedText, charsSaved } = getShorteningResult(originalText);
			pendingSavedChars.set(document.uri.toString(), charsSaved);

			if (shortenedText === originalText) {
				return;
			}

			const fullRange = new vscode.Range(
				document.positionAt(0),
				document.positionAt(originalText.length)
			);

			event.waitUntil(Promise.resolve([vscode.TextEdit.replace(fullRange, shortenedText)]));
		}),
		vscode.workspace.onDidSaveTextDocument((document) => {
			if (!isWolframDocument(document)) {
				return;
			}

			const uri = document.uri.toString();
			const charsSaved = pendingSavedChars.get(uri) ?? 0;
			pendingSavedChars.delete(uri);
			showSavedStatus(charsSaved);
		}),
		vscode.commands.registerCommand('wolfram-shortener.shortenFile', async () => {
			const editor = vscode.window.activeTextEditor;

			if (!editor || !isWolframDocument(editor.document)) {
				vscode.window.showInformationMessage('Open a Wolfram Language file first.');
				return;
			}

			await shortenDocument(editor.document);
		})
	);
}

function deactivate() {
	if (statusResetTimer) {
		clearTimeout(statusResetTimer);
		statusResetTimer = undefined;
	}
}

module.exports = {
	activate,
	deactivate
};
