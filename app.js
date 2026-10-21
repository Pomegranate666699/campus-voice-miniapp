const config = require('./config')
const auth = require('./services/auth')

App({
  globalData: {
    user: null,
    config: config,
    // 首页把问题暂存在这里，切到语音页后再取出来。
    // 原因：voice 是 tabBar 页面，wx.navigateTo 跳不过去，只能 switchTab，
    // 而 switchTab 不支持带参数。
    pendingQuestion: ''
  },

  onLaunch() {
    // 只有填了云环境 ID 才初始化。没填就是本地模式，不碰任何网络。
    if (config.mode === 'cloud') {
      if (wx.cloud) {
        wx.cloud.init({
          env: config.cloudEnv,
          traceUser: true
        })
      } else {
        console.error('[campus-voice] 当前基础库不支持云开发，请升级开发者工具')
      }
    }

    this.globalData.user = auth.getMe()
  }
})
