#!/usr/bin/env node
/**
 * One-time import: copy Catena engineering docs into Mintlify layout.
 * Source: ../catena/docs (relative to gidorah-docs repo root)
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..");
const CATENA_DOCS = path.resolve(REPO_ROOT, "../catena/docs");
const CATENA_REPO = "https://github.com/gidorah/catena/blob/dev";

/** @type {Set<string>} */
const EXCLUDE_DIRS = new Set(["notion-export"]);

/** @type {string[]} */
const INCLUDE_TOP_LEVEL = [
  "README.md",
  "overview.md",
  "getting-started",
  "how-to",
  "explanation",
  "reference",
  "decisions",
  "packages",
];

function walkMarkdownFiles(dir, base = dir) {
  /** @type {string[]} */
  const files = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    const rel = path.relative(base, full);
    const top = rel.split(path.sep)[0];
    if (entry.isDirectory()) {
      if (EXCLUDE_DIRS.has(entry.name)) continue;
      files.push(...walkMarkdownFiles(full, base));
    } else if (entry.isFile() && entry.name.endsWith(".md")) {
      files.push(full);
    }
  }
  return files;
}

function collectSourceFiles() {
  /** @type {string[]} */
  const files = [];
  for (const item of INCLUDE_TOP_LEVEL) {
    const full = path.join(CATENA_DOCS, item);
    if (!fs.existsSync(full)) continue;
    if (fs.statSync(full).isDirectory()) {
      files.push(...walkMarkdownFiles(full, CATENA_DOCS));
    } else if (item.endsWith(".md")) {
      files.push(full);
    }
  }
  return files.sort();
}

function parseExistingFrontmatter(content) {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
  if (!match) return { frontmatter: null, body: content };
  const raw = match[1];
  /** @type {Record<string, string>} */
  const fields = {};
  for (const line of raw.split("\n")) {
    const m = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (m) fields[m[1]] = m[2].trim();
  }
  return { frontmatter: fields, body: match[2] };
}

function extractTitle(body, basename) {
  for (const line of body.split("\n")) {
    const h2 = line.match(/^## ADR-\d+:\s*(.+)$/);
    if (h2) return `ADR-${basename.match(/^(\d+)/)?.[1] ?? "?"}: ${h2[1].trim()}`;
    const h1 = line.match(/^#\s+(.+)$/);
    if (h1) return h1[1].trim();
  }
  return basename.replace(/\.md$/, "").replace(/-/g, " ");
}

function extractDescription(body) {
  const lines = body.split("\n");
  let started = false;
  for (const line of lines) {
    if (/^#{1,6}\s/.test(line)) {
      started = true;
      continue;
    }
    if (!started) continue;
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (trimmed.startsWith("|") || trimmed.startsWith("-") || trimmed.startsWith("*"))
      continue;
    return trimmed.length > 180 ? `${trimmed.slice(0, 177)}...` : trimmed;
  }
  return "Catena engineering documentation.";
}

function mintlifyPathFromRel(relPath) {
  let p = relPath.replace(/\.md$/, "");
  if (p === "README") return "engineering-docs";
  return p.split(path.sep).join("/");
}

function resolveDocLink(href, currentRelDir) {
  if (/^(https?:|mailto:|#)/.test(href)) return href;

  if (href.startsWith("../") && !href.includes("/docs/")) {
    const repoPath = href.replace(/^\.\.\//, "");
    if (repoPath.endsWith(".md")) {
      return `${CATENA_REPO}/${repoPath}`;
    }
    return `${CATENA_REPO}/${repoPath}`;
  }

  const abs = path.normalize(path.join(currentRelDir, href));
  if (abs.endsWith("/")) {
    const segment = abs.replace(/\/$/, "").split(path.sep).pop();
    return `/${segment}`;
  }
  if (!abs.endsWith(".md")) return href;
  const withoutExt = abs.replace(/\.md$/, "");
  const mintPath = withoutExt.split(path.sep).join("/");
  if (mintPath === "README") return "/engineering-docs";
  return `/${mintPath}`;
}

function rewriteLinks(body, currentRelDir) {
  return body.replace(/\[([^\]]*)\]\(([^)]+)\)/g, (full, text, href) => {
    if (href.startsWith("<") && href.endsWith(">")) return full;
    const cleaned = href.split("#");
    const base = cleaned[0];
    const hash = cleaned[1] ? `#${cleaned[1]}` : "";
    const resolved = resolveDocLink(base, currentRelDir);
    return `[${text}](${resolved}${hash})`;
  });
}

function buildFrontmatterBlock(existing, title, description) {
  const lines = [`title: "${title.replace(/"/g, '\\"')}"`, `description: "${description.replace(/"/g, '\\"')}"`];
  if (existing) {
    for (const [key, value] of Object.entries(existing)) {
      if (key === "title" || key === "description") continue;
      lines.push(`${key}: ${value}`);
    }
  }
  return `---\n${lines.join("\n")}\n---\n\n`;
}

function destPathForSource(sourcePath) {
  const rel = path.relative(CATENA_DOCS, sourcePath);
  if (rel === "README.md") {
    return path.join(REPO_ROOT, "engineering-docs.md");
  }
  return path.join(REPO_ROOT, rel);
}

function removeStarterContent() {
  const removeDirs = [
    "onboarding",
    "hr-people",
    "it-security",
    "policies",
    "engineering",
  ];
  for (const dir of removeDirs) {
    fs.rmSync(path.join(REPO_ROOT, dir), { recursive: true, force: true });
  }
}

function main() {
  if (!fs.existsSync(CATENA_DOCS)) {
    console.error(`Catena docs not found at ${CATENA_DOCS}`);
    process.exit(1);
  }

  removeStarterContent();

  const sources = collectSourceFiles();
  /** @type {string[]} */
  const importedPaths = [];

  for (const source of sources) {
    const rel = path.relative(CATENA_DOCS, source);
    const dest = destPathForSource(source);
    fs.mkdirSync(path.dirname(dest), { recursive: true });

    const raw = fs.readFileSync(source, "utf8");
    const { frontmatter, body } = parseExistingFrontmatter(raw);
    const basename = path.basename(source);
    const title = extractTitle(body, basename);
    const description = extractDescription(body);
    const currentRelDir = path.dirname(rel);
    const rewritten = rewriteLinks(body, currentRelDir);
    const output = buildFrontmatterBlock(frontmatter, title, description) + rewritten;

    fs.writeFileSync(dest, output);
    importedPaths.push(mintlifyPathFromRel(rel === "README.md" ? "engineering-docs.md" : rel));
  }

  fs.writeFileSync(
    path.join(REPO_ROOT, "scripts", "imported-pages.json"),
    JSON.stringify(importedPaths, null, 2) + "\n",
  );

  console.log(`Imported ${importedPaths.length} pages from ${CATENA_DOCS}`);
}

main();
