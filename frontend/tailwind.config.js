/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        base: {
          950: 'rgb(var(--base-950) / <alpha-value>)',
          900: 'rgb(var(--base-900) / <alpha-value>)',
          800: 'rgb(var(--base-800) / <alpha-value>)',
          700: 'rgb(var(--base-700) / <alpha-value>)',
          600: 'rgb(var(--base-600) / <alpha-value>)',
          500: 'rgb(var(--base-500) / <alpha-value>)',
        },
        accent: {
          DEFAULT: 'rgb(var(--accent-rgb) / <alpha-value>)',
          dim: 'rgb(var(--accent-dim-rgb) / <alpha-value>)',
          glow: 'rgb(var(--accent-rgb) / 0.18)',
        },
        moon: {
          DEFAULT: '#7FA8FF',
          glow: 'rgba(127,168,255,0.16)',
        },
        muted: '#6A6E78',
        soft: '#A4A8B2',
      },
      fontFamily: {
        display: ['"Fraunces"', 'serif'],
        mono: ['"JetBrains Mono"', 'monospace'],
        sans: ['"Hanken Grotesk"', 'sans-serif'],
      },
      borderRadius: {
        '4xl': '2rem',
      },
      boxShadow: {
        glow: '0 0 24px 2px rgb(var(--accent-rgb) / 0.28)',
        'glow-lg': '0 0 70px 10px rgb(var(--accent-rgb) / 0.18)',
        panel: '0 18px 44px -28px rgba(0,0,0,0.9)',
      },
      backgroundImage: {
        ambient:
          'radial-gradient(120% 80% at 50% -10%, rgb(var(--accent-rgb) / 0.10), transparent 60%), radial-gradient(90% 60% at 100% 100%, rgba(127,168,255,0.06), transparent 55%)',
      },
      animation: {
        'spin-slow': 'spin 18s linear infinite',
        'pulse-accent': 'pulseAccent 2.4s ease-in-out infinite',
        'slide-up': 'slideUp 0.4s cubic-bezier(0.16,1,0.3,1)',
        'fade-in': 'fadeIn 0.3s ease',
        rise: 'rise 0.6s cubic-bezier(0.16,1,0.3,1) both',
        float: 'float 7s ease-in-out infinite',
      },
      keyframes: {
        pulseAccent: {
          '0%,100%': { boxShadow: '0 0 0 0 rgba(234,177,76,0)' },
          '50%': { boxShadow: '0 0 26px 4px rgba(234,177,76,0.30)' },
        },
        slideUp: {
          from: { transform: 'translateY(14px)', opacity: '0' },
          to: { transform: 'translateY(0)', opacity: '1' },
        },
        fadeIn: {
          from: { opacity: '0' },
          to: { opacity: '1' },
        },
        rise: {
          from: { transform: 'translateY(20px)', opacity: '0' },
          to: { transform: 'translateY(0)', opacity: '1' },
        },
        float: {
          '0%,100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-6px)' },
        },
      },
    },
  },
  plugins: [],
};
