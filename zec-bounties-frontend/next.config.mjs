/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
  serverExternalPackages: ['@elemental-zcash/zaddr_wasm_parser'],
  experimental: {
    serverComponentsExternalPackages: ['@elemental-zcash/zaddr_wasm_parser'],
  },
  outputFileTracingExcludes: {
    '*': [
      './node_modules/@elemental-zcash/zaddr_wasm_parser/**',
      './node_modules/**/*.wasm',
    ],
  },
};

export default nextConfig;
