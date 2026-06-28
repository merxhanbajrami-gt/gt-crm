import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  // this app is the workspace root (a stray lockfile sits one level up)
  turbopack: {
    root: path.join(__dirname),
  },
};

export default nextConfig;
