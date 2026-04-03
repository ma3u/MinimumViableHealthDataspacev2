import type { Metadata, Viewport } from "next";
import "./globals.css";
import Navigation from "@/components/Navigation";
import DemoPasswordBanner from "@/components/DemoPasswordBanner";
import AuthProvider from "@/components/AuthProvider";

export const metadata: Metadata = {
  title: "Health Dataspace Explorer",
  description:
    "Interactive demo of the European Health Data Space (EHDS) — explore FHIR R4 clinical records, OMOP CDM analytics, and DSP contract negotiation across 7 participant roles.",
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
    <html lang="en">
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
