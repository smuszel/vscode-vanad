type ChildProcess = import('child_process').ChildProcess;
type TextEditor = import('vscode').TextEditor;

type Failure = {
    callerLine: number
    diff: string
}

declare type State = {
    editor: TextEditor;
    testcaseFailures: Failure[];
    runningFile?: ChildProcess;
    success: boolean;
};