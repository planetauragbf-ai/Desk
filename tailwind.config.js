/** @type {import('tailwindcss').Config} */
// Palette alignée sur l'identité Planet'Stock (stockage.planet-aura-gbf.workers.dev)
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        aura: {
          50: '#f8fafc',
          100: '#e2e8f0',
          200: '#d0d5dd',
          700: '#3f4c60',
          800: '#2e7fa0',
          900: '#14435c',
          950: '#0e3346',
        },
        accent: {
          400: '#3b9abf',
          500: '#2e7fa0',
        },
        coral: {
          500: '#ef4444',
          600: '#dc2626',
        },
        sand: '#f0f5fa',
      },
      fontFamily: {
        sans: ['"DM Sans"', 'system-ui', '-apple-system', 'sans-serif'],
      },
      boxShadow: {
        card: '0 1px 3px rgba(15, 23, 42, 0.07), 0 4px 16px rgba(15, 23, 42, 0.05)',
      },
    },
  },
  plugins: [],
}
