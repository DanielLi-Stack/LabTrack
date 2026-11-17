import type { NextConfig } from "next";

const nextConfig: NextConfig = { output: "standalone", serverExternalPackages: ["@prisma/client"], devIndicators: false };
export default nextConfig;
