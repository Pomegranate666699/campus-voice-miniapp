const config = require('../../config')

/**
 * 课程数据（演示用，接教务系统时换成接口返回）
 * day：1 = 周一 … 7 = 周日
 * type：每周 / 单周 / 双周
 */
const allCourses = [
  { id: 'c1', day: 1, name: '移动应用开发', period: '1-2 节', start: '08:00', end: '09:40', room: '教学楼 A203', teacher: '周老师', type: '每周' },
  { id: 'c2', day: 2, name: '大学英语', period: '3-4 节', start: '10:10', end: '11:50', room: '教学楼 B106', teacher: '陈老师', type: '每周' },
  { id: 'c3', day: 3, name: 'UI 设计基础', period: '5-6 节', start: '14:00', end: '15:40', room: '实训楼 302', teacher: '李老师', type: '单周' },
  { id: 'c4', day: 4, name: '职业素养', period: '1-2 节', start: '08:00', end: '09:40', room: '教学楼 C201', teacher: '王老师', type: '每周' },
  { id: 'c5', day: 5, name: '前端综合实训', period: '3-4 节', start: '10:10', end: '11:50', room: '实训楼 401', teacher: '吴老师', type: '双周' },
  { id: 'c6', day: 5, name: '体育', period: '7-8 节', start: '15:50', end: '17:30', room: '田径场', teacher: '郑老师', type: '每周' }
]

const WEEK_LABELS = ['周一', '周二', '周三', '周四', '周五', '周六', '周日']
const FULL_LABELS = ['星期一', '星期二', '星期三', '星期四', '星期五', '星期六', '星期日']

// 前后各一年（52 周）
const MAX_OFFSET = 52

const DAY_MS = 24 * 60 * 60 * 1000

/** 把 'YYYY-MM-DD' 解析成本地时间，避免 new Date('2026-09-07') 按 UTC 解析导致差一天 */
function parseDate(text) {
  const parts = String(text || '').split('-')
  if (parts.length !== 3) return new Date()
  return new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]))
}

/** 取某天所在周的周一（周一为一周起点） */
function startOfWeek(date) {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate())
  const weekday = d.getDay() || 7 // 周日是 0，转成 7
  d.setDate(d.getDate() - (weekday - 1))
  return d
}

function addDays(date, n) {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate())
  d.setDate(d.getDate() + n)
  return d
}

function shortDate(date) {
  return (date.getMonth() + 1) + '/' + date.getDate()
}

Page({
  data: {
    weekNo: 0,
    weekText: '',
    weekRange: '',
    offset: 0,
    days: [],
    selectedIndex: 0,
    selectedDay: '星期一',
    courses: [],
    courseCount: 0,
    canPrev: true,
    canNext: true,
    isThisWeek: true
  },

  onLoad() {
    // 本周一（以真实日期为基准）
    this.baseMonday = startOfWeek(new Date())
    // 学期第一周的周一（来自 config.semesterStart）
    this.semesterMonday = startOfWeek(parseDate(config.semesterStart))

    this.gotoWeek(0)
  },

  onShow() {
    const tabBar = this.getTabBar && this.getTabBar()
    if (tabBar) tabBar.setData({ selected: 1 })
  },

  /* ---------------------------- 周切换 ---------------------------- */

  /**
   * 跳到相对本周的第 offset 周。
   * dayIndex 传 null 表示自动选：本周选今天，其它周选周一。
   */
  gotoWeek(offset, dayIndex) {
    const monday = addDays(this.baseMonday, offset * 7)
    const weekNo = Math.round((monday - this.semesterMonday) / (7 * DAY_MS)) + 1

    const today = new Date()
    const todayKey = today.getFullYear() + '-' + (today.getMonth() + 1) + '-' + today.getDate()

    const days = []
    for (let i = 0; i < 7; i++) {
      const d = addDays(monday, i)
      const key = d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate()
      days.push({
        label: WEEK_LABELS[i],
        date: shortDate(d),
        isToday: key === todayKey,
        selectedClass: ''
      })
    }

    let index = dayIndex
    if (index === null || index === undefined) {
      index = offset === 0 ? (today.getDay() || 7) - 1 : 0
    }

    this.applySelectedDay(days, index)

    this.setData({
      offset: offset,
      weekNo: weekNo,
      weekText: weekNo >= 1 ? '第 ' + weekNo + ' 周' : '开学前',
      weekRange: shortDate(monday) + ' – ' + shortDate(addDays(monday, 6)),
      canPrev: offset > -MAX_OFFSET,
      canNext: offset < MAX_OFFSET,
      isThisWeek: offset === 0
    })

    this.renderCourses(weekNo, index + 1)
  },

  applySelectedDay(days, index) {
    const decorated = days.map(function (item, i) {
      return Object.assign({}, item, {
        selectedClass: i === index ? 'day-selected' : ''
      })
    })

    this.setData({
      days: decorated,
      selectedIndex: index,
      selectedDay: FULL_LABELS[index]
    })
  },

  selectDay(e) {
    const index = Number(e.currentTarget.dataset.index)
    this.applySelectedDay(this.data.days, index)
    this.renderCourses(this.data.weekNo, index + 1)
  },

  prevWeek() {
    if (!this.data.canPrev) return
    this.gotoWeek(this.data.offset - 1)
  },

  nextWeek() {
    if (!this.data.canNext) return
    this.gotoWeek(this.data.offset + 1)
  },

  chooseToday() {
    this.gotoWeek(0)
  },

  /* ---------------------------- 课程渲染 ---------------------------- */

  renderCourses(weekNo, weekday) {
    const isOddWeek = weekNo % 2 !== 0

    const courses = allCourses.filter(function (item) {
      if (item.day !== weekday) return false
      // 单双周只在对应周显示；周次算不准时（开学前）按单周处理
      if (item.type === '单周' && !isOddWeek) return false
      if (item.type === '双周' && isOddWeek) return false
      return true
    })

    this.setData({ courses: courses, courseCount: courses.length })
  },

  askCourse() {
    wx.switchTab({ url: '/pages/voice/voice' })
  }
})
