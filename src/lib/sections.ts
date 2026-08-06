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
    slug: "nearby",
    label: "Nearby",
    nav: [{ href: "/nearby/", label: "Just over the line" }],
  },
  {
    slug: "events",
    label: "Events",
    nav: [{ href: "/events/", label: "Fairs and events" }],
  },
  {
    slug: "indoors",
    label: "Indoors",
    nav: [{ href: "/indoors/", label: "Museums, science centers and libraries" }],
  },
  {
    slug: "dogs",
    label: "Dogs",
    nav: [{ href: "/dogs/", label: "Where the dog can come" }],
  },
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
