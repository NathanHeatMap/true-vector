import type { Metadata } from "next";
import { ClerkProvider } from "@clerk/nextjs";

import "./globals.css";

export const metadata: Metadata = {
  title: {
    template: "%s · True Vector",
    default: "True Vector",
  },
  description:
    "Active vetting and continuous suitability for defence-environment workforces.",
  robots: "noindex, nofollow", // prototype — keep out of search until launch
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ClerkProvider>
      <html lang="en">
        <body>{children}</body>
      </html>
    </ClerkProvider>
  );
}
