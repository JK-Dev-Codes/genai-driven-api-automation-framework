module.exports = {
  default: {
    requireModule: ['ts-node/register'],
    require: ['src/steps/**/*.ts'],
    paths: ['src/features/**/*.feature'],
    format: [
      'progress-bar',
      'html:output/cucumber-report.html',
      'json:output/cucumber-report.json',
    ],
    worldParameters: {
      appName: process.env.APP_NAME || 'default',
    },
    publishQuiet: true,
  },
};
