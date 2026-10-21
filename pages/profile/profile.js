Page({onShow(){const tabBar=this.getTabBar&&this.getTabBar();if(tabBar)tabBar.setData({selected:4})},history(){wx.showToast({title:'暂无问答记录',icon:'none'})},privacy(){wx.showToast({title:'数据仅保存在当前设备',icon:'none'})},feedback(){wx.showToast({title:'感谢你的反馈',icon:'none'})}})

