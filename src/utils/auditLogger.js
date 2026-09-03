import { supabase } from '../supabaseClient.js';
import * as XLSX from 'xlsx';

const LOCAL_STORAGE_KEY = 'gh_system_audit_logs';
const MAX_LOCAL_ENTRIES = 500;

export const ACTION_TYPES = {
  CREATE: { label: 'إضافة', color: '#10b981', bg: 'rgba(16, 185, 129, 0.12)', border: 'rgba(16, 185, 129, 0.3)' },
  UPDATE: { label: 'تعديل', color: '#f59e0b', bg: 'rgba(245, 158, 11, 0.12)', border: 'rgba(245, 158, 11, 0.3)' },
  DELETE: { label: 'حذف', color: '#ef4444', bg: 'rgba(239, 68, 68, 0.12)', border: 'rgba(239, 68, 68, 0.3)' },
  COPY: { label: 'نسخ', color: '#8b5cf6', bg: 'rgba(139, 92, 246, 0.12)', border: 'rgba(139, 92, 246, 0.3)' },
  RECEIVE: { label: 'استلام', color: '#06b6d4', bg: 'rgba(6, 182, 212, 0.12)', border: 'rgba(6, 182, 212, 0.3)' },
  PRINT: { label: 'طباعة', color: '#3b82f6', bg: 'rgba(59, 130, 246, 0.12)', border: 'rgba(59, 130, 246, 0.3)' },
  EXPORT: { label: 'تصدير', color: '#14b8a6', bg: 'rgba(20, 184, 166, 0.12)', border: 'rgba(20, 184, 166, 0.3)' },
  SECURITY: { label: 'أمان ومستخدمين', color: '#ec4899', bg: 'rgba(236, 72, 153, 0.12)', border: 'rgba(236, 72, 153, 0.3)' },
  AUTH: { label: 'تسجيل دخول', color: '#6366f1', bg: 'rgba(99, 102, 241, 0.12)', border: 'rgba(99, 102, 241, 0.3)' },
  SETTINGS: { label: 'إعدادات النظام', color: '#eab308', bg: 'rgba(234, 179, 8, 0.12)', border: 'rgba(234, 179, 8, 0.3)' },
  RESTORE: { label: 'استعادة طلبية', color: '#22c55e', bg: 'rgba(34, 197, 94, 0.12)', border: 'rgba(34, 197, 94, 0.3)' },
};

export const SYSTEM_SCREENS = {
  entry: { key: 'entry', nameAr: 'أوامر الإنتاج وتوثيق الطلبات', icon: '📝', color: '#d4af37' },
  'order-reports': { key: 'order-reports', nameAr: 'تقارير ومطابقة الطلبيات', icon: '📋', color: '#f59e0b' },
  export: { key: 'export', nameAr: 'مستندات وفواتير التصدير', icon: '📤', color: '#60a5fa' },
  receiving: { key: 'receiving', nameAr: 'استلام بضائع الشركة', icon: '📥', color: '#4ade80' },
  'factory-portal': { key: 'factory-portal', nameAr: 'بوابة صاحب المصنع', icon: '🏭', color: '#d4af37' },
  barcodes: { key: 'barcodes', nameAr: 'استخراج وطباعة الباركود', icon: '🏷️', color: '#fb923c' },
  analytics: { key: 'analytics', nameAr: 'التحليلات الاستراتيجية', icon: '📈', color: '#ec4899' },
  reports: { key: 'reports', nameAr: 'التقارير والإحصائيات', icon: '📊', color: '#ec4899' },
  'shipping-invoice': { key: 'shipping-invoice', nameAr: 'فاتورة الشحن', icon: '🧾', color: '#06b6d4' },
  'packing-list': { key: 'packing-list', nameAr: 'فاتورة الجمارك (بيان التعبئة)', icon: '📦', color: '#10b981' },
  'warehouse-receipt': { key: 'warehouse-receipt', nameAr: 'تقرير استلام البضائع (المستودع)', icon: '🏢', color: '#f59e0b' },
  admin: { key: 'admin', nameAr: 'لوحة الإدارة والمستخدمين', icon: '👑', color: '#a78bfa' },
  auth: { key: 'auth', nameAr: 'شاشة تسجيل الدخول', icon: '🔐', color: '#6366f1' },
};

export const getScreenInfo = (log) => {
  const directKey = log?.details?.screenKey || log?.screenKey;
  if (directKey && SYSTEM_SCREENS[directKey]) {
    return SYSTEM_SCREENS[directKey];
  }
  const directName = log?.details?.screenName || log?.screenName;
  if (directName) {
    return { nameAr: directName, icon: '🖥️', color: 'var(--accent-color)' };
  }

  // Deduce intelligently from action and entity_type
  const act = (log?.action || '').toUpperCase();
  const ent = (log?.entity_type || '').toLowerCase();

  if (act.includes('BARCODE')) return SYSTEM_SCREENS.barcodes;
  if (act.includes('CONTRACT')) return SYSTEM_SCREENS['order-reports'];
  if (act.includes('EXPORT_DOC')) return SYSTEM_SCREENS.export;
  if (act.includes('RECEIVE') || ent === 'receiving') return SYSTEM_SCREENS.receiving;
  if (act.includes('FACTORY') || ent === 'factory') return SYSTEM_SCREENS['factory-portal'];
  if (act.includes('INVOICE') || ent === 'shipping-invoice') return SYSTEM_SCREENS['shipping-invoice'];
  if (act.includes('PACKING') || ent === 'packing-list') return SYSTEM_SCREENS['packing-list'];
  if (act.includes('WAREHOUSE') || ent === 'warehouse-receipt') return SYSTEM_SCREENS['warehouse-receipt'];
  if (act.startsWith('USER_') || act.startsWith('SECURITY') || ent === 'user' || ent === 'system_user') return SYSTEM_SCREENS.admin;
  if (act.startsWith('LOOKUP') || ent === 'lookup') return SYSTEM_SCREENS.admin;
  if (act.startsWith('AUTH_') || act.startsWith('LOGIN') || act.startsWith('LOGOUT') || ent === 'auth') return SYSTEM_SCREENS.auth;
  if (act.startsWith('ORDER_') || ent === 'order') return SYSTEM_SCREENS.entry;

  return { nameAr: 'شاشة أوامر الإنتاج', icon: '📝', color: 'var(--accent-color)' };
};

export const FIELD_TRANSLATIONS_AR = {
  // Chinese labels
  '产品名称': 'اسم المنتج',
  '工厂': 'المصنع',
  '总数量': 'إجمالي الكمية',
  '交货日期': 'تاريخ التسليم',
  '单价': 'سعر القطعة',
  '币种': 'العملة',
  '装箱方式': 'طريقة التعبئة (سعة الكرتون)',
  '装箱数量': 'عدد الكراتين والتعبئة',
  '主条形码': 'الباركود الرئيسي',
  '条形码': 'الباركود',
  '颜色数量': 'عدد الألوان',
  '颜色分布': 'توزيع الألوان والمقاسات',
  '面料': 'نوع القماش',
  '备注': 'الملاحظات والتعليمات',
  '买方': 'المشتري / العميل',
  '商标': 'العلامة التجارية',
  '箱规': 'مقاس وحجم الكرتون',
  '包装条件': 'شروط التعبئة والتغليف',
  '材料': 'المواد والخامات',
  '尺码': 'المقاسات',
  '尺码表': 'جدول المقاسات',
  '价格': 'السعر',
  '数量': 'الكمية',
  '订单号': 'رقم الطلب',
  '款号': 'رقم الموديل',
  '状态': 'الحالة',

  // English keys
  productName: 'اسم المنتج',
  factoryId: 'المصنع',
  totalQuantity: 'إجمالي الكمية',
  deliveryDate: 'تاريخ التسليم',
  requestDate: 'تاريخ الطلب',
  productPrice: 'سعر القطعة',
  currency: 'العملة',
  cartonPackage: 'طريقة التعبئة (سعة الكرتون)',
  cartonQty: 'عدد الكراتين والتعبئة',
  barcode: 'الباركود الرئيسي',
  productBarcode: 'باركود المنتج',
  colorDistribution: 'توزيع الألوان والمقاسات',
  color_count: 'عدد الألوان',
  colors: 'الألوان',
  sizes: 'المقاسات',
  fabric: 'نوع القماش',
  remarks: 'الملاحظات والتعليمات',
  buyerCompany: 'شركة المشتري',
  buyerId: 'معرف / اسم المشتري',
  buyerMobile: 'رقم هاتف المشتري',
  tradeMark: 'العلامة التجارية',
  cartonSize: 'مقاس الكرتون',
  packagingConditions: 'شروط التعبئة والتغليف',
  materials: 'المواد والخامات',
  serialNumber: 'رقم الموديل',
  orderNumber: 'رقم الطلب',
  productImages: 'صور المنتج',
  status: 'حالة الطلبية',
};

export const translateFieldToArabic = (fieldKeyOrLabel) => {
  if (!fieldKeyOrLabel) return '-';
  const str = String(fieldKeyOrLabel).trim();
  
  if (FIELD_TRANSLATIONS_AR[str]) {
    return FIELD_TRANSLATIONS_AR[str];
  }
  
  for (const [k, v] of Object.entries(FIELD_TRANSLATIONS_AR)) {
    if (str.toLowerCase() === k.toLowerCase()) {
      return v;
    }
  }
  
  return str;
};

export const getCopiedFromModel = (log) => {
  if (!log) return null;
  const entityId = log.entity_id ? String(log.entity_id).trim() : '';

  let candidate = log.details?.copiedFrom ? String(log.details.copiedFrom).trim() : null;

  if (!candidate && log.details?.meta?.copiedFrom) {
    candidate = String(log.details.meta.copiedFrom).trim();
  }

  if (!candidate && log.summary) {
    const matchAr = log.summary.match(/من\s*(?:الموديل\s*الأصلي|الموديل|الطلبية)\s*#?([A-Za-z0-9-_]+)/);
    if (matchAr && matchAr[1]) candidate = matchAr[1].trim();

    if (!candidate) {
      const matchZh = log.summary.match(/从\s*([A-Za-z0-9-_]+)\s*复制/);
      if (matchZh && matchZh[1]) candidate = matchZh[1].trim();
    }

    if (!candidate) {
      const matchEn = log.summary.match(/from\s*#?([A-Za-z0-9-_]+)/i);
      if (matchEn && matchEn[1]) candidate = matchEn[1].trim();
    }
  }

  // An order is NEVER copied from itself to itself.
  // If candidate is identical to entity_id, it is a legacy logging artifact where both from and to received newSerial.
  if (candidate && entityId && candidate.toLowerCase() === entityId.toLowerCase()) {
    return null;
  }

  return candidate || null;
};

export const formatDetailedLogSummary = (log) => {
  if (!log) return '';
  const screen = getScreenInfo(log);
  const screenLabel = screen?.nameAr ? `[شاشة ${screen.nameAr}]` : '';
  const u = log.username || 'الموظف';
  const id = log.entity_id ? `#${log.entity_id}` : '';
  
  const act = (log.action || '').toUpperCase();
  const actType = (log.action_type || '').toUpperCase();

  // Special handling for COPY action
  if (act.includes('COPY') || actType === 'COPY') {
    const fromModel = getCopiedFromModel(log);
    if (fromModel) {
      return `قام الموظف [${u}] بنسخ بيانات الطلبية من الموديل الأصلي [#${fromModel}] وتوليد موديل جديد برقم [${id}] من ${screenLabel}.`;
    }
    return `قام الموظف [${u}] بإنشاء وتوثيق طلبية مستنسخة برقم [${id}] من ${screenLabel}.`;
  }

  // Special handling for UPDATE action (details what was modified)
  if (act.includes('UPDATE') || actType === 'UPDATE') {
    if (log.details?.changes && Array.isArray(log.details.changes) && log.details.changes.length > 0) {
      const changesList = log.details.changes.map(c => {
        const fieldAr = translateFieldToArabic(c.label || c.field);
        return `${fieldAr}: (${c.from || '-'} ➔ ${c.to || '-'})`;
      }).join('، ');
      return `قام الموظف [${u}] بتعديل بيانات الطلبية ${id} من ${screenLabel}، شمل التعديل: [${changesList}].`;
    }
    return `قام الموظف [${u}] بحفظ وتحديث سجل الطلبية ${id} من ${screenLabel} (تحديث عام للبيانات/الملاحظات/الصور).`;
  }

  if (log.summary && log.summary.includes('من شاشة')) {
    return log.summary;
  }
  
  if (act.includes('CREATE') && id) {
    const qty = log.details?.totalQuantity ? `بإجمالي كمية (${log.details.totalQuantity} قطعة)` : '';
    const buyer = log.details?.buyerCompany || log.details?.client ? `للمشتري (${log.details.buyerCompany || log.details.client})` : '';
    return `قام الموظف [${u}] بإضافة وتوثيق طلبية جديدة للموديل ${id} ${buyer} ${qty} من ${screenLabel}.`;
  }
  if (act.includes('DELETE') && id) {
    return `قام الموظف [${u}] بحذف الطلبية رقم ${id} نهائياً من ${screenLabel}.`;
  }
  if (act.includes('RECEIVE') && id) {
    return `قام الموظف [${u}] باستلام كراتين بضاعة للموديل ${id} من ${screenLabel}.`;
  }
  if (act.includes('PRINT')) {
    return `قام الموظف [${u}] بعملية طباعة للموديل ${id} من ${screenLabel}.`;
  }
  if (act.includes('EXPORT')) {
    return `قام الموظف [${u}] بتصدير تقرير بيانات من ${screenLabel}.`;
  }
  if (act.includes('LOGIN')) {
    return `قام الموظف [${u}] بتسجيل الدخول إلى النظام عبر ${screenLabel}.`;
  }
  if (act.includes('LOGOUT')) {
    return `قام الموظف [${u}] بتسجيل الخروج من النظام.`;
  }
  
  return log.summary ? `${log.summary} - من ${screenLabel}` : `إجراء في النظام بواسطة [${u}] من ${screenLabel}`;
};

const isBrowser = typeof window !== 'undefined' && typeof localStorage !== 'undefined';
const memCache = [];

const safeStorageGet = (key) => isBrowser ? localStorage.getItem(key) : null;
const safeStorageSet = (key, val) => isBrowser ? localStorage.setItem(key, val) : null;
const safeStorageRemove = (key) => isBrowser ? localStorage.removeItem(key) : null;

/**
 * Get locally stored audit entries
 */
export const getLocalAuditLogs = () => {
  if (!isBrowser) return [...memCache];
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (err) {
    console.error('Error reading local audit logs:', err);
    return [];
  }
};

/**
 * Save entries to local storage
 */
const saveLocalAuditLogs = (logs) => {
  if (!isBrowser) {
    memCache.length = 0;
    memCache.push(...logs.slice(0, MAX_LOCAL_ENTRIES));
    return;
  }
  try {
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(logs.slice(0, MAX_LOCAL_ENTRIES)));
  } catch (err) {
    console.error('Error saving local audit logs:', err);
  }
};

/**
 * Logs a system audit event with dual resilience (Local buffer + Supabase cloud)
 */
export const logAuditEvent = async ({
  action,
  actionType = 'UPDATE',
  entityType = 'order',
  entityId = '',
  user = null,
  screenKey = '',
  screenName = '',
  summary = '',
  details = {},
}) => {
  try {
    // Determine user info
    let username = user?.username;
    let role = user?.role;
    let userId = user?.id;

    if (!username) {
      try {
        const { data: sessionData } = await supabase.auth.getSession();
        const sessionUser = sessionData?.session?.user;
        if (sessionUser) {
          username = sessionUser.user_metadata?.username || sessionUser.email?.replace('@greenhand.local', '') || 'system';
          role = sessionUser.user_metadata?.role || 'user';
          userId = sessionUser.id;
        }
      } catch (authErr) {
        console.warn('Could not detect session user for audit log:', authErr);
      }
    }

    username = username || 'system';
    role = role || 'guest';

    const screenMeta = screenKey && SYSTEM_SCREENS[screenKey] ? SYSTEM_SCREENS[screenKey] : null;
    const finalScreenName = screenName || screenMeta?.nameAr || details.screenName || null;
    const enrichedDetails = {
      ...details,
      screenKey: screenKey || details.screenKey || null,
      screenName: finalScreenName,
    };

    const logEntry = {
      id: typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      created_at: new Date().toISOString(),
      action: action || 'UNKNOWN_ACTION',
      action_type: actionType,
      entity_type: entityType,
      entity_id: String(entityId || ''),
      user_id: userId || null,
      username,
      user_role: role,
      summary: summary || action || 'إجراء في النظام',
      details: enrichedDetails,
      user_agent: typeof navigator !== 'undefined' ? navigator.userAgent : null,
      synced: false,
    };

    // 1. Immediately store in local cache (guarantees zero data loss)
    const existingLogs = getLocalAuditLogs();
    saveLocalAuditLogs([logEntry, ...existingLogs]);

    // 2. Asynchronously transmit to Supabase table
    try {
      const { synced, ...dbPayload } = logEntry;
      const { error } = await supabase.from('system_audit_logs').insert([dbPayload]);
      if (!error) {
        // Mark as synced locally
        const currentLogs = getLocalAuditLogs();
        const updated = currentLogs.map(item => item.id === logEntry.id ? { ...item, synced: true } : item);
        saveLocalAuditLogs(updated);
        safeStorageRemove('gh_audit_table_pending');
      } else {
        if (error.code === 'PGRST205' || error.message?.includes('schema cache') || error.message?.includes('does not exist')) {
          safeStorageSet('gh_audit_table_pending', 'true');
        }
        console.warn('Supabase audit log insert notice:', error.message);
      }
    } catch (dbErr) {
      console.warn('Failed to insert audit log to Supabase, retained locally:', dbErr);
    }

    return logEntry;
  } catch (err) {
    console.error('Fatal error logging audit event:', err);
    return null;
  }
};

/**
 * Fetch audit logs combining Supabase cloud and local buffer
 */
export const fetchAuditLogs = async ({ limit = 5000 } = {}) => {
  let cloudLogs = [];
  let isCloudConnected = false;

  try {
    const { data, error } = await supabase
      .from('system_audit_logs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (!error && data) {
      cloudLogs = data;
      isCloudConnected = true;
      safeStorageRemove('gh_audit_table_pending');
    } else {
      if (error?.code === 'PGRST205') {
        safeStorageSet('gh_audit_table_pending', 'true');
      }
    }
  } catch (err) {
    console.warn('Could not query Supabase system_audit_logs:', err);
  }

  // Merge with local logs
  const localLogs = getLocalAuditLogs();
  const cloudIds = new Set(cloudLogs.map(l => l.id));

  // Find local items not in cloud yet
  const unsyncedLocal = localLogs.filter(l => !cloudIds.has(l.id));

  // Combine and sort by date descending
  const combined = [...unsyncedLocal, ...cloudLogs].sort((a, b) => {
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });

  return {
    logs: combined.slice(0, limit),
    isCloudConnected,
    hasUnsynced: unsyncedLocal.length > 0,
    tablePending: safeStorageGet('gh_audit_table_pending') === 'true' && !isCloudConnected,
  };
};

/**
 * 1-Click Restore a Deleted Order from Audit Log
 */
export const restoreDeletedOrder = async (logEntry, user) => {
  try {
    const snapshot = logEntry?.details?.fullSnapshot;
    const serialNumber = logEntry?.entity_id || snapshot?.serialNumber;

    if (!serialNumber || !snapshot) {
      throw new Error('لا تتوفر نسخة بيانات صالحة لاستعادة هذه الطلبية');
    }

    // Check if order already exists to prevent overwrite
    const { data: existing } = await supabase
      .from('orders')
      .select('id')
      .eq('serial_number', serialNumber)
      .maybeSingle();

    if (existing) {
      throw new Error(`الطلبية برقم ${serialNumber} موجودة بالفعل في النظام حالياً`);
    }

    // Insert back into orders
    const payload = {
      serial_number: serialNumber,
      order_data: snapshot,
    };

    const { error } = await supabase.from('orders').insert([payload]);
    if (error) throw error;

    // Log the restore event
    await logAuditEvent({
      action: 'RESTORE_ORDER',
      actionType: 'RESTORE',
      entityType: 'order',
      entityId: serialNumber,
      user,
      summary: `تم استعادة الطلبية المحذوفة رقم ${serialNumber} بنجاح إلى النظام`,
      details: {
        restoredFromAuditId: logEntry.id,
        restoredAt: new Date().toISOString(),
      },
    });

    return { success: true };
  } catch (err) {
    console.error('Error restoring order:', err);
    return { success: false, error: err.message };
  }
};

/**
 * Scan existing orders and local archive to import historical activity
 */
export const scanAndImportExistingOrderLogs = async (user) => {
  let importedCount = 0;
  try {
    const existingAudit = getLocalAuditLogs();
    const existingKeys = new Set(existingAudit.map(e => `${e.entity_id}_${e.action}_${e.created_at?.slice(0, 16)}`));
    const newEntries = [];

    // 1. Scan orders table for embedded activityLog
    const { data: orders, error } = await supabase.from('orders').select('serial_number, order_data, created_at');
    if (!error && orders) {
      orders.forEach(order => {
        const serial = order.serial_number;
        const activities = order.order_data?.activityLog || [];
        activities.forEach(act => {
          const createdAt = act.at || order.created_at || new Date().toISOString();
          const key = `${serial}_${act.action}_${createdAt.slice(0, 16)}`;
          if (!existingKeys.has(key)) {
            existingKeys.add(key);
            let actionType = 'UPDATE';
            if (act.action === 'create') actionType = 'CREATE';
            else if (act.action === 'copy') actionType = 'COPY';
            else if (act.action === 'delete') actionType = 'DELETE';
            else if (act.action === 'receive') actionType = 'RECEIVE';
            else if (act.action?.includes('print') || act.action?.includes('barcode')) actionType = 'PRINT';

            newEntries.push({
              id: act.id || `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
              created_at: createdAt,
              action: `ORDER_${(act.action || 'activity').toUpperCase()}`,
              action_type: actionType,
              entity_type: 'order',
              entity_id: serial,
              username: act.actor || 'system',
              user_role: 'data_entry',
              summary: act.note || `إجراء على الطلبية ${serial}`,
              details: {
                changes: act.changes || [],
                meta: act.meta || {},
                historical: true,
              },
              synced: false,
            });
            importedCount++;
          }
        });
      });
    }

    // 2. Scan deleted archive
    try {
      const rawArchive = safeStorageGet('gh_deleted_activity_archive');
      if (rawArchive) {
        const deletedItems = JSON.parse(rawArchive);
        deletedItems.forEach(item => {
          const serial = item.serial_number;
          const createdAt = item.deletedAt || new Date().toISOString();
          const key = `${serial}_DELETE_ORDER_${createdAt.slice(0, 16)}`;
          if (!existingKeys.has(key)) {
            existingKeys.add(key);
            newEntries.push({
              id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
              created_at: createdAt,
              action: 'DELETE_ORDER',
              action_type: 'DELETE',
              entity_type: 'order',
              entity_id: serial,
              username: item.order_data?.activityLog?.[0]?.actor || 'system',
              user_role: 'data_entry',
              summary: `تم حذف الطلبية برقم ${serial}`,
              details: {
                fullSnapshot: item.order_data,
                historical: true,
              },
              synced: false,
            });
            importedCount++;
          }
        });
      }
    } catch (arcErr) {
      console.warn('Error reading deleted archive:', arcErr);
    }

    if (newEntries.length > 0) {
      const merged = [...newEntries, ...existingAudit];
      saveLocalAuditLogs(merged);

      // Attempt to batch push to Supabase if table exists (in chunks of 200)
      try {
        const payloads = newEntries.map(({ synced, id, ...rest }) => rest);
        const CHUNK_SIZE = 200;
        for (let i = 0; i < payloads.length; i += CHUNK_SIZE) {
          const chunk = payloads.slice(i, i + CHUNK_SIZE);
          const { error: chunkErr } = await supabase.from('system_audit_logs').insert(chunk);
          if (chunkErr) {
            console.warn('Batch chunk insert error:', chunkErr.message);
          }
        }
      } catch (insertErr) {
        console.warn('Could not push historical logs to Supabase:', insertErr);
      }
    }

    return { count: importedCount };
  } catch (err) {
    console.error('Error importing existing order logs:', err);
    return { count: 0, error: err.message };
  }
};

/**
 * Export filtered audit logs to Excel
 */
export const exportAuditLogsToExcel = (logs, fileName = 'System_Audit_Log') => {
  try {
    const rows = logs.map((log, index) => {
      const actionTypeMeta = ACTION_TYPES[log.action_type] || { label: log.action_type };
      
      // Summarize changes if available
      let changesText = '';
      if (log.details?.changes && Array.isArray(log.details.changes)) {
        changesText = log.details.changes.map(c => `${translateFieldToArabic(c.label || c.field)}: (${c.from || '-'} ➔ ${c.to || '-'})`).join(' | ');
      } else if (log.details?.fullSnapshot) {
        changesText = `نسخة محفوظة (الموديل: ${log.details.fullSnapshot.serialNumber || log.entity_id} - الكمية: ${log.details.fullSnapshot.totalQuantity || '-'})`;
      } else if (log.action_type === 'COPY' || (log.action || '').toUpperCase().includes('COPY')) {
        const fromM = getCopiedFromModel(log);
        changesText = fromM ? `تم النسخ من الموديل الأصل #${fromM} إلى الموديل الجديد #${log.entity_id}` : `تم نسخ الطلبية`;
      }

      const screen = getScreenInfo(log);

      return {
        '#': index + 1,
        'التاريخ والوقت': new Date(log.created_at).toLocaleString('ar-SA', {
          year: 'numeric', month: '2-digit', day: '2-digit',
          hour: '2-digit', minute: '2-digit', second: '2-digit'
        }),
        'الموظف (المستخدم)': log.username,
        'الدور الوظيفي': log.user_role || 'مستخدم',
        'الشاشة المصدر': screen?.nameAr || 'شاشة أوامر الإنتاج',
        'نوع العملية': actionTypeMeta.label,
        'رمز الإجراء': log.action,
        'القسم / العنصر': log.entity_type,
        'رقم الموديل / المعرف': log.entity_id || '-',
        'ملخص الحركة': formatDetailedLogSummary(log),
        'تفاصيل التغييرات': changesText || '-',
      };
    });

    const worksheet = XLSX.utils.json_to_sheet(rows);

    // RTL for Arabic
    worksheet['!cols'] = [
      { wch: 6 },
      { wch: 22 },
      { wch: 18 },
      { wch: 15 },
      { wch: 15 },
      { wch: 20 },
      { wch: 15 },
      { wch: 20 },
      { wch: 35 },
      { wch: 50 },
    ];

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'سجل العمليات');
    XLSX.writeFile(workbook, `${fileName}_${new Date().toISOString().split('T')[0]}.xlsx`);
    return true;
  } catch (err) {
    console.error('Error exporting audit logs to Excel:', err);
    return false;
  }
};

/**
 * Format relative time in Arabic (e.g. "منذ 5 دقائق")
 */
export const formatRelativeTime = (isoString) => {
  if (!isoString) return '-';
  try {
    const diff = (Date.now() - new Date(isoString).getTime()) / 1000;
    if (diff < 60) return 'الآن';
    if (diff < 3600) return `منذ ${Math.floor(diff / 60)} دقيقة`;
    if (diff < 86400) return `منذ ${Math.floor(diff / 3600)} ساعة`;
    if (diff < 172800) return 'أمس';
    if (diff < 604800) return `منذ ${Math.floor(diff / 86400)} أيام`;
    return new Date(isoString).toLocaleDateString('ar-SA', { month: 'short', day: 'numeric', year: 'numeric' });
  } catch {
    return isoString;
  }
};
