import type { NextConfig } from "next";

/**
 * GitHub Pages build.
 *
 * Set by the deploy workflow only (`.github/workflows/deploy.yml`) — local
 * `next dev` / `next build` / `next start` never see this flag, so the normal
 * dev loop and the `vice-evidence-prod` preview (`next start`) are unaffected.
 * Pages serves a project site from `/<repo>/`, not `/`, and has no server to
 * run `next start` against, so both `output: 'export'` and `basePath` are
 * conditional on the same flag rather than always on.
 *
 * `NEXT_PUBLIC_BASE_PATH` is derived from the identical `basePath` value and
 * fed back in as an `env` var so the two can never disagree. It is what
 * `src/lib/asset-path.ts` prefixes onto every literal `/public` path — the
 * editor's own `image` option, `new Audio()`, canvas `new window.Image()` and
 * a few deliberately-plain `<img>` tags all take a raw string and never go
 * through `next/image`, so nothing here can be rewritten automatically.
 */
const isGithubPagesBuild = process.env.GITHUB_PAGES === "true";
const basePath = isGithubPagesBuild ? "/unlayer-contest-gta-image-editor" : "";

const nextConfig: NextConfig = {
  ...(isGithubPagesBuild
    ? {
        output: "export",
        basePath,
        assetPrefix: basePath,
        images: { unoptimized: true },
      }
    : {}),
  env: {
    NEXT_PUBLIC_BASE_PATH: basePath,
  },
};

export default nextConfig;
