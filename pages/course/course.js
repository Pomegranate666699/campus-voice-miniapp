const allCourses = [
  { id: 'c1', day: 1, name: '移动应用开发', time: '第 1 - 2 节 08:00-09:40', period: '1-2 节', start: '08:00', end: '09:40', room: '教学楼 A203', teacher: '周老师', type: '每周' },
  { id: 'c2', day: 2, name: '大学英语', time: '第 3 - 4 节 10:10-11:50', period: '3-4 节', start: '10:10', end: '11:50', room: '教学楼 B106', teacher: '陈老师', type: '每周' },
  { id: 'c3', day: 3, name: 'UI 设计基础', time: '第 5 - 6 节 14:00-15:40', period: '5-6 节', start: '14:00', end: '15:40', room: '实训楼 302', teacher: '李老师', type: '单周' },
  { id: 'c4', day: 4, name: '职业素养', time: '第 1 - 2 节 08:00-09:40', period: '1-2 节', start: '08:00', end: '09:40', room: '教学楼 C201', teacher: '王老师', type: '每周' }
]
const dayNames = ['星期一', '星期二', '星期三', '星期四', '星期五', '星期六', '星期日']
function makeDays(selected) {
  return dayNames.map((label, index) => ({ label, date: '09/' + String(15 + index), selectedClass: index + 1 === selected ? 'day-selected' : '' }))
}
Page({
  onShow() { const tabBar = this.getTabBar && this.getTabBar(); if (tabBar) tabBar.setData({ selected: 1 }) },
  data: { week: 6, selectedDay: '星期一', selectedIndex: 1, days: makeDays(1), courses: allCourses.filter(item => item.day === 1), courseCount: 1 },
  selectDay(e) {
    const index = Number(e.currentTarget.dataset.index) + 1
    const courses = allCourses.filter(item => item.day === index)
    this.setData({ selectedIndex: index, selectedDay: dayNames[index - 1], days: makeDays(index), courses, courseCount: courses.length })
  },
  chooseToday() { this.selectDay({ currentTarget: { dataset: { index: 0 } } }) },
  addCourse() { wx.navigateTo({ url: '/pages/course/course' }) },
  askCourse() { wx.switchTab({ url: '/pages/voice/voice' }) }
})
