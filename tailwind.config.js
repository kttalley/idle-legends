/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        // WoW-inspired dark fantasy palette
        parchment: '#d4b896',
        'parchment-dark': '#b8976e',
        stone: '#4a4235',
        'stone-light': '#6b5e4e',
        'stone-dark': '#2a251e',
        'gold-wow': '#ffd700',
        'gold-dark': '#c8a100',
        // Rarity colors
        'rarity-common': '#9d9d9d',
        'rarity-uncommon': '#1eff00',
        'rarity-rare': '#0070dd',
        'rarity-epic': '#a335ee',
        'rarity-legendary': '#ff8000',
      },
      fontFamily: {
        fantasy: ['"MedievalSharp"', '"Palatino Linotype"', 'Palatino', 'serif'],
      },
    },
  },
  plugins: [],
}
