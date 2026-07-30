/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        aura: {
          50: '#f2f7fb',
          100: '#e7f0f8',
          200: '#cfe1f0',
          700: '#1d4e6b',
          800: '#123c56',
          900: '#0b2e44',
          950: '#07202f',
        },
        accent: {
          400: '#38bdf8',
          500: '#0ea5e9',
        },
        coral: {
          500: '#f0716a',
          600: '#e15750',
        },
        sand: '#f7f5f0',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'Segoe UI', 'Roboto', 'sans-serif'],
      },
      boxShadow: {
        card: '0 1px 3px rgba(11, 46, 68, 0.08), 0 4px 16px rgba(11, 46, 68, 0.06)',
      },
    },
  },
  plugins: [],
}
