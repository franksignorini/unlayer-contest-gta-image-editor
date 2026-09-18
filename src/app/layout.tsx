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

const TITLE = "VICE EVIDENCE — VCPD Digital Forensics";
const DESCRIPTION =
  "A CCTV camera caught you. You have three minutes to alter the evidence before Vice City PD runs automated forensic analysis.";

// Same flag next.config.ts gates `output: 'export'` on. Only the GitHub
// Pages build is reachable at a public URL, so it's the only one that needs
// an absolute `metadataBase` — the shared og:image/twitter:image convention
// files resolve against it. Locally and on `next start`, Next falls back to
// the request origin on its own.
//
// Origin only, no `/unlayer-contest-gta-image-editor` path — Next already
// prefixes the convention image route with next.config.ts's own `basePath`
// before resolving it against this. Including the repo path here too
// double-prefixed the resolved og:image URL with it.
const isGithubPagesBuild = process.env.GITHUB_PAGES === "true";
const siteUrl = "https://franksignorini.github.io";

export const metadata: Metadata = {
  ...(isGithubPagesBuild ? { metadataBase: new URL(siteUrl) } : {}),
  title: TITLE,
  description: DESCRIPTION,
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    siteName: "VICE EVIDENCE",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESCRIPTION,
  },
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
