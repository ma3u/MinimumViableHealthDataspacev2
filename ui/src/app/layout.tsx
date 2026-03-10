import type { Metadata } from "next";
import "./globals.css";
import Navigation from "@/components/Navigation";
import AuthProvider from "@/components/AuthProvider";

export const metadata: Metadata = {
  title: "Health Dataspace Explorer",
  description: "EHDS-compliant Health Dataspace v2 Graph Explorer",
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
          <Navigation />
          <main className="flex-1">{children}</main>
        </AuthProvider>
      </body>
    </html>
  );
}
