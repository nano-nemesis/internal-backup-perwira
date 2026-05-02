/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ['class'],
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        primary: '#0077FF',
        'primary-hover': '#0060CC',
        'primary-light': '#EFF6FF',
        secondary: '#FF8C00',
        'secondary-light': '#FFF7ED',
        danger: '#E63000',
        'danger-light': '#FEF2F0',
        success: '#16A34A',
        'success-light': '#F0FDF4',
        surface: '#F8FAFC',
        border: '#E2E8F0',
        'text-primary': '#0F172A',
        'text-secondary': '#64748B',
        'sidebar-bg': '#0F172A',
        'sidebar-text': '#CBD5E1',
        'sidebar-active-bg': '#1E293B',
      },
      fontFamily: {
        display: ['DM Sans', 'system-ui', 'sans-serif'],
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'Space Mono', 'Consolas', 'monospace'],
      },
    },
  },
  plugins: [],
}
