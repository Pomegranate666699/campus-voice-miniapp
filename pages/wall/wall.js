const store = require('../../services/store')
const config = require('../../config')

const PAGE_SIZE = config.pageSize

const CATEGORY_TABS = [{ id: 'all', label: '全部' }].concat(
  store.CATEGORIES.map(function (name) {
    return { id: name, label: name }
  })
)

const PUBLISH_CATEGORIES = store.CATEGORIES.map(function (name) {
  return { id: name, label: name }
})

Page({
  data: {
    mode: config.mode,
    categories: CATEGORY_TABS,
    publishCategories: PUBLISH_CATEGORIES,
    activeCategory: 'all',
    keyword: '',
    posts: [],
    hasMore: true,
    loading: true,       // 首次加载 / 下拉刷新
    loadingMore: false,  // 上拉加载
    error: '',           // 加载失败时给用户看的原因
    total: 0,

    sheetVisible: false,
    draft: '',
    draftCategory: '日常',
    draftCount: 0,
    submitting: false
  },

  onLoad() {
    // 页码放在 this 上而不是 data 里：它变了不需要重新渲染
    this.pageIndex = 0
    this.reload()
  },

  onShow() {
    const tabBar = this.getTabBar && this.getTabBar()
    if (tabBar) tabBar.setData({ selected: 3 })

    // 从详情页评论/点赞回来时，数量和列表可能变了，刷新一下
    const app = getApp()
    if (app && app.globalData && app.globalData.wallDirty) {
      app.globalData.wallDirty = false
      this.reload()
    }
  },

  onUnload() {
    if (this.searchTimer) clearTimeout(this.searchTimer)
  },

  onPullDownRefresh() {
    this.reload().then(function () {
      wx.stopPullDownRefresh()
    })
  },

  onReachBottom() {
    this.loadMore()
  },

  /* ---------------------------- 数据加载 ---------------------------- */

  reload() {
    const self = this
    this.pageIndex = 0
    this.setData({ loading: true, error: '', hasMore: true })

    return store
      .listPosts({
        page: 0,
        size: PAGE_SIZE,
        keyword: this.data.keyword,
        category: this.data.activeCategory
      })
      .then(function (res) {
        self.setData({
          posts: res.items,
          hasMore: res.hasMore,
          total: res.total,
          loading: false
        })
      })
      .catch(function (err) {
        self.setData({
          loading: false,
          error: err.message || '加载失败，请稍后重试',
          posts: []
        })
      })
  },

  loadMore() {
    if (this.data.loading || this.data.loadingMore || !this.data.hasMore) return

    const self = this
    const next = this.pageIndex + 1
    this.setData({ loadingMore: true })

    store
      .listPosts({
        page: next,
        size: PAGE_SIZE,
        keyword: this.data.keyword,
        category: this.data.activeCategory
      })
      .then(function (res) {
        self.pageIndex = next
        self.setData({
          posts: self.data.posts.concat(res.items),
          hasMore: res.hasMore,
          loadingMore: false
        })
      })
      .catch(function () {
        self.setData({ loadingMore: false })
        wx.showToast({ title: '加载更多失败', icon: 'none' })
      })
  },

  retry() {
    this.reload()
  },

  openPost(e) {
    const id = e.currentTarget.dataset.id
    if (!id) return
    wx.navigateTo({ url: '/pages/post/post?id=' + id })
  },

  /* ---------------------------- 搜索 / 筛选 ---------------------------- */

  onSearch(e) {
    const value = e.detail.value
    this.setData({ keyword: value })

    // 防抖：停止输入 350ms 才真正查询，否则每敲一个字就发一次请求
    const self = this
    if (this.searchTimer) clearTimeout(this.searchTimer)
    this.searchTimer = setTimeout(function () {
      self.reload()
    }, 350)
  },

  clearSearch() {
    if (this.searchTimer) clearTimeout(this.searchTimer)
    this.setData({ keyword: '' })
    this.reload()
  },

  selectCategory(e) {
    const id = e.currentTarget.dataset.id
    if (id === this.data.activeCategory) return
    this.setData({ activeCategory: id })
    this.reload()
  },

  /* ---------------------------- 点赞 ---------------------------- */

  likePost(e) {
    const id = e.currentTarget.dataset.id
    const self = this

    let index = -1
    this.data.posts.forEach(function (post, i) {
      if (post.id === id) index = i
    })
    if (index < 0) return

    const before = this.data.posts[index]

    // 乐观更新：先改界面，让点击立刻有反馈；失败了再改回去。
    // 这是移动端体验的关键，等网络回来再变会让人觉得"卡了"。
    const optimistic = Object.assign({}, before, {
      liked: !before.liked,
      likes: before.likes + (before.liked ? -1 : 1)
    })
    this.setData({ ['posts[' + index + ']']: optimistic })

    store
      .toggleLike(id)
      .then(function (res) {
        self.setData({
          ['posts[' + index + '].liked']: res.liked,
          ['posts[' + index + '].likes']: res.likes
        })
      })
      .catch(function (err) {
        self.setData({ ['posts[' + index + ']']: before })
        wx.showToast({ title: err.message || '操作失败', icon: 'none' })
      })
  },

  /* ---------------------------- 删除 ---------------------------- */

  onPostLongPress(e) {
    const id = e.currentTarget.dataset.id
    const self = this

    let target = null
    this.data.posts.forEach(function (post) {
      if (post.id === id) target = post
    })
    if (!target) return

    if (!target.mine) {
      wx.showToast({ title: '只能删除自己的动态', icon: 'none' })
      return
    }

    wx.showModal({
      title: '删除动态',
      content: '删除后不可恢复，确定要删吗？',
      confirmText: '删除',
      confirmColor: '#c0392b',
      success: function (res) {
        if (res.confirm) self.doDelete(id)
      }
    })
  },

  doDelete(id) {
    const self = this
    wx.showLoading({ title: '删除中', mask: true })

    store
      .removePost(id)
      .then(function () {
        wx.hideLoading()
        self.setData({
          posts: self.data.posts.filter(function (post) {
            return post.id !== id
          })
        })
        wx.showToast({ title: '已删除', icon: 'success' })
      })
      .catch(function (err) {
        wx.hideLoading()
        wx.showToast({ title: err.message || '删除失败', icon: 'none' })
      })
  },

  /* ---------------------------- 发布 ---------------------------- */

  openSheet() {
    this.setData({
      sheetVisible: true,
      draft: '',
      draftCategory: '日常',
      draftCount: 0
    })
  },

  closeSheet() {
    if (this.data.submitting) return
    this.setData({ sheetVisible: false })
  },

  onDraftInput(e) {
    const value = e.detail.value
    this.setData({ draft: value, draftCount: value.length })
  },

  pickDraftCategory(e) {
    this.setData({ draftCategory: e.currentTarget.dataset.name })
  },

  // 阻止点击面板内部时，事件冒泡到遮罩把面板关掉
  noop() {},

  submitPost() {
    const content = (this.data.draft || '').trim()
    if (!content) {
      wx.showToast({ title: '说点什么再发布吧', icon: 'none' })
      return
    }
    if (this.data.submitting) return

    const self = this
    this.setData({ submitting: true })

    store
      .createPost({ content: content, category: this.data.draftCategory })
      .then(function () {
        self.setData({
          submitting: false,
          sheetVisible: false,
          draft: '',
          draftCount: 0
        })
        wx.showToast({ title: '发布成功', icon: 'success' })
        return self.reload()
      })
      .catch(function (err) {
        self.setData({ submitting: false })
        wx.showToast({ title: err.message || '发布失败', icon: 'none' })
      })
  }
})
