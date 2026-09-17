/**
 * Prefixes a root-relative `/public` asset path with the app's base path.
 *
 * Locally, on `next start`, and on any host that serves the app from `/`,
 * `NEXT_PUBLIC_BASE_PATH` is empty and this is a no-op. The GitHub Pages
 * build serves the app from `/<repo>/` instead of `/`, and sets it —
 * see `next.config.ts`, which derives both Next's own `basePath` and this
 * env var from the same `GITHUB_PAGES` flag, so they can never disagree.
 *
 * Applied at the SOURCE of every static asset path — `missions.ts`,
 * `intro.ts`, `music.ts` — rather than at each of its many consumers.
 * Under `output: 'export'` (forced by the same flag), `next/image` is
 * `unoptimized` and renders a plain `<img src>` with exactly the string it
 * was given, so there is no automatic basePath rewriting to rely on. Most
 * consumers here never go through `next/image` at all: the editor's own
 * `image` option, `new Audio()`, `new window.Image()` for canvas work, and
 * a few deliberately-plain `<img>` tags all take a literal string, so the
 * prefix has to already be baked into the path by the time it reaches them.
 */
export const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

export function assetPath(path: string): string {
  return BASE_PATH ? `${BASE_PATH}${path}` : path;
}
