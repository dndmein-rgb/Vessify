/** @type {import('next').NextConfig} */
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const nextConfig = {
  reactStrictMode: true,
  // Pins the workspace root explicitly to this frontend/ directory.
  // Without this, Next.js guesses the root by walking up and finding the
  // nearest lockfile — with three independent lockfiles (root, backend/,
  // frontend/) and no declared npm workspace, that guess is inconsistent
  // across environments. Locally on Windows it happened to guess right;
  // on Render's Linux container it guessed wrong, which is what triggered
  // the <Html> build error — Next.js was tracing/bundling against the
  // wrong file set.
  outputFileTracingRoot: __dirname,
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: "http://localhost:8787/api/:path*",
      },
    ];
  },
};

export default nextConfig;