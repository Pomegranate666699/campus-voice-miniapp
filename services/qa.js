/**
 * 问答服务
 *
 * 【三层回退】
 *   1. AI        —— 云端可用时，走大模型，能回答知识库没收录的问题
 *   2. 本地知识库 —— AI 挂了 / 没配 Key / 网络差，用关键词规则兜住
 *   3. 兜底提示   —— 连关键词都没命中，给一段引导语，而不是空白或报错
 *
 * 这个设计的意义：AI 依赖外部服务，它一定会挂。
 * 会挂不要紧，关键是挂了之后用户还能不能用。
 * 这叫「优雅降级」（graceful degradation），是生产系统的标配。
 */

const config = require('../config')
const local = require('../utils/campus-qa')

function sourceLabel(source) {
  if (source === 'ai') return 'AI 生成'
  if (source === 'local') return '本地知识库'
  return '兜底提示'
}

/** 第 2、3 层：本地关键词匹配 */
function askLocal(question) {
  const hit = local.answerFor(question)
  return {
    answer: hit || local.fallbackAnswer,
    source: hit ? 'local' : 'fallback',
    degraded: false
  }
}

/** 第 1 层：调用云函数走大模型 */
function askCloud(question) {
  return new Promise(function (resolve, reject) {
    if (!wx.cloud) {
      reject(new Error('当前环境不支持云开发'))
      return
    }

    wx.cloud.callFunction({
      name: config.askFunction,
      data: { question: question },
      success: function (res) {
        const result = (res && res.result) || {}
        if (result.error) {
          reject(new Error(result.error))
          return
        }
        if (!result.answer) {
          reject(new Error('AI 没有返回内容'))
          return
        }
        resolve({
          answer: result.answer,
          source: 'ai',
          degraded: false
        })
      },
      fail: function (err) {
        reject(new Error((err && err.errMsg) || '云函数调用失败'))
      }
    })
  })
}

/**
 * 统一入口：页面只调这一个方法。
 * 不管底下是 AI 还是本地，返回结构都一样，页面不需要写 if/else。
 */
function ask(question) {
  const q = String(question || '').trim()

  if (!q) {
    return Promise.resolve({ answer: '', source: 'local', degraded: false })
  }

  // 本地模式或手动关掉 AI：直接用知识库，不发任何请求
  if (config.mode !== 'cloud' || !config.useAI) {
    return Promise.resolve(askLocal(q))
  }

  return askCloud(q).catch(function (err) {
    console.warn('[qa] AI 不可用，已降级到本地知识库：', err.message)
    const result = askLocal(q)
    result.degraded = true
    result.reason = err.message
    return result
  })
}

module.exports = { ask, sourceLabel }
