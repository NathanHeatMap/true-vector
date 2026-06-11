import type { NextConfig } from "next";

const config: NextConfig = {
  reactStrictMode: true,
  serverExternalPackages: ["postgres", "@anthropic-ai/sdk"],
};

export default config;
