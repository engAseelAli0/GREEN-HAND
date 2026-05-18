const STAGES = {
  draft: { label: 'مسودة', color: '#94a3b8' },
  ready: { label: 'جاهز للمصنع', color: '#38bdf8' },
  production: { label: 'قيد الإنتاج', color: '#f59e0b' },
  overdue: { label: 'متأخر', color: '#fb7185' },
  received: { label: 'تم الاستلام', color: '#34d399' },
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
  const add = (severity, label, fix) => issues.push({ severity, label, fix });

  if (!data.productName) add('critical', 'اسم المنتج مفقود', 'أكمل بيانات المنتج');
  if (!data.factoryId) add('critical', 'المصنع غير محدد', 'حدد المصنع قبل الإرسال');
  if (!qty) add('critical', 'الكميات غير موجودة', 'أدخل توزيع الألوان والمقاسات');
  if (!data.deliveryDate) add('warning', 'تاريخ التسليم غير محدد', 'أضف تاريخ التسليم');
  if (!data.productPrice) add('warning', 'سعر المنتج غير موجود', 'أضف السعر قبل الفواتير');
  if (!data.currency) add('warning', 'العملة غير محددة', 'حدد العملة');
  if (!data.cartonPackage && !data.cartonQty) add('warning', 'بيانات الكراتين ناقصة', 'أكمل بيانات التغليف');
  if (!data.productImages?.length) add('info', 'لا توجد صور للمنتج', 'أضف صورة مرجعية للمصنع');
  if (data.productName && !hasLookupCode(lookups.products, data.productName, 'codePrefix')) {
    add('warning', 'كود المنتج غير محفوظ', 'أضف codePrefix في إعدادات المنتجات');
  }

  const colorNames = Object.keys(data.colorDistribution || {});
  const missingColorCodes = colorNames.filter(color => !hasLookupCode(lookups.colors, color, 'abbr'));
  if (missingColorCodes.length) {
    add('warning', `${missingColorCodes.length} لون بدون اختصار باركود`, 'أضف اختصارات الألوان');
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const deliveryDate = data.deliveryDate ? new Date(data.deliveryDate) : null;
  const daysToDelivery = deliveryDate && !Number.isNaN(deliveryDate.getTime())
    ? Math.ceil((deliveryDate - today) / 86400000)
    : null;
  if (stage !== 'received' && daysToDelivery !== null && daysToDelivery < 0) {
    add('critical', `متأخر ${Math.abs(daysToDelivery)} يوم`, 'راجع المصنع أو حدث تاريخ التسليم');
  } else if (stage !== 'received' && daysToDelivery !== null && daysToDelivery <= 3) {
    add('warning', `موعد التسليم قريب خلال ${daysToDelivery} يوم`, 'تابع الإنتاج والاستلام');
  }

  const severityWeight = { critical: 28, warning: 12, info: 4 };
  const penalty = issues.reduce((sum, issue) => sum + severityWeight[issue.severity], 0);
  const healthScore = Math.max(0, Math.min(100, 100 - penalty));
  const risk = healthScore < 55 ? 'high' : healthScore < 80 ? 'medium' : 'low';

  return {
    serial: order?.serial_number || data.serialNumber || '-',
    stage,
    stageLabel: STAGES[stage]?.label || 'غير محدد',
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

export const getStageMeta = (stage) => STAGES[stage] || { label: 'غير محدد', color: '#94a3b8' };
