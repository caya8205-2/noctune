/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        base: {
          950: '#090A0C',
          900: '#111318',
          800: '#151920',
          700: '#20262E',
          600: '#2B313A',
          500: '#38414D',
        },
        accent: {
          DEFAULT: '#8EECCB',
          dim: '#66C7AA',
          glow: 'rgba(142,236,203,0.16)',
        },
        muted: '#747B86',
        soft: '#AEB6C1',
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
