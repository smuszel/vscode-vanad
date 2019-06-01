import * as vsc from 'vscode';
import { promisify } from 'util';
import { execFile } from 'child_process';
const exec = promisify(execFile);

export function activate(context: vsc.ExtensionContext) {
	const statusBar = vsc.window.createStatusBarItem(vsc.StatusBarAlignment.Right, 1010);
	const failureDecoration = vsc.window.createTextEditorDecorationType({
		backgroundColor: { id: 'extension.failedTestcaseColor' }
	});

	const runTest = (editor: vsc.TextEditor) => {
		const path = editor.document.uri.fsPath;
		const errs = exec('node', [path]).then(({ stdout }) => {
			const out = stdout
				.toString()
				.split('\n')
				.filter(Boolean);
			return out.map(ln => JSON.parse(ln));
		});

		return update(editor, errs, false);
	};

	const update = async (
		editor: vsc.TextEditor,
		testcaseFailures: Promise<any[]> | any[],
		clear?: boolean
	) => {
		let _tf = testcaseFailures;

		if (testcaseFailures instanceof Promise) {
			statusBar.text = '$(sync~spin) Running tests...';
			statusBar.show();
			_tf = await testcaseFailures;
		} else {
			_tf = testcaseFailures;
		}

		const failureRanges = _tf.map(fail => {
			const callerLine = editor.document.lineAt(fail.callerLine - 1);
			const startIx = callerLine.firstNonWhitespaceCharacterIndex;
			const rangeStart = callerLine.range.start.translate(0, startIx);
			const rangeEnd = callerLine.range.end;
			const range = new vsc.Range(rangeStart, rangeEnd);
			const hoverMessage = { language: 'javascript', value: fail.diff };

			return { range, hoverMessage };
		});

		if (failureRanges.length) {
			editor.setDecorations(failureDecoration, failureRanges);
			statusBar.text = '$(alert) Testcases failed: ' + failureRanges.length;
			statusBar.show();
		} else if (clear) {
			editor && editor.setDecorations(failureDecoration, []);
			statusBar.hide();
		} else {
			statusBar.text = '$(check) All testcases passed';
			statusBar.show();
		}
	};

	const mainCommand = vsc.commands.registerCommand('extension.main', async () => {
		const ate = vsc.window.activeTextEditor;

		if (ate) {
			const pragma = ate.document.lineAt(0).text.includes('@vanad');
			!pragma &&
				(await ate.edit(eb => {
					eb.insert(new vsc.Position(0, 0), '// @vanad\n');
				}));
			runTest(ate);
		}
	});

	const textChange = vsc.workspace.onDidChangeTextDocument(ev => {
		const ate = vsc.window.activeTextEditor;

		if (ate && ate.document === ev.document) {
			update(ate, [], true);
		}
	});

	const textSave = vsc.workspace.onDidSaveTextDocument(doc => {
		const ate = vsc.window.activeTextEditor;
		const pragma = doc.lineAt(0).text.includes('@vanad');

		if (ate && ate.document === doc && pragma) {
			setTimeout(() => runTest(ate), 0);
		}
	});

	context.subscriptions.push(mainCommand, textChange, textSave);
}
