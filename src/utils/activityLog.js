import i18n from '../i18n';

const MAX_ACTIVITY_ITEMS = 80;

const ACTION_META = {
  create: { label: () => i18n.t('activity.create'), color: '#38bdf8' },
  update: { label: () => i18n.t('activity.update'), color: '#f59e0b' },
  copy: { label: () => i18n.t('activity.copy'), color: '#a78bfa' },
  delete: { label: () => i18n.t('activity.delete'), color: '#fb7185' },
  barcode_print: { label: () => i18n.t('activity.barcode_print'), color: '#22c55e' },
  barcode_sample: { label: () => i18n.t('activity.barcode_sample'), color: '#0ea5e9' },
  receive: { label: () => i18n.t('activity.receive'), color: '#34d399' },
};

const importantFields = [
  ['productName', 'activity.fields.productName'],
  ['factoryId', 'activity.fields.factoryId'],
  ['totalQuantity', 'activity.fields.totalQuantity'],
  ['deliveryDate', 'activity.fields.deliveryDate'],
  ['productPrice', 'activity.fields.productPrice'],
  ['currency', 'activity.fields.currency'],
  ['cartonPackage', 'activity.fields.cartonPackage'],
  ['cartonQty', 'activity.fields.cartonQty'],
  ['barcode', 'activity.fields.barcode'],
];

export const getActorName = (user) => user?.username || user?.email || 'system';

export const summarizeOrderChanges = (before = {}, after = {}) => {
  const changes = [];
  importantFields.forEach(([key, keyLabel]) => {
    const prev = String(before?.[key] ?? '');
    const next = String(after?.[key] ?? '');
    if (prev !== next) changes.push({ field: key, label: i18n.t(keyLabel), from: prev || '-', to: next || '-' });
  });

  const beforeColors = Object.keys(before?.colorDistribution || {}).length;
  const afterColors = Object.keys(after?.colorDistribution || {}).length;
  if (beforeColors !== afterColors) {
    changes.push({ field: 'colorDistribution', label: i18n.t('activity.fields.color_count'), from: String(beforeColors), to: String(afterColors) });
  }

  return changes.slice(0, 8);
};

export const createActivityItem = ({ action, user, note, changes = [], meta = {} }) => {
  const actionMeta = ACTION_META[action] || { label: () => action, color: '#94a3b8' };
  const label = typeof actionMeta.label === 'function' ? actionMeta.label() : actionMeta.label;
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    action,
    actionLabel: label,
    color: actionMeta.color,
    actor: getActorName(user),
    at: new Date().toISOString(),
    note: note || label,
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

export const getActivityActionLabel = (item, t) => {
  if (!item) return '';
  const key = `activity.${item.action}`;
  const translated = t(key);
  if (translated && translated !== key) return translated;
  return item.actionLabel || item.action || '';
};

export const getActivityNote = (item, t) => {
  if (!item) return '';
  switch (item.action) {
    case 'create':
      return t('activity.notes.created', { serial: item.serial || item.meta?.serial || '' });
    case 'update':
      return t('activity.notes.updated', { serial: item.serial || item.meta?.serial || '' });
    case 'delete':
      return t('activity.notes.deleted', { serial: item.serial || item.meta?.serial || '' });
    case 'copy':
      return t('activity.notes.copied', { 
        from: item.meta?.copiedFrom || '', 
        to: item.serial || item.meta?.to || '' 
      });
    case 'receive':
      const count = item.meta?.pieces || (typeof item.note === 'string' ? parseInt(item.note.replace(/\D/g, ''), 10) : '') || '';
      return t('activity.notes.received', { count });
    default:
      return t(item.note) || item.note || '';
  }
};

export const formatActivityTime = (iso) => {
  if (!iso) return '-';
  try {
    return new Date(iso).toLocaleString(i18n.language === 'ar' ? 'ar-SA' : (i18n.language === 'zh' ? 'zh-CN' : 'en-GB'), {
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
