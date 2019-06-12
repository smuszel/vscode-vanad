const test = require('vanad');
const f = require('./main');

test('abc', t => {
    // t(1, 1);
    // t(1, 3);

    setTimeout(() => {
        t(f(1, undefined), 2)
        // t(1, 1);
    }, 100);
});







