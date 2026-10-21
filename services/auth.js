/**
 * 用户身份（登录）
 *
 * 【改造前的问题】
 * 项目里没有任何登录，不知道"这条动态是谁发的"，
 * 面试官第一句问「用户体系怎么做」就直接卡住。
 *
 * 【这里怎么做】
 * 小程序不用账号密码。我们给每台设备生成一个稳定 ID，存本地，
 * 之后再接微信真正的 openid（云开发会自动给每条数据打 _openid）。
 *
 * 注意：本地 ID 只是"显示用"的身份，谁都能改。
 * 真正的安全边界在数据库权限规则（见 README）。
 */

const KEY_ME = 'cv_me_v3'

function randomDigits() {
  return String(Math.floor(1000 + Math.random() * 9000))
}

function defaultMe() {
  return {
    id: 'u_' + Date.now().toString(36) + randomDigits(),
    nickname: '同学' + randomDigits(),
    initial: '同',
    tone: ''
  }
}

function readRaw() {
  try {
    const saved = wx.getStorageSync(KEY_ME)
    return saved && saved.id ? saved : null
  } catch (e) {
    return null
  }
}

function writeRaw(me) {
  try {
    wx.setStorageSync(KEY_ME, me)
  } catch (e) {
    // 存储写失败不影响本次使用，静默降级
  }
}

/** 读取当前用户，第一次进来会自动生成一个 */
function getMe() {
  const saved = readRaw()
  if (saved) return saved
  const me = defaultMe()
  writeRaw(me)
  return me
}

/** 修改用户信息（昵称），返回新的用户对象 */
function updateMe(patch) {
  const next = Object.assign({}, getMe(), patch || {})
  if (patch && typeof patch.nickname === 'string') {
    const name = patch.nickname.trim().slice(0, 12)
    if (name) {
      next.nickname = name
      next.initial = name.charAt(0)
    }
  }
  writeRaw(next)
  return next
}

module.exports = { getMe, updateMe }
