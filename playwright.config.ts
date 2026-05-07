import { defineConfig } from '@playwright/test';
import * as dotenv from 'dotenv';
dotenv.config();

export default defineConfig({
  testDir: './src/features',
  timeout: parseInt(process.env.TIMEOUT || '30000'),
  use: {
    baseURL: process.env.BASE_URL || '',
    extraHTTPHeaders: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
  },
  reporter: [
    ['list'],
    ['html', { outputFolder: 'output/playwright-report', open: 'never' }],
  ],
});
