/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ['class'],
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      keyframes: {
        // Bar indeterminate: meluncur bolak-balik selama proses berjalan.
        // Dipakai saat backup berjalan, yang durasinya tidak bisa diperkirakan
        // (tergantung ukuran konfigurasi/dump dan kecepatan SSH ke target).
        indeterminate: {
          '0%':   { transform: 'translateX(-100%) scaleX(0.4)' },
          '50%':  { transform: 'translateX(30%) scaleX(0.7)' },
          '100%': { transform: 'translateX(100%) scaleX(0.4)' },
        },
      },
      animation: {
        indeterminate: 'indeterminate 1.4s ease-in-out infinite',
      },
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
