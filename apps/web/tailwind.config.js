/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: {
          950: '#06080d',
        },
        panel: {
          950: '#10151f',
          900: '#151b27',
          800: '#1b2231',
        },
        'signal-orange': {
          DEFAULT: '#ff7a37',
          strong: '#ff9354',
        },
        'signal-cyan': '#27d4ff',
      },
      boxShadow: {
        soft: '0 28px 80px rgba(5, 9, 15, 0.45)',
      },
    },
  },
  plugins: [],
}
