const { answerFor, fallbackAnswer } = require('../../utils/campus-qa')

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
    const answer = answerFor(q) || fallbackAnswer
    this.setData({ showResult: true, resultText: answer })
    if (wx.pageScrollTo) {
      setTimeout(() => {
        try { wx.pageScrollTo({ selector: '#answer', duration: 200, offsetTop: -20 }) } catch (e) {}
      }, 80)
    }
  },

  fillLibrary() { this.setData({ question: '图书馆开放时间' }) },
  fillCourse() { this.setData({ question: '今天有什么课' }) },
  fillCanteen() { this.setData({ question: '食堂推荐' }) }
})
