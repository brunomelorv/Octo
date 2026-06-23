/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        accent: 'var(--accent)',
        ice: 'var(--ice)',
        'card-bg': 'var(--card-bg)',
        text: 'var(--text)',
        border: 'var(--border)',
      },
    },
  },
  plugins: [],
}



