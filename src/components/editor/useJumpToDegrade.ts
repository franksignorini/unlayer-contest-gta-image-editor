"use client";

/**
 * A way straight down to DEFOCUS.
 *
 * SCRUB opens on a grid of eleven presets, then LIGHT, then COLOUR, and only
 * then DEGRADE — so on a 900px terminal the two sliders the whole game turns on
 * start below the panel's fold, under a hairline scrollbar, and nothing on
 * screen says they are there. A player who tries the presets sees the rail
 * barely move and can reasonably conclude SCRUB is cosmetic. The library
 * gives us no way to reorder its panel, so this offers a jump instead: visible
 * only while the DEGRADE heading exists and sits below the panel's visible
 * area, gone the moment the player can see it.
 *
 * Found by our own translation string (see `sectionHeading`), polled at the
 * same modest rate as the panel-open check. If the library stops rendering
 * that heading, the chip simply never appears.
 */

import { useCallback, useEffect, useState } from "react";
import type { RefObject } from "react";
import { sectionHeading } from "./commit";
import { DEGRADE_LABEL } from "./editor-config";

const POLL_MS = 300;

/** The nearest ancestor that actually scrolls. */
function scrollParent(el: HTMLElement, stop: Element): HTMLElement | null {
  let node = el.parentElement;
  while (node && node !== stop) {
    if (node.scrollHeight > node.clientHeight + 1) {
      const overflow = getComputedStyle(node).overflowY;
      if (overflow === "auto" || overflow === "scroll") return node;
    }
    node = node.parentElement;
  }
  return null;
}

export function useJumpToDegrade(
  root: RefObject<HTMLElement | null> | undefined,
  enabled: boolean
) {
  const [offscreen, setOffscreen] = useState(false);

  useEffect(() => {
    if (!enabled || !root) return;
    const id = setInterval(() => {
      const container = root.current;
      const heading = sectionHeading(container, DEGRADE_LABEL);
      if (!container || !heading) {
        setOffscreen(false);
        return;
      }
      const scroller = scrollParent(heading, container);
      if (!scroller) {
        setOffscreen(false);
        return;
      }
      const below =
        heading.getBoundingClientRect().top >
        scroller.getBoundingClientRect().bottom - 48;
      setOffscreen(below);
    }, POLL_MS);
    return () => clearInterval(id);
  }, [root, enabled]);

  const jump = useCallback(() => {
    if (!root) return;
    const heading = sectionHeading(root.current, DEGRADE_LABEL);
    heading?.scrollIntoView({ block: "start", behavior: "smooth" });
    setOffscreen(false);
  }, [root]);

  return { offscreen, jump };
}
