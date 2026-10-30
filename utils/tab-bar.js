const ROUTES = [
  '/pages/test-hall/index', '/pages/my-tree/index', '/pages/user-center/index'
];

function syncTabBar(page, route) {
  if (!page || typeof page.getTabBar !== 'function') return;
  const selected = ROUTES.indexOf(route);
  const bar = page.getTabBar();
  if (selected >= 0 && bar && typeof bar.setData === 'function') bar.setData({ selected });
}

module.exports = { ROUTES, syncTabBar };
