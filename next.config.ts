import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // Self-contained server bundle for the Docker image that runs on the droplet.
  output: 'standalone',
  // pg and better-auth use Node APIs; keep them out of the server bundle.
  serverExternalPackages: ['pg', 'better-auth'],
}

export default nextConfig
