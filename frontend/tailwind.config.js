/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        // Brand colors - primary indigo/purple gradient palette
        brand: {
          50: '#eef2ff',
          100: '#e0e7ff',
          200: '#c7d2fe',
          300: '#a5b4fc',
          400: '#818cf8',
          500: '#6366f1',
          600: '#4f46e5', // Primary brand color (indigo-600)
          700: '#4338ca',
          800: '#3730a3',
          900: '#312e81',
        },
        // Semantic colors for feedback states
        success: {
          50: '#f0fdf4',
          100: '#dcfce7',
          500: '#22c55e',
          600: '#16a34a',
          700: '#15803d',
        },
        error: {
          50: '#fef2f2',
          100: '#fee2e2',
          500: '#ef4444',
          600: '#dc2626',
          700: '#b91c1c',
        },
        // Design token utilities — map CSS variable names to Tailwind color utilities
        // e.g. bg-bg, bg-bg-raised, text-fg, text-fg-muted, border-border, etc.
        'bg':               'var(--bg)',
        'bg-raised':        'var(--bg-raised)',
        'bg-sunken':        'var(--bg-sunken)',
        'bg-inverse':       'var(--bg-inverse)',
        'bg-inverse-raised': 'var(--bg-inverse-raised)',
        'bg-inverse-sunken': 'var(--bg-inverse-sunken)',
        'border':           'var(--border)',
        'border-strong':    'var(--border-strong)',
        'border-inverse':   'var(--border-inverse)',
        'fg':               'var(--fg)',
        'fg-muted':         'var(--fg-muted)',
        'fg-subtle':        'var(--fg-subtle)',
        'fg-inverse':       'var(--fg-inverse)',
        'fg-inverse-muted': 'var(--fg-inverse-muted)',
        'accent':           'var(--accent)',
        'accent-fg':        'var(--accent-fg)',
        'accent-soft':      'var(--accent-soft)',
        'accent-ink':       'var(--accent-ink)',
        'run':              'var(--run)',
        'run-soft':         'var(--run-soft)',
        'danger':           'var(--danger)',
        'danger-soft':      'var(--danger-soft)',
        'info':             'var(--info)',
        'info-soft':        'var(--info-soft)',
        'warn':             'var(--warn)',
        'warn-soft':        'var(--warn-soft)',
      },
      fontFamily: {
        sans:  'var(--font-sans)',
        mono:  'var(--font-mono)',
        serif: 'var(--font-serif)',
      },
      borderRadius: {
        DEFAULT: 'var(--radius)',
        lg:      'var(--radius-lg)',
      },
      keyframes: {
        shake: {
          '0%, 100%': { transform: 'translateX(0)' },
          '10%, 30%, 50%, 70%, 90%': { transform: 'translateX(-4px)' },
          '20%, 40%, 60%, 80%': { transform: 'translateX(4px)' },
        },
        spin: {
          '0%': { transform: 'rotate(0deg)' },
          '100%': { transform: 'rotate(360deg)' },
        },
        pulse: {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.5' },
        },
      },
      animation: {
        shake: 'shake 0.5s ease-in-out',
        spin: 'spin 1s linear infinite',
        pulse: 'pulse 2s ease-in-out infinite',
      },
      // Focus ring standardization
      ringColor: {
        DEFAULT: '#4f46e5', // brand-600
      },
      ringOffsetWidth: {
        DEFAULT: '2px',
      },
      // Box shadow — token-based (design system) + legacy elevated components
      boxShadow: {
        'token':      'var(--shadow)',
        'token-lg':   'var(--shadow-lg)',
        'card':       '0 1px 3px 0 rgb(0 0 0 / 0.1), 0 1px 2px -1px rgb(0 0 0 / 0.1)',
        'card-hover': '0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)',
        'elevated':   '0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1)',
        'modal':      '0 25px 50px -12px rgb(0 0 0 / 0.25)',
      },
    },
  },
  plugins: [],
}
