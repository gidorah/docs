#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..");

function listPages(dir, prefix = "") {
  /** @type {string[]} */
  const pages = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith(".")) continue;
    const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      pages.push(...listPages(full, rel));
    } else if (entry.name.endsWith(".md")) {
      pages.push(rel.replace(/\.md$/, "").replace(/\/README$/, ""));
    }
  }
  return pages.sort();
}

function adrPages() {
  const dir = path.join(REPO_ROOT, "decisions");
  return fs
    .readdirSync(dir)
    .filter((f) => /^\d{3}-/.test(f) && f.endsWith(".md"))
    .sort()
    .map((f) => `decisions/${f.replace(/\.md$/, "")}`);
}

const docs = {
  $schema: "https://mintlify.com/docs.json",
  theme: "maple",
  name: "Catena",
  description:
    "Engineering documentation for Catena — GAEB tender ingest, canonical structure, and procurement workflow.",
  colors: {
    primary: "#166534",
    light: "#22C55E",
    dark: "#14532D",
  },
  favicon: "/favicon.ico",
  icons: { library: "lucide" },
  metadata: { timestamp: true },
  contextual: {
    options: ["copy", "view", "assistant"],
  },
  logo: {
    light: "/logo/light.svg",
    dark: "/logo/dark.svg",
  },
  navbar: {
    links: [
      {
        label: "GitHub",
        href: "https://github.com/gidorah/catena",
      },
    ],
  },
  navigation: {
    tabs: [
      {
        tab: "Documentation",
        groups: [
          {
            group: "Start here",
            pages: ["index", "overview", "engineering-docs"],
          },
          {
            group: "Getting started",
            pages: [
              "getting-started/local-development",
              "getting-started/first-gaeb-upload",
            ],
          },
          {
            group: "How-to guides",
            pages: listPages(path.join(REPO_ROOT, "how-to"), "how-to"),
          },
          {
            group: "Explanation",
            pages: listPages(path.join(REPO_ROOT, "explanation"), "explanation"),
          },
          {
            group: "Reference",
            pages: listPages(path.join(REPO_ROOT, "reference"), "reference"),
          },
          {
            group: "Packages",
            pages: listPages(path.join(REPO_ROOT, "packages"), "packages"),
          },
        ],
      },
      {
        tab: "ADRs",
        groups: [
          {
            group: "About ADRs",
            pages: ["decisions/README"],
          },
          {
            group: "Decisions",
            pages: adrPages(),
          },
        ],
      },
    ],
  },
};

fs.writeFileSync(path.join(REPO_ROOT, "docs.json"), JSON.stringify(docs, null, 2) + "\n");
console.log("Wrote docs.json");
