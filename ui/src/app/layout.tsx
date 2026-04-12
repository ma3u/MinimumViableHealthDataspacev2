import type { Metadata, Viewport } from "next";
import "./globals.css";
import Navigation from "@/components/Navigation";
import DemoPasswordBanner from "@/components/DemoPasswordBanner";
import AuthProvider from "@/components/AuthProvider";

export const metadata: Metadata = {
  title: "European Health Data Space | Interactive Demo",
  description:
    "Interactive demo of the European Health Data Space (EHDS). Explore FHIR R4 clinical records, OMOP CDM analytics, and DSP contract negotiation across 7 participant roles with 127 synthetic patients.",
  openGraph: {
    title: "European Health Data Space | Interactive Demo",
    description:
      "Explore cross-border health data sharing with 7 demo personas, 127 synthetic patients, and 5,300+ knowledge graph nodes. DSP 2025-1, FHIR R4, OMOP CDM, HealthDCAT-AP.",
    url: "https://ma3u.github.io/MinimumViableHealthDataspacev2/",
    siteName: "EHDS Demo",
    images: [
      {
        url: "https://ma3u.github.io/MinimumViableHealthDataspacev2/og-image.png",
        width: 1200,
        height: 630,
        alt: "European Health Data Space demo: knowledge graph, FHIR clinical data, and OMOP analytics dashboard",
      },
    ],
    locale: "en_US",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "European Health Data Space | Interactive Demo",
    description:
      "Explore cross-border health data sharing with 7 demo personas, 127 synthetic patients, and 5,300+ knowledge graph nodes.",
    images: [
      "https://ma3u.github.io/MinimumViableHealthDataspacev2/og-image.png",
    ],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      {/* Inline script applies saved theme class before first paint — prevents flash */}
      <head>
        <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('theme');document.documentElement.classList.toggle('dark',t==='dark')}catch(e){}})()`,
          }}
        />
      </head>
      <body className="min-h-screen flex flex-col">
        <AuthProvider>
          <a href="#main-content" className="skip-to-content">
            Skip to main content
          </a>
          <Navigation />
          <DemoPasswordBanner />
          <main id="main-content" className="flex-1" role="main">
            {children}
          </main>
        </AuthProvider>
      </body>
    </html>
  );
}
