/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@roosta/shared', 'contracts'],
};
export default nextConfig;
