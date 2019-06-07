import * as vsc from 'vscode';
import { execFile } from 'child_process';

export function activate(context: vsc.ExtensionContext) {
    //@ts-ignore
    let prevState: State = { runningFile: undefined, success: false, editor: vsc.window.activeTextEditor };
	const statusBar = vsc.window.createStatusBarItem(vsc.StatusBarAlignment.Right, 1010);
	const failureDecoration = vsc.window.createTextEditorDecorationType({
		backgroundColor: { id: 'extension.failedTestcaseColor' }
    });
    
    const isActiveVanadDocument = (activeTextEditor: vsc.TextEditor, document: vsc.TextDocument) => {
        const pragma = document.lineAt(0).text.includes('@vanad');
        const atePath = activeTextEditor.document.uri.fsPath;
        const docPath = document.uri.fsPath.split('.git')[0];

        return atePath === docPath && pragma;
    }

	const runTest = (editor: vsc.TextEditor) => {
        const path = editor.document.uri.fsPath;
        const runningFile = execFile('node', [path]);
        let testcaseFailures: any[] = [];
        
        runningFile.stdout.on('data', chunk => {
            const str = chunk.toString();

            if (str) {
                const testInfo = JSON.parse(str);
                testcaseFailures.push(testInfo);
            }
        });

        runningFile.on('close', () => {
            if (!runningFile.killed) {
                const success = !testcaseFailures.length;
                update({ editor, runningFile: undefined, testcaseFailures, success });
            }
        });
        
        update({ editor, runningFile, testcaseFailures, success: false });
	};

	const update = (state: State) => {
		if (state.runningFile) {
			statusBar.text = '$(sync~spin) Running tests...';
			statusBar.show();
        } else if (state.testcaseFailures.length) {
            const failureRanges = state.testcaseFailures.map(fail => {
                const callerLine = state.editor.document.lineAt(fail.callerLine - 1);
                const startIx = callerLine.firstNonWhitespaceCharacterIndex;
                const rangeStart = callerLine.range.start.translate(0, startIx);
                const rangeEnd = callerLine.range.end;
                const range = new vsc.Range(rangeStart, rangeEnd);
                const hoverMessage = { language: 'javascript', value: fail.diff };

                return { range, hoverMessage };
            });

            state.editor.setDecorations(failureDecoration, failureRanges);
            statusBar.text = '$(alert) Testcases failed: ' + failureRanges.length;
            statusBar.show();
        } else if (state.success) {
			statusBar.text = '$(check) All testcases passed';
            statusBar.show();
        } else {
			state.editor.setDecorations(failureDecoration, []);
			statusBar.hide();
        }

        prevState = state;
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
    
	const killTestRunCommand = vsc.commands.registerCommand('extension.killRunningTest', async () => {
		const ate = vsc.window.activeTextEditor;

        if (ate && prevState.runningFile) {
            prevState.runningFile.kill();
            update({ editor: ate, runningFile: undefined, testcaseFailures: [], success: false });
		}
	});

	const textChange = vsc.workspace.onDidChangeTextDocument(ev => {
        const ate = vsc.window.activeTextEditor;

		if (ate && isActiveVanadDocument(ate, ev.document)) {
			runTest(ate);
		} else if (ate) {
			update({ editor: ate, runningFile: undefined, testcaseFailures: [], success: false });
        }
    });
    
    vsc.workspace.onDidOpenTextDocument(doc => {
        const ate = vsc.window.activeTextEditor;

		if (ate && isActiveVanadDocument(ate, doc) && !prevState.runningFile) {
			setTimeout(() => runTest(ate), 0);
		}
    })

	const textSave = vsc.workspace.onDidSaveTextDocument(doc => {
        const ate = vsc.window.activeTextEditor;

		if (ate && isActiveVanadDocument(ate, doc) && !prevState.runningFile) {
			setTimeout(() => runTest(ate), 0);
		}
	});

	context.subscriptions.push(mainCommand, killTestRunCommand, textChange, textSave);
}
