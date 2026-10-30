const { ROUTES } = require('../utils/tab-bar.js');
Component({
  data: {
    selected: 0,
    tabs: [
      { label: '探索', icon: 'home' },
      { label: '我的树', icon: 'tree' },
      { label: '档案', icon: 'archive' }
    ]
  },
  lifetimes: {
    attached() {
      if (typeof getCurrentPages !== 'function') return;
      const pages = getCurrentPages();
      const last = pages[pages.length - 1];
      const selected = last ? ROUTES.indexOf('/' + last.route) : -1;
      if (selected >= 0) this.setData({ selected });
    }
  },
  methods: {
    switchTab(event) {
      const index = Number(event.currentTarget.dataset.index);
      if (!Number.isInteger(index) || !ROUTES[index] || index === this.data.selected || this._switching) return;
      this._switching = true;
      wx.switchTab({
        url: ROUTES[index],
        success: () => this.setData({ selected: index }),
        fail: () => wx.showToast({ title: '页面暂未打开，请再试一次', icon: 'none' }),
        complete: () => { this._switching = false; }
      });
    }
  }
});
