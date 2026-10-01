module.exports = {
  rootDir: __dirname,
  testEnvironment: '/Users/piluvitu/WWW/PiluVitu-Dev/packages/tools/node_modules/jest-environment-jsdom',
  transform: { '^.+\\.tsx?$': ['/Users/piluvitu/WWW/PiluVitu-Dev/packages/tools/node_modules/ts-jest', { tsconfig: { moduleResolution: 'node', strict: true, esModuleInterop: true, target: 'ES2017', module: 'commonjs', lib: ['dom','esnext'], types: ['jest'], typeRoots: ['/Users/piluvitu/WWW/PiluVitu-Dev/packages/tools/node_modules/@types'] } }] },
  testMatch: ['<rootDir>/src/**/*.test.ts'],
  cacheDirectory: __dirname + '/.jest-cache',
}
