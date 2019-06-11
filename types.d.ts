type ChildProcess = import('child_process').ChildProcess;
type TextEditor = import('vscode').TextEditor;
type TextEditorDecorationType = import('vscode').TextEditorDecorationType;
type StatusBarItem = import('vscode').StatusBarItem;

type Caller = {
    path: string;
    line: number;
};

type TestcaseResult = {
    callers: Caller[];
    diff: string | null;
    title: string;
};

type ExtensionItems = {
    statusBar: StatusBarItem;
    ate?: TextEditor;
    failureDecoration: TextEditorDecorationType;
};

type State = {
    results: TestcaseResult[];
    errors: string[];
    runningTests?: ChildProcess;
};
