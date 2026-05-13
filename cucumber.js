module.exports = {
  // Runs ALL feature files (npm test)
  default: {
    requireModule: ['ts-node/register'],
    require: ['src/steps/**/*.ts'],
    paths: ['src/features/**/*.feature'],
    format: [
      'summary',
      'html:output/cucumber-report.html',
      'json:output/cucumber-report.json',
    ],
    worldParameters: {
      appName: process.env.APP_NAME || 'default',
    },
  },
  // Runs only the feature file passed on the CLI:
  // npx cucumber-js --profile single "src/features/PDS-16079.feature"
  single: {
    requireModule: ['ts-node/register'],
    require: ['src/steps/**/*.ts'],
    format: [
      'summary',
      'html:output/cucumber-report.html',
      'json:output/cucumber-report.json',
    ],
    worldParameters: {
      appName: process.env.APP_NAME || 'default',
    },
  },
};
