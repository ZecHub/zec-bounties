import type React from "react";
import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import { BountyProvider } from "@/lib/bounty-context";
import { ZAddressProvider } from "@/components/address/zaddress-integration-hook";
import { ThemeProvider } from "@/components/theme-provider";
import { Suspense } from "react";
import "./globals.css";

const geistSans = Geist({ subsets: ["latin"], variable: "--font-sans" });
const geistMono = Geist_Mono({ subsets: ["latin"], variable: "--font-mono" });

export const metadata: Metadata = {
  title: "ZEC Bounties | Bounty Platform",
  description:
    "ZEC Bounties is a privacy-first bounty platform for Zcash users, featuring bug bounties, community rewards, and crypto incentives.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Structured Data for SEO */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@type": "WebSite",
              name: "ZEC Bounties",
              url: "https://bounties.zechub.wiki",
              description:
                "ZEC Bounties is a privacy-first platform for Zcash bug bounties, crypto rewards, and community contributions.",
            }),
          }}
        />
        {/* Optional: Meta robots */}
        <meta name="robots" content="index, follow" />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} font-sans antialiased`}
      >
        <ThemeProvider attribute="class" defaultTheme="dark" enableSystem>
          <Suspense fallback={<div>Loading...</div>}>
            <BountyProvider>
              <ZAddressProvider>{children}</ZAddressProvider>
            </BountyProvider>
          </Suspense>
          <Analytics />
        </ThemeProvider>
      </body>
    </html>
  );
}
