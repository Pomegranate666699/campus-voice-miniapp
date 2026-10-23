Component({
  data:{selected:0,hidden:false,list:[
    {pagePath:'pages/index/index',text:'首页',iconPath:'/assets/home-normal.png',selectedIconPath:'/assets/home-selected.png'},
    {pagePath:'pages/course/course',text:'课程',iconPath:'/assets/course-normal.png',selectedIconPath:'/assets/course-selected.png'},
    {pagePath:'pages/voice/voice',text:'语音',iconPath:'/assets/voice-normal.png',selectedIconPath:'/assets/voice-selected.png'},
    {pagePath:'pages/wall/wall',text:'校园墙',iconPath:'/assets/wall-normal.png',selectedIconPath:'/assets/wall-selected.png'},
    {pagePath:'pages/profile/profile',text:'我的',iconPath:'/assets/profile-normal.png',selectedIconPath:'/assets/profile-selected.png'}
  ]},
  lifetimes:{attached(){this.syncSelected()}},
  pageLifetimes:{show(){this.syncSelected()}},
  methods:{
    syncSelected(){const pages=getCurrentPages();const current=pages[pages.length-1];const route=current&&current.route;const index=this.data.list.findIndex(item=>item.pagePath===route);if(index>=0)this.setData({selected:index})},
    switchTab(e){const index=Number(e.currentTarget.dataset.index);const path=e.currentTarget.dataset.path||((this.data.list[index]||{}).pagePath);if(!path)return;this.setData({selected:index});wx.switchTab({url:'/'+path,fail:()=>this.syncSelected()})}
  }
})

