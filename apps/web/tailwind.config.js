import { fileURLToPath } from 'node:url';
import { pluginContentGlobs } from '@codearena/plugin-host/vite';

const rootDir = fileURLToPath(new URL('../..', import.meta.url));

/** @type {import('tailwindcss').Config} */
export default {
  // Classes usadas pelos painéis dos plugins ativos em codearena.config.json.
  content: ['./index.html', './src/**/*.{ts,tsx}', ...pluginContentGlobs({ rootDir, configPath: process.env.CODEARENA_CONFIG })],
  theme: {
    extend: {
      colors: {
        ink: {
          950: '#06070D',
          900: '#0B0D18',
          850: '#10132A',
          800: '#151933',
          700: '#1D2242',
          600: '#282E55',
          500: '#3A416F',
          400: '#5A6194',
        },
        lime: { DEFAULT: '#B9FF3B', soft: '#B9FF3B26' },
        violet: { DEFAULT: '#8C61FF', soft: '#8C61FF26' },
        coral: { DEFAULT: '#FF5D7D', soft: '#FF5D7D26' },
        cyan: { DEFAULT: '#3DDCFF', soft: '#3DDCFF26' },
        amber: { DEFAULT: '#FFC940', soft: '#FFC94026' },
      },
      fontFamily: {
        display: ['"Space Grotesk Variable"', 'system-ui', 'sans-serif'],
        sans: ['"Space Grotesk Variable"', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono Variable"', 'ui-monospace', 'monospace'],
      },
      boxShadow: {
        glow: '0 0 0 1px rgba(185,255,59,.35), 0 0 32px -6px rgba(185,255,59,.45)',
        panel: '0 1px 0 0 rgba(255,255,255,.04) inset, 0 20px 40px -24px rgba(0,0,0,.8)',
      },
      keyframes: {
        'pulse-ring': {
          '0%': { boxShadow: '0 0 0 0 rgba(185,255,59,.5)' },
          '100%': { boxShadow: '0 0 0 14px rgba(185,255,59,0)' },
        },
      },
      animation: {
        'pulse-ring': 'pulse-ring 0.9s ease-out 1',
      },
    },
  },
  plugins: [],
};
