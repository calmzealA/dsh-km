import assert from 'node:assert/strict'
import test from 'node:test'

import { tokenize } from '../lib/tokenize.js'

test('indexes CJK as bigrams', () => {
  assert.deepEqual(tokenize('知识管理'), ['知识', '识管', '管理'])
})

test('keeps a single CJK character', () => {
  assert.deepEqual(tokenize('库'), ['库'])
})

test('splits Latin and mixed text', () => {
  assert.deepEqual(tokenize('DeepSeek Harness，知识库'), ['deepseek', 'harness', '知识', '识库'])
})

test('normalizes full width and case', () => {
  assert.deepEqual(tokenize('ＤＳＨ'), ['dsh'])
  assert.deepEqual(tokenize('BM25 检索'), ['bm25', '检索'])
})
