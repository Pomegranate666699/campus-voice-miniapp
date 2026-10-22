/**
 * 数据层 · 云开发实现
 *
 * 和 local-store 暴露完全相同的方法签名，
 * 所以页面代码不需要知道数据到底存在本地还是云端。
 *
 * 【两个集合】
 *   posts  动态正文       权限：所有用户可读，仅创建者可写
 *   likes  点赞记录       权限：所有用户可读，仅创建者可写
 *
 * 【为什么点赞要单独一张表】
 * 如果把点赞数直接存在 posts 里，别人给你点赞时就要改你的帖子，
 * 而权限规则不允许"改别人的数据"，所以只能把点赞做成独立记录，
 * 谁的点赞谁创建，天然符合权限，也不需要服务端参与。
 */

const auth = require('./auth')
const config = require('../config')
const time = require('../utils/time')

const COL_POSTS = 'posts'
const COL_LIKES = 'likes'
const COL_COMMENTS = 'comments'
const CATEGORIES = ['日常', '校园活动', '失物招领', '二手集市']

const COMMENT_PAGE_SIZE = 10

/** 用户输入的关键词要转义，否则输入 "." 会把所有内容都匹配上 */
function escapeRegExp(text) {
  return String(text).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function db() {
  if (!wx.cloud) {
    throw new Error('当前环境不支持云开发，请升级微信开发者工具或基础库')
  }
  return wx.cloud.database()
}

/** 把数据库的英文报错翻译成"用户看得懂、你知道怎么修"的中文 */
function friendlyError(err) {
  const code = err && err.errCode
  const message = (err && (err.errMsg || err.message)) || '未知错误'

  if (code === -502005 || message.indexOf('collection not exists') >= 0) {
    return '数据库集合还没创建，请先在云开发控制台创建 posts 和 likes 两个集合'
  }
  if (code === -502003 || message.indexOf('permission') >= 0 || message.indexOf('无权限') >= 0) {
    return '没有数据库权限，请检查集合的权限规则是否为「所有用户可读，仅创建者可写」'
  }
  return message
}

/** 读取一批帖子的点赞情况 */
async function fetchLikes(ids, database) {
  const map = {}
  try {
    const _ = database.command
    const res = await database
      .collection(COL_LIKES)
      .where({ postId: _.in(ids) })
      .limit(100)
      .get()

    ;(res.data || []).forEach(function (like) {
      if (!like.authorId) return
      if (!map[like.postId]) map[like.postId] = []
      map[like.postId].push(like.authorId)
    })
  } catch (err) {
    // likes 集合还没建时，不应该拖垮整个列表
    console.warn('[cloud] 读取点赞失败，按 0 处理：', err)
  }
  return map
}

/** 集合还没建时，不应该让整个页面崩掉，按 0 处理 */
function isMissingCollection(err) {
  const message = (err && (err.errMsg || err.message)) || ''
  return (err && err.errCode === -502005) || message.indexOf('collection not exists') >= 0
}

/** 读取一批帖子的评论数 */
async function fetchCommentCounts(ids, database) {
  const map = {}
  try {
    const _ = database.command
    const res = await database
      .collection(COL_COMMENTS)
      .where({ postId: _.in(ids) })
      .field({ postId: true })
      .limit(100)
      .get()

    ;(res.data || []).forEach(function (item) {
      if (!item.postId) return
      map[item.postId] = (map[item.postId] || 0) + 1
    })
  } catch (err) {
    if (!isMissingCollection(err)) {
      console.warn('[cloud] 读取评论数失败，按 0 处理：', err)
    }
  }
  return map
}

/** 把数据库里的评论转成页面能直接用的形状 */
function commentToViewModel(doc, meId) {
  return {
    id: doc._id,
    postId: doc.postId,
    authorId: doc.authorId || '',
    author: doc.author || '匿名同学',
    initial: doc.initial || (doc.author || '同').charAt(0),
    tone: doc.tone || '',
    content: doc.content,
    createdAt: time.toTimestamp(doc.createdAt),
    time: time.fromNow(doc.createdAt),
    mine: doc.authorId === meId
  }
}

async function listPosts(options) {
  const opt = options || {}
  const page = Math.max(0, opt.page || 0)
  const size = opt.size || config.pageSize
  const keyword = String(opt.keyword || '').trim()
  const category = opt.category || 'all'

  const database = db()
  const where = {}
  if (category !== 'all') where.category = category
  if (keyword) {
    where.content = database.RegExp({ regexp: escapeRegExp(keyword), options: 'i' })
  }

  let res
  try {
    // 没有任何筛选条件时不要调 where({})，部分基础库会报参数不合法
    let query = database.collection(COL_POSTS)
    if (Object.keys(where).length) query = query.where(where)

    res = await query
      .orderBy('createdAt', 'desc')
      .skip(page * size)
      .limit(size)
      .get()
  } catch (err) {
    throw new Error(friendlyError(err))
  }

  const docs = res.data || []
  if (!docs.length) {
    return { items: [], hasMore: false, total: page * size }
  }

  const ids = docs.map(function (doc) {
    return doc._id
  })
  // 点赞和评论数都要查，用 Promise.all 并行，别串行等两次
  const results = await Promise.all([
    fetchLikes(ids, database),
    fetchCommentCounts(ids, database)
  ])
  const likesMap = results[0]
  const commentCounts = results[1]
  const me = auth.getMe()

  const items = docs.map(function (doc) {
    const likedBy = likesMap[doc._id] || []
    return {
      id: doc._id,
      authorId: doc.authorId || '',
      author: doc.author || '匿名同学',
      initial: doc.initial || (doc.author || '同').charAt(0),
      tone: doc.tone || '',
      content: doc.content,
      category: doc.category,
      createdAt: time.toTimestamp(doc.createdAt),
      time: time.fromNow(doc.createdAt),
      likes: likedBy.length,
      liked: likedBy.indexOf(me.id) >= 0,
      comments: commentCounts[doc._id] || 0,
      mine: doc.authorId === me.id
    }
  })

  return {
    items: items,
    hasMore: docs.length === size,
    total: page * size + docs.length
  }
}

/**
 * 发布前做内容安全检测。
 * 云函数没部署时选择"放行"，这样本地开发不会被卡住；
 * 上线前应该改成 return false（拦截），并把错误提示给用户。
 */
async function checkContent(content) {
  try {
    const res = await wx.cloud.callFunction({
      name: 'msgSecCheck',
      data: { content: content }
    })
    const result = (res && res.result) || {}
    return result.pass !== false
  } catch (err) {
    console.warn('[内容安全] 云函数未部署或调用失败，本次放行：', err)
    return true
  }
}

async function createPost(input) {
  const content = String((input && input.content) || '').trim()
  if (!content) throw new Error('内容不能为空')

  if (config.requireContentCheck) {
    const passed = await checkContent(content)
    if (!passed) throw new Error('内容含违规信息，请修改后再发布')
  }

  const me = auth.getMe()
  const database = db()

  try {
    const res = await database.collection(COL_POSTS).add({
      data: {
        authorId: me.id,
        author: me.nickname,
        initial: me.initial || '同',
        tone: me.tone || '',
        content: content.slice(0, 500),
        category: (input && input.category) || '日常',
        createdAt: Date.now()
      }
    })
    return res._id
  } catch (err) {
    throw new Error(friendlyError(err))
  }
}

async function removePost(postId) {
  const database = db()

  try {
    // 客户端只能删自己的记录，删别人的会被权限规则直接拒绝
    await database.collection(COL_POSTS).doc(postId).remove()
  } catch (err) {
    throw new Error(friendlyError(err))
  }

  // 顺手清掉这条的点赞（别人的点赞删不掉，忽略即可）
  try {
    await database.collection(COL_LIKES).where({ postId: postId }).remove()
  } catch (e) {}

  // 评论同理，否则会留下孤儿数据
  try {
    await database.collection(COL_COMMENTS).where({ postId: postId }).remove()
  } catch (e) {}

  return true
}

async function toggleLike(postId) {
  const me = auth.getMe()
  const database = db()

  let liked = false
  try {
    const existing = await database
      .collection(COL_LIKES)
      .where({ postId: postId, authorId: me.id })
      .limit(1)
      .get()

    if (existing.data && existing.data.length) {
      await database.collection(COL_LIKES).doc(existing.data[0]._id).remove()
      liked = false
    } else {
      await database.collection(COL_LIKES).add({
        data: { postId: postId, authorId: me.id, createdAt: Date.now() }
      })
      liked = true
    }
  } catch (err) {
    throw new Error(friendlyError(err))
  }

  const counted = await database
    .collection(COL_LIKES)
    .where({ postId: postId })
    .count()

  return { liked: liked, likes: counted.total || 0 }
}

/* ------------------------------ 单条与评论 ------------------------------ */

async function getPost(postId) {
  const me = auth.getMe()
  const database = db()

  let doc
  try {
    const res = await database.collection(COL_POSTS).doc(postId).get()
    doc = res.data
  } catch (err) {
    throw new Error(friendlyError(err))
  }

  if (!doc) throw new Error('这条动态已经不存在了')

  const results = await Promise.all([
    fetchLikes([postId], database),
    fetchCommentCounts([postId], database)
  ])
  const likedBy = results[0][postId] || []

  return {
    id: doc._id,
    authorId: doc.authorId || '',
    author: doc.author || '匿名同学',
    initial: doc.initial || (doc.author || '同').charAt(0),
    tone: doc.tone || '',
    content: doc.content,
    category: doc.category,
    createdAt: time.toTimestamp(doc.createdAt),
    time: time.fromNow(doc.createdAt),
    likes: likedBy.length,
    liked: likedBy.indexOf(me.id) >= 0,
    comments: results[1][postId] || 0,
    mine: doc.authorId === me.id
  }
}

async function listComments(options) {
  const opt = options || {}
  const postId = String(opt.postId || '')
  const page = Math.max(0, opt.page || 0)
  const size = opt.size || COMMENT_PAGE_SIZE
  const database = db()

  let res
  try {
    res = await database
      .collection(COL_COMMENTS)
      .where({ postId: postId })
      .orderBy('createdAt', 'desc')
      .skip(page * size)
      .limit(size)
      .get()
  } catch (err) {
    // comments 集合还没建时，按"没有评论"处理，不要让详情页打不开
    if (isMissingCollection(err)) {
      return { items: [], hasMore: false, total: 0 }
    }
    throw new Error(friendlyError(err))
  }

  const me = auth.getMe()
  const items = (res.data || []).map(function (doc) {
    return commentToViewModel(doc, me.id)
  })

  return {
    items: items,
    hasMore: items.length === size,
    total: page * size + items.length
  }
}

async function addComment(input) {
  const postId = String((input && input.postId) || '')
  const content = String((input && input.content) || '').trim()

  if (!postId) throw new Error('缺少动态 ID')
  if (!content) throw new Error('说点什么再评论吧')

  if (config.requireContentCheck) {
    const passed = await checkContent(content)
    if (!passed) throw new Error('评论含违规信息，请修改后再发')
  }

  const me = auth.getMe()
  const database = db()
  const createdAt = Date.now()

  try {
    const res = await database.collection(COL_COMMENTS).add({
      data: {
        postId: postId,
        authorId: me.id,
        author: me.nickname,
        initial: me.initial || '同',
        tone: me.tone || '',
        content: content.slice(0, 200),
        createdAt: createdAt
      }
    })

    return {
      id: res._id,
      postId: postId,
      authorId: me.id,
      author: me.nickname,
      initial: me.initial || '同',
      tone: me.tone || '',
      content: content.slice(0, 200),
      createdAt: createdAt,
      time: time.fromNow(createdAt),
      mine: true
    }
  } catch (err) {
    throw new Error(friendlyError(err))
  }
}

async function removeComment(input) {
  const commentId = String((input && input.commentId) || '')
  if (!commentId) throw new Error('缺少评论 ID')

  const database = db()
  try {
    // 和删帖一样：客户端删别人的会被权限规则直接拒绝
    await database.collection(COL_COMMENTS).doc(commentId).remove()
  } catch (err) {
    throw new Error(friendlyError(err))
  }
  return true
}

/* ------------------------------ 统计 ------------------------------ */

async function getMyStats() {
  const me = auth.getMe()
  const database = db()

  try {
    const results = await Promise.all([
      database.collection(COL_POSTS).where({ authorId: me.id }).count(),
      database.collection(COL_LIKES).where({ authorId: me.id }).count(),
      database.collection(COL_COMMENTS).where({ authorId: me.id }).count()
    ])
    return {
      posts: results[0].total || 0,
      likes: results[1].total || 0,
      comments: results[2].total || 0
    }
  } catch (err) {
    console.warn('[cloud] 统计数据读取失败：', err)
    return { posts: 0, likes: 0, comments: 0 }
  }
}

module.exports = {
  mode: 'cloud',
  CATEGORIES: CATEGORIES,
  listPosts: listPosts,
  createPost: createPost,
  removePost: removePost,
  toggleLike: toggleLike,
  getPost: getPost,
  listComments: listComments,
  addComment: addComment,
  removeComment: removeComment,
  getMyStats: getMyStats
}
