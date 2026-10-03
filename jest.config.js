/** @type {import('jest').Config} */
module.exports = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: 'src',
  testRegex: '.*\\.spec\\.ts$',
  // `*.integration.spec.ts` write to a real Postgres and run only through
  // `npm run test:integration` against an explicit TEST_DATABASE_URL — a
  // plain `npm test` must never touch whatever database `.env` points at.
  testPathIgnorePatterns: ['/node_modules/', '\\.integration\\.spec\\.ts$'],
  transform: {
    '^.+\\.(t|j)s$': 'ts-jest',
  },
  collectCoverageFrom: ['**/*.(t|j)s'],
  coverageDirectory: '../coverage',
  testEnvironment: 'node',
  // No business logic exists yet (File 12 Part 10, Phase 0) — real unit
  // tests start with Phase 1 (Identity). Don't fail an empty `npm test`.
  passWithNoTests: true,
};
