import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Permite um build de verificação em outra pasta (NEXT_DIST_DIR=.next-verify) sem derrubar o `next dev`.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  // A rota da IA lê public/data/*.json do disco (loadMapData no servidor). Na Vercel, os arquivos de
  // public/ vão para o CDN e não entram na função automaticamente: inclui os JSON no bundle da função.
  outputFileTracingIncludes: {
    "/api/azimuth": ["./public/data/**/*.json"],
  },
};

export default nextConfig;
