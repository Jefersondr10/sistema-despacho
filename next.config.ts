import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Gera uma imagem Docker menor e autocontida para produção.
  output: "standalone",
};

export default nextConfig;
