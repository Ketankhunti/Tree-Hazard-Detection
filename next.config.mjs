/** @type {import('next').NextConfig} */
const nextConfig = {
  // node-postgres resolves optional native/driver modules at runtime; keep it
  // out of the server bundle so the bundler does not try to follow them.
  experimental: {
    serverComponentsExternalPackages: ["pg"],
  },
};

export default nextConfig;
