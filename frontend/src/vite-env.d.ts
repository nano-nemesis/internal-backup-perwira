/// <reference types="vite/client" />

declare module '*.png' {
  const src: string
  export default src
}

declare module '*.jpg' {
  const src: string
  export default src
}

declare module '*.svg' {
  const src: string
  export default src
}

/** "<semver>+<tanggal build WIB>.<hash commit>", diisi vite.config.ts. */
declare const __VERSI__: string
