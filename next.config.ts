import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Permite um build de verificação em outra pasta (NEXT_DIST_DIR=.next-verify) sem derrubar o `next dev`.
  distDir: process.env.NEXT_DIST_DIR || ".next",
};

export default nextConfig;
