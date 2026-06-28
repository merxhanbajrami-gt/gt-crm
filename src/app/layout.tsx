import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "GT / OS — Pipeline",
  description: "GT-HQ internal CRM",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
