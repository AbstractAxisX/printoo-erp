import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // ریشهٔ صریح turbopack برای جلوگیری از هشدار multi-lockfile
  // و اطمینان از پیدا کردن صحیح مسیر پروژه
  turbopack: {
    root: __dirname,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
};

export default nextConfig;
