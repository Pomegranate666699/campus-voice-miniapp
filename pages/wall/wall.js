const seedPosts = [
  { id: 'p1', avatar: '林', avatarTone: '', author: '林同学', time: '刚刚', category: '校园活动', content: '本周五晚 7 点操场有社团迎新活动，欢迎大家来认识新朋友。', likes: 18, comments: 4, liked: false },
  { id: 'p2', avatar: '陈', avatarTone: 'blue', author: '陈同学', time: '12 分钟前', category: '失物招领', content: '在图书馆门口捡到一张校园卡，请失主到学生事务中心领取。', likes: 9, comments: 2, liked: false },
  { id: 'p3', avatar: '周', avatarTone: 'amber', author: '周同学', time: '38 分钟前', category: '二手集市', content: '九成新的计算器和专业课教材，毕业整理，校内可以面交。', likes: 12, comments: 6, liked: false }
]
Page({
  onShow() { const tabBar = this.getTabBar && this.getTabBar(); if (tabBar) tabBar.setData({ selected: 3 }) },
  data: { postCount: 3, likes: 18,
    keyword: '',
    activeCategory: 'all',
    onlineCount: 128,
    categories: [{ id: 'all', label: '全部' }, { id: 'daily', label: '日常' }, { id: 'activity', label: '校园活动' }, { id: 'lost', label: '失物招领' }, { id: 'market', label: '二手集市' }],
    posts: seedPosts,
    filteredPosts: seedPosts
  },
  onSearch(e) { const keyword = e.detail.value.trim().toLowerCase(); this.setData({ keyword }); this.filterPosts(keyword, this.data.activeCategory) },
  clearSearch() { this.setData({ keyword: '' }); this.filterPosts('', this.data.activeCategory) },
  selectCategory(e) { const id = e.currentTarget.dataset.id; this.setData({ activeCategory: id }); this.filterPosts(this.data.keyword, id) },
  filterPosts(keyword, category) {
    const categoryMap = { activity: '校园活动', lost: '失物招领', market: '二手集市', daily: '日常' }
    const posts = this.data.posts.filter(item => (!category || category === 'all' || item.category === categoryMap[category]) && (!keyword || (item.content + item.author + item.category).toLowerCase().indexOf(keyword) >= 0))
    this.setData({ filteredPosts: posts, postCount: posts.length })
  },
  likePost(e) {
    const id = e.currentTarget.dataset.id
    const posts = this.data.posts.map(item => item.id === id ? Object.assign({}, item, { liked: !item.liked, likes: item.likes + (item.liked ? -1 : 1) }) : item)
    this.setData({ posts })
    this.filterPosts(this.data.keyword, this.data.activeCategory)
  },
  publish() { wx.showModal({ title: '发布动态', content: '演示模式下暂不连接云端，你可以在此接入校园墙发布接口。', showCancel: false }) }
})



