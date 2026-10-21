/**
 * 云函数：内容安全检测
 *
 * 【为什么必须放在云函数里】
 * 检测接口要用小程序的 access_token，而这个凭证绝对不能放在前端代码里
 * （反编译就能看到）。云函数运行在服务器上，天然安全。
 * 这是面试常问的一道题：「敏感操作为什么不能放前端？」
 *
 * 【部署方法】
 * 1. 在开发者工具里右键 cloudfunctions/msgSecCheck →「上传并部署：云端安装依赖」
 * 2. 部署完成后，把 config.js 里的 requireContentCheck 改成 true
 */

const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

exports.main = async (event) => {
  const content = String(event.content || '').trim()
  if (!content) {
    return { pass: false, reason: '内容不能为空' }
  }

  const { OPENID } = cloud.getWXContext()

  try {
    // 云调用：不用自己管 access_token，平台会代劳
    const res = await cloud.openapi.security.msgSecCheck({
      content: content,
      version: 2,
      scene: 2,
      openid: OPENID
    })

    const result = (res && res.result) || {}
    const suggest = result.suggest || 'pass'

    return {
      pass: suggest !== 'risky',
      suggest: suggest,
      label: result.label || 0
    }
  } catch (err) {
    // 87014：内容含有违法违规内容
    if (err && (err.errCode === 87014 || err.errCode === '87014')) {
      return { pass: false, suggest: 'risky', reason: '内容含违规信息' }
    }

    console.error('[msgSecCheck] 调用失败', err)
    // 检测服务本身出错时放行，避免因为第三方故障导致用户发不出内容。
    // 想更严格就改成 pass: false。
    return { pass: true, skipped: true, error: (err && err.errCode) || 'unknown' }
  }
}
