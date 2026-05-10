import nextPwa from "next-pwa";

const withPWA = nextPwa({
  dest: "public",
  register: true,
  skipWaiting: true,
  disable: process.env.NODE_ENV === "development",
  runtimeCaching: [
    {
      urlPattern: /^https:\/\/fonts\.(googleapis|gstatic)\.com\/.*/i,
      handler: "CacheFirst",
      options: {
        cacheName: "google-fonts",
        expiration: { maxEntries: 8, maxAgeSeconds: 60 * 60 * 24 * 365 },
      },
    },
    {
      urlPattern: /\.(?:eot|otf|ttc|ttf|woff|woff2|font.css)$/i,
      handler: "StaleWhileRevalidate",
      options: { cacheName: "static-font-assets" },
    },
    {
      urlPattern: /\.(?:jpg|jpeg|gif|png|svg|ico|webp)$/i,
      handler: "StaleWhileRevalidate",
      options: { cacheName: "static-image-assets" },
    },
    {
      urlPattern: /\.(?:js)$/i,
      handler: "StaleWhileRevalidate",
      options: { cacheName: "static-js-assets" },
    },
    {
      urlPattern: /\.(?:css|less)$/i,
      handler: "StaleWhileRevalidate",
      options: { cacheName: "static-style-assets" },
    },
    {
      urlPattern: /\/_next\/data\/.+\/.+\.json$/i,
      handler: "StaleWhileRevalidate",
      options: { cacheName: "next-data" },
    },
    {
      urlPattern: ({ request, url }) =>
        request.mode === "navigate" && !url.pathname.startsWith("/api/"),
      handler: "NetworkFirst",
      options: {
        cacheName: "pages",
        networkTimeoutSeconds: 3,
        expiration: { maxEntries: 32, maxAgeSeconds: 60 * 60 * 24 },
      },
    },
    {
      urlPattern: /\/api\/(?!process).*/i,
      handler: "NetworkFirst",
      method: "GET",
      options: {
        cacheName: "apis",
        networkTimeoutSeconds: 10,
        expiration: { maxEntries: 16, maxAgeSeconds: 60 * 60 * 24 },
      },
    },
  ],
});

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    serverActions: { bodySizeLimit: "4mb" },
  },
};

export default withPWA(nextConfig);
