window.__ModuleLoader__.load({
  id: 'dsh-km',
  factory(require) {
    const React = require('react')
    const h = React.createElement
    const { useCallback, useEffect, useMemo, useRef, useState } = React

    /* ------------------------------------------------------------------ *
     * Transport
     * ------------------------------------------------------------------ */

    function apiBase() {
      try {
        const boot = window.__DSH_BOOT__
        const origin = boot && ((boot.connection && boot.connection.origin) || boot.origin || boot.apiOrigin)
        if (typeof origin === 'string' && origin) {
          return String(origin).replace(/\/+$/, '') + '/dsh-km/api'
        }
      } catch {
        /* same-origin fallback */
      }
      return '/dsh-km/api'
    }

    const BASE = apiBase()

    async function request(path, body, method) {
      const init = {
        method: method ?? (body === undefined ? 'GET' : 'POST'),
        headers: { accept: 'application/json' },
      }
      if (body !== undefined) {
        init.headers['content-type'] = 'application/json'
        init.body = JSON.stringify(body)
      }
      const response = await fetch(BASE + path, init)
      const text = await response.text()
      let payload = null
      if (text) {
        try {
          payload = JSON.parse(text)
        } catch {
          throw new Error(text.slice(0, 200))
        }
      }
      if (!response.ok) {
        const message = payload && payload.error && payload.error.message
        throw new Error(message || 'HTTP ' + response.status)
      }
      return payload
    }

    /* ------------------------------------------------------------------ *
     * Locale
     * ------------------------------------------------------------------ */

    const DICT = {
      en: {
        title: 'Knowledge',
        entryLabel: 'Knowledge',
        searchPlaceholder: 'Search notes…',
        newNote: 'New note',
        refresh: 'Refresh',
        all: 'All',
        draft: 'draft',
        verified: 'verified',
        stale: 'stale',
        archived: 'archived',
        status: 'Status',
        filterStatus: 'Review status',
        emptyList: 'No notes yet. Create one here, or ask the agent to call km_write.',
        emptySelection: 'Select a note on the left, or create a new one.',
        noWorkspaces: 'No registered workspace. Open a workspace first.',
        emptyVault: 'This workspace has no knowledge base yet.',
        save: 'Save',
        saving: 'Saving…',
        cancel: 'Cancel',
        delete: 'Move to trash',
        confirmDelete: 'Confirm delete',
        saved: 'Note saved.',
        deleted: 'Note moved to the trash.',
        titleRequired: 'A title is required.',
        loadFailed: 'Could not load the knowledge base.',
        noteTitle: 'Title',
        tags: 'Tags',
        tagsHint: 'comma separated',
        when: 'When to recall',
        whenHint: 'One line: when should this note come to mind?',
        body: 'Body',
        details: 'Details',
        id: 'Id',
        path: 'Path',
        created: 'Created',
        updated: 'Updated',
        sources: 'Sources',
        links: 'Links',
        backlinks: 'Backlinks',
        noSources: 'No sources recorded.',
        noLinks: 'No links.',
        noBacklinks: 'No backlinks.',
        copy: 'Copy',
        copied: 'Id copied.',
        workspace: 'Workspace',
        notes: 'notes',
        results: 'results',
        settingsTitle: 'Knowledge base',
        settingsIntro: 'Local Markdown notes under the workspace. Settings here are stored in $DSH_HOME/dsh-km/settings.json; a key set in cordis.patch.yml still wins.',
        autoCreate: 'Create the vault on first write',
        watch: 'Reload the index when files change on disk',
        searchTopK: 'Default search results',
        maxResultChars: 'Search result budget (characters)',
        saveSettings: 'Save settings',
        savedSettings: 'Settings saved.',
        rebuild: 'Rebuild index',
        rebuilt: 'Index rebuilt.',
        vaults: 'Workspaces',
        about: 'Four tools: km_search, km_read, km_write, km_link. Command: /km. Zero dependencies, no network, no model calls.',
        noVault: 'no vault yet',
        openPanel: 'Open the knowledge panel',
        settings: 'Settings',
        readOnly: 'Sources and links are written by the agent or /km; edit the Markdown file to change them.',
      },
      'zh-CN': {
        title: '知识库',
        entryLabel: '知识库',
        searchPlaceholder: '搜索笔记…',
        newNote: '新建笔记',
        refresh: '刷新',
        all: '全部',
        draft: '待审',
        verified: '已确认',
        stale: '过期',
        archived: '已归档',
        status: '状态',
        filterStatus: '审核状态',
        emptyList: '还没有笔记。可以在这里新建，或让 agent 调用 km_write。',
        emptySelection: '从左侧选择一条笔记，或新建一条。',
        noWorkspaces: '没有已注册的工作区，请先打开一个工作区。',
        emptyVault: '这个工作区还没有知识库。',
        save: '保存',
        saving: '保存中…',
        cancel: '取消',
        delete: '移入回收站',
        confirmDelete: '确认删除',
        saved: '笔记已保存。',
        deleted: '笔记已移入回收站。',
        titleRequired: '标题不能为空。',
        loadFailed: '加载知识库失败。',
        noteTitle: '标题',
        tags: '标签',
        tagsHint: '逗号分隔',
        when: '什么时候该想起它',
        whenHint: '一句话：什么情况下应该想起这条笔记？',
        body: '正文',
        details: '详情',
        id: 'Id',
        path: '路径',
        created: '创建',
        updated: '更新',
        sources: '来源',
        links: '链接',
        backlinks: '反链',
        noSources: '没有记录来源。',
        noLinks: '没有链接。',
        noBacklinks: '没有被链接。',
        copy: '复制',
        copied: '已复制 Id。',
        workspace: '工作区',
        notes: '条笔记',
        results: '条结果',
        settingsTitle: '知识库',
        settingsIntro: '笔记以 Markdown 保存在工作区。这里的设置写入 $DSH_HOME/dsh-km/settings.json；cordis.patch.yml 中显式设置的同名键优先。',
        autoCreate: '首次写入时自动创建知识库',
        watch: '磁盘文件变化时自动重建索引',
        searchTopK: '默认检索条数',
        maxResultChars: '检索结果字符预算',
        saveSettings: '保存设置',
        savedSettings: '设置已保存。',
        rebuild: '重建索引',
        rebuilt: '索引已重建。',
        vaults: '工作区',
        about: '4 个工具：km_search、km_read、km_write、km_link；命令：/km。零依赖、无网络、无模型调用。',
        noVault: '尚未创建知识库',
        openPanel: '打开知识库面板',
        settings: '设置',
        readOnly: '来源与链接由 agent 或 /km 写入；需要修改请直接编辑 Markdown 文件。',
      },
    }
    DICT.zh = DICT['zh-CN']

    let translate = key => DICT.en[key] ?? key
    function t(key) {
      return translate(key)
    }

    /* ------------------------------------------------------------------ *
     * Small helpers
     * ------------------------------------------------------------------ */

    function splitTags(value) {
      return String(value ?? '')
        .split(/[,，]/)
        .map(item => item.trim())
        .filter(Boolean)
        .slice(0, 20)
    }

    function shortTime(value) {
      const time = Date.parse(String(value ?? ''))
      if (!Number.isFinite(time)) return ''
      const date = new Date(time)
      const now = Date.now()
      if (now - time < 24 * 60 * 60 * 1000) {
        return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      }
      return date.toLocaleDateString()
    }

    function errorText(error) {
      return error instanceof Error ? error.message : String(error)
    }

    /* ------------------------------------------------------------------ *
     * Icons and styles
     * ------------------------------------------------------------------ */

    function BookIcon(props) {
      const size = props && props.size ? props.size : 16
      return h(
        'svg',
        { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', 'aria-hidden': true },
        h('path', {
          d: 'M4 5.5A2.5 2.5 0 0 1 6.5 3H11l2 2h4.5A2.5 2.5 0 0 1 20 7.5V19a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V5.5Z',
          stroke: 'currentColor',
          strokeWidth: 1.6,
          strokeLinejoin: 'round',
        }),
        h('path', { d: 'M8 9h8M8 12.5h8M8 16h5', stroke: 'currentColor', strokeWidth: 1.4, strokeLinecap: 'round' }),
      )
    }

    const CSS = `
.dsh-km-root{display:flex;flex-direction:column;height:100%;min-height:0;background:var(--dsw-alias-bg-base,#fff);color:var(--dsw-alias-text-primary,#1f2328);font-size:13px}
.dsh-km-head{display:flex;align-items:center;gap:8px;padding:10px 14px;border-bottom:1px solid var(--dsw-alias-border-secondary,#e5e7eb);flex-wrap:wrap}
.dsh-km-brand{display:flex;align-items:center;gap:7px;font-weight:600;font-size:14px;margin-right:4px}
.dsh-km-select,.dsh-km-input,.dsh-km-search,.dsh-km-textarea{font:inherit;color:inherit;background:var(--dsw-alias-bg-elevated,#fff);border:1px solid var(--dsw-alias-border-secondary,#d5d9e0);border-radius:6px;padding:5px 8px;outline:none}
.dsh-km-search{flex:1;min-width:160px}
.dsh-km-select:focus,.dsh-km-input:focus,.dsh-km-search:focus,.dsh-km-textarea:focus{border-color:var(--dsw-alias-border-accent,#0f766e);box-shadow:0 0 0 2px var(--dsw-alias-bg-accent-muted,rgba(15,118,110,.15))}
.dsh-km-btn{font:inherit;cursor:pointer;border:1px solid var(--dsw-alias-border-secondary,#d5d9e0);background:var(--dsw-alias-bg-elevated,#fff);color:inherit;border-radius:6px;padding:5px 10px}
.dsh-km-btn:hover{background:var(--dsw-alias-bg-hover,#f3f5f7)}
.dsh-km-btn[data-primary="true"]{background:var(--dsw-alias-bg-accent,#0f766e);border-color:transparent;color:#fff}
.dsh-km-btn[data-danger="true"]{color:var(--dsw-alias-text-danger,#b42318)}
.dsh-km-btn:disabled{opacity:.5;cursor:not-allowed}
.dsh-km-filters{display:flex;gap:6px;padding:8px 14px;border-bottom:1px solid var(--dsw-alias-border-secondary,#eef0f3);flex-wrap:wrap}
.dsh-km-chip{cursor:pointer;border:1px solid transparent;border-radius:999px;padding:3px 9px;background:transparent;color:var(--dsw-alias-text-secondary,#57606a);font:inherit}
.dsh-km-chip[data-active="true"]{background:var(--dsw-alias-bg-accent-muted,rgba(15,118,110,.12));color:var(--dsw-alias-text-accent,#0f766e);border-color:var(--dsw-alias-border-accent,#0f766e)}
.dsh-km-error,.dsh-km-notice{margin:8px 14px;padding:7px 10px;border-radius:6px;font-size:12px}
.dsh-km-error{background:var(--dsw-alias-bg-danger-muted,#fdecea);color:var(--dsw-alias-text-danger,#b42318)}
.dsh-km-notice{background:var(--dsw-alias-bg-success-muted,#e8f5ee);color:var(--dsw-alias-text-success,#17663a)}
.dsh-km-body{display:flex;flex:1;min-height:0}
.dsh-km-list{width:300px;min-width:220px;border-right:1px solid var(--dsw-alias-border-secondary,#e5e7eb);overflow:auto;padding:6px}
.dsh-km-item{display:block;width:100%;text-align:left;border:1px solid transparent;border-radius:8px;background:transparent;color:inherit;font:inherit;padding:8px 9px;cursor:pointer}
.dsh-km-item:hover{background:var(--dsw-alias-bg-hover,#f6f7f9)}
.dsh-km-item[data-active="true"]{background:var(--dsw-alias-bg-accent-muted,rgba(15,118,110,.1));border-color:var(--dsw-alias-border-accent,#0f766e)}
.dsh-km-item-head{display:flex;align-items:center;gap:6px;justify-content:space-between}
.dsh-km-item-title{font-weight:600;font-size:13px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.dsh-km-item-when{margin-top:3px;font-size:12px;color:var(--dsw-alias-text-secondary,#57606a);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.dsh-km-item-meta{display:flex;align-items:center;gap:4px;margin-top:4px;flex-wrap:wrap}
.dsh-km-item-empty{padding:24px 14px;color:var(--dsw-alias-text-secondary,#57606a);text-align:center;line-height:1.7}
.dsh-km-tag{font-size:11px;border-radius:999px;padding:1px 6px;background:var(--dsw-alias-bg-secondary,#f1f3f5);color:var(--dsw-alias-text-secondary,#57606a)}
.dsh-km-time{margin-left:auto;font-size:11px;color:var(--dsw-alias-text-tertiary,#8b949e)}
.dsh-km-pill{font-size:11px;border-radius:999px;padding:1px 7px;background:var(--dsw-alias-bg-secondary,#f1f3f5);color:var(--dsw-alias-text-secondary,#57606a);flex:none}
.dsh-km-pill[data-status="verified"]{background:var(--dsw-alias-bg-success-muted,#e8f5ee);color:var(--dsw-alias-text-success,#17663a)}
.dsh-km-pill[data-status="draft"]{background:var(--dsw-alias-bg-warning-muted,#fff6e5);color:var(--dsw-alias-text-warning,#9a6700)}
.dsh-km-pill[data-status="stale"]{background:var(--dsw-alias-bg-danger-muted,#fdecea);color:var(--dsw-alias-text-danger,#b42318)}
.dsh-km-snippet{margin-top:4px;font-size:12px;color:var(--dsw-alias-text-secondary,#57606a);line-height:1.5;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.dsh-km-err-inline{margin-top:4px;font-size:11px;color:var(--dsw-alias-text-danger,#b42318)}
.dsh-km-editor{flex:1;min-width:0;display:flex;flex-direction:column;padding:14px 16px;overflow:auto}
.dsh-km-editor-empty,.dsh-km-detail-empty{margin:auto;color:var(--dsw-alias-text-secondary,#57606a);line-height:1.8;text-align:center;max-width:360px}
.dsh-km-row{display:flex;gap:8px;align-items:center;margin-bottom:8px}
.dsh-km-row .dsh-km-input{flex:1}
.dsh-km-label{font-size:12px;color:var(--dsw-alias-text-secondary,#57606a);margin:10px 0 4px}
.dsh-km-textarea{width:100%;min-height:260px;resize:vertical;line-height:1.65;font-family:var(--dsw-font-mono,ui-monospace,SFMono-Regular,Consolas,monospace);font-size:13px}
.dsh-km-editor-actions{display:flex;gap:8px;align-items:center;margin-top:10px}
.dsh-km-editor-actions .dsh-km-spacer{flex:1}
.dsh-km-detail{width:260px;min-width:200px;border-left:1px solid var(--dsw-alias-border-secondary,#e5e7eb);overflow:auto;padding:14px}
.dsh-km-detail h3{margin:0 0 10px;font-size:13px}
.dsh-km-kv{display:grid;grid-template-columns:64px 1fr;gap:4px 8px;font-size:12px;margin-bottom:12px}
.dsh-km-kv dt{color:var(--dsw-alias-text-secondary,#57606a)}
.dsh-km-kv dd{margin:0;word-break:break-word}
.dsh-km-section{margin-top:12px;font-size:12px}
.dsh-km-section h4{margin:0 0 5px;font-size:12px;color:var(--dsw-alias-text-secondary,#57606a);font-weight:600}
.dsh-km-section ul{margin:0;padding-left:16px;line-height:1.7}
.dsh-km-section li{word-break:break-word}
.dsh-km-muted{color:var(--dsw-alias-text-secondary,#57606a)}
.dsh-km-entry{display:flex;align-items:center;gap:6px;border:0;background:transparent;color:inherit;font:inherit;cursor:pointer;padding:4px 6px;border-radius:6px}
.dsh-km-entry:hover{background:var(--dsw-alias-bg-hover,#f3f5f7)}
.dsh-km-settings{padding:18px 20px;max-width:760px;overflow:auto;height:100%}
.dsh-km-settings h2{margin:0 0 6px;font-size:16px}
.dsh-km-settings p{line-height:1.7;color:var(--dsw-alias-text-secondary,#57606a)}
.dsh-km-field{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:9px 0;border-bottom:1px solid var(--dsw-alias-border-secondary,#eef0f3)}
.dsh-km-field label{font-size:13px}
.dsh-km-field .dsh-km-input{width:110px}
.dsh-km-ws{border:1px solid var(--dsw-alias-border-secondary,#e5e7eb);border-radius:8px;padding:10px 12px;margin:8px 0}
.dsh-km-ws-title{font-weight:600;font-size:13px}
.dsh-km-ws-path{font-size:11px;color:var(--dsw-alias-text-secondary,#57606a);word-break:break-all;margin:3px 0 6px}
@media (max-width: 980px){.dsh-km-detail{display:none}.dsh-km-list{width:240px}}
`

    function StyleSheet() {
      return h('style', null, CSS)
    }

    /* ------------------------------------------------------------------ *
     * Main knowledge panel
     * ------------------------------------------------------------------ */

    function KmPanel() {
      const [workspaces, setWorkspaces] = useState([])
      const [workspace, setWorkspace] = useState('')
      const [notes, setNotes] = useState([])
      const [mode, setMode] = useState('list')
      const [query, setQuery] = useState('')
      const [status, setStatus] = useState('')
      const [selected, setSelected] = useState(null)
      const [draft, setDraft] = useState(null)
      const [loading, setLoading] = useState(true)
      const [busy, setBusy] = useState(false)
      const [error, setError] = useState('')
      const [notice, setNotice] = useState('')
      const [confirmDelete, setConfirmDelete] = useState(false)
      const requestSeq = useRef(0)

      const loadWorkspaces = useCallback(async () => {
        const data = await request('/workspaces')
        const list = Array.isArray(data.workspaces) ? data.workspaces : []
        setWorkspaces(list)
        let saved = ''
        try {
          saved = window.localStorage.getItem('dsh-km:workspace') || ''
        } catch {
          saved = ''
        }
        const preferred =
          list.find(item => item.path === saved) ||
          list.find(item => item.exists) ||
          list[0]
        if (preferred) setWorkspace(previous => previous || preferred.path)
        return list
      }, [])

      useEffect(() => {
        let cancelled = false
        loadWorkspaces()
          .catch(errorObject => {
            if (!cancelled) setError(errorText(errorObject))
          })
          .finally(() => {
            if (!cancelled) setLoading(false)
          })
        return () => {
          cancelled = true
        }
      }, [loadWorkspaces])

      useEffect(() => {
        if (!workspace) return undefined
        try {
          window.localStorage.setItem('dsh-km:workspace', workspace)
        } catch {
          /* ignore */
        }
        const seq = ++requestSeq.current
        const timer = setTimeout(async () => {
          try {
            const params = new URLSearchParams({ vault: workspace })
            if (query.trim()) params.set('q', query.trim())
            if (status) params.set('status', status)
            const data = await request('/notes?' + params.toString())
            if (seq !== requestSeq.current) return
            setNotes(Array.isArray(data.notes) ? data.notes : [])
            setMode(data.mode || 'list')
            setError('')
          } catch (errorObject) {
            if (seq === requestSeq.current) setError(errorText(errorObject))
          }
        }, query.trim() ? 180 : 0)
        return () => clearTimeout(timer)
      }, [workspace, query, status])

      useEffect(() => {
        if (!notice) return undefined
        const timer = setTimeout(() => setNotice(''), 4000)
        return () => clearTimeout(timer)
      }, [notice])

      const openNote = useCallback(async id => {
        if (!workspace) return
        try {
          const params = new URLSearchParams({ vault: workspace, id })
          const data = await request('/note?' + params.toString())
          const note = data.note
          setSelected(note)
          setConfirmDelete(false)
          setDraft({
            id: note.id,
            title: note.title,
            tags: (note.tags || []).join(', '),
            when: note.when || '',
            body: note.body || '',
            status: note.status,
          })
        } catch (errorObject) {
          setError(errorText(errorObject))
        }
      }, [workspace])

      const reloadNotes = useCallback(async () => {
        if (!workspace) return
        const seq = ++requestSeq.current
        try {
          const params = new URLSearchParams({ vault: workspace })
          if (query.trim()) params.set('q', query.trim())
          if (status) params.set('status', status)
          const data = await request('/notes?' + params.toString())
          if (seq !== requestSeq.current) return
          setNotes(Array.isArray(data.notes) ? data.notes : [])
          setMode(data.mode || 'list')
        } catch (errorObject) {
          setError(errorText(errorObject))
        }
      }, [workspace, query, status])

      const startNew = useCallback(() => {
        setSelected(null)
        setConfirmDelete(false)
        setDraft({ id: '', title: '', tags: '', when: '', body: '', status: 'verified' })
      }, [])

      const save = useCallback(async () => {
        if (!draft || !workspace) return
        if (!draft.title.trim()) {
          setError(t('titleRequired'))
          return
        }
        setBusy(true)
        setError('')
        try {
          const data = await request(
            '/note',
            {
              vault: workspace,
              id: draft.id || undefined,
              title: draft.title.trim(),
              tags: splitTags(draft.tags),
              when: draft.when.trim(),
              body: draft.body,
              status: draft.status,
            },
            'POST',
          )
          setNotice(t('saved'))
          await reloadNotes()
          await loadWorkspaces()
          if (data.note && data.note.id) await openNote(data.note.id)
        } catch (errorObject) {
          setError(errorText(errorObject))
        } finally {
          setBusy(false)
        }
      }, [draft, workspace, reloadNotes, loadWorkspaces, openNote])

      const remove = useCallback(async () => {
        if (!draft || !draft.id || !workspace) return
        if (!confirmDelete) {
          setConfirmDelete(true)
          return
        }
        setBusy(true)
        try {
          await request('/trash', { vault: workspace, id: draft.id }, 'POST')
          setNotice(t('deleted'))
          setSelected(null)
          setDraft(null)
          setConfirmDelete(false)
          await reloadNotes()
          await loadWorkspaces()
        } catch (errorObject) {
          setError(errorText(errorObject))
        } finally {
          setBusy(false)
        }
      }, [draft, workspace, confirmDelete, reloadNotes, loadWorkspaces])

      const currentWorkspace = useMemo(
        () => workspaces.find(item => item.path === workspace) || null,
        [workspaces, workspace],
      )

      const copyId = useCallback(async () => {
        if (!selected) return
        try {
          await navigator.clipboard.writeText(selected.id)
          setNotice(t('copied'))
        } catch {
          setNotice(selected.id)
        }
      }, [selected])

      const statuses = ['', 'draft', 'verified', 'stale']

      return h(
        'div',
        { className: 'dsh-km-root' },
        h(StyleSheet),
        h(
          'header',
          { className: 'dsh-km-head' },
          h('div', { className: 'dsh-km-brand' }, h(BookIcon, { size: 17 }), h('span', null, t('title'))),
          workspaces.length
            ? h(
                'select',
                {
                  className: 'dsh-km-select',
                  value: workspace,
                  onChange: event => {
                    setWorkspace(event.target.value)
                    setSelected(null)
                    setDraft(null)
                  },
                  title: currentWorkspace ? currentWorkspace.path : '',
                },
                workspaces.map(item =>
                  h(
                    'option',
                    { key: item.path, value: item.path },
                    `${item.title} · ${item.exists ? (item.counts ? item.counts.total : 0) : t('noVault')}`,
                  ),
                ),
              )
            : null,
          h('input', {
            className: 'dsh-km-search',
            type: 'search',
            value: query,
            placeholder: t('searchPlaceholder'),
            onChange: event => setQuery(event.target.value),
          }),
          h('button', { className: 'dsh-km-btn', type: 'button', onClick: startNew, disabled: !workspace }, t('newNote')),
          h('button', { className: 'dsh-km-btn', type: 'button', onClick: reloadNotes, disabled: !workspace }, t('refresh')),
        ),
        h(
          'div',
          { className: 'dsh-km-filters' },
          statuses.map(value =>
            h(
              'button',
              {
                key: value || 'all',
                type: 'button',
                className: 'dsh-km-chip',
                'data-active': status === value ? 'true' : 'false',
                onClick: () => setStatus(value),
              },
              value ? t(value) : t('all'),
            ),
          ),
          query.trim() ? h('span', { className: 'dsh-km-muted', style: { marginLeft: 'auto' } }, `${notes.length} ${t('results')}`) : null,
        ),
        error ? h('div', { className: 'dsh-km-error' }, error) : null,
        notice ? h('div', { className: 'dsh-km-notice' }, notice) : null,
        h(
          'div',
          { className: 'dsh-km-body' },
          h(
            'aside',
            { className: 'dsh-km-list' },
            loading ? h('div', { className: 'dsh-km-item-empty' }, '…') : null,
            !loading && !workspaces.length
              ? h('div', { className: 'dsh-km-item-empty' }, t('noWorkspaces'))
              : null,
            !loading && workspaces.length && !notes.length
              ? h('div', { className: 'dsh-km-item-empty' }, query.trim() ? t('emptyList') : t('emptyList'))
              : null,
            notes.map(note =>
              h(
                'button',
                {
                  key: note.id,
                  type: 'button',
                  className: 'dsh-km-item',
                  'data-active': selected && selected.id === note.id ? 'true' : 'false',
                  onClick: () => openNote(note.id),
                },
                h(
                  'div',
                  { className: 'dsh-km-item-head' },
                  h('span', { className: 'dsh-km-item-title' }, note.title),
                  h('span', { className: 'dsh-km-pill', 'data-status': note.status }, t(note.status)),
                ),
                note.when ? h('div', { className: 'dsh-km-item-when' }, note.when) : null,
                h(
                  'div',
                  { className: 'dsh-km-item-meta' },
                  (note.tags || []).slice(0, 4).map(tag => h('span', { key: tag, className: 'dsh-km-tag' }, tag)),
                  h('span', { className: 'dsh-km-time' }, shortTime(note.updated)),
                ),
                note.snippet ? h('div', { className: 'dsh-km-snippet' }, note.snippet) : null,
                note.error ? h('div', { className: 'dsh-km-err-inline' }, note.error) : null,
              ),
            ),
          ),
          h(
            'main',
            { className: 'dsh-km-editor' },
            !draft
              ? h('div', { className: 'dsh-km-editor-empty' }, selected ? t('emptySelection') : t('emptySelection'))
              : h(
                  'div',
                  null,
                  h('input', {
                    className: 'dsh-km-input',
                    value: draft.title,
                    placeholder: t('noteTitle'),
                    onChange: event => setDraft({ ...draft, title: event.target.value }),
                    style: { width: '100%', fontSize: '15px', fontWeight: 600 },
                  }),
                  h('div', { className: 'dsh-km-row', style: { marginTop: '8px' } },
                    h('input', {
                      className: 'dsh-km-input',
                      value: draft.tags,
                      placeholder: t('tags') + ' · ' + t('tagsHint'),
                      onChange: event => setDraft({ ...draft, tags: event.target.value }),
                    }),
                    h(
                      'select',
                      {
                        className: 'dsh-km-select',
                        value: draft.status,
                        onChange: event => setDraft({ ...draft, status: event.target.value }),
                      },
                      ['draft', 'verified', 'stale'].map(value => h('option', { key: value, value }, t(value))),
                    ),
                  ),
                  h('div', { className: 'dsh-km-label' }, t('when')),
                  h('input', {
                    className: 'dsh-km-input',
                    value: draft.when,
                    placeholder: t('whenHint'),
                    onChange: event => setDraft({ ...draft, when: event.target.value }),
                    style: { width: '100%' },
                  }),
                  h('div', { className: 'dsh-km-label' }, t('body')),
                  h('textarea', {
                    className: 'dsh-km-textarea',
                    value: draft.body,
                    onChange: event => setDraft({ ...draft, body: event.target.value }),
                    spellCheck: false,
                  }),
                  h(
                    'div',
                    { className: 'dsh-km-editor-actions' },
                    h('button', { className: 'dsh-km-btn', type: 'button', 'data-primary': 'true', disabled: busy, onClick: save }, busy ? t('saving') : t('save')),
                    h('button', { className: 'dsh-km-btn', type: 'button', disabled: busy, onClick: () => setDraft(null) }, t('cancel')),
                    h('span', { className: 'dsh-km-spacer' }),
                    draft.id
                      ? h(
                          'button',
                          { className: 'dsh-km-btn', type: 'button', 'data-danger': 'true', disabled: busy, onClick: remove },
                          confirmDelete ? t('confirmDelete') : t('delete'),
                        )
                      : null,
                  ),
                  draft.id ? h('div', { className: 'dsh-km-muted', style: { marginTop: '8px' } }, draft.id + ' · ' + (selected ? selected.path : '')) : null,
                ),
          ),
          h(
            'aside',
            { className: 'dsh-km-detail' },
            !selected
              ? h('div', { className: 'dsh-km-detail-empty' }, t('details'))
              : h(
                  'div',
                  null,
                  h('h3', null, t('details')),
                  h(
                    'dl',
                    { className: 'dsh-km-kv' },
                    h('dt', null, t('id')),
                    h('dd', null, selected.id, ' ', h('button', { className: 'dsh-km-btn', type: 'button', onClick: copyId }, t('copy'))),
                    h('dt', null, t('path')),
                    h('dd', null, selected.path),
                    h('dt', null, t('status')),
                    h('dd', null, t(selected.status)),
                    h('dt', null, t('updated')),
                    h('dd', null, selected.updated ? new Date(selected.updated).toLocaleString() : ''),
                  ),
                  h(
                    'div',
                    { className: 'dsh-km-section' },
                    h('h4', null, t('sources')),
                    (selected.sources || []).length
                      ? h(
                          'ul',
                          null,
                          selected.sources.map((source, index) =>
                            h('li', { key: index }, `${source.type}: ${source.ref}${source.locator ? ' (' + source.locator + ')' : ''}`),
                          ),
                        )
                      : h('div', { className: 'dsh-km-muted' }, t('noSources')),
                  ),
                  h(
                    'div',
                    { className: 'dsh-km-section' },
                    h('h4', null, t('links')),
                    (selected.links || []).length
                      ? h('ul', null, selected.links.map(id => h('li', { key: id }, id)))
                      : h('div', { className: 'dsh-km-muted' }, t('noLinks')),
                  ),
                  h(
                    'div',
                    { className: 'dsh-km-section' },
                    h('h4', null, t('backlinks')),
                    (selected.backlinks || []).length
                      ? h('ul', null, selected.backlinks.map(item => h('li', { key: item.id }, `${item.title} (${item.id})`)))
                      : h('div', { className: 'dsh-km-muted' }, t('noBacklinks')),
                  ),
                  h('div', { className: 'dsh-km-section dsh-km-muted' }, t('readOnly')),
                ),
          ),
        ),
      )
    }

    /* ------------------------------------------------------------------ *
     * Settings page
     * ------------------------------------------------------------------ */

    function SettingsPage() {
      const [state, setState] = useState({ loading: true, settings: {}, effective: {}, defaults: {}, workspaces: [] })
      const [error, setError] = useState('')
      const [notice, setNotice] = useState('')
      const [saving, setSaving] = useState(false)

      const load = useCallback(async () => {
        const [settings, workspaceData] = await Promise.all([request('/settings'), request('/workspaces')])
        setState({
          loading: false,
          settings: settings.settings || {},
          effective: settings.effective || {},
          defaults: settings.defaults || {},
          workspaces: workspaceData.workspaces || [],
        })
      }, [])

      useEffect(() => {
        let cancelled = false
        load().catch(errorObject => {
          if (!cancelled) {
            setError(errorText(errorObject))
            setState(previous => ({ ...previous, loading: false }))
          }
        })
        return () => {
          cancelled = true
        }
      }, [load])

      const setKey = (key, value) => setState(previous => ({ ...previous, settings: { ...previous.settings, [key]: value } }))

      const save = useCallback(async () => {
        setSaving(true)
        setError('')
        try {
          await request('/settings', state.settings, 'POST')
          setNotice(t('savedSettings'))
          await load()
        } catch (errorObject) {
          setError(errorText(errorObject))
        } finally {
          setSaving(false)
        }
      }, [state.settings, load])

      const rebuild = useCallback(async workspacePath => {
        try {
          await request('/rebuild', { vault: workspacePath }, 'POST')
          setNotice(t('rebuilt'))
          await load()
        } catch (errorObject) {
          setError(errorText(errorObject))
        }
      }, [load])

      const effective = state.effective || {}

      return h(
        'div',
        { className: 'dsh-km-settings' },
        h(StyleSheet),
        h('h2', null, t('settingsTitle')),
        h('p', null, t('settingsIntro')),
        error ? h('div', { className: 'dsh-km-error' }, error) : null,
        notice ? h('div', { className: 'dsh-km-notice' }, notice) : null,
        state.loading
          ? h('p', null, '…')
          : h(
              'div',
              null,
              h(
                'div',
                { className: 'dsh-km-field' },
                h('label', null, t('autoCreate')),
                h('input', {
                  type: 'checkbox',
                  checked: state.settings.autoCreate ?? effective.autoCreate ?? true,
                  onChange: event => setKey('autoCreate', event.target.checked),
                }),
              ),
              h(
                'div',
                { className: 'dsh-km-field' },
                h('label', null, t('watch')),
                h('input', {
                  type: 'checkbox',
                  checked: state.settings.watch ?? effective.watch ?? true,
                  onChange: event => setKey('watch', event.target.checked),
                }),
              ),
              h(
                'div',
                { className: 'dsh-km-field' },
                h('label', null, t('searchTopK')),
                h('input', {
                  className: 'dsh-km-input',
                  type: 'number',
                  min: 1,
                  max: 50,
                  value: state.settings.searchTopK ?? effective.searchTopK ?? 8,
                  onChange: event => setKey('searchTopK', Number(event.target.value)),
                }),
              ),
              h(
                'div',
                { className: 'dsh-km-field' },
                h('label', null, t('maxResultChars')),
                h('input', {
                  className: 'dsh-km-input',
                  type: 'number',
                  min: 500,
                  max: 40000,
                  value: state.settings.maxResultChars ?? effective.maxResultChars ?? 6000,
                  onChange: event => setKey('maxResultChars', Number(event.target.value)),
                }),
              ),
              h(
                'div',
                { style: { marginTop: '12px' } },
                h('button', { className: 'dsh-km-btn', type: 'button', 'data-primary': 'true', disabled: saving, onClick: save }, saving ? t('saving') : t('saveSettings')),
              ),
              h('h3', { style: { marginTop: '22px' } }, t('vaults')),
              state.workspaces.map(item =>
                h(
                  'div',
                  { key: item.path, className: 'dsh-km-ws' },
                  h('div', { className: 'dsh-km-ws-title' }, `${item.title}${item.counts ? ' · ' + item.counts.total + ' ' + t('notes') : ''}`),
                  h('div', { className: 'dsh-km-ws-path' }, item.path),
                  h(
                    'div',
                    { className: 'dsh-km-muted', style: { fontSize: '12px', marginBottom: '6px' } },
                    item.exists ? `${item.vault}` : t('noVault'),
                  ),
                  h('button', { className: 'dsh-km-btn', type: 'button', onClick: () => rebuild(item.path) }, t('rebuild')),
                ),
              ),
              h('p', { style: { marginTop: '18px' } }, t('about')),
            ),
      )
    }

    /* ------------------------------------------------------------------ *
     * Plugin definition
     * ------------------------------------------------------------------ */

    return {
      inject: ['slots', 'locale'],
      apply(ctx) {
        try {
          const bound = ctx.locale.bind('dsh-km')
          translate = key => {
            try {
              return bound(key)
            } catch {
              return DICT.en[key] ?? key
            }
          }
        } catch {
          translate = key => DICT.en[key] ?? key
        }

        for (const [language, dictionary] of Object.entries(DICT)) {
          ctx.effect(() => ctx.locale.register('dsh-km', language, dictionary))
        }

        const Entry = () => {
          const open = () => {
            const layout = ctx.get ? ctx.get('layout') : ctx.layout
            if (layout && typeof layout.selectPanel === 'function') layout.selectPanel('dsh-km')
          }
          return h(
            'button',
            { className: 'dsh-km-entry', type: 'button', onClick: open, title: t('openPanel') },
            h(BookIcon, { size: 16 }),
            h('span', null, t('entryLabel')),
          )
        }

        ctx.effect(() =>
          ctx.slots.inject('sidebar.footer.action', () =>
            ctx.slots.register(
              { name: 'sidebar.footer.action', id: 'dsh-km', order: 20, label: () => t('entryLabel') },
              Entry,
            ),
          ),
        )

        ctx.effect(() =>
          ctx.slots.inject('main', () =>
            ctx.slots.register({ name: 'main', key: 'dsh-km' }, KmPanel),
          ),
        )

        ctx.effect(() =>
          ctx.slots.inject('settings.section', () =>
            ctx.slots.register(
              { name: 'settings.section', id: 'dsh-km', order: 30, label: () => t('settingsTitle') },
              SettingsPage,
            ),
          ),
        )
      },
    }
  },
})
