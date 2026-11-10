/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
  allowedDevOrigins: ["127.0.0.1"],
  // Keep the package out of the server bundle so next build does not parse
  // the wasm-pack .wasm import. The KPI page is a client component, so the
  // client bundle still includes it.
  serverExternalPackages: ["@elemental-zcash/zaddr_wasm_parser"],
  webpack(config, { isServer, dev }) {
    config.experiments = {
      ...config.experiments,
      asyncWebAssembly: true,
    };
    // Server prod builds look for wasm under .next/server; emit it where
    // the tracer expects it. Client and dev use the normal static path.
    config.output.webassemblyModuleFilename =
      isServer && !dev
        ? "../static/wasm/[modulehash].wasm"
        : "static/wasm/[modulehash].wasm";
    return config;
  },
};

export default nextConfig;
