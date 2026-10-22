const qa = require('../../services/qa')
const history = require('../../services/history')

let recorder = null
let pluginReady = false

try {
  const plugin = requirePlugin('WechatSI')
  recorder = plugin.getRecordRecognitionManager()
  pluginReady = !!recorder
} catch (e) {
  console.warn('WechatSI 插件未启用，语音输入不可用', e)
}

Page({
  data: {
    question: '',
    showResult: false,
    resultText: '',
    thinking: false,       // AI 思考中
    source: '',            // ai / local / fallback
    sourceLabel: '',
    degraded: false,       // 是否因为 AI 失败而降级
    recording: false,
    recognizing: false,
    voiceTitle: '按住说话',
    voiceHint: '长按录音，松开发送'
  },

  onLoad(options) {
    if (options && options.text) {
      this.setData({ question: decodeURIComponent(options.text) })
    }
    this.setupRecorder()
  },

  onShow() {
    const tabBar = this.getTabBar && this.getTabBar()
    if (tabBar) tabBar.setData({ selected: 2 })

    // 从首页带着问题跳过来：取出问题并自动回答
    const app = getApp()
    const pending = app && app.globalData && app.globalData.pendingQuestion
    if (pending) {
      app.globalData.pendingQuestion = ''
      this.setData({ question: pending })
      const self = this
      setTimeout(function () {
        self.submit()
      }, 60)
    }
  },

  onUnload() {
    this.unloaded = true
    if (this.data.recording && recorder) {
      try { recorder.stop() } catch (e) {}
    }
  },

  onHide() {
    if (this.data.recording) this.onVoiceCancel()
  },

  setupRecorder() {
    if (!recorder) return
    recorder.onStart = () => {
      this.setVoiceState(true, false, '正在听…', '松开发送')
    }
    recorder.onStop = (res) => {
      if (this.unloaded) return
      const cancelled = this.cancelled
      this.cancelled = false
      this.setVoiceState(false, false, '按住说话', '长按录音，松开发送')
      if (cancelled) return
      const text = ((res && res.result) || '').trim()
      if (!text) {
        wx.showToast({ title: '没听清，再说一次', icon: 'none' })
        return
      }
      this.setData({ question: text })
      this.submit()
    }
    recorder.onError = (err) => {
      if (this.unloaded) return
      console.error('voice error', err)
      this.setVoiceState(false, false, '按住说话', '长按录音，松开发送')
      const msg = (err && err.msg) || ''
      wx.showToast({ title: msg && msg.length <= 18 ? msg : '语音识别失败，请重试', icon: 'none' })
    }
  },

  setVoiceState(recording, recognizing, voiceTitle, voiceHint) {
    this.setData({ recording, recognizing, voiceTitle, voiceHint })
  },

  onVoiceStart() {
    if (!pluginReady) {
      wx.showModal({
        title: '语音插件未启用',
        content: '请先在小程序后台添加「微信同声传译」插件，再重新编译使用语音输入。',
        showCancel: false
      })
      return
    }
    if (this.data.recording || this.data.recognizing) return
    this.cancelled = false
    wx.getSetting({
      success: (res) => {
        const auth = res.authSetting || {}
        if (auth['scope.record'] === false) {
          this.askOpenSetting()
        } else if (auth['scope.record']) {
          this.startRecord()
        } else {
          wx.authorize({
            scope: 'scope.record',
            success: () => this.startRecord(),
            fail: () => this.askOpenSetting()
          })
        }
      },
      fail: () => this.startRecord()
    })
  },

  askOpenSetting() {
    wx.showModal({
      title: '需要麦克风权限',
      content: '开启麦克风后才能语音提问，去设置里打开吧。',
      confirmText: '去设置',
      success: (res) => {
        if (!res.confirm) return
        wx.openSetting({
          success: (s) => {
            if (s.authSetting && s.authSetting['scope.record']) this.startRecord()
          }
        })
      }
    })
  },

  startRecord() {
    if (!recorder) return
    this.setVoiceState(true, false, '正在听…', '松开发送')
    try {
      if (wx.vibrateShort) wx.vibrateShort({ type: 'light' })
    } catch (e) {}
    try {
      recorder.start({ duration: 30000, lang: 'zh_CN' })
    } catch (e) {
      console.error(e)
      this.setVoiceState(false, false, '按住说话', '长按录音，松开发送')
      wx.showToast({ title: '录音启动失败，请重试', icon: 'none' })
    }
  },

  onVoiceEnd() {
    if (!this.data.recording) return
    this.setVoiceState(false, true, '正在识别…', '稍等一下')
    try {
      recorder.stop()
    } catch (e) {
      this.setVoiceState(false, false, '按住说话', '长按录音，松开发送')
    }
  },

  onVoiceCancel() {
    if (!this.data.recording) return
    this.cancelled = true
    this.setVoiceState(false, false, '按住说话', '长按录音，松开发送')
    try { recorder.stop() } catch (e) {}
  },

  onInput(e) {
    this.setData({ question: e.detail.value })
  },

  focusText() {
    wx.showToast({ title: '直接在下方输入即可', icon: 'none' })
  },

  submit() {
    const q = (this.data.question || '').trim()
    if (!q) {
      wx.showToast({ title: '先输入一个问题', icon: 'none' })
      return
    }

    // 每次提问生成一个序号。如果用户在 AI 回答前又问了新问题，
    // 旧请求回来时序号对不上，就直接丢掉，避免答案串台。
    const token = (this.requestToken || 0) + 1
    this.requestToken = token

    this.setData({
      showResult: true,
      thinking: true,
      resultText: '',
      source: '',
      sourceLabel: '',
      degraded: false
    })

    const self = this

    qa.ask(q)
      .then(function (res) {
        if (self.requestToken !== token) return
        self.setData({
          thinking: false,
          resultText: res.answer,
          source: res.source,
          sourceLabel: qa.sourceLabel(res.source),
          degraded: !!res.degraded
        })
        // 记一条历史，供「我的 → 问答记录」查看
        history.add({ question: q, answer: res.answer })
        self.scrollToAnswer()
      })
      .catch(function (err) {
        if (self.requestToken !== token) return
        self.setData({
          thinking: false,
          resultText: '抱歉，这个问题暂时回答不了：' + (err.message || '未知错误'),
          source: '',
          sourceLabel: ''
        })
      })
  },

  scrollToAnswer() {
    if (!wx.pageScrollTo) return
    setTimeout(function () {
      try {
        wx.pageScrollTo({ selector: '#answer', duration: 220, offsetTop: -20 })
      } catch (e) {}
    }, 80)
  },

  fillLibrary() { this.setData({ question: '图书馆开放时间' }) },
  fillCourse() { this.setData({ question: '今天有什么课' }) },
  fillCanteen() { this.setData({ question: '食堂推荐' }) }
})
