const store = require('../../services/store')
const auth = require('../../services/auth')
const history = require('../../services/history')
const config = require('../../config')

Page({
  data: {
    mode: config.mode,
    version: config.version,
    me: null,
    stats: { posts: 0, likes: 0, comments: 0 },
    historyCount: 0
  },

  onShow() {
    const tabBar = this.getTabBar && this.getTabBar()
    if (tabBar) tabBar.setData({ selected: 4 })
    this.refresh()
  },

  refresh() {
    const self = this
    this.setData({
      me: auth.getMe(),
      historyCount: history.list().length
    })

    store
      .getMyStats()
      .then(function (stats) {
        self.setData({ stats: stats })
      })
      .catch(function (err) {
        console.warn('读取统计失败', err)
      })
  },

  editNickname() {
    const self = this
    const current = this.data.me ? this.data.me.nickname : ''

    wx.showModal({
      title: '修改昵称',
      editable: true,
      placeholderText: '最多 12 个字',
      content: current,
      success(res) {
        if (!res.confirm) return
        const next = auth.updateMe({ nickname: res.content || '' })
        self.setData({ me: next })
        wx.showToast({ title: '已保存', icon: 'success' })
      }
    })
  },

  openHistory() {
    wx.navigateTo({ url: '/pages/history/history' })
  },

  openPrivacy() {
    wx.showModal({
      title: '数据说明',
      content: this.data.mode === 'cloud'
        ? '动态和点赞存在云开发数据库，所有同学都能看到。问答记录只存在本机。'
        : '当前是本地演示模式：所有数据只存在这台设备，换台手机就看不到了。',
      showCancel: false
    })
  },

  feedback() {
    wx.showToast({ title: '感谢反馈', icon: 'none' })
  }
})
