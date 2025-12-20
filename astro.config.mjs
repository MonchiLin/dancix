// @ts-check
import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import tailwindcss from '@tailwindcss/vite';
import cloudflare from '@astrojs/cloudflare';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { storybookTest } from "@storybook/addon-vitest/vitest-plugin";
import { playwright } from "@vitest/browser-playwright";

const dirname = path.dirname(fileURLToPath(import.meta.url));

// https://astro.build/config
export default defineConfig({
  output: 'server',
  // Disable session storage to avoid KV binding requirements.
  session: {
    driver: 'null'
  },
  integrations: [react()],

  vite: {
    plugins: [/** @type {any} */(tailwindcss())],
    resolve: {
      alias: {
        "@": path.resolve(dirname, "./src")
      }
    },
    optimizeDeps: {
      // Prevent first-load hydration failures caused by Vite lazy-optimizing this dependency.
      include: ['web-highlighter']
    },
    // @ts-ignore
    test: {
      projects: [
        {
          extends: true,
          plugins: [
            // The plugin will run tests for the stories defined in your Storybook config
            // See options at: https://storybook.js.org/docs/next/writing-tests/integrations/vitest-addon#storybooktest
            storybookTest({ configDir: path.join(dirname, '.storybook') }),
          ],
          test: {
            name: 'storybook',
            browser: {
              enabled: true,
              headless: true,
              provider: playwright({}),
              instances: [{ browser: 'chromium' }],
            },
            setupFiles: ['.storybook/vitest.setup.ts'],
          },
        },
      ],
    },
  },

  adapter: cloudflare({imageService: "compile"})
});
