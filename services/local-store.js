/**
 * 数据层 · 本地实现
 *
 * 【这个文件解决什么问题】
 * 改造前，帖子数据直接写在 wall.js 顶部一个数组里，
 * 想加"发布"功能根本无从下手，因为数组是常量。
 *
 * 现在页面只调用 store.listPosts() / store.createPost() 这样的方法，
 * 完全不关心数据存在哪。数据层换实现，页面一行都不用改。
 *
 * 本地实现用 wx.setStorageSync，把数据存在手机上。
 * 换台手机数据就没了 —— 这正是它只适合演示的原因。
 */

const auth = require('./auth')
const config = require('../config')
const time = require('../utils/time')

const KEY_POSTS = 'cv_posts_v3'
const KEY_LIKES = 'cv_likes_v3'

// 故意加一点延迟，让"加载中"状态真的能被看到。
// 真实网络请求本来就有延迟，本地模式假装一下，界面才不会"闪一下就出来"。
const LATENCY = 120

const CATEGORIES = ['日常', '校园活动', '失物招领', '二手集市']

const MINUTE = 60 * 1000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

function delay(ms) {
  return new Promise(function (resolve) {
    setTimeout(resolve, ms)
  })
}

/* ------------------------------ 种子数据 ------------------------------ */

function buildSeed() {
  const now = Date.now()
  const rows = [
    ['林同学', '校园活动', '本周五晚 7 点操场有社团迎新活动，欢迎大家来认识新朋友。', 5 * MINUTE, '林', ''],
    ['陈同学', '失物招领', '在图书馆门口捡到一张校园卡，请失主到学生事务中心领取。', 12 * MINUTE, '陈', 'blue'],
    ['周同学', '二手集市', '九成新的计算器和专业课教材，毕业整理，校内可以面交。', 38 * MINUTE, '周', 'amber'],
    ['吴同学', '日常', '图书馆三楼靠窗的位置下午有太阳，适合写作业，就是有点吵。', 1 * HOUR, '吴', ''],
    ['郑同学', '校园活动', '院系篮球赛周六开打，还缺两个替补，有想打的联系我。', 3 * HOUR, '郑', 'blue'],
    ['孙同学', '日常', '二食堂新开了个面档，八块钱一碗，量挺足，排队大概十分钟。', 5 * HOUR, '孙', ''],
    ['黄同学', '失物招领', '在实训楼 302 捡到一副白色耳机，放在讲台上了。', 8 * HOUR, '黄', 'amber'],
    ['赵同学', '二手集市', '出 24 寸显示器，无坏点，宿舍自提，价格私聊。', 1 * DAY, '赵', ''],
    ['钱同学', '日常', '早八真的太难了，有没有一起打卡互相监督的。', 2 * DAY, '钱', 'blue'],
    ['周同学', '校园活动', '下周三下午有就业指导讲座，讲简历和面试，建议大三的都去。', 3 * DAY, '周', ''],
    ['李同学', '日常', '宿舍空调维修登记在楼下值班室，别再往群里发了，师傅看不到。', 4 * DAY, '李', 'amber'],
    ['王同学', '二手集市', '毕业出一辆山地车，骑了两年，链条新换的，三百带走。', 5 * DAY, '王', ''],
    ['冯同学', '失物招领', '在体育馆捡到一串钥匙，挂了个小熊挂件，认领请联系。', 6 * DAY, '冯', 'blue']
  ]

  return rows.map(function (row, index) {
    return {
      id: 'seed_' + (index + 1),
      authorId: 'seed_' + (index + 1),
      author: row[0],
      category: row[1],
      content: row[2],
      createdAt: now - row[3],
      initial: row[4],
      tone: row[5]
    }
  })
}

/* ------------------------------ 读写 ------------------------------ */

function readPosts() {
  try {
    const saved = wx.getStorageSync(KEY_POSTS)
    if (Array.isArray(saved) && saved.length) return saved
  } catch (e) {}

  const seeded = buildSeed()
  writePosts(seeded)
  return seeded
}

function writePosts(posts) {
  try {
    wx.setStorageSync(KEY_POSTS, posts)
  } catch (e) {}
}

function readLikes() {
  try {
    const saved = wx.getStorageSync(KEY_LIKES)
    if (saved && typeof saved === 'object' && !Array.isArray(saved)) return saved
  } catch (e) {}
  return {}
}

function writeLikes(map) {
  try {
    wx.setStorageSync(KEY_LIKES, map)
  } catch (e) {}
}

/* ------------------------------ 视图模型 ------------------------------ */

/**
 * 把"存储里的数据"转成"页面直接能用的数据"。
 * 页面不应该自己算"这条我点过赞吗"，那是数据层的活。
 */
function toViewModel(post, likesMap, meId) {
  const likedBy = likesMap[post.id] || []
  return {
    id: post.id,
    authorId: post.authorId,
    author: post.author,
    initial: post.initial || '同',
    tone: post.tone || '',
    content: post.content,
    category: post.category,
    createdAt: post.createdAt,
    time: time.fromNow(post.createdAt),
    likes: likedBy.length,
    liked: likedBy.indexOf(meId) >= 0,
    mine: post.authorId === meId
  }
}

/* ------------------------------ 对外接口 ------------------------------ */

function listPosts(options) {
  const opt = options || {}
  const page = Math.max(0, opt.page || 0)
  const size = opt.size || config.pageSize
  const keyword = String(opt.keyword || '').trim().toLowerCase()
  const category = opt.category || 'all'

  return delay(LATENCY).then(function () {
    const me = auth.getMe()
    const likesMap = readLikes()

    const filtered = readPosts()
      .filter(function (post) {
        if (category !== 'all' && post.category !== category) return false
        if (!keyword) return true
        const haystack = (post.content + post.author + post.category).toLowerCase()
        return haystack.indexOf(keyword) >= 0
      })
      .sort(function (a, b) {
        return b.createdAt - a.createdAt
      })

    const start = page * size
    const slice = filtered.slice(start, start + size)

    return {
      items: slice.map(function (post) {
        return toViewModel(post, likesMap, me.id)
      }),
      hasMore: start + size < filtered.length,
      total: filtered.length
    }
  })
}

function createPost(input) {
  const content = String((input && input.content) || '').trim()

  return delay(LATENCY).then(function () {
    if (!content) throw new Error('内容不能为空')

    const me = auth.getMe()
    const posts = readPosts()

    const post = {
      id: 'p_' + Date.now().toString(36),
      authorId: me.id,
      author: me.nickname,
      initial: me.initial || '同',
      tone: me.tone || '',
      content: content.slice(0, 500),
      category: (input && input.category) || '日常',
      createdAt: Date.now()
    }

    writePosts([post].concat(posts))
    return toViewModel(post, readLikes(), me.id)
  })
}

function removePost(postId) {
  return delay(LATENCY).then(function () {
    const me = auth.getMe()
    const posts = readPosts()
    const target = posts.filter(function (post) {
      return post.id === postId
    })[0]

    // 只允许删自己的。注意：前端判断只是体验，真正的拦截在云端权限规则。
    if (!target) throw new Error('这条动态已经不存在了')
    if (target.authorId !== me.id) throw new Error('只能删除自己发布的内容')

    writePosts(posts.filter(function (post) {
      return post.id !== postId
    }))

    const likes = readLikes()
    delete likes[postId]
    writeLikes(likes)

    return true
  })
}

function toggleLike(postId) {
  return delay(Math.max(40, Math.round(LATENCY / 2))).then(function () {
    const me = auth.getMe()
    const map = readLikes()
    const users = map[postId] || []
    const index = users.indexOf(me.id)

    if (index >= 0) users.splice(index, 1)
    else users.push(me.id)

    map[postId] = users
    writeLikes(map)

    return { liked: index < 0, likes: users.length }
  })
}

function getMyStats() {
  const me = auth.getMe()
  const myPosts = readPosts().filter(function (post) {
    return post.authorId === me.id
  })
  const map = readLikes()
  let likes = 0
  Object.keys(map).forEach(function (postId) {
    if (map[postId].indexOf(me.id) >= 0) likes += 1
  })

  return Promise.resolve({ posts: myPosts.length, likes: likes })
}

module.exports = {
  mode: 'local',
  CATEGORIES: CATEGORIES,
  listPosts: listPosts,
  createPost: createPost,
  removePost: removePost,
  toggleLike: toggleLike,
  getMyStats: getMyStats
}
