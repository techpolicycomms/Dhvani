# Dhvani — Knowledge Graph

An interactive, graphify.net-style force-directed map of the Dhvani codebase.
Pages, API routes, components, hooks, contexts, libraries, external services,
storage backends, and docs are all nodes. Edges show how the code is actually
wired — ES imports, `/api/...` calls, context consumption, storage read/write,
external-service dependencies, and page-to-page navigation.

## How to open it

Double-click `index.html` in any modern browser.

- Works offline after the first load of the vis-network CDN
  (`https://unpkg.com/vis-network/...`).
- No backend. Just static HTML + a static `graph.json`.

## How to read the graph

**Node shapes and colors** (legend also visible as filter swatches in the sidebar):

| Type | Color | Shape |
|---|---|---|
| `page` | ITU Blue `#009CD6` | large dot |
| `component` | ITU Light `#4FB7E4` | dot |
| `hook` | `#8BDAF3` | dot |
| `context` | `#F5A623` (amber) | dot |
| `lib` | Gray `#6B7280` | dot |
| `api-route` | ITU Dark `#003366` | box |
| `external-service` | Red `#E04F5F` | diamond |
| `storage-backend` | Purple `#9B59B6` | database |
| `config` | Green `#4B9E6A` | dot |
| `docs` | Warm tan `#B28F4E` | text label |

**Edge types**:

| Type | Meaning |
|---|---|
| `imports` | One file `import`s another (derived from ES-module statements with `@/` or relative paths). |
| `calls-api` | A component / hook / page calls `fetch("/api/...")` — linked to the matching `route.ts`. |
| `uses-context` | A client component calls `useTranscriptionContext()` or `useUserProfile()`. |
| `reads-storage` / `writes-storage` | A storage adapter reads or writes a concrete backend (OPFS, IndexedDB, localStorage, local filesystem, Azure Blob). |
| `depends-on-service` | A server-side module hits an external service (Azure OpenAI, Azure Blob, Microsoft Graph, Microsoft Entra, GitHub Releases). |
| `navigates-to` | A page uses `<Link href="/other">` to navigate to another page. |

**Sidebar**:
- Search filters by label and summary text.
- Type checkboxes toggle whole classes of nodes on/off.
- Clicking a node shows its label, file path, one-line summary, and full incoming
  and outgoing edge lists. Edge list items are themselves clickable — they
  recenter the graph on the linked node.

## What's in the graph

| Type | Count |
|---|---|
| page | 15 |
| component | 38 |
| hook | 10 |
| context | 2 |
| lib | 36 |
| api-route | 28 |
| external-service | 7 |
| storage-backend | 8 |
| config | 2 |
| docs | 15 |
| **Total nodes** | **161** |
| **Total edges** | **393** |

## How to regenerate

The graph is built by a small Python script that walks the repo, reads file
heads for summaries, and parses ES import statements + `fetch("/api/...")`
calls + `<Link href>` attributes + `useXyzContext()` calls to derive edges.
External services and storage backends are added as fixed nodes with
hand-wired edges (Azure OpenAI, Azure Blob, Entra, Graph, GitHub Releases,
OPFS, IndexedDB, localStorage, etc.).

```bash
# From anywhere — the script hard-codes the Dhvani repo path.
python3 docs/KNOWLEDGE_GRAPH/build_graph.py
# Output: docs/KNOWLEDGE_GRAPH/graph.json
```

The build script is deliberately self-contained — no external
dependencies beyond a stock Python 3 install. When you add a new
file, re-run it and the node/edge counts will update automatically.
For new files that warrant a custom one-line summary, edit the
`SUMMARIES` dict at the top of the script.

## What's deliberately NOT parsed

- The content of `.md` doc files (one node per doc, no keyword/topic edges).
- Dynamic string-built URLs (`fetch(\`/api/\${x}\`)`) — these show up as no-ops.
- Third-party npm packages other than `lucide-react`, which is the only
  external library with enough structural significance (every icon-using
  component links to it) to warrant a node.
- Anything under `node_modules/`, `.next/`, `data/`, `extension/`,
  `companion/`, `public/` (except `sw.js`), `scripts/`, or
  `tsconfig.tsbuildinfo`.

## Design notes

- Graph layout uses `forceAtlas2Based` physics — gives cleaner
  pages-at-the-edges + libraries-in-the-middle layout than the default
  Barnes-Hut.
- The viewer is deliberately one HTML file so it can be opened with
  `file://` and shared by just sending the folder.
- Dark theme only — ITU palette on a `#0F1620` panel background for
  readability during long inspection sessions.
