/**
 * 云函数：内容安全检测（直连版）
 *
 * 【为什么不用 cloud.openapi 云调用】
 * 云调用依赖平台代管的 access_token，当前环境一直返回
 * -501001 invalid wx openapi access_token，属于环境侧问题，改代码解决不了。
 *
 * 所以改成自己用 appid + secret 换 token，链路完全自己控制，
 * 也不再依赖平台的云调用能力。这和 askCampus 调大模型是同一个套路。
 *
 * 【需要配置的环境变量】
 *   WX_APPID    小程序 AppID
 *   WX_SECRET   小程序 AppSecret
 *              在 mp.weixin.qq.com → 开发管理 → 开发设置 里生成
 *
 * ⚠️ AppSecret 是最高级别的凭证，泄露等于小程序被接管。
 *    只能放在云函数环境变量里，绝不能出现在前端代码或 Git 中。
 *
 * 【部署】
 * 1. 云函数 msgSecCheck → 配置 → 环境变量，添加上面两个
 * 2. 右键 cloudfunctions/msgSecCheck →「上传并部署：云端安装依赖」
 * 3. config.js 里把 requireContentCheck 改成 true
 */

const cloud = require('wx-server-sdk')
const https = require('https')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const API_HOST = 'api.weixin.qq.com'
const TIMEOUT_MS = 8000

/**
 * access_token 有效期 7200 秒，但云函数实例会复用，
 * 所以放模块级缓存里，避免每次请求都去换一次（否则会被限频）。
 */
let tokenCache = {
  value: '',
  expireAt: 0
}

/** 发一个 HTTPS 请求，统一处理超时和错误 */
function request(options) {
  return new Promise(function (resolve, reject) {
    const payload = options.body ? JSON.stringify(options.body) : null

    const req = https.request(
      {
        hostname: options.host,
        path: options.path,
        method: options.method || 'GET',
        timeout: TIMEOUT_MS,
        headers: Object.assign(
          { 'Content-Type': 'application/json' },
          payload ? { 'Content-Length': Buffer.byteLength(payload) } : {},
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
      req.destroy(new Error('请求微信接口超时'))
    })
    req.on('error', reject)

    if (payload) req.write(payload)
    req.end()
  })
}

/** 用 appid + secret 换 access_token（带缓存） */
async function getAccessToken(appid, secret) {
  const now = Date.now()

  // 提前 60 秒过期，避免临界点拿到刚失效的 token
  if (tokenCache.value && tokenCache.expireAt > now + 60 * 1000) {
    return tokenCache.value
  }

  const path =
    '/cgi-bin/token?grant_type=client_credential' +
    '&appid=' + encodeURIComponent(appid) +
    '&secret=' + encodeURIComponent(secret)

  const res = await request({ host: API_HOST, path: path, method: 'GET' })
  const data = res.json || {}

  if (!data.access_token) {
    throw new Error(
      '获取 access_token 失败：' + (data.errcode || '') + ' ' + (data.errmsg || '未知错误')
    )
  }

  tokenCache.value = data.access_token
  tokenCache.expireAt = now + (data.expires_in || 7200) * 1000
  return tokenCache.value
}

exports.main = async function (event) {
  const content = String((event && event.content) || '').trim()

  if (!content) {
    return { pass: false, reason: '内容不能为空' }
  }

  const appid = process.env.WX_APPID
  const secret = process.env.WX_SECRET
  if (!appid || !secret) {
    return { pass: true, skipped: true, error: '云函数未配置 WX_APPID / WX_SECRET' }
  }

  const { OPENID } = cloud.getWXContext()

  try {
    const token = await getAccessToken(appid, secret)

    // 控制台「云端测试」没有真实用户身份，拿不到 openid；
    // 而 v2 接口强制要求 openid，所以这里直接返回，并用 tokenOk 证明换 token 是通的。
    if (!OPENID) {
      return {
        pass: true,
        skipped: true,
        tokenOk: true,
        error: '缺少 openid（控制台测试无用户身份，请在小程序内验证）'
      }
    }

    const res = await request({
      host: API_HOST,
      path: '/wxa/msg_sec_check?access_token=' + token,
      method: 'POST',
      body: {
        content: content,
        version: 2,
        scene: 2,
        openid: OPENID || ''
      }
    })

    const data = res.json || {}

    // token 失效（40001）或被重置（42001）：清缓存，下次重新换
    if (data.errcode === 40001 || data.errcode === 42001) {
      tokenCache.expireAt = 0
      return { pass: true, skipped: true, error: data.errcode, message: data.errmsg }
    }

    // 87014：内容含违规信息
    if (data.errcode === 87014) {
      return { pass: false, suggest: 'risky', reason: '内容含违规信息' }
    }

    if (data.errcode && data.errcode !== 0) {
      console.warn('[msgSecCheck] 接口返回异常', data.errcode, data.errmsg)
      return { pass: true, skipped: true, error: data.errcode, message: data.errmsg }
    }

    const result = data.result || {}
    return {
      pass: result.suggest !== 'risky',
      suggest: result.suggest || 'pass',
      label: result.label || 0
    }
  } catch (err) {
    console.error('[msgSecCheck] 调用失败', err)
    // 检测服务本身出错时放行，避免因为第三方故障导致用户发不出内容。
    // 要更严格就改成 pass: false。
    return { pass: true, skipped: true, error: (err && err.message) || 'unknown' }
  }
}
