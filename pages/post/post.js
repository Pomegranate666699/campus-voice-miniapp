const store = require('../../services/store')

const PAGE_SIZE = 10

Page({
  data: {
    postId: '',
    post: null,
    comments: [],
    page: 0,
    hasMore: true,
    loading: true,
    loadingMore: false,
    error: '',

    commentTotal: 0,
    draft: '',
    draftCount: 0,
    sending: false,
    maxLength: 200
  },

  onLoad(options) {
    const id = (options && options.id) || ''
    if (!id) {
      this.setData({ loading: false, error: '缺少动态 ID，请从校园墙进入' })
      return
    }
    this.setData({ postId: id })
    this.loadPost()
    this.loadComments(true)
  },

  onPullDownRefresh() {
    this.loadPost()
    this.loadComments(true)
    wx.stopPullDownRefresh()
  },

  onReachBottom() {
    this.loadComments(false)
  },

  /* ---------------------------- 加载 ---------------------------- */

  loadPost() {
    const self = this
    return store
      .getPost(this.data.postId)
      .then(function (post) {
        self.setData({ post: post, loading: false, error: '' })
      })
      .catch(function (err) {
        self.setData({ loading: false, error: err.message || '加载失败' })
      })
  },

  loadComments(reset) {
    if (this.data.loadingMore) return
    if (!reset && !this.data.hasMore) return

    const self = this
    const page = reset ? 0 : this.data.page + 1
    this.setData({ loadingMore: true })

    return store
      .listComments({ postId: this.data.postId, page: page, size: PAGE_SIZE })
      .then(function (res) {
        self.setData({
          comments: reset ? res.items : self.data.comments.concat(res.items),
          page: page,
          hasMore: res.hasMore,
          commentTotal: res.total,
          loadingMore: false
        })
      })
      .catch(function (err) {
        self.setData({ loadingMore: false })
        wx.showToast({ title: err.message || '评论加载失败', icon: 'none' })
      })
  },

  retry() {
    this.setData({ error: '', loading: true })
    this.loadPost()
    this.loadComments(true)
  },

  /* ---------------------------- 点赞 ---------------------------- */

  likePost() {
    const post = this.data.post
    if (!post) return

    const self = this
    const before = post
    const optimistic = Object.assign({}, post, {
      liked: !post.liked,
      likes: post.likes + (post.liked ? -1 : 1)
    })
    this.setData({ post: optimistic })
    this.markDirty()

    store
      .toggleLike(post.id)
      .then(function (res) {
        self.setData({ 'post.liked': res.liked, 'post.likes': res.likes })
      })
      .catch(function () {
        self.setData({ post: before })
        wx.showToast({ title: '操作失败', icon: 'none' })
      })
  },

  /* ---------------------------- 评论 ---------------------------- */

  onDraftInput(e) {
    const value = e.detail.value
    this.setData({ draft: value, draftCount: value.length })
  },

  submitComment() {
    const content = (this.data.draft || '').trim()
    if (!content) {
      wx.showToast({ title: '说点什么再发吧', icon: 'none' })
      return
    }
    if (this.data.sending) return

    const self = this
    this.setData({ sending: true })

    store
      .addComment({ postId: this.data.postId, content: content })
      .then(function (comment) {
        self.setData({
          sending: false,
          draft: '',
          draftCount: 0,
          // 新评论插到最前面，和"最新优先"的排序保持一致
          comments: [comment].concat(self.data.comments),
          commentTotal: self.data.commentTotal + 1
        })
        self.markDirty()
        wx.showToast({ title: '评论成功', icon: 'success' })
      })
      .catch(function (err) {
        self.setData({ sending: false })
        wx.showToast({ title: err.message || '评论失败', icon: 'none' })
      })
  },

  onCommentLongPress(e) {
    const id = e.currentTarget.dataset.id

    let target = null
    this.data.comments.forEach(function (comment) {
      if (comment.id === id) target = comment
    })
    if (!target) return

    if (!target.mine) {
      wx.showToast({ title: '只能删除自己的评论', icon: 'none' })
      return
    }

    const self = this
    wx.showModal({
      title: '删除评论',
      content: '删除后不可恢复，确定吗？',
      confirmText: '删除',
      confirmColor: '#c0392b',
      success: function (res) {
        if (!res.confirm) return
        self.doRemoveComment(id)
      }
    })
  },

  doRemoveComment(id) {
    const self = this
    store
      .removeComment({ postId: this.data.postId, commentId: id })
      .then(function () {
        self.setData({
          comments: self.data.comments.filter(function (comment) {
            return comment.id !== id
          }),
          commentTotal: Math.max(0, self.data.commentTotal - 1)
        })
        self.markDirty()
        wx.showToast({ title: '已删除', icon: 'success' })
      })
      .catch(function (err) {
        wx.showToast({ title: err.message || '删除失败', icon: 'none' })
      })
  },

  /**
   * 标记列表已过期。
   * 详情页改了数据（点赞/评论），返回校园墙时必须刷新，
   * 否则用户会看到"评论数没变"的假象。
   */
  markDirty() {
    const app = getApp()
    if (app && app.globalData) app.globalData.wallDirty = true
  }
})
