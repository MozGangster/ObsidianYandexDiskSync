module.exports = {
  testEnvironment: 'node',
  roots: ['<rootDir>/__tests__'],
  moduleFileExtensions: ['js', 'json'],
  clearMocks: true,
  moduleNameMapper: {
    '^obsidian$': '<rootDir>/__mocks__/obsidian.js',
  },
};
