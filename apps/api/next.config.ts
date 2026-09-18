import type { NextConfig } from "next";

/** Origin allowed to call the API. Defaults to the web app's dev server. */
const webOrigin = process.env.WEB_ORIGIN ?? "http://localhost:8080";

const nextConfig: NextConfig = {
  // Self-contained server bundle, so the Docker image doesn't ship node_modules.
  output: "standalone",
  // The web app runs on its own origin, so the browser preflights these routes.
  async headers() {
    return [
      {
        source: "/api/:path*",
        headers: [
          { key: "Access-Control-Allow-Origin", value: webOrigin },
          { key: "Access-Control-Allow-Methods", value: "GET,POST,PATCH,OPTIONS" },
          { key: "Access-Control-Allow-Headers", value: "Content-Type" },
        ],
      },
    ];
  },
};

export default nextConfig;
