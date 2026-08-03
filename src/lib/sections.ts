/**
 * Section registry.
 *
 * Adding a section means one entry here — the masthead and the section nav
 * both read from it. Learned from the Delaware build, where the nav was
 * hardcoded to the first section and had to be untangled when the second
 * arrived.
 */
export interface NavItem {
  href: string;
  label: string;
}

export interface Section {
  slug: string;
  label: string;
  nav: NavItem[];
}

export const SECTIONS: Section[] = [
  {
    slug: "parks",
    label: "Parks",
    // Two entries, not twenty. The card grids do the drilling.
    nav: [
      { href: "/parks/", label: "State parks" },
      { href: "/parks/regional/", label: "Town parks" },
    ],
  },
];

/** The section a path belongs to, or null for home and the meta pages. */
export function sectionFor(pathname: string): Section | null {
  const first = pathname.split("/").filter(Boolean)[0];
  return SECTIONS.find((s) => s.slug === first) ?? null;
}
