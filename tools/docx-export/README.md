# docx-export

Exports the project docs in [`docs/`](../../docs) from Markdown to Word (`.docx`, A4). The Markdown files are the source of truth. Edit those, then re-run this export; never edit the `.docx` files by hand.

## Setup (once)

```bash
cd tools/docx-export
npm install
```

Requirements: Node 20+ and Google Chrome (used headless to draw the mermaid diagrams). `npm install` skips puppeteer's own Chromium download (`.puppeteerrc.cjs`). To use a different browser, set `CHROME_PATH`.

## Usage

```bash
./build.sh              # all docs/NN-*.md → docs/NN-*.docx
./build.sh 01-PRD 03    # selected docs (name, number prefix, or path)
```

Each run extracts the mermaid blocks, renders them to PNG in a temporary folder (deleted afterwards), and writes the `.docx` next to its `.md`. If Chrome is missing or a diagram fails to render, that diagram appears as a code block and a warning is printed.

## Files

| File | Role |
|---|---|
| `build.sh` | Orchestrates the export for one or more docs |
| `md2docx.js` | Markdown → DOCX converter (uses the [`docx`](https://www.npmjs.com/package/docx) library) |
| `extract-mermaid.js` | Writes each mermaid block to `<prefix>-<n>.mmd` for rendering |
| `mermaid-config.json` | Diagram theme (teal palette from `04-UI-UX-Design-Brief.md`) and tighter layout spacing |

## What the converter supports

Headings `#`–`####` (the `#` title becomes the document title and running header), paragraphs, `**bold**`, `*italic*`, `~~strike~~`, `` `code` ``, links (external links stay clickable; repo-relative links become plain text), pipe tables (column widths sized to content, header row repeats across pages, 7.5pt text for tables with 7+ columns), bullet/numbered lists with nesting, `- [ ]` tasks, `>` quotes, `---` rules, fenced code blocks, and mermaid diagrams as images.

Anything else, such as inline HTML or footnotes, comes through as plain text.

## Writing diagrams that print well

The page is A4 portrait, so diagrams are scaled to fit 6.3" × 7.9". To keep labels readable:
- Prefer `flowchart TD`/`TB` over `LR` when a chain is long or a node has many children.
- Keep decision diamonds short (put criteria in a side note) and merge purely linear steps.
- Check the result: a label under about 6pt in the `.docx` means the diagram needs a new layout.
