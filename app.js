App({
  globalData: {
    userInfo: null,
    history: []
  },
  onLaunch() {
    // Keep launch synchronous. The simulator can delay app startup when local
    // storage is unavailable; history is loaded lazily by the history page.
  },
  addHistory(item) {
    const current = Array.isArray(this.globalData.history) ? this.globalData.history : []
    const next = [item, ...current.filter(x => x.id !== item.id)].slice(0, 20)
    this.globalData.history = next
    try { wx.setStorageSync('campus_history', next) } catch (e) {}
  }
})

