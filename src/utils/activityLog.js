const MAX_ACTIVITY_ITEMS = 80;

const ACTION_META = {
  create: { label: 'إنشاء الطلب', color: '#38bdf8' },
  update: { label: 'تحديث الطلب', color: '#f59e0b' },
  copy: { label: 'نسخ الطلب', color: '#a78bfa' },
  delete: { label: 'حذف الطلب', color: '#fb7185' },
  barcode_print: { label: 'طباعة الباركود', color: '#22c55e' },
  barcode_sample: { label: 'طباعة عينة باركود', color: '#0ea5e9' },
  receive: { label: 'استلام المصنع', color: '#34d399' },
};

const importantFields = [
  ['productName', 'اسم المنتج'],
  ['factoryId', 'المصنع'],
  ['totalQuantity', 'إجمالي الكمية'],
  ['deliveryDate', 'تاريخ التسليم'],
  ['productPrice', 'السعر'],
  ['currency', 'العملة'],
  ['cartonPackage', 'تعبئة الكرتون'],
  ['cartonQty', 'عدد الكراتين'],
  ['barcode', 'الباركود الأساسي'],
];

export const getActorName = (user) => user?.username || user?.email || 'system';

export const summarizeOrderChanges = (before = {}, after = {}) => {
  const changes = [];
  importantFields.forEach(([key, label]) => {
    const prev = String(before?.[key] ?? '');
    const next = String(after?.[key] ?? '');
    if (prev !== next) changes.push({ field: key, label, from: prev || '-', to: next || '-' });
  });

  const beforeColors = Object.keys(before?.colorDistribution || {}).length;
  const afterColors = Object.keys(after?.colorDistribution || {}).length;
  if (beforeColors !== afterColors) {
    changes.push({ field: 'colorDistribution', label: 'عدد الألوان', from: String(beforeColors), to: String(afterColors) });
  }

  return changes.slice(0, 8);
};

export const createActivityItem = ({ action, user, note, changes = [], meta = {} }) => {
  const actionMeta = ACTION_META[action] || { label: action, color: '#94a3b8' };
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    action,
    actionLabel: actionMeta.label,
    color: actionMeta.color,
    actor: getActorName(user),
    at: new Date().toISOString(),
    note: note || actionMeta.label,
    changes,
    meta,
  };
};

export const appendActivity = (orderData = {}, item) => ({
  ...orderData,
  activityLog: [item, ...(orderData.activityLog || [])].slice(0, MAX_ACTIVITY_ITEMS),
});

export const activitySummary = (items = []) => {
  const byAction = items.reduce((acc, item) => {
    acc[item.action] = (acc[item.action] || 0) + 1;
    return acc;
  }, {});
  return {
    total: items.length,
    last: items[0],
    prints: (byAction.barcode_print || 0) + (byAction.barcode_sample || 0),
    updates: byAction.update || 0,
    receives: byAction.receive || 0,
  };
};

export const formatActivityTime = (iso) => {
  if (!iso) return '-';
  try {
    return new Date(iso).toLocaleString('ar-SA', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
};
