/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // CRM is an internal tool — keep it out of search engines.
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }],
      },
    ];
  },
};

export default nextConfig;
