const history = require('../../services/history')
const time = require('../../utils/time')

Page({
  data: {
    items: []
  },

  onShow() {
    this.load()
  },

  load() {
    const items = history.list().map(function (item) {
      return Object.assign({}, item, { time: time.fromNow(item.createdAt) })
    })
    this.setData({ items: items })
  },

  onTapItem(e) {
    const id = e.currentTarget.dataset.id

    let target = null
    this.data.items.forEach(function (item) {
      if (item.id === id) target = item
    })
    if (!target) return

    wx.showModal({
      title: target.question,
      content: target.answer,
      showCancel: false,
      confirmText: '知道了'
    })
  },

  clearAll() {
    const self = this
    if (!this.data.items.length) return

    wx.showModal({
      title: '清空记录',
      content: '清空后不可恢复，确定吗？',
      confirmText: '清空',
      confirmColor: '#c0392b',
      success(res) {
        if (!res.confirm) return
        history.clear()
        self.setData({ items: [] })
      }
    })
  }
})
