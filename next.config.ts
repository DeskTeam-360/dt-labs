import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  async redirects() {
    const legacySettings = [
      "ticket-statuses",
      "ticket-types",
      "ticket-priorities",
      "tags",
      "email-integration",
      "slack-notifications",
      "message-templates",
      "automation-rules",
      "knowledge-base",
    ] as const
    return legacySettings.flatMap((seg) => [
      { source: `/${seg}`, destination: `/settings/${seg}`, permanent: true },
      { source: `/${seg}/:path*`, destination: `/settings/${seg}/:path*`, permanent: true },
    ])
  },
};

export default nextConfig;