import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Person A's frontend (Vite dev server, different origin) calls these API
  // routes directly — localhost demo only, so a permissive policy is fine.
  async headers() {
    return [
      {
        source: "/api/:path*",
        headers: [
          { key: "Access-Control-Allow-Origin", value: "*" },
          { key: "Access-Control-Allow-Methods", value: "GET,POST,PATCH,OPTIONS" },
          { key: "Access-Control-Allow-Headers", value: "Content-Type" },
        ],
      },
    ];
  },
};

export default nextConfig;
