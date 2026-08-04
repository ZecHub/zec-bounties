import type React from "react";
import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import { BountyProvider } from "@/lib/bounty-context";
import { ZAddressProvider } from "@/components/address/zaddress-integration-hook";
import { ThemeProvider } from "@/components/theme-provider";
import { Suspense } from "react";
import { Toaster } from "@/components/ui/sonner";
import "./globals.css";
import { ColorThemeProvider } from "@/components/theme/color-theme-provider";

const geistSans = Geist({ subsets: ["latin"], variable: "--font-sans" });
const geistMono = Geist_Mono({ subsets: ["latin"], variable: "--font-mono" });

export const metadata: Metadata = {
  title: "ZEC Bounties | Bounty Platform",
  description:
    "ZEC Bounties is a privacy-first bounty platform for the Zcash cryptocurrency (ZEC). Zcash is a digital currency providing censorship-resistant, secure, and private payments. ZEC Bounties enables bug bounties, community rewards, development incentives, and contributor programs designed to support innovation and growth across the Zcash ecosystem. It is a great way to earn Zcash (ZEC)",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `
                      try {
                        var t = localStorage.getItem('colorTheme');
                        if (t) document.documentElement.setAttribute('data-color-theme', t);
                      } catch (e) {}
                    `,
          }}
        />
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
          <ColorThemeProvider>
            <Suspense fallback={<div>Loading...</div>}>
              <BountyProvider>
                {/* <ZAddressProvider> */}
                {children}
                {/* </ZAddressProvider> */}
                <Toaster position="top-right" />
              </BountyProvider>
            </Suspense>
          </ColorThemeProvider>
          <Analytics />
        </ThemeProvider>
      </body>
    </html>
  );
}
