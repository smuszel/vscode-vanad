// @vanad
const t = require('vanad');

t('abc', t => {
    t(1, 1);
    t(1, 2);
});
