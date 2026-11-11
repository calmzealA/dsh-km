const CJK_RANGE = /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\uac00-\ud7af]/

export function normalizeText(value) {
  return String(value ?? '').normalize('NFKC').toLowerCase()
}

export function isCjk(char) {
  return CJK_RANGE.test(char)
}

/**
 * CJK text is indexed as character bigrams (single characters for one-char
 * runs), Latin/digit text as lowercased runs. This keeps retrieval useful
 * without a segmenter or a model.
 */
export function tokenize(value) {
  const text = normalizeText(value)
  const chars = Array.from(text)
  const tokens = []
  let latin = ''
  const flush = () => {
    if (latin) {
      tokens.push(latin)
      latin = ''
    }
  }
  for (let i = 0; i < chars.length; i++) {
    const char = chars[i]
    if (isCjk(char)) {
      flush()
      let end = i
      let run = ''
      while (end < chars.length && isCjk(chars[end])) {
        run += chars[end]
        end++
      }
      const runChars = Array.from(run)
      if (runChars.length === 1) tokens.push(runChars[0])
      else for (let k = 0; k < runChars.length - 1; k++) tokens.push(runChars[k] + runChars[k + 1])
      i = end - 1
    } else if (/[a-z0-9]/.test(char)) {
      latin += char
    } else {
      flush()
    }
  }
  flush()
  return tokens
}

export function uniqueTokens(value) {
  const seen = new Set()
  const result = []
  for (const token of tokenize(value)) {
    if (seen.has(token)) continue
    seen.add(token)
    result.push(token)
  }
  return result
}

export function tokenCounts(tokens) {
  const counts = new Map()
  for (const token of tokens) counts.set(token, (counts.get(token) ?? 0) + 1)
  return counts
}
