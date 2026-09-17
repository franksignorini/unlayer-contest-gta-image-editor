import type { Metadata, Viewport } from "next";
import { Barlow_Condensed, JetBrains_Mono } from "next/font/google";
import "./globals.css";

/** Condensed uppercase for labels and headings — instrument panel lettering. */
const condensed = Barlow_Condensed({
  variable: "--font-condensed",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

/** Every number and readout in the app is monospace. */
const monoData = JetBrains_Mono({
  variable: "--font-mono-data",
  subsets: ["latin"],
  weight: ["400", "500", "700"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "VICE EVIDENCE — VCPD Digital Forensics",
  description:
    "A CCTV camera caught you. You have three minutes to alter the evidence before Vice City PD runs automated forensic analysis.",
};

export const viewport: Viewport = {
  themeColor: "#04050a",
  colorScheme: "dark",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${condensed.variable} ${monoData.variable} h-full antialiased`}
    >
      <body className="min-h-full bg-void">{children}</body>
    </html>
  );
}
