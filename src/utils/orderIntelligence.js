import i18n from '../i18n';

const STAGES = {
  draft: { labelKey: 'intelligence.stages.draft', color: '#94a3b8' },
  ready: { labelKey: 'intelligence.stages.ready', color: '#38bdf8' },
  production: { labelKey: 'intelligence.stages.production', color: '#f59e0b' },
  overdue: { labelKey: 'intelligence.stages.overdue', color: '#fb7185' },
  received: { labelKey: 'intelligence.stages.received', color: '#34d399' },
};

const normalize = (value) => String(value || '').trim().toLowerCase();

export const calculateOrderQuantity = (orderData = {}) => {
  const dist = orderData.colorDistribution || {};
  const colorTotal = Object.values(dist).reduce((sum, sizes) => {
    if (!sizes || typeof sizes !== 'object') return sum;
    return sum + Object.values(sizes).reduce((s, qty) => s + (parseInt(qty, 10) || 0), 0);
  }, 0);
  return colorTotal || parseInt(orderData.totalQuantity, 10) || 0;
};

export const getReceivingStatus = (receiving) => {
  const status = receiving?.receive_data?.status || '';
  const lowered = normalize(status);
  if (lowered.includes('received') || status.includes('مستلمة') || status.includes('تم')) return 'received';
  if (status) return 'production';
  return '';
};

export const getOrderStage = (order, receiving) => {
  const data = order?.order_data || {};
  const received = getReceivingStatus(receiving) === 'received';
  if (received) return 'received';

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const delivery = data.deliveryDate ? new Date(data.deliveryDate) : null;
  if (delivery && !Number.isNaN(delivery.getTime()) && delivery < today) return 'overdue';

  if (data.factoryId && calculateOrderQuantity(data) > 0) return 'production';
  if (data.productName && data.factoryId) return 'ready';
  return 'draft';
};

const hasLookupCode = (items = [], name, key) => {
  const match = items.find(item => (typeof item === 'object' ? item.name : item) === name);
  return !!(match && typeof match === 'object' && match[key]);
};

export const analyzeOrder = (order, receiving, lookups = {}) => {
  const data = order?.order_data || {};
  const issues = [];
  const qty = calculateOrderQuantity(data);
  const stage = getOrderStage(order, receiving);
  const add = (severity, labelKey, fixKey, count) => {
    issues.push({
      severity,
      label: i18n.t(labelKey, { count }),
      fix: i18n.t(fixKey)
    });
  };

  if (!data.productName) add('critical', 'intelligence.issues.product_name_missing', 'intelligence.fixes.product_name_missing');
  if (!data.factoryId) add('critical', 'intelligence.issues.factory_missing', 'intelligence.fixes.factory_missing');
  if (!qty) add('critical', 'intelligence.issues.quantity_missing', 'intelligence.fixes.quantity_missing');
  if (!data.deliveryDate) add('warning', 'intelligence.issues.delivery_date_missing', 'intelligence.fixes.delivery_date_missing');
  if (!data.productPrice) add('warning', 'intelligence.issues.price_missing', 'intelligence.fixes.price_missing');
  if (!data.currency) add('warning', 'intelligence.issues.currency_missing', 'intelligence.fixes.currency_missing');
  if (!data.cartonPackage && !data.cartonQty) add('warning', 'intelligence.issues.carton_data_missing', 'intelligence.fixes.carton_data_missing');
  if (!data.productImages?.length) add('info', 'intelligence.issues.images_missing', 'intelligence.fixes.images_missing');
  if (data.productName && !hasLookupCode(lookups.products, data.productName, 'codePrefix')) {
    add('warning', 'intelligence.issues.code_prefix_missing', 'intelligence.fixes.code_prefix_missing');
  }

  const colorNames = Object.keys(data.colorDistribution || {});
  const missingColorCodes = colorNames.filter(color => !hasLookupCode(lookups.colors, color, 'abbr'));
  if (missingColorCodes.length) {
    add('warning', 'intelligence.issues.color_abbr_missing', 'intelligence.fixes.color_abbr_missing', missingColorCodes.length);
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const deliveryDate = data.deliveryDate ? new Date(data.deliveryDate) : null;
  const daysToDelivery = deliveryDate && !Number.isNaN(deliveryDate.getTime())
    ? Math.ceil((deliveryDate - today) / 86400000)
    : null;
  if (stage !== 'received' && daysToDelivery !== null && daysToDelivery < 0) {
    add('critical', 'intelligence.issues.overdue_days', 'intelligence.fixes.overdue_days', Math.abs(daysToDelivery));
  } else if (stage !== 'received' && daysToDelivery !== null && daysToDelivery <= 3) {
    add('warning', 'intelligence.issues.delivery_soon', 'intelligence.fixes.delivery_soon', daysToDelivery);
  }

  const severityWeight = { critical: 28, warning: 12, info: 4 };
  const penalty = issues.reduce((sum, issue) => sum + severityWeight[issue.severity], 0);
  const healthScore = Math.max(0, Math.min(100, 100 - penalty));
  const risk = healthScore < 55 ? 'high' : healthScore < 80 ? 'medium' : 'low';

  return {
    serial: order?.serial_number || data.serialNumber || '-',
    stage,
    stageLabel: STAGES[stage]?.labelKey ? i18n.t(STAGES[stage].labelKey) : i18n.t('intelligence.stages.undefined'),
    stageColor: STAGES[stage]?.color || '#94a3b8',
    issues,
    criticalCount: issues.filter(i => i.severity === 'critical').length,
    warningCount: issues.filter(i => i.severity === 'warning').length,
    healthScore,
    risk,
    quantity: qty,
    daysToDelivery,
  };
};

export const buildOperationalIntelligence = (orders = [], receivings = [], lookups = {}) => {
  const receivingMap = new Map(receivings.map(item => [item.serial_number, item]));
  const analyzed = orders.map(order => analyzeOrder(order, receivingMap.get(order.serial_number), lookups));
  const stageCounts = analyzed.reduce((acc, item) => {
    acc[item.stage] = (acc[item.stage] || 0) + 1;
    return acc;
  }, {});
  const riskCounts = analyzed.reduce((acc, item) => {
    acc[item.risk] = (acc[item.risk] || 0) + 1;
    return acc;
  }, { low: 0, medium: 0, high: 0 });
  const issueCounts = new Map();
  analyzed.forEach(item => {
    item.issues.forEach(issue => {
      const key = issue.label;
      const existing = issueCounts.get(key) || {
        label: key,
        severity: issue.severity,
        fix: issue.fix,
        count: 0,
        serials: []
      };
      existing.count += 1;
      if (item.serial) existing.serials.push(item.serial);
      issueCounts.set(key, existing);
    });
  });

  const topIssues = [...issueCounts.values()]
    .sort((a, b) => b.count - a.count)
    .slice(0, 6);
  const urgentOrders = analyzed
    .filter(item => item.risk === 'high' || item.stage === 'overdue' || (item.daysToDelivery !== null && item.daysToDelivery <= 3))
    .sort((a, b) => a.healthScore - b.healthScore)
    .slice(0, 8);
  const avgHealth = analyzed.length
    ? Math.round(analyzed.reduce((sum, item) => sum + item.healthScore, 0) / analyzed.length)
    : 100;

  return {
    analyzed,
    avgHealth,
    totalQuantity: analyzed.reduce((sum, item) => sum + item.quantity, 0),
    stageCounts,
    riskCounts,
    topIssues,
    urgentOrders,
  };
};

export const getStageMeta = (stage) => {
  const meta = STAGES[stage];
  if (!meta) return { label: i18n.t('intelligence.stages.undefined'), color: '#94a3b8' };
  return {
    label: i18n.t(meta.labelKey),
    color: meta.color
  };
};
