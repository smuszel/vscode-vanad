import { Caller, StackParser } from '../types/internal';

const callerRegex = /\s\(?(\S+):(\d+):(\d+)\)?$/;
const internalsRegex = /^internal\//;

const createCaller = (matches: string[]): Caller => ({
    path: matches[1],
    line: +matches[2],
});

const parseLine = (line: string) => {
    const matches = line.trim().match(callerRegex);
    return matches ? createCaller(matches) : matches;
};

// @ts-ignore
const stackParser: StackParser = ({ stack }) => {
    return (stack || '')
        .split('\n')
        .map(line => {
            const caller = line && parseLine(line);
            const res = caller && !internalsRegex.test(caller.path) ? caller : false;
            return res;
        })
        .filter(Boolean);
};

export default stackParser;
