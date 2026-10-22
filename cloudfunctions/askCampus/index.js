/**
 * 云函数：AI 校园问答
 *
 * 【架构】
 *   小程序 → 云函数（持有 API Key） → 大模型 API → 原路返回
 *
 * 【为什么必须走云函数】
 * 大模型的 API Key 一旦出现在前端，反编译就能拿到，别人可以刷爆你的额度。
 * 云函数运行在服务器上，Key 存在环境变量里，前端永远看不到。
 *
 * 【用哪个模型】
 * 默认 DeepSeek，接口兼容 OpenAI 协议。
 * 换供应商只需要改环境变量，不用改代码：
 *   LLM_HOST  api.deepseek.com
 *   LLM_PATH  /chat/completions
 *   LLM_MODEL deepseek-chat
 *
 * 【环境变量怎么配】
 * 云开发控制台 → 云函数 → askCampus → 配置 → 环境变量
 * 新增 LLM_API_KEY，值是你的 Key。然后点「保存」并重新部署。
 */

const cloud = require('wx-server-sdk')
const https = require('https')
const { buildSystemPrompt } = require('./knowledge')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const DEFAULT_HOST = 'api.deepseek.com'
const DEFAULT_PATH = '/chat/completions'
const DEFAULT_MODEL = 'deepseek-chat'

const MAX_QUESTION_LENGTH = 200
const TIMEOUT_MS = 15000

/**
 * 发一个 HTTPS POST。
 * 用 Node 内置的 https 而不是第三方库：云函数依赖越少，部署越快、越不容易出问题。
 */
function postJson(options) {
  return new Promise(function (resolve, reject) {
    const payload = JSON.stringify(options.body)

    const req = https.request(
      {
        hostname: options.host,
        path: options.path,
        method: 'POST',
        timeout: TIMEOUT_MS,
        headers: Object.assign(
          {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(payload)
          },
          options.headers || {}
        )
      },
      function (res) {
        let raw = ''
        res.setEncoding('utf8')
        res.on('data', function (chunk) {
          raw += chunk
        })
        res.on('end', function () {
          let json = null
          try {
            json = JSON.parse(raw)
          } catch (e) {
            json = null
          }
          resolve({ status: res.statusCode, raw: raw, json: json })
        })
      }
    )

    // 没有超时保护的请求会一直挂着，把云函数实例耗死
    req.on('timeout', function () {
      req.destroy(new Error('请求大模型超时'))
    })
    req.on('error', reject)

    req.write(payload)
    req.end()
  })
}

exports.main = async function (event) {
  const question = String((event && event.question) || '').trim()

  if (!question) {
    return { error: '问题不能为空' }
  }
  if (question.length > MAX_QUESTION_LENGTH) {
    return { error: '问题太长了，精简到 200 字以内再问' }
  }

  const apiKey = process.env.LLM_API_KEY
  if (!apiKey) {
    return { error: '云函数未配置 LLM_API_KEY 环境变量' }
  }

  const host = process.env.LLM_HOST || DEFAULT_HOST
  const path = process.env.LLM_PATH || DEFAULT_PATH
  const model = process.env.LLM_MODEL || DEFAULT_MODEL

  try {
    const res = await postJson({
      host: host,
      path: path,
      headers: { Authorization: 'Bearer ' + apiKey },
      body: {
        model: model,
        messages: [
          { role: 'system', content: buildSystemPrompt() },
          { role: 'user', content: question }
        ],
        temperature: 0.3,
        max_tokens: 400,
        stream: false
      }
    })

    if (res.status !== 200) {
      // 只记前 300 个字符，避免把整段响应写进日志（可能含敏感信息）
      console.error('[askCampus] 上游异常', res.status, String(res.raw).slice(0, 300))
      return { error: 'AI 服务返回异常（HTTP ' + res.status + '）' }
    }

    const data = res.json || {}
    const choice = data.choices && data.choices[0]
    const content = choice && choice.message && choice.message.content

    if (!content || !String(content).trim()) {
      return { error: 'AI 没有返回内容' }
    }

    return {
      answer: String(content).trim(),
      model: model,
      usage: data.usage || null
    }
  } catch (err) {
    console.error('[askCampus] 调用失败', err)
    return { error: (err && err.message) || '调用失败' }
  }
}
