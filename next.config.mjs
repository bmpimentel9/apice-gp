/** @type {import('next').NextConfig} */
const nextConfig = {
  // O jogo é 100% cliente: exportar estático elimina cold start de função
  // serverless e deixa o comportamento previsível em rede móvel instável.
  output: 'export',
  reactStrictMode: true,
  images: { unoptimized: true },
  compiler: {
    removeConsole: process.env.NODE_ENV === 'production' ? { exclude: ['error', 'warn'] } : false,
  },
};

export default nextConfig;
