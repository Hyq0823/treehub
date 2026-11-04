const OPTIONS = [
  { id: 'relationship', label: '恋爱中', icon: '♡' },
  { id: 'breakup', label: '分手后', icon: '☾' },
  { id: 'work', label: '工作变化', icon: '↗' },
  { id: 'overthinking', label: '最近内耗', icon: '∿' },
  { id: 'ordinary', label: '普通记录', icon: '·' }
];

function getContext(id) {
  return OPTIONS.find(item => item.id === id) || null;
}

function getContextLabel(id) {
  const item = getContext(id);
  return item ? item.label : '';
}

module.exports = { OPTIONS, getContext, getContextLabel };
