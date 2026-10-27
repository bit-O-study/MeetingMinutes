import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  experimental: { proxyClientMaxBodySize: "65mb" },
  /* config options here */
};

export default nextConfig;
