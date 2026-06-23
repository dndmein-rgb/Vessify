import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Vessify — Transaction Extractor",
  description: "Personal finance transaction extractor with multi-tenant isolation",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen bg-background antialiased">{children}</body>
    </html>
  );
}
