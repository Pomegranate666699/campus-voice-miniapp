/**
 * 数据层自测脚本（在 Node 里跑，不需要微信开发者工具）
 *
 * 用法：node scripts/selftest.js
 *
 * 为什么要有这个：页面代码只能在开发者工具里点，
 * 但数据层的逻辑（分页、筛选、点赞、删除）是纯函数，可以脱离小程序单独测。
 * 改完数据层跑一次，几秒钟就能知道有没有破坏原有行为。
 */

const path = require('path')
const assert = require('assert')

/* ---------------------- 1. 用内存模拟 wx 的存储 ---------------------- */

const memory = new Map()

global.wx = {
  getStorageSync(key) {
    return memory.has(key) ? memory.get(key) : ''
  },
  setStorageSync(key, value) {
    // 走一遍序列化，确保存进去的东西是能被 JSON 表达的
    memory.set(key, JSON.parse(JSON.stringify(value)))
  },
  removeStorageSync(key) {
    memory.delete(key)
  }
}

const store = require(path.join(__dirname, '..', 'services', 'local-store'))
const auth = require(path.join(__dirname, '..', 'services', 'auth'))
const time = require(path.join(__dirname, '..', 'utils', 'time'))
const qa = require(path.join(__dirname, '..', 'services', 'qa'))
const config = require(path.join(__dirname, '..', 'config'))

/* ---------------------- 2. 简易测试框架 ---------------------- */

let passed = 0
let failed = 0

function test(name, fn) {
  return Promise.resolve()
    .then(fn)
    .then(() => {
      passed += 1
      console.log('  PASS  ' + name)
    })
    .catch((err) => {
      failed += 1
      console.log('  FAIL  ' + name)
      console.log('        ' + (err && err.message ? err.message : err))
    })
}

/* ---------------------- 3. 用例 ---------------------- */

async function main() {
  console.log('\n[数据层自测]\n')

  await test('第一页返回 8 条，且 hasMore 为 true', async () => {
    const res = await store.listPosts({ page: 0, size: 8 })
    assert.strictEqual(res.items.length, 8)
    assert.strictEqual(res.hasMore, true)
    assert.strictEqual(res.total, 13)
  })

  await test('第二页返回剩余 5 条，且 hasMore 为 false', async () => {
    const res = await store.listPosts({ page: 1, size: 8 })
    assert.strictEqual(res.items.length, 5)
    assert.strictEqual(res.hasMore, false)
  })

  await test('列表按发布时间倒序', async () => {
    const res = await store.listPosts({ page: 0, size: 20 })
    for (let i = 1; i < res.items.length; i++) {
      assert.ok(
        res.items[i - 1].createdAt >= res.items[i].createdAt,
        '第 ' + i + ' 条的时间比前一条新'
      )
    }
  })

  await test('按分类筛选有效', async () => {
    const res = await store.listPosts({ page: 0, size: 50, category: '失物招领' })
    assert.ok(res.items.length > 0)
    res.items.forEach((item) => assert.strictEqual(item.category, '失物招领'))
  })

  await test('关键词搜索能命中内容', async () => {
    const res = await store.listPosts({ page: 0, size: 50, keyword: '图书馆' })
    assert.ok(res.items.length > 0)
    res.items.forEach((item) => {
      const haystack = item.content + item.author + item.category
      assert.ok(haystack.indexOf('图书馆') >= 0)
    })
  })

  await test('搜索无结果时返回空列表而不是报错', async () => {
    const res = await store.listPosts({ page: 0, size: 50, keyword: '这段文字一定搜不到' })
    assert.strictEqual(res.items.length, 0)
    assert.strictEqual(res.hasMore, false)
  })

  await test('发布后能出现在第一页，并且标记为 mine', async () => {
    const before = await store.listPosts({ page: 0, size: 8 })
    await store.createPost({ content: '自测发布的一条动态', category: '日常' })
    const after = await store.listPosts({ page: 0, size: 8 })

    assert.strictEqual(after.total, before.total + 1)
    assert.strictEqual(after.items[0].content, '自测发布的一条动态')
    assert.strictEqual(after.items[0].mine, true)
  })

  await test('空内容不允许发布', async () => {
    let error = null
    try {
      await store.createPost({ content: '   ' })
    } catch (err) {
      error = err
    }
    assert.ok(error, '应该抛出错误')
    assert.ok(error.message.indexOf('不能为空') >= 0)
  })

  await test('点赞后 liked 为 true、数量 +1；再点一次取消', async () => {
    const list = await store.listPosts({ page: 0, size: 1 })
    const post = list.items[0]
    const base = post.likes

    const on = await store.toggleLike(post.id)
    assert.strictEqual(on.liked, true)
    assert.strictEqual(on.likes, base + 1)

    const off = await store.toggleLike(post.id)
    assert.strictEqual(off.liked, false)
    assert.strictEqual(off.likes, base)
  })

  await test('不能删除别人的动态', async () => {
    const list = await store.listPosts({ page: 0, size: 20 })
    const others = list.items.filter((item) => !item.mine)
    assert.ok(others.length > 0)

    let error = null
    try {
      await store.removePost(others[0].id)
    } catch (err) {
      error = err
    }
    assert.ok(error, '应该拒绝删除别人的动态')
    assert.ok(error.message.indexOf('只能删除自己') >= 0)
  })

  await test('能删除自己的动态', async () => {
    const mine = await store.createPost({ content: '待删除的动态', category: '日常' })
    await store.removePost(mine.id)

    const list = await store.listPosts({ page: 0, size: 50 })
    const exists = list.items.some((item) => item.id === mine.id)
    assert.strictEqual(exists, false)
  })

  await test('统计能拿到自己发布的数量', async () => {
    const stats = await store.getMyStats()
    assert.ok(stats.posts >= 1, '至少有一条自己发的')
    assert.strictEqual(typeof stats.likes, 'number')
    assert.strictEqual(typeof stats.comments, 'number')
  })

  await test('详情页能读到评论数和评论列表', async () => {
    const post = await store.getPost('seed_1')
    assert.strictEqual(post.comments, 2)

    const res = await store.listComments({ postId: 'seed_1', page: 0, size: 10 })
    assert.strictEqual(res.items.length, 2)
    assert.strictEqual(res.hasMore, false)
  })

  await test('发表评论后排在第一位，总数 +1', async () => {
    const before = await store.listComments({ postId: 'seed_2', page: 0, size: 10 })
    const created = await store.addComment({ postId: 'seed_2', content: '自测评论' })
    const after = await store.listComments({ postId: 'seed_2', page: 0, size: 10 })

    assert.strictEqual(after.total, before.total + 1)
    assert.strictEqual(after.items[0].id, created.id)
    assert.strictEqual(after.items[0].mine, true)
  })

  await test('空评论不允许发布', async () => {
    let error = null
    try {
      await store.addComment({ postId: 'seed_2', content: '   ' })
    } catch (err) {
      error = err
    }
    assert.ok(error, '应该抛出错误')
    assert.ok(error.message.indexOf('说点什么') >= 0)
  })

  await test('不能删除别人的评论', async () => {
    const res = await store.listComments({ postId: 'seed_1', page: 0, size: 10 })
    const others = res.items.filter((item) => !item.mine)
    assert.ok(others.length > 0)

    let error = null
    try {
      await store.removeComment({ postId: 'seed_1', commentId: others[0].id })
    } catch (err) {
      error = err
    }
    assert.ok(error, '应该拒绝删除别人的评论')
    assert.ok(error.message.indexOf('只能删除自己') >= 0)
  })

  await test('能删除自己的评论', async () => {
    const created = await store.addComment({ postId: 'seed_2', content: '待删评论' })
    await store.removeComment({ postId: 'seed_2', commentId: created.id })

    const res = await store.listComments({ postId: 'seed_2', page: 0, size: 10 })
    const exists = res.items.some((item) => item.id === created.id)
    assert.strictEqual(exists, false)
  })

  await test('删除动态会连带清掉它的评论', async () => {
    const post = await store.createPost({ content: '带评论的动态', category: '日常' })
    await store.addComment({ postId: post.id, content: '临时评论' })
    await store.removePost(post.id)

    const res = await store.listComments({ postId: post.id, page: 0, size: 10 })
    assert.strictEqual(res.total, 0)
  })

  await test('昵称修改生效并写入本地', async () => {
    const next = auth.updateMe({ nickname: '测试同学' })
    assert.strictEqual(next.nickname, '测试同学')
    assert.strictEqual(next.initial, '测')
    assert.strictEqual(auth.getMe().nickname, '测试同学')
  })

  await test('相对时间格式化正确', () => {
    const now = Date.now()
    assert.strictEqual(time.fromNow(now - 10 * 1000), '刚刚')
    assert.strictEqual(time.fromNow(now - 5 * 60 * 1000), '5 分钟前')
    assert.strictEqual(time.fromNow(now - 3 * 60 * 60 * 1000), '3 小时前')
    assert.strictEqual(time.fromNow(now - 2 * 24 * 60 * 60 * 1000), '2 天前')
    assert.strictEqual(time.fromNow(null), '')
  })

  // 问答相关的用例固定跑在本地模式，避免受 config.js 里 CLOUD_ENV 的影响。
  // qa.ask 是在调用时读 config.mode 的，所以这里改运行时值就能生效。
  config.mode = 'local'

  await test('本地模式下问答命中知识库', async () => {
    const res = await qa.ask('图书馆开放时间')
    assert.strictEqual(res.source, 'local')
    assert.ok(res.answer.indexOf('图书馆') >= 0, '答案应该提到图书馆')
    assert.strictEqual(res.degraded, false)
  })

  await test('知识库没收录时返回兜底提示，而不是报错', async () => {
    const res = await qa.ask('量子纠缠和相对论有什么关系')
    assert.strictEqual(res.source, 'fallback')
    assert.ok(res.answer.length > 0)
  })

  await test('云端模式下云开发不可用，自动降级到本地知识库', async () => {
    config.mode = 'cloud'

    const res = await qa.ask('图书馆开放时间')
    assert.strictEqual(res.degraded, true, '应该标记为降级')
    assert.ok(res.answer.length > 0, '降级后仍然要有答案')

    config.mode = 'local'
  })

  await test('空问题直接返回空答案，不发请求', async () => {
    const res = await qa.ask('   ')
    assert.strictEqual(res.answer, '')
  })

  await test('问答来源标识可读', () => {
    assert.strictEqual(qa.sourceLabel('ai'), 'AI 生成')
    assert.strictEqual(qa.sourceLabel('local'), '本地知识库')
    assert.strictEqual(qa.sourceLabel('fallback'), '兜底提示')
  })

  console.log('\n结果：' + passed + ' 通过，' + failed + ' 失败\n')
  process.exit(failed === 0 ? 0 : 1)
}

main()
