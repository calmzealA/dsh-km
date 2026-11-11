/**
 * A small fixture-level retrieval check. It is not a semantic benchmark: it
 * proves the index and ranking path keep working for CJK and English notes.
 *
 *   node test/eval-search.mjs
 */
import fsp from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { Vault } from '../lib/vault.js'

const notes = [
  ['检索方案选型', '比较 BM25 与向量检索，最终选择混合检索，并用 RRF 融合排序。', ['检索', '架构']],
  ['知识库存储', '工作区 .dsh-km 下的 Markdown 是唯一真源，索引在启动时重建。', ['存储', '设计']],
  ['审核流程', '模型写入默认 draft，人工确认后改为 verified，过期内容标 stale。', ['流程']],
  ['来源与引用', '每条笔记记录 session、url 或 file 来源，回答里用 [km-id] 引用。', ['引用']],
  ['侧边栏面板', '侧边栏底部的知识库入口打开 main 面板，支持搜索、编辑与回收站。', ['界面']],
  ['CJK 分词', '中文按 bigram 建索引，英文按词切分，混合查询也能命中。', ['检索']],
  ['Deployment notes', 'The host runs Node.js and serves the Web GUI on a loopback port.', ['ops']],
  ['Windows paths', 'IDs never contain path separators; vault containment is checked with realpath.', ['security']],
  ['Session capture', 'A later milestone will read session events and attach them as sources.', ['session']],
  ['Zero dependencies', 'No embeddings, no network calls, no model calls at runtime.', ['design']],
  ['When to recall', 'The when line is indexed so a situation can match, not only a keyword.', ['design']],
  ['Trash policy', '删除把笔记移入回收站 .trash；工具从不直接 unlink 笔记文件。', ['safety']],
  ['Tag filters', 'Search can require every tag in a query to be present.', ['检索']],
  ['Status weights', 'Verified notes rank above drafts; archived notes are skipped by default.', ['ranking']],
  ['Link graph', 'km_link writes both directions; backlinks are derived on read.', ['graph']],
  ['Command surface', '/km add saves a verified note; /km search renders compact hits.', ['command']],
  ['Panel editor', 'Title, tags, when and body are editable; sources and links stay agent-owned.', ['界面']],
  ['Index rebuild', 'The panel can rebuild a vault index without restarting the host.', ['ops']],
  ['Config precedence', 'Plugin row config wins over settings.json, which wins over defaults.', ['config']],
  ['Publish flow', 'The package is published to npm and listed in a plugin index.', ['release']],
]

const queries = [
  ['向量检索', '检索方案选型'],
  ['Markdown 真源', '知识库存储'],
  ['draft verified', '审核流程'],
  ['bigram', 'CJK 分词'],
  ['侧边栏 面板', '侧边栏面板'],
  ['session sources', 'Session capture'],
  ['RRF', '检索方案选型'],
  ['Windows realpath', 'Windows paths'],
  ['回收站', 'Trash policy'],
  ['npm plugin index', 'Publish flow'],
]

const home = await fsp.mkdtemp(path.join(os.tmpdir(), 'dsh-km-eval-home-'))
process.env.DSH_HOME = home
const root = await fsp.mkdtemp(path.join(os.tmpdir(), 'dsh-km-eval-vault-'))
const vault = new Vault({ root, watch: false })
await vault.init()

const ids = new Map()
for (const [title, body, tags] of notes) {
  const written = await vault.write({ title, body, tags, status: 'verified', when: body.slice(0, 40) })
  ids.set(title, written.id)
}

let hits = 0
for (const [query, expectedTitle] of queries) {
  const result = vault.search(query, { topK: 5 })
  const expectedId = ids.get(expectedTitle)
  const matched = result.hits.some(hit => hit.id === expectedId)
  if (matched) hits++
  const top = result.hits[0]
  console.log(`${matched ? 'PASS' : 'MISS'}  ${query}  ->  ${top ? top.title : '(none)'}  [${result.mode}]`)
}
const rate = hits / queries.length
console.log(`\nHit@5: ${hits}/${queries.length} = ${rate.toFixed(2)}`)
await fsp.rm(root, { recursive: true, force: true })
await fsp.rm(home, { recursive: true, force: true })
vault.close()
if (rate < 0.9) {
  console.error('Hit@5 below 0.9 on the fixture corpus')
  process.exitCode = 1
}
