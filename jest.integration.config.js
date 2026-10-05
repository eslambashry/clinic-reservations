/** @type {import('jest').Config} */
const base = require('./jest.config');

// DB-backed suites only. `test/require-disposable-db.js` refuses to run
// without TEST_DATABASE_URL and swaps it in for DATABASE_URL/DIRECT_URL.
module.exports = {
  ...base,
  testRegex: '.*\\.integration\\.spec\\.ts$',
  testPathIgnorePatterns: ['/node_modules/'],
  setupFiles: ['<rootDir>/../test/require-disposable-db.js'],
  passWithNoTests: false,
};
