export type Caller = {
    path: string;
    line: number;
};

export type ComparisonResult = {
    callers: Caller[];
    diff: Diff;
    title: string;
};

export type Diff = string | null;
export type Compare = <T>(a: T, b: T) => Diff;
export type Verbosity = 'basic' | 'full';

export type StackParser = (err: { stack?: string }) => Caller[];
export type ComparisonEngine = <T>(a: T, b: T) => Diff;
export type Logger = (comparisonResult: ComparisonResult) => void;
export type RuntimeOptions = {
    comparisonEngine: ComparisonEngine;
    stackParser: StackParser;
    logger: Logger;
};
