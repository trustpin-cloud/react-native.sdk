/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src', '<rootDir>/plugin/src', '<rootDir>/attest/src', '<rootDir>/attest/plugin/src'],
  clearMocks: true,
};
