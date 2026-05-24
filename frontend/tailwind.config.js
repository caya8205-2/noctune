/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        base: {
          950: '#080808',
          900: '#111111',
          800: '#1a1a1a',
          700: '#242424',
          600: '#2e2e2e',
          500: '#3a3a3a',
        },
        accent: {
          DEFAULT: '#C8F135',
          dim: '#9AC42A',
          glow: 'rgba(200,241,53,0.16)',
        },
        muted: '#6b6b6b',
        soft: '#9a9a9a',
      },
      fontFamily: {
        display: ['"DM Serif Display"', 'serif'],
        mono: ['"JetBrains Mono"', 'monospace'],
        sans: ['"DM Sans"', 'sans-serif'],
      },
      animation: {
        'spin-slow': 'spin 8s linear infinite',
        'pulse-accent': 'pulseAccent 2s ease-in-out infinite',
        'slide-up': 'slideUp 0.3s cubic-bezier(0.16,1,0.3,1)',
        'fade-in': 'fadeIn 0.2s ease',
      },
      keyframes: {
        pulseAccent: {
          '0%,100%': { boxShadow: '0 0 0 0 rgba(200,241,53,0)' },
          '50%': { boxShadow: '0 0 20px 4px rgba(200,241,53,0.25)' },
        },
        slideUp: {
          from: { transform: 'translateY(12px)', opacity: '0' },
          to: { transform: 'translateY(0)', opacity: '1' },
        },
        fadeIn: {
          from: { opacity: '0' },
          to: { opacity: '1' },
        },
      },
    },
  },
  plugins: [],
};

