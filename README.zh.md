# dsh-km 知识库

面向 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 的本地优先知识库。知识以工作区 `.dsh-km/` 下的普通 Markdown 保存，模型通过 4 个 `km_*` 工具读写，你在设置旁的 Web 面板里审阅。

- **Markdown 是唯一真源。** 笔记就是普通文件，可打开、diff、提交、复制、搬走；内存索引在启动和写入后派生。
- **每条笔记都说明「什么时候该想起它」。** `when` 一行参与索引，检索匹配的是情境，而不只是关键词。
- **来源与审核是一等公民。** 笔记带 `sources`（session / url / file / manual）和审核状态：`draft`、`verified`、`stale`、`archived`。模型新写的笔记默认 `draft`。
- **零依赖、零网络、零模型调用。** 中文 bigram + 英文词 + 加权 BM25，不要求 embedding。
- **不离开工作区。** 删除只移入 `.trash/`，工具从不直接 unlink 笔记文件。

## 安装

npm（推荐）：

```sh
dsh plugin --profile web add dsh-km
```

本地目录：

```sh
dsh plugin --profile web add ./dsh-km
```

DSH Desktop 中打开 **插件 → 安装第三方插件**，粘贴包目录绝对路径；启用后刷新一次页面以加载 Web 面板。Host 侧改动需重启，面板改动刷新即可。

## 快速开始

对话里：

```text
> 把这次关于检索方案的结论存进知识库，标注一下来源
```

模型调用 `km_write`，返回稳定 id（如 `km-8060879c`）。之后：

```text
> 之前关于检索方案是怎么定的？用 [km-id] 标注引用
```

模型调用 `km_search`、`km_read`，并在回答里带 id。知识库面板在侧边栏底部、设置旁；界面中英双语，跟随 DSH 当前语言。

命令：

```text
/km                     状态、计数、最近笔记
/km add <文本>          保存人工笔记（verified）
/km search <文本>       紧凑检索结果
/km open                状态 + 打开面板提示
```

## 工具

| 工具 | 参数 | 返回 |
|---|---|---|
| `km_search` | `query`（空则列最近）、`tags?`、`status?`、`topK?`、`workspace?` | id、标题、状态、`when`、摘要、来源、分数 |
| `km_read` | `id`、`maxChars?`、`workspace?` | frontmatter、正文、来源、链接、反链 |
| `km_write` | `title`、`body`、`tags?`、`when?`、`status?`、`sources?`、`id?` | 稳定 id、路径、状态、时间 |
| `km_link` | `from`、`to` | 双向链接 |

工具只接受 id（`km-xxxxxxxx`），不接受文件路径。模型新写默认 `draft`；`/km add` 与面板保存默认 `verified`。

## Vault 结构

```
<workspace>/.dsh-km/
├── .gitignore              # .trash/ 与 *.tmp
├── notes/
│   └── 检索方案选型-km-8060879c.md
└── .trash/
```

笔记是 Markdown + 一小段 YAML frontmatter：

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

手写笔记会在下次重建时被拾取；解析失败的笔记会在面板里提示，不影响其他笔记。

## 检索

- 中文按字符 bigram 建索引，英文/数字按词切分，混合查询可用。
- 字段加权 BM25：`title` 3、`when` 2、`tags` 2、`body` 1；`k1=1.2`、`b=0.75`。
- `verified` 高于 `draft`；`stale` 降权；`archived` 默认不检索。
- 查询词全覆盖有奖励；词元不命中时有有界子串回退。
- 结果受 `maxResultChars` 预算限制，摘要 180 字符，每条命中都带来源。

## 配置

`cordis.patch.yml` 的插件行支持：

| 键 | 默认 | 含义 |
|---|---|---|
| `vaultDir` | `''` | 空表示 `<workspace>/.dsh-km`；也可填工作区内的子目录。 |
| `maxNoteBytes` | `1048576` | 单条笔记正文上限。 |
| `searchTopK` | `8` | 默认检索条数。 |
| `maxResultChars` | `6000` | 工具结果字符预算。 |
| `autoCreate` | `true` | 首次写入时创建 vault。 |
| `watch` | `true` | 磁盘变化时重建索引。 |

优先级：`cordis.patch.yml` 显式键 > 设置页（`$DSH_HOME/dsh-km/settings.json`）> 内置默认。面板不会改你的 profile patch。

## HTTP API

面板通过同源前缀 `/dsh-km/api` 访问 Host：

| 路由 | 作用 |
|---|---|
| `GET /workspaces` | 已注册工作区、vault 是否存在、笔记数 |
| `GET /notes?vault=&q=&status=&limit=` | 列表或检索 |
| `GET /note?vault=&id=` | 单条全文、链接、反链 |
| `POST /note` | 新建/更新 |
| `POST /trash` | 移入 `.trash/` |
| `POST /rebuild` | 重建指定 vault 索引 |
| `GET/POST /settings` | 读写面板设置 |
| `GET /stats?vault=` | 计数、热门标签、解析告警、revision |

`vault` 必须是已注册工作区路径；id 必须匹配 `^km-[0-9a-f]{8}$`。

## 安全

- 所有文件操作都在工作区的 vault 内；id 不含路径分隔符，`path.resolve` 后再校验包含关系。
- 每个 vault 串行写入，临时文件 + rename，并对 Windows 的 `EPERM`/`EBUSY`/`EACCES` 做有界重试。
- 删除可恢复（`.trash/`），工具不会永久删除笔记。
- 插件不发起网络请求，也不调用模型。

## 限制与路线

这是第一个里程碑，暂不包含：

- 从会话事件自动沉淀（带事件坐标）、审核队列、按相关性门控的自动召回注入；
- 引用核验（`km_check`）；
- embedding、PDF/Office 导入、长文档分块、图谱画布。

数据模型已经为这些步骤预留 `sources` 与 `status`。

## 发布与索引

- npm：`dsh-km`
- 仓库：<https://github.com/calmzealA/dsh-km>
- 官方插件市场 format 1 索引：`market/index.json`。发布后在 **插件 → 发现 → 添加索引源** 填入：

  `https://cdn.jsdelivr.net/npm/dsh-km@0.1.0/market/index.json`

## 开发

```sh
node --test test/     # 单元测试
node test/eval-search.mjs
npm pack --dry-run
```

无安装脚本、无运行时依赖。目标 DSH `>=0.2.2-rc.1 <0.3.0`，Node.js 20+。

## 许可

MIT © 2026 老陈聊AI
