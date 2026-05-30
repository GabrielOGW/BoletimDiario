import type { Config } from 'tailwindcss';

const config: Config = {
  darkMode: 'class',
  // Aplica :hover só em dispositivos com hover real (evita hover "grudado" no touch).
  future: {
    hoverOnlyWhenSupported: true,
  },
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './features/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        ink: '#08090b',
        surface: {
          DEFAULT: '#121317',
          raised: '#1a1c22',
          hover: '#22242c',
        },
        line: '#2a2d36',
        brand: {
          DEFAULT: '#f5a524',
          soft: '#3a2d12',
        },
        approved: {
          DEFAULT: '#22c55e',
          soft: '#0f2e1c',
        },
      },
      fontFamily: {
        sans: ['var(--font-sans)', 'system-ui', 'sans-serif'],
      },
      borderRadius: {
        xl: '0.875rem',
        '2xl': '1.125rem',
      },
      keyframes: {
        'slide-up': {
          from: { transform: 'translateY(12px)', opacity: '0' },
          to: { transform: 'translateY(0)', opacity: '1' },
        },
      },
      animation: {
        'slide-up': 'slide-up 0.18s ease-out',
      },
    },
  },
  plugins: [],
};

export default config;
