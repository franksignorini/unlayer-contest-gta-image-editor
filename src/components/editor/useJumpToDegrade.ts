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
 * The FIRST time SCRUB opens in a case it takes the jump itself. That is the
 * move the terminal's own first line tells a new player to make, and the chip
 * alone was a flickering 9px label competing with a grid of eleven thumbnails
 * for the most important glance of the run. After that the panel is left where
 * the player puts it — they have been shown the way down once.
 *
 * Only the panel scrolls. `scrollIntoView` walks every scrollable ancestor, and
 * below `lg` the page itself is one, so the jump used to throw the whole
 * terminal up the screen as well. The exception is a phone: there the editor
 * grows to fit its panel and has no scroller of its own, so the page is the
 * only thing that can bring DEFOCUS up — scrolled to just under the sticky
 * clock, never behind it.
 *
 * Found by our own translation string (see `sectionHeading`), polled at the
 * same modest rate as the panel-open check. If the library stops rendering
 * that heading, the chip simply never appears.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import type { RefObject } from "react";
import { sectionHeading } from "./commit";
import { DEGRADE_LABEL } from "./editor-config";

const POLL_MS = 300;

/** Breathing room left above the heading once it is scrolled to. */
const HEADROOM_PX = 8;

/**
 * On a stacked layout, where the page scrolls: room for the sticky clock
 * header above the heading, and for the sticky submit bar below the fold.
 */
const PAGE_HEADER_PX = 96;
const PAGE_FOOTER_PX = 150;

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

/**
 * Whether the heading sits below what its panel is showing — or, with no
 * panel scroller (a phone), below what the window is showing.
 */
function belowFold(heading: HTMLElement, scroller: HTMLElement | null): boolean {
  const top = heading.getBoundingClientRect().top;
  if (scroller) return top > scroller.getBoundingClientRect().bottom - 48;
  // No panel scroller and a page that cannot scroll either — the bounded
  // `lg` terminal with a panel that happens to fit — means nothing is hidden.
  const page = document.scrollingElement;
  const pageScrolls = !!page && page.scrollHeight > window.innerHeight + 1;
  return pageScrolls && top > window.innerHeight - PAGE_FOOTER_PX;
}

/**
 * Scroll the panel — and only the panel — so the heading leads it; on a phone,
 * the page, so the heading lands just under the sticky clock.
 */
function scrollPanelTo(heading: HTMLElement, scroller: HTMLElement | null) {
  const top = heading.getBoundingClientRect().top;
  if (scroller) {
    const delta = top - scroller.getBoundingClientRect().top;
    scroller.scrollBy({ top: delta - HEADROOM_PX, behavior: "smooth" });
  } else {
    window.scrollBy({ top: top - PAGE_HEADER_PX, behavior: "smooth" });
  }
}

export function useJumpToDegrade(
  root: RefObject<HTMLElement | null> | undefined,
  enabled: boolean
) {
  const [offscreen, setOffscreen] = useState(false);
  /** The guided jump is spent once per terminal, i.e. once per case. */
  const guided = useRef(false);

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
      const below = belowFold(heading, scroller);
      if (!guided.current) {
        guided.current = true;
        if (below) {
          scrollPanelTo(heading, scroller);
          setOffscreen(false);
          return;
        }
      }
      setOffscreen(below);
    }, POLL_MS);
    return () => clearInterval(id);
  }, [root, enabled]);

  const jump = useCallback(() => {
    if (!root) return;
    const container = root.current;
    const heading = sectionHeading(container, DEGRADE_LABEL);
    if (container && heading) {
      scrollPanelTo(heading, scrollParent(heading, container));
    }
    setOffscreen(false);
  }, [root]);

  return { offscreen, jump };
}
