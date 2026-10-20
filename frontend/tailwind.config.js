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
      fontFamily: {
        display: ['Plus Jakarta Sans', 'system-ui', 'sans-serif'],
        sans: ['Plus Jakarta Sans', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'Consolas', 'monospace'],
      },
      // Gaya kartu lembut: semua sudut naik satu tingkat dari bawaan Tailwind,
      // jadi kelas rounded-* lama ikut berubah tanpa disentuh satu per satu.
      borderRadius: {
        DEFAULT: '0.5rem',
        md: '0.75rem',
        lg: '1rem',
        xl: '1.25rem',
        '2xl': '1.375rem',
      },
    },
  },
  plugins: [],
}
