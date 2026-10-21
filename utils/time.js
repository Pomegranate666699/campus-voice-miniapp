/**
 * 时间格式化工具
 *
 * 【为什么单独抽出来】
 * "刚发布"→"3 分钟前"→"3 天前"这套逻辑，校园墙、问答记录都要用。
 * 如果每个页面各写一遍，改一处就要改两处，最后必然不一致。
 */

const MINUTE = 60 * 1000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

/**
 * 把各种形态的时间统一成毫秒时间戳。
 * 云数据库返回的是 Date 对象，本地存的是数字，传参时还可能是字符串。
 */
function toTimestamp(value) {
  if (!value) return 0
  if (value instanceof Date) return value.getTime()
  if (typeof value === 'number') return value
  const parsed = new Date(value).getTime()
  return Number.isNaN(parsed) ? 0 : parsed
}

/** 相对时间：刚刚 / 12 分钟前 / 3 小时前 / 2 天前 / 10月8日 */
function fromNow(value) {
  const ts = toTimestamp(value)
  if (!ts) return ''
  const diff = Date.now() - ts

  if (diff < 0) return '刚刚'
  if (diff < MINUTE) return '刚刚'
  if (diff < HOUR) return Math.floor(diff / MINUTE) + ' 分钟前'
  if (diff < DAY) return Math.floor(diff / HOUR) + ' 小时前'
  if (diff < 7 * DAY) return Math.floor(diff / DAY) + ' 天前'

  const d = new Date(ts)
  return (d.getMonth() + 1) + '月' + d.getDate() + '日'
}

module.exports = { fromNow, toTimestamp }
