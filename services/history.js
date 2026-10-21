/**
 * 问答历史（本地存储）
 *
 * 【为什么放本地】
 * 问答记录属于个人数据，量小、只自己看，没必要建数据库表。
 * 能放本地就放本地，是节约成本也是最简单的做法。
 */

const KEY = 'cv_history_v3'
const MAX = 30

function list() {
  try {
    const saved = wx.getStorageSync(KEY)
    return Array.isArray(saved) ? saved : []
  } catch (e) {
    return []
  }
}

function add(entry) {
  if (!entry || !entry.question) return list()

  const item = {
    id: entry.id || 'h_' + Date.now().toString(36),
    question: String(entry.question).slice(0, 200),
    answer: String(entry.answer || '').slice(0, 500),
    createdAt: entry.createdAt || Date.now()
  }

  const next = [item].concat(list()).slice(0, MAX)
  try {
    wx.setStorageSync(KEY, next)
  } catch (e) {}
  return next
}

function clear() {
  try {
    wx.removeStorageSync(KEY)
  } catch (e) {}
  return []
}

module.exports = { list, add, clear, MAX }
