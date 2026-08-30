import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";

import { AppShell } from "@/app/_components/app-shell";
import { PwaInstallProvider } from "@/app/_components/pwa-install";

import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Sistema de Despacho",
  description: "Gestão de pacotes, despacho, romaneios e rastreios.",
  applicationName: "Sistema de Despacho",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "Sistema Despacho",
    statusBarStyle: "default",
  },
  formatDetection: {
    telephone: false,
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#0f766e",
  colorScheme: "light",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="pt-BR"
      data-scroll-behavior="smooth"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full">
        <PwaInstallProvider>
          <AppShell>{children}</AppShell>
        </PwaInstallProvider>
      </body>
    </html>
  );
}
