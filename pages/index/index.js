const config = require('../../config')

Page({
  data: {
    schoolName: config.schoolName,
    demoMode: config.mode !== 'cloud',
    profile: null,
    greeting: '你好，南洋同学',
    avatar: '同',
    query: '',
    shortcuts: [
      { id: 'course', icon: '▦', title: '我的课程', desc: '查看今天与本周课表', url: '/pages/course/course' },
      { id: 'service', icon: '⌕', title: '校园服务', desc: '查找校园办事与空间' },
      { id: 'wall', icon: '✦', title: '校园墙', desc: '看看同学正在分享什么', url: '/pages/wall/wall' }
    ],
    examples: ['图书馆开放时间', '今天下午有哪些课', '食堂和失物招领怎么找']
  },
  onShow() {
    const profile = wx.getStorageSync('campus_profile') || null
    const tabBar = this.getTabBar && this.getTabBar(); if (tabBar) tabBar.setData({ selected: 0 });
    this.setData({ profile, greeting: profile && profile.nickname ? profile.nickname + '，今天想了解什么？' : '你好，南洋同学', avatar: profile && profile.nickname ? profile.nickname.charAt(0) : '同' })
  },
  onInput(e) { this.setData({ query: e.detail.value }) },
  onVoiceTap() { wx.switchTab({ url: '/pages/voice/voice' }) },
  onShortcutTap(e) {
    const item = this.data.shortcuts.find(x => x.id === e.currentTarget.dataset.id)
    if (!item) return
    if (item.id === 'course' || item.id === 'wall') return wx.switchTab({ url: item.url })
    wx.switchTab({ url: '/pages/voice/voice' })
  },
  submitQuery() {
    const query = (this.data.query || '').trim()
    if (!query) {
      wx.showToast({ title: '请输入想了解的校园服务', icon: 'none' })
      return
    }
    // voice 是 tabBar 页面，只能用 switchTab，而 switchTab 不能带参数，
    // 所以问题先存在全局，等语音页显示时再取出来。
    getApp().globalData.pendingQuestion = query
    wx.switchTab({ url: '/pages/voice/voice' })
  },
  onExampleTap(e) {
    getApp().globalData.pendingQuestion = e.currentTarget.dataset.text
    wx.switchTab({ url: '/pages/voice/voice' })
  },
  openProfile() { wx.switchTab({ url: '/pages/profile/profile' }) }
})







