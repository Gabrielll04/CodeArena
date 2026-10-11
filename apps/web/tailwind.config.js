import { fileURLToPath } from 'node:url';
import { pluginContentGlobs } from '@codearena/plugin-host/vite';

const rootDir = fileURLToPath(new URL('../..', import.meta.url));

/** Cores que mudam entre a página (clara) e a bancada (editor e painéis de plugin, escura). Ver styles.css. */
const themed = (name) => `rgb(var(--${name}) / <alpha-value>)`;

/** @type {import('tailwindcss').Config} */
export default {
  // Classes usadas pelos painéis dos plugins ativos em codearena.config.json.
  content: ['./index.html', './src/**/*.{ts,tsx}', ...pluginContentGlobs({ rootDir, configPath: process.env.CODEARENA_CONFIG })],
  theme: {
    extend: {
      colors: {
        fg: themed('fg'),
        canvas: themed('canvas'),
        surface: themed('surface'),
        sunken: themed('sunken'),
        ink: {
          DEFAULT: '#171B33',
          950: '#0C0E1C',
          900: '#111426',
          850: '#161A30',
          800: '#1C2039',
          700: '#262B48',
          600: '#343A5C',
          500: '#4A5178',
          400: '#6A7199',
        },
        cobalt: { DEFAULT: themed('cobalt'), deep: '#1B2FB0', soft: '#2C47F01F' },
        mint: { DEFAULT: themed('mint'), fill: '#12A877', soft: '#0F9B6C1F' },
        tomato: { DEFAULT: themed('tomato'), fill: '#E8492C', soft: '#E0442A1F' },
        sun: { DEFAULT: '#FFB21E', deep: themed('sun-deep'), soft: '#FFB21E2E' },
        sky: { DEFAULT: '#1690C4', deep: themed('sky-deep'), soft: '#1690C41F' },
        // Nomes antigos, mantidos para os painéis de plugins (que rodam sobre a bancada escura).
        lime: { DEFAULT: '#3FD9A0', soft: '#3FD9A026' },
        violet: { DEFAULT: '#8A9BFF', soft: '#8A9BFF26' },
        coral: { DEFAULT: '#FF7A61', soft: '#FF7A6126' },
        cyan: { DEFAULT: '#5CC8F2', soft: '#5CC8F226' },
        amber: { DEFAULT: '#FFC34D', soft: '#FFC34D26' },
      },
      fontFamily: {
        display: ['"Archivo Variable"', 'system-ui', 'sans-serif'],
        sans: ['"Atkinson Hyperlegible Next Variable"', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono Variable"', 'ui-monospace', 'monospace'],
      },
      boxShadow: {
        panel: '0 1px 2px rgb(var(--fg) / 0.06)',
        lift: '0 12px 32px -16px rgb(23 27 51 / 0.35)',
      },
    },
  },
  plugins: [],
};
