# dsh-km

Local-first knowledge base for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness). Your workspace keeps its knowledge as plain Markdown under `.dsh-km/`; the agent reads and writes it through four `km_*` tools, and you review it in a Web panel beside Settings.

- **Markdown is the source of truth.** Notes are ordinary files you can open, diff, commit, copy or move. The in-memory index is derived on startup and after writes.
- **Every note says when to recall it.** A one-line `when` field is indexed, so a situation can match — not only a keyword.
- **Provenance and review are first-class.** Notes carry `sources` (session, URL, file, manual) and a review status: `draft`, `verified`, `stale`, `archived`. Model-written notes start as `draft`.
- **Zero dependencies, zero network, zero model calls.** CJK bigrams and Latin words with weighted BM25; no embeddings required.
- **Nothing leaves the workspace.** Deletes move notes to `.trash/`; the tools never unlink a note file.

## Install

From npm (recommended):

```sh
dsh plugin --profile web add dsh-km
```

From a local checkout:

```sh
dsh plugin --profile web add ./dsh-km
```

In DSH Desktop, open **Plugins → Install third-party plugin** and paste the absolute package directory. Enable the bundle, then refresh the page once so the Web panel loads. Host-side changes need a restart; panel-only changes need a page refresh.

## Quick start

In a conversation:

```text
> 把这次关于检索方案的结论存进知识库，标注一下来源
```

The agent calls `km_write` and returns a stable id such as `km-8060879c`. Later:

```text
> 之前关于检索方案是怎么定的？用 [km-id] 标注引用
```

The agent calls `km_search`, then `km_read`, and answers with the id. The knowledge panel is at the sidebar footer, beside Settings. The UI is bilingual (English / 简体中文) and follows the active DSH locale.

You can also use the command surface:

```text
/km                     status, counts, recent notes
/km add <text>          save a human-authored note (verified)
/km search <text>       compact hits
/km open                status + hint to open the panel
```

## Tools

| Tool | Arguments | Returns |
|---|---|---|
| `km_search` | `query` (empty lists recent), `tags?`, `status?`, `topK?`, `workspace?` | Note ids, titles, status, `when`, snippet, sources, score |
| `km_read` | `id`, `maxChars?`, `workspace?` | Frontmatter, body, sources, links, backlinks |
| `km_write` | `title`, `body`, `tags?`, `when?`, `status?`, `sources?`, `id?` | Stable id, path, status, timestamps |
| `km_link` | `from`, `to` | Bidirectional link between two notes |

Notes are ids (`km-xxxxxxxx`); tools never accept file paths. New notes default to `draft`; `/km add` and panel saves default to `verified`.

## Vault layout

```
<workspace>/.dsh-km/
├── .gitignore              # .trash/ and *.tmp
├── notes/
│   └── 检索方案选型-km-8060879c.md
└── .trash/
```

A note is Markdown with a small YAML frontmatter block:

```yaml
---
id: km-8060879c
title: 检索方案选型
tags: [检索, 架构]
when: 当需要决定检索方案时
links: [km-9f8e7d6c]
status: verified
created: 2026-11-11T09:00:00.000Z
updated: 2026-11-11T09:30:00.000Z
sources:
  - {type: session, ref: sess_ab12, locator: "seq:41-47", capturedAt: "2026-11-11T09:00:00.000Z"}
  - {type: url, ref: https://example.com/spec}
---
正文 Markdown……
```

Hand-written notes are picked up on the next reload. A malformed note is reported in the panel and does not block the rest of the vault.

## Search

- CJK text is indexed as character bigrams; Latin/digit text as lowercased words. Mixed queries work.
- Weighted BM25 over `title` (3), `when` (2), `tags` (2), `body` (1), with `k1=1.2`, `b=0.75`.
- `verified` notes rank above `draft`; `stale` is down-weighted; `archived` is excluded unless requested.
- Complete query coverage gets a bonus; when tokens miss, a bounded substring fallback still finds literal matches.
- Results are budgeted (`maxResultChars`), snippets are 180 characters, and every hit carries its sources.

## Configuration

The plugin row in `cordis.patch.yml` accepts:

| Key | Default | Meaning |
|---|---|---|
| `vaultDir` | `''` | Empty means `<workspace>/.dsh-km`. A relative or absolute subdirectory of the workspace. |
| `maxNoteBytes` | `1048576` | Maximum body size per note. |
| `searchTopK` | `8` | Default number of search hits. |
| `maxResultChars` | `6000` | Tool-result character budget. |
| `autoCreate` | `true` | Create the vault on first write. |
| `watch` | `true` | Reload the index when files change on disk. |

Precedence: a key set in `cordis.patch.yml` wins over the Settings page; the Settings page writes non-secret values to `$DSH_HOME/dsh-km/settings.json`, which wins over the built-in defaults. The panel never edits your profile patch.

## HTTP API

The Web panel talks to the host over the same-origin prefix `/dsh-km/api`:

| Route | Purpose |
|---|---|
| `GET /workspaces` | Registered workspaces, vault presence, note counts |
| `GET /notes?vault=&q=&status=&limit=` | List or search notes |
| `GET /note?vault=&id=` | One note with body, links, backlinks |
| `POST /note` | Create or update |
| `POST /trash` | Move a note to `.trash/` |
| `POST /rebuild` | Rebuild one vault index |
| `GET/POST /settings` | Read/write panel settings |
| `GET /stats?vault=` | Counts, top tags, parse warnings, revision |

`vault` must be a registered workspace path; note ids must match `^km-[0-9a-f]{8}$`.

## Safety

- All file operations stay under the workspace's vault; IDs cannot contain path separators, and containment is checked after `path.resolve`.
- Writes are serialized per vault and use a temporary file plus rename, with bounded retries for Windows `EPERM`/`EBUSY`/`EACCES`.
- Deletes are recoverable (`.trash/`); the tools never permanently remove a note.
- No network requests and no model calls are made by the plugin.

## Limitations and roadmap

This is the first milestone. Not included yet:

- automatic capture from session events with event coordinates, a review queue, and relevance-gated recall injection;
- citation verification (`km_check`);
- embeddings, PDF/Office ingestion, long-document chunking, and a graph canvas.

The data model already reserves `sources` and `status` for those steps.

## Publish and indexes

- npm: `dsh-km`
- Repository: <https://github.com/calmzealA/dsh-km>
- Official plugin-market index (format 1): see `market/index.json`. After publishing, add its URL in **Plugins → Discover → Add index source**:

  `https://cdn.jsdelivr.net/npm/dsh-km@0.1.0/market/index.json`

## Development

```sh
node --test test/     # unit tests
node test/eval-search.mjs
npm pack --dry-run
```

No install scripts and no runtime dependencies. The plugin targets DSH `>=0.2.2-rc.1 <0.3.0` and Node.js 20+.

## License

MIT © 2026 老陈聊AI
