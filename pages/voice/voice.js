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
    voiceHint: '长按录音，松开发送',

    activeTab: 'voice', // voice：麦克风；text：文字输入
    inputFocus: false,
    voiceText: ''       // 语音识别出来的文字，只在语音 tab 展示
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
      this.setData({ question: pending, activeTab: 'text', inputFocus: true })
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
      this.starting = false
      this.setVoiceState(true, false, '正在听…', '松开发送')

      // 手指在权限回调返回之前就抬起来了：现在才真正开始录，那就立刻结束。
      // 不处理的话会变成"点一下开始、再点一下才停"的诡异交互。
      if (this.releasePending) {
        this.releasePending = false
        this.onVoiceEnd()
      }
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
      // 识别结果留在语音 tab，不再写进文字输入框
      this.setData({ voiceText: text, activeTab: 'voice' })
      this.submit(text)
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
    if (this.data.recording || this.data.recognizing || this.starting) return
    this.cancelled = false
    this.releasePending = false
    this.starting = true

    wx.getSetting({
      success: (res) => {
        const auth = res.authSetting || {}
        if (auth['scope.record'] === false) {
          this.starting = false
          this.askOpenSetting()
        } else if (auth['scope.record']) {
          this.startRecord()
        } else {
          wx.authorize({
            scope: 'scope.record',
            success: () => this.startRecord(),
            fail: () => {
              this.starting = false
              this.askOpenSetting()
            }
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
    if (!recorder) {
      this.starting = false
      return
    }
    this.setVoiceState(true, false, '正在听…', '松开发送')

    // 兜底：万一 onStart 没回调，也不能让按钮一直处于"启动中"状态
    const self = this
    setTimeout(function () {
      self.starting = false
    }, 1500)

    try {
      if (wx.vibrateShort) wx.vibrateShort({ type: 'light' })
    } catch (e) {}
    try {
      recorder.start({ duration: 30000, lang: 'zh_CN' })
    } catch (e) {
      console.error(e)
      this.starting = false
      this.setVoiceState(false, false, '按住说话', '长按录音，松开发送')
      wx.showToast({ title: '录音启动失败，请重试', icon: 'none' })
    }
  },

  onVoiceEnd() {
    // 还在等权限回调，录音尚未开始：记下来，等 onStart 后立刻结束
    if (this.starting && !this.data.recording) {
      this.releasePending = true
      return
    }
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

  switchMode(e) {
    const tab = (e && e.currentTarget && e.currentTarget.dataset && e.currentTarget.dataset.tab) || 'voice'
    if (tab === this.data.activeTab) return
    this.setData({
      activeTab: tab,
      inputFocus: tab === 'text'
    })
  },

  submit(text) {
    // 语音提问时会显式传入识别结果；文字输入框触发时不传（或传入事件对象）。
    const fromVoice = typeof text === 'string'
    const q = String(fromVoice ? text : (this.data.question || '')).trim()

    if (!q) {
      // 只有从文字输入框触发时，才把用户引到文字 tab
      if (!fromVoice) {
        this.setData({ activeTab: 'text', inputFocus: true })
      }
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
          degraded: !!res.degraded,
          inputFocus: false
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

  // 示例问句：填进去并直接提问，少一次点击
  fillLibrary() { this.askPreset('图书馆开放时间') },
  fillCourse() { this.askPreset('今天有什么课') },
  fillCanteen() { this.askPreset('食堂推荐') },

  askPreset(text) {
    this.setData({ question: text, activeTab: 'text' })
    this.submit()
  }
})
