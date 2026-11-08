// The demo's Overview, top to bottom: Activity (all history) and the insight banners across the top, six small cards
// (Net worth on 5Y, Earned, Spent, Safe to spend, Needs attention, Budgets), then Cash and Credit cards (medium),
// Coming up and Daily spending (small). Real installs keep the app's own defaults.
export const DEMO_DASH = {
  v: 3, units: 6, order: ['activity', 'insights', 'networth', 'earned', 'spent', 'safe', 'attention', 'budgets', 'cash', 'cards', 'bills', 'heatmap'],
  shown: ['cash', 'cards', 'heatmap'], hidden: ['spending', 'cashflow'],
  size: { activity: 'l', insights: 'l', networth: 's', earned: 's', spent: 's', safe: 's', attention: 's', budgets: 's', cash: 'm', cards: 'm', bills: 's', heatmap: 's' },
  opts: { activity: { range: 'all' } },
};
