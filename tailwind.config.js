/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Geist', 'Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['"Geist Mono"', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
      colors: {
        ink: { 950: '#09090b', 900: '#121216', 850: '#17171c', 800: '#1d1d24' },
        emerald: { DEFAULT: '#10b981' },
        violet: { DEFAULT: '#8b5cf6' },
      },
      boxShadow: {
        glow: '0 0 0 1px rgba(16,185,129,.35), 0 8px 40px -8px rgba(16,185,129,.45)',
        'glow-violet': '0 0 0 1px rgba(139,92,246,.35), 0 8px 40px -8px rgba(139,92,246,.45)',
      },
      keyframes: {
        shimmer: { '0%': { backgroundPosition: '-200% 0' }, '100%': { backgroundPosition: '200% 0' } },
      },
      animation: { shimmer: 'shimmer 3s linear infinite' },
    },
  },
  plugins: [],
}
