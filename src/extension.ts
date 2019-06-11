import * as vsc from 'vscode';
import { execFile } from 'child_process';
import { join } from 'path';
import { flatMap } from './flatMap';

const initial = () => ({
    runningTests: undefined,
    results: [],
    errors: [],
});

let state: State = initial();

const render = (state: State, items: ExtensionItems) => {
    const failedResults = state.results.filter(x => x.diff);
    const ate = items.ate;

    if (ate) {
        const failureRanges = flatMap(failedResults, result => {
            const docPath = ate.document.uri.fsPath;
            const matchedCallers = result.callers.filter(c => docPath === c.path);

            const failureRanges = matchedCallers.map(caller => {
                const editorLine = ate.document.lineAt(caller.line - 1);
                const startIx = editorLine.firstNonWhitespaceCharacterIndex;
                const rangeStart = editorLine.range.start.translate(0, startIx);
                const rangeEnd = editorLine.range.end;
                const range = new vsc.Range(rangeStart, rangeEnd);
                const isTestDeclarationLine = editorLine.text.includes(result.title);
                const hov = {
                    language: 'javascript',
                    value: result.diff || '',
                };
                const hoverMessage = isTestDeclarationLine ? undefined : hov;
                return { range, hoverMessage };
            });

            return failureRanges;
        });
        ate.setDecorations(items.failureDecoration, failureRanges);
    }

    const statusBar = items.statusBar;

    if (state.runningTests) {
        statusBar.text = '$(sync~spin) Running tests...';
        statusBar.show();
    } else if (failedResults.length) {
        statusBar.text = '$(alert) Testcases failed: ' + failedResults.length;
        statusBar.show();
    } else if (state.results.length) {
        statusBar.text = '$(check) All testcases passed';
        statusBar.show();
    } else {
        statusBar.hide();
    }
};

export function activate(context: vsc.ExtensionContext) {
    const statusBar = vsc.window.createStatusBarItem(vsc.StatusBarAlignment.Right, 1010);
    const failureDecoration = vsc.window.createTextEditorDecorationType({
        backgroundColor: { id: 'extension.failedTestcaseColor' },
    });

    const setState = (_state = state) => {
        state = _state;
        render(_state, {
            statusBar,
            failureDecoration,
            ate: vsc.window.activeTextEditor,
        });
    };

    const stopTests = (runningTests: ChildProcess) => {
        runningTests.kill();
        setState({ ...state, runningTests: undefined });
    };

    const runTests = () => {
        const f = (vsc.workspace.workspaceFolders || [])[0];
        const p = f && join(f.uri.fsPath, 'node_modules', 'vanad', 'bin', 'vanad.js');
        const path = p || '';
        const verbosity = '--verbosity=full';
        const cwd = '--cwd=' + f.uri.fsPath;
        const runningTests = execFile('node', [path, verbosity, cwd]);

        setState({
            runningTests,
            results: [],
            errors: [],
        });
        let i = 0;
        runningTests.stdout.on('data', chunk => {
            const lines = chunk.toString().split('\n');
            const testInfo = lines.filter(Boolean).map(l => JSON.parse(l));
            setState({ ...state, results: [...state.results, ...testInfo] });
        });

        runningTests.stderr.on('data', chunk => {
            setState({ ...state, errors: [...state.errors, chunk.toString()] });
        });

        runningTests.on('close', () => {
            setState({ ...state, runningTests: undefined });
        });
    };

    const resetStatus = () => {
        setState(initial());
    };

    const _runTests = () => {
        if (state.runningTests) {
            vsc.window.showInformationMessage('Tests are already running');
        } else {
            setTimeout(() => {
                runTests();
            }, 200);
        }
    };

    const _stopTests = () => {
        if (state.runningTests) {
            stopTests(state.runningTests);
        } else {
            vsc.window.showInformationMessage('Cannot stop since tests are not running');
        }
    };

    const _resetStatus = () => {
        if (state.runningTests) {
            _stopTests();
        }
        resetStatus();
    };

    const reg = vsc.commands.registerCommand;
    const runTestsCommand = reg('extension.runTests', _runTests);
    const stopTestsCommand = reg('extension.stopTests', _stopTests);
    const resetStatusCommand = reg('extension.resetStatus', _resetStatus);

    const onTextSave = vsc.workspace.onDidSaveTextDocument(() => {
        vsc.commands.executeCommand('extension.runTests');
    });

    const onTextChange = vsc.workspace.onDidChangeTextDocument(() => {
        vsc.commands.executeCommand('extension.resetStatus');
    });

    setInterval(setState, 100);

    context.subscriptions.push(
        runTestsCommand,
        stopTestsCommand,
        resetStatusCommand,
        onTextSave,
        onTextChange,
    );
}
