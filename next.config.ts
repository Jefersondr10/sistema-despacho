import type { NextConfig } from "next";

const isVercelBuild = process.env.VERCEL === "1";

const nextConfig: NextConfig = {
  ...(isVercelBuild ? {} : { output: "standalone" as const }),
  async redirects() {
    if (!isVercelBuild) return [];

    return [
      {
        source: "/:path*",
        destination: "https://bipagem.nucleodeoperacao.com.br/:path*",
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
