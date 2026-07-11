/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Semantic brand tokens (preferred for new code)
        noctune: {
          gold: 'rgb(var(--noctune-gold) / <alpha-value>)',
          'gold-dim': 'rgb(var(--noctune-gold-dim) / <alpha-value>)',
          moon: 'rgb(var(--noctune-moon) / <alpha-value>)',
          bg: 'rgb(var(--noctune-bg) / <alpha-value>)',
          surface: 'rgb(var(--noctune-surface) / <alpha-value>)',
          raised: 'rgb(var(--noctune-surface-raised) / <alpha-value>)',
          high: 'rgb(var(--noctune-surface-high) / <alpha-value>)',
          border: 'rgb(var(--noctune-border) / <alpha-value>)',
          muted: 'rgb(var(--noctune-muted) / <alpha-value>)',
          soft: 'rgb(var(--noctune-soft) / <alpha-value>)',
          ink: 'rgb(var(--noctune-ink) / <alpha-value>)',
          danger: 'rgb(var(--noctune-danger) / <alpha-value>)',
        },
        // Existing scale — maps to same CSS vars
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
          DEFAULT: 'rgb(var(--noctune-moon) / <alpha-value>)',
          glow: 'rgb(var(--noctune-moon) / 0.16)',
        },
        muted: 'rgb(var(--noctune-muted) / <alpha-value>)',
        soft: 'rgb(var(--noctune-soft) / <alpha-value>)',
        ink: 'rgb(var(--noctune-ink) / <alpha-value>)',
        danger: 'rgb(var(--noctune-danger) / <alpha-value>)',
      },
      fontFamily: {
        display: ['var(--font-display)', 'serif'],
        mono: ['var(--font-mono)', 'monospace'],
        sans: ['var(--font-sans)', 'sans-serif'],
      },
      borderRadius: {
        '4xl': '2rem',
        card: 'var(--radius-card)',
        panel: 'var(--radius-panel)',
        thumb: 'var(--radius-thumb)',
      },
      spacing: {
        'page-x': 'var(--space-page-x)',
        'page-y': 'var(--space-page-y)',
        'track-gap': 'var(--space-track-gap)',
        'modal-pad': 'var(--size-modal-pad)',
      },
      width: {
        'track-thumb-xs': 'var(--size-track-thumb-xs)',
        'track-thumb-sm': 'var(--size-track-thumb-sm)',
        'track-thumb': 'var(--size-track-thumb)',
        'track-thumb-md': 'var(--size-track-thumb-md)',
        'track-thumb-lg': 'var(--size-track-thumb-lg)',
        'action-hit': 'var(--size-action-hit)',
        'dropdown': 'var(--size-dropdown-width)',
        'modal-sm': 'var(--size-modal-sm)',
        'modal-md': 'var(--size-modal-md)',
        'modal-lg': 'var(--size-modal-lg)',
        'play-btn': 'var(--size-play-button)',
        'player-bar': 'var(--size-player-bar)',
      },
      height: {
        'track-thumb-xs': 'var(--size-track-thumb-xs)',
        'track-thumb-sm': 'var(--size-track-thumb-sm)',
        'track-thumb': 'var(--size-track-thumb)',
        'track-thumb-md': 'var(--size-track-thumb-md)',
        'track-thumb-lg': 'var(--size-track-thumb-lg)',
        'action-hit': 'var(--size-action-hit)',
        'play-btn': 'var(--size-play-button)',
        'player-bar': 'var(--size-player-bar)',
        'top-chrome': 'var(--size-top-chrome)',
        'dropdown-max': 'var(--size-dropdown-max-h)',
      },
      maxWidth: {
        'modal-sm': 'var(--size-modal-sm)',
        'modal-md': 'var(--size-modal-md)',
        'modal-lg': 'var(--size-modal-lg)',
        dropdown: 'var(--size-dropdown-width)',
      },
      maxHeight: {
        dropdown: 'var(--size-dropdown-max-h)',
      },
      zIndex: {
        dropdown: 'var(--z-dropdown)',
        modal: 'var(--z-modal)',
        toast: 'var(--z-toast)',
      },
      boxShadow: {
        glow: '0 0 24px 2px rgb(var(--accent-rgb) / 0.28)',
        'glow-lg': '0 0 70px 10px rgb(var(--accent-rgb) / 0.18)',
        panel: '0 18px 44px -28px rgba(0,0,0,0.9)',
      },
      backgroundImage: {
        ambient:
          'radial-gradient(120% 80% at 50% -10%, rgb(var(--accent-rgb) / 0.10), transparent 60%), radial-gradient(90% 60% at 100% 100%, rgb(var(--noctune-moon) / 0.06), transparent 55%)',
      },
      transitionDuration: {
        fast: 'var(--duration-fast)',
        normal: 'var(--duration-normal)',
        slow: 'var(--duration-slow)',
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
          '0%,100%': { boxShadow: '0 0 0 0 rgb(var(--accent-rgb) / 0)' },
          '50%': { boxShadow: '0 0 26px 4px rgb(var(--accent-rgb) / 0.30)' },
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
