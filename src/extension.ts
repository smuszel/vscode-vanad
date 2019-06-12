import * as vsc from 'vscode';
import { execFile } from 'child_process';
import { join } from 'path';
import { bool } from './bool';
import stackParser from './stackParser';

const initial = () => ({
    runningTests: undefined,
    results: [],
    errors: [],
    watching: false,
});

const render = (state: State, items: ExtensionItems) => {
    const failedResults = state.results.filter(x => x.diff);
    const ate = items.ate;

    if (ate && state.errors.length) {
        const errors = state.errors.join('').split('\n');
        const ix = errors.findIndex(str => /^Error/.test(str));
        const message = errors.slice(0, ix - 2);
        const stack = errors.slice(ix + 1, errors.length);
        const callers = stackParser({ stack: stack.join('\n') });
        const docPath = ate.document.uri.fsPath;
        const matchedCaller = callers.find(c => docPath === c.path);

        if (matchedCaller && message) {
            const editorLine = ate.document.lineAt(matchedCaller.line - 1);
            const startIx = editorLine.firstNonWhitespaceCharacterIndex;
            const rangeStart = editorLine.range.start.translate(0, startIx);
            const rangeEnd = editorLine.range.end;
            const range = new vsc.Range(rangeStart, rangeEnd);
            message[0] = JSON.stringify(message[0].trim());
            const hoverMessage = {
                language: 'javascript',
                value: message.join('\n'),
            };

            ate.setDecorations(items.failureDecoration, [{ range, hoverMessage }]);
        }
    } else if (ate) {
        const docPath = ate.document.uri.fsPath;
        const failureRanges = failedResults.map(result => {
            const matchedCaller = result.callers.find(c => docPath === c.path);

            if (matchedCaller) {
                const editorLine = ate.document.lineAt(matchedCaller.line - 1);
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
            }
        });

        ate.setDecorations(items.failureDecoration, failureRanges.filter(bool));
    }

    const statusBar = items.statusBar;

    if (state.runningTests) {
        statusBar.text = '$(sync~spin) Running tests...';
    } else if (state.errors.length) {
        statusBar.text = '$(alert) Errors encountered';
    } else if (failedResults.length) {
        statusBar.text = '$(alert) Testcases failed: ' + failedResults.length;
    } else if (state.results.length) {
        statusBar.text = '$(check) All testcases passed';
    } else if (state.watching) {
        statusBar.text = '$(eye) Watching';
    } else {
        statusBar.text = 'idle';
    }
};

export function activate(context: vsc.ExtensionContext) {
    const statusBar = vsc.window.createStatusBarItem(vsc.StatusBarAlignment.Right, 1010);
    const failureDecoration = vsc.window.createTextEditorDecorationType({
        backgroundColor: { id: 'extension.failedTestcaseColor' },
    });

    const state = (() => {
        let value: State = initial();

        return {
            setState: (_state = value, shouldRender = true) => {
                value = _state;
                shouldRender &&
                    render(_state, {
                        statusBar,
                        failureDecoration,
                        ate: vsc.window.activeTextEditor,
                    });
            },
            get value() {
                return value;
            },
        };
    })();

    const setState = state.setState;

    const stopTests = (runningTests: ChildProcess) => {
        runningTests.kill();
        setState({ ...state.value, runningTests: undefined });
    };

    const runTests = () => {
        const f = (vsc.workspace.workspaceFolders || [])[0];
        const p = f && join(f.uri.fsPath, 'node_modules', 'vanad', 'bin', 'vanad.js');
        const path = p || '';
        const verbosity = '--verbosity=full';
        const cwd = '--cwd=' + f.uri.fsPath;
        const runningTests = execFile('node', [path, verbosity, cwd]);

        runningTests.stdout.on('data', chunk => {
            const lines = chunk.toString().split('\n');
            const testInfo = lines.filter(Boolean).map(l => JSON.parse(l));
            setState({ ...state.value, results: [...state.value.results, ...testInfo] });
        });

        runningTests.stderr.on('data', chunk => {
            setState(
                { ...state.value, errors: [...state.value.errors, chunk.toString()] },
                false,
            );
        });

        runningTests.on('close', () => {
            setState({ ...state.value, runningTests: undefined });
        });
    };

    const resetStatus = () => {
        setState(initial());
    };

    const _runTests = () => {
        if (state.value.runningTests) {
            vsc.window.showInformationMessage('Tests are already running');
        } else {
            runTests();
        }
    };

    const _stopTests = () => {
        const rt = state.value.runningTests;
        if (rt) {
            stopTests(rt);
        } else {
            vsc.window.showInformationMessage('Cannot stop since tests are not running');
        }
    };

    const _resetHighlighting = () => {
        setState({ ...state.value, errors: [], results: [] });
    };

    const _toggleWatching = () => {
        setState({ ...state.value, watching: !state.value.watching });
    };

    const reg = vsc.commands.registerCommand;
    const runTestsCommand = reg('extension.runTests', _runTests);
    const toggleWatchingCommand = reg('extension.toggleWatching', _toggleWatching);
    const stopTestsCommand = reg('extension.stopTests', _stopTests);
    const resetHighlightingCommand = reg(
        'extension.resetHighlighting',
        _resetHighlighting,
    );

    const onTextSave = vsc.workspace.onDidSaveTextDocument(() => {
        state.value.watching && vsc.commands.executeCommand('extension.runTests');
    });

    const onTextChange = vsc.workspace.onDidChangeTextDocument(() => {
        // setTimeout(() => {
        !state.value.runningTests &&
            vsc.commands.executeCommand('extension.resetHighlighting');
        // }, 200);
    });

    setInterval(setState, 100);
    statusBar.show();
    context.subscriptions.push(
        runTestsCommand,
        stopTestsCommand,
        resetHighlightingCommand,
        toggleWatchingCommand,
        onTextSave,
        onTextChange,
    );
}
