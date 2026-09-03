import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { 
  fetchAuditLogs, 
  exportAuditLogsToExcel, 
  restoreDeletedOrder, 
  ACTION_TYPES, 
  SYSTEM_SCREENS,
  getScreenInfo,
  formatDetailedLogSummary,
  translateFieldToArabic,
  getCopiedFromModel,
  formatRelativeTime 
} from '../utils/auditLogger';
import { useAuth } from '../context/AuthContext';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { 
  ShieldAlert, Activity, Search, RefreshCw, Download, RotateCcw, 
  Eye, Calendar, Filter, User, Layers, ArrowRight, CheckCircle, AlertTriangle, 
  Trash2, Edit, PlusCircle, Copy, Printer, FileSpreadsheet, Lock, ChevronDown, 
  Clock, Check, X, Shield, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight,
  Monitor
} from 'lucide-react';

const PAGE_SIZE_OPTIONS = [15, 25, 50, 100];

const AuditLog = () => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const contentTopRef = useRef(null);

  // State
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [isCloudConnected, setIsCloudConnected] = useState(true);

  // Filters & Controls
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedActionType, setSelectedActionType] = useState('ALL');
  const [selectedEmployee, setSelectedEmployee] = useState('ALL');
  const [selectedScreen, setSelectedScreen] = useState('ALL');
  const [selectedTimeRange, setSelectedTimeRange] = useState('ALL'); // TODAY, 24H, 7D, 30D, ALL
  const [viewMode, setViewMode] = useState('timeline'); // 'timeline' | 'table'

  // Pagination State
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  // Modals
  const [selectedLog, setSelectedLog] = useState(null);
  const [isRestoring, setIsRestoring] = useState(false);

  // Fetch logs
  const loadLogs = useCallback(async (showToast = false) => {
    try {
      setRefreshing(true);
      const res = await fetchAuditLogs({ limit: 5000 });
      setLogs(res.logs || []);
      setIsCloudConnected(res.isCloudConnected);
      if (showToast) {
        toast.success(`تم تحديث السجل بنجاح (${res.logs?.length || 0} حركة مسجلة)`);
      }
    } catch (err) {
      console.error('Error loading audit logs:', err);
      toast.error('حدث خطأ أثناء تحميل سجل العمليات');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadLogs();
  }, [loadLogs]);

  // Extract unique employees for filter dropdown
  const employeesList = useMemo(() => {
    const set = new Set();
    logs.forEach(l => {
      if (l.username) set.add(l.username);
    });
    return Array.from(set).sort();
  }, [logs]);

  // Extract unique screens present in logs
  const screensList = useMemo(() => {
    return Object.entries(SYSTEM_SCREENS);
  }, []);

  // Filter logs
  const filteredLogs = useMemo(() => {
    const now = Date.now();
    return logs.filter(item => {
      // 1. Action Type Filter
      if (selectedActionType !== 'ALL' && item.action_type !== selectedActionType) {
        return false;
      }

      // 2. Employee Filter
      if (selectedEmployee !== 'ALL' && item.username !== selectedEmployee) {
        return false;
      }

      // 3. Screen / Module Filter
      if (selectedScreen !== 'ALL') {
        const screen = getScreenInfo(item);
        const itemScreenKey = item.details?.screenKey || item.screenKey || screen?.key;
        if (itemScreenKey !== selectedScreen) {
          return false;
        }
      }

      // 4. Time Range Filter
      if (selectedTimeRange !== 'ALL') {
        const itemTime = new Date(item.created_at).getTime();
        const diffHours = (now - itemTime) / (1000 * 60 * 60);
        if (selectedTimeRange === 'TODAY') {
          const itemDate = new Date(item.created_at).toDateString();
          const todayDate = new Date().toDateString();
          if (itemDate !== todayDate) return false;
        } else if (selectedTimeRange === '24H' && diffHours > 24) {
          return false;
        } else if (selectedTimeRange === '7D' && diffHours > 24 * 7) {
          return false;
        } else if (selectedTimeRange === '30D' && diffHours > 24 * 30) {
          return false;
        }
      }

      // 5. Search Query (Serial, Employee, Summary, Note, Action, Screen)
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const screen = getScreenInfo(item);
        const matchesSerial = item.entity_id?.toLowerCase().includes(q);
        const matchesUser = item.username?.toLowerCase().includes(q);
        const matchesSummary = item.summary?.toLowerCase().includes(q);
        const matchesAction = item.action?.toLowerCase().includes(q);
        const matchesScreen = screen?.nameAr?.toLowerCase().includes(q);
        if (!matchesSerial && !matchesUser && !matchesSummary && !matchesAction && !matchesScreen) {
          return false;
        }
      }

      return true;
    });
  }, [logs, selectedActionType, selectedEmployee, selectedScreen, selectedTimeRange, searchQuery]);

  // Reset page to 1 whenever filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, selectedActionType, selectedEmployee, selectedScreen, selectedTimeRange, pageSize]);

  // Pagination Calculations
  const totalItems = filteredLogs.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const startIndex = (currentPage - 1) * pageSize;
  const endIndex = Math.min(startIndex + pageSize, totalItems);
  const paginatedLogs = useMemo(() => {
    return filteredLogs.slice(startIndex, endIndex);
  }, [filteredLogs, startIndex, endIndex]);

  // Handle page change with smooth scroll
  const handlePageChange = (newPage) => {
    if (newPage < 1 || newPage > totalPages) return;
    setCurrentPage(newPage);
    if (contentTopRef.current) {
      contentTopRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  // Calculate Statistics (KPIs)
  const stats = useMemo(() => {
    const todayStr = new Date().toDateString();
    let totalToday = 0;
    let deletions = 0;
    let edits = 0;
    let createsAndCopies = 0;
    const userActivityMap = {};

    logs.forEach(item => {
      const isToday = new Date(item.created_at).toDateString() === todayStr;
      if (isToday) {
        totalToday++;
        userActivityMap[item.username] = (userActivityMap[item.username] || 0) + 1;
      }

      if (item.action_type === 'DELETE') deletions++;
      if (item.action_type === 'UPDATE') edits++;
      if (item.action_type === 'CREATE' || item.action_type === 'COPY') createsAndCopies++;
    });

    let mostActiveUser = '-';
    let maxCount = 0;
    Object.entries(userActivityMap).forEach(([usr, count]) => {
      if (count > maxCount) {
        maxCount = count;
        mostActiveUser = `${usr} (${count})`;
      }
    });

    return {
      totalToday,
      deletions,
      edits,
      createsAndCopies,
      mostActiveUser,
    };
  }, [logs]);

  // Handle Restore Order
  const handleRestore = async (logEntry) => {
    if (!window.confirm(t('audit_log.confirm_restore', { defaultValue: 'هل أنت متأكد من استعادة هذه الطلبية المحذوفة وإعادتها للنظام؟' }))) return;
    try {
      setIsRestoring(true);
      const res = await restoreDeletedOrder(logEntry, user);
      if (res.success) {
        toast.success(t('audit_log.restore_success', { defaultValue: 'تم استعادة الطلبية بنجاح وإعادتها لقاعدة البيانات!' }));
        setSelectedLog(null);
        await loadLogs();
      } else {
        toast.error(res.error || 'فشلت عملية استعادة الطلبية');
      }
    } catch (err) {
      console.error(err);
      toast.error('حدث خطأ غير متوقع أثناء الاستعادة');
    } finally {
      setIsRestoring(false);
    }
  };

  const getActionMeta = (actionType) => {
    return ACTION_TYPES[actionType] || { label: actionType, color: '#94a3b8', bg: 'rgba(148, 163, 184, 0.12)', border: 'rgba(148, 163, 184, 0.3)' };
  };

  const getActionIcon = (actionType) => {
    switch (actionType) {
      case 'CREATE': return <PlusCircle size={16} />;
      case 'UPDATE': return <Edit size={16} />;
      case 'DELETE': return <Trash2 size={16} />;
      case 'COPY': return <Copy size={16} />;
      case 'RECEIVE': return <Layers size={16} />;
      case 'PRINT': return <Printer size={16} />;
      case 'EXPORT': return <FileSpreadsheet size={16} />;
      case 'SECURITY': return <Shield size={16} />;
      case 'RESTORE': return <RotateCcw size={16} />;
      case 'AUTH': return <Lock size={16} />;
      default: return <Activity size={16} />;
    }
  };

  // Generate page numbers window (e.g. 1 ... 4, 5, 6 ... 176)
  const paginationRange = useMemo(() => {
    const delta = 2;
    const range = [];
    for (let i = Math.max(2, currentPage - delta); i <= Math.min(totalPages - 1, currentPage + delta); i++) {
      range.push(i);
    }

    if (currentPage - delta > 2) {
      range.unshift('...');
    }
    if (currentPage + delta < totalPages - 1) {
      range.push('...');
    }

    range.unshift(1);
    if (totalPages > 1) {
      range.push(totalPages);
    }

    return range;
  }, [currentPage, totalPages]);

  return (
    <div className="audit-log-container fade-in" style={{ padding: '1.5rem 2rem', maxWidth: '1600px', margin: '0 auto' }}>
      
      {/* ═══ Header Section ═══ */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: '1.5rem',
        marginBottom: '2rem',
        padding: '1.5rem 2rem',
        background: 'var(--surface-color)',
        borderRadius: '16px',
        border: '1px solid var(--border-color)',
        boxShadow: '0 8px 32px rgba(0, 0, 0, 0.12)',
        position: 'relative',
        overflow: 'hidden'
      }}>
        {/* Glow accent */}
        <div style={{
          position: 'absolute',
          top: 0,
          right: 0,
          width: '300px',
          height: '100%',
          background: 'radial-gradient(circle at top right, rgba(212, 175, 55, 0.08), transparent 70%)',
          pointerEvents: 'none'
        }} />

        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.5rem' }}>
            <div style={{
              width: '44px',
              height: '44px',
              borderRadius: '12px',
              background: 'linear-gradient(135deg, rgba(212, 175, 55, 0.2), rgba(212, 175, 55, 0.05))',
              border: '1px solid var(--accent-color)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--accent-color)'
            }}>
              <ShieldAlert size={26} />
            </div>
            <div>
              <h1 style={{ fontSize: '1.75rem', fontWeight: '800', margin: 0 }} className="text-gradient">
                {t('audit_log.title', { defaultValue: 'سجل العمليات والرقابة العامة' })}
              </h1>
              <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: '0.9rem', marginTop: '0.2rem' }}>
                {t('audit_log.subtitle', { defaultValue: 'تتبع شامل ولحظي لكافة التحركات والعمليات في النظام ومعرفة من قام بالإجراء بدقة' })}
              </p>
            </div>
          </div>

          {/* Cloud vs Local Status Indicator */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginTop: '0.75rem' }}>
            <div style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.4rem',
              padding: '0.25rem 0.75rem',
              borderRadius: '20px',
              fontSize: '0.78rem',
              fontWeight: '600',
              background: isCloudConnected ? 'rgba(16, 185, 129, 0.12)' : 'rgba(245, 158, 11, 0.12)',
              color: isCloudConnected ? '#10b981' : '#f59e0b',
              border: `1px solid ${isCloudConnected ? 'rgba(16, 185, 129, 0.3)' : 'rgba(245, 158, 11, 0.3)'}`
            }}>
              <span style={{
                width: '8px',
                height: '8px',
                borderRadius: '50%',
                backgroundColor: isCloudConnected ? '#10b981' : '#f59e0b',
                boxShadow: isCloudConnected ? '0 0 8px #10b981' : '0 0 8px #f59e0b'
              }} />
              {isCloudConnected ? t('audit_log.cloud_connected', { defaultValue: 'متصل سحابياً (Supabase)' }) : t('audit_log.local_resilient', { defaultValue: 'حفظ محلي فوري ومؤمن' })}
            </div>
            <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
              إجمالي الحركات المفهرسة: <strong style={{ color: 'var(--accent-color)' }}>{logs.length.toLocaleString('ar-SA')}</strong>
            </span>
          </div>
        </div>

        {/* Action Controls: Refresh & Excel Export only */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
          <button
            onClick={() => loadLogs(true)}
            disabled={refreshing}
            className="btn btn-outline"
            style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.65rem 1.25rem', fontSize: '0.92rem' }}
            title={t('audit_log.btn_refresh', { defaultValue: 'تحديث فوري' })}
          >
            <RefreshCw size={17} className={refreshing ? 'spin-anim' : ''} />
            {t('audit_log.btn_refresh', { defaultValue: 'تحديث فوري' })}
          </button>

          <button
            onClick={() => exportAuditLogsToExcel(filteredLogs)}
            className="btn btn-accent"
            style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.65rem 1.4rem', fontWeight: 'bold', fontSize: '0.92rem' }}
          >
            <Download size={17} />
            {t('audit_log.btn_export_excel', { defaultValue: 'تصدير Excel' })}
          </button>
        </div>
      </div>

      {/* ═══ Top Summary Metric Cards (KPIs) ═══ */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
        gap: '1rem',
        marginBottom: '2rem'
      }}>
        {/* Card 1: Today's Total Activities */}
        <div style={{
          background: 'var(--surface-color)',
          border: '1px solid var(--border-color)',
          borderRadius: '14px',
          padding: '1.25rem',
          display: 'flex',
          alignItems: 'center',
          gap: '1rem',
          boxShadow: '0 4px 16px rgba(0,0,0,0.06)'
        }}>
          <div style={{
            width: '48px',
            height: '48px',
            borderRadius: '12px',
            background: 'rgba(59, 130, 246, 0.12)',
            color: '#3b82f6',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}>
            <Activity size={24} />
          </div>
          <div>
            <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>{t('audit_log.kpi_total_today', { defaultValue: 'إجمالي العمليات اليوم' })}</div>
            <div style={{ fontSize: '1.6rem', fontWeight: '800', color: 'var(--text-main)' }}>{stats.totalToday.toLocaleString('ar-SA')}</div>
          </div>
        </div>

        {/* Card 2: Deletions (Red Alert) */}
        <div style={{
          background: 'var(--surface-color)',
          border: '1px solid rgba(239, 68, 68, 0.3)',
          borderRadius: '14px',
          padding: '1.25rem',
          display: 'flex',
          alignItems: 'center',
          gap: '1rem',
          boxShadow: '0 4px 16px rgba(239, 68, 68, 0.08)'
        }}>
          <div style={{
            width: '48px',
            height: '48px',
            borderRadius: '12px',
            background: 'rgba(239, 68, 68, 0.15)',
            color: '#ef4444',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}>
            <Trash2 size={24} />
          </div>
          <div>
            <div style={{ fontSize: '0.82rem', color: '#ef4444', fontWeight: '600' }}>{t('audit_log.kpi_deletions', { defaultValue: 'عمليات الحذف' })}</div>
            <div style={{ fontSize: '1.6rem', fontWeight: '800', color: '#ef4444' }}>{stats.deletions.toLocaleString('ar-SA')}</div>
          </div>
        </div>

        {/* Card 3: Modifications */}
        <div style={{
          background: 'var(--surface-color)',
          border: '1px solid rgba(245, 158, 11, 0.3)',
          borderRadius: '14px',
          padding: '1.25rem',
          display: 'flex',
          alignItems: 'center',
          gap: '1rem',
          boxShadow: '0 4px 16px rgba(245, 158, 11, 0.08)'
        }}>
          <div style={{
            width: '48px',
            height: '48px',
            borderRadius: '12px',
            background: 'rgba(245, 158, 11, 0.15)',
            color: '#f59e0b',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}>
            <Edit size={24} />
          </div>
          <div>
            <div style={{ fontSize: '0.82rem', color: '#f59e0b', fontWeight: '600' }}>{t('audit_log.kpi_edits', { defaultValue: 'عمليات التعديل' })}</div>
            <div style={{ fontSize: '1.6rem', fontWeight: '800', color: '#f59e0b' }}>{stats.edits.toLocaleString('ar-SA')}</div>
          </div>
        </div>

        {/* Card 4: Creates & Copies */}
        <div style={{
          background: 'var(--surface-color)',
          border: '1px solid rgba(16, 185, 129, 0.3)',
          borderRadius: '14px',
          padding: '1.25rem',
          display: 'flex',
          alignItems: 'center',
          gap: '1rem',
          boxShadow: '0 4px 16px rgba(16, 185, 129, 0.08)'
        }}>
          <div style={{
            width: '48px',
            height: '48px',
            borderRadius: '12px',
            background: 'rgba(16, 185, 129, 0.15)',
            color: '#10b981',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}>
            <PlusCircle size={24} />
          </div>
          <div>
            <div style={{ fontSize: '0.82rem', color: '#10b981', fontWeight: '600' }}>{t('audit_log.kpi_creates_copies', { defaultValue: 'الإضافات والنسخ' })}</div>
            <div style={{ fontSize: '1.6rem', fontWeight: '800', color: '#10b981' }}>{stats.createsAndCopies.toLocaleString('ar-SA')}</div>
          </div>
        </div>

        {/* Card 5: Most Active Employee */}
        <div style={{
          background: 'var(--surface-color)',
          border: '1px solid var(--border-color)',
          borderRadius: '14px',
          padding: '1.25rem',
          display: 'flex',
          alignItems: 'center',
          gap: '1rem',
          boxShadow: '0 4px 16px rgba(0,0,0,0.06)'
        }}>
          <div style={{
            width: '48px',
            height: '48px',
            borderRadius: '12px',
            background: 'rgba(212, 175, 55, 0.15)',
            color: 'var(--accent-color)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}>
            <User size={24} />
          </div>
          <div>
            <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>{t('audit_log.kpi_most_active', { defaultValue: 'الموظف الأكثر نشاطاً' })}</div>
            <div style={{ fontSize: '1.1rem', fontWeight: '700', color: 'var(--accent-color)' }}>{stats.mostActiveUser}</div>
          </div>
        </div>
      </div>

      {/* ═══ Search & Filters Toolbar ═══ */}
      <div style={{
        background: 'var(--surface-color)',
        borderRadius: '16px',
        border: '1px solid var(--border-color)',
        padding: '1.25rem',
        marginBottom: '2rem',
        display: 'flex',
        flexDirection: 'column',
        gap: '1.25rem',
        boxShadow: '0 4px 20px rgba(0,0,0,0.08)'
      }}>
        {/* Row 1: Search, Screen Filter, Employee Filter, Time Filter, View Toggle */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem', flexWrap: 'wrap' }}>
          
          {/* Live Search */}
          <div style={{ flex: '1 1 280px', position: 'relative' }}>
            <Search size={18} style={{ position: 'absolute', right: '1rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="بحث برقم الموديل، الموظف، الشاشة، أو نص الإجراء..."
              style={{
                width: '100%',
                padding: '0.75rem 2.8rem 0.75rem 1rem',
                borderRadius: '10px',
                border: '1px solid var(--border-color)',
                background: 'var(--surface-highlight)',
                color: 'var(--text-main)',
                fontSize: '0.92rem'
              }}
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                style={{
                  position: 'absolute',
                  left: '0.75rem',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  background: 'none',
                  border: 'none',
                  color: 'var(--text-muted)',
                  cursor: 'pointer'
                }}
              >
                <X size={16} />
              </button>
            )}
          </div>

          {/* Screen / Module Origin Filter */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <Monitor size={16} color="var(--accent-color)" />
            <select
              value={selectedScreen}
              onChange={(e) => setSelectedScreen(e.target.value)}
              style={{
                padding: '0.75rem 0.85rem',
                borderRadius: '10px',
                border: '1px solid var(--border-color)',
                background: 'var(--surface-highlight)',
                color: 'var(--text-main)',
                fontSize: '0.88rem',
                cursor: 'pointer'
              }}
            >
              <option value="ALL">جميع الشاشات والأقسام</option>
              {screensList.map(([sKey, sMeta]) => (
                <option key={sKey} value={sKey}>
                  {sMeta.icon} {sMeta.nameAr}
                </option>
              ))}
            </select>
          </div>

          {/* Employee Filter */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <User size={16} color="var(--accent-color)" />
            <select
              value={selectedEmployee}
              onChange={(e) => setSelectedEmployee(e.target.value)}
              style={{
                padding: '0.75rem 0.85rem',
                borderRadius: '10px',
                border: '1px solid var(--border-color)',
                background: 'var(--surface-highlight)',
                color: 'var(--text-main)',
                fontSize: '0.88rem',
                cursor: 'pointer'
              }}
            >
              <option value="ALL">{t('audit_log.filter_all_employees', { defaultValue: 'جميع الموظفين' })}</option>
              {employeesList.map(emp => (
                <option key={emp} value={emp}>{emp}</option>
              ))}
            </select>
          </div>

          {/* Time Range Filter */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <Calendar size={16} color="var(--accent-color)" />
            <div style={{ display: 'flex', background: 'var(--surface-highlight)', borderRadius: '10px', padding: '3px', border: '1px solid var(--border-color)' }}>
              {[
                { id: 'ALL', label: t('audit_log.date_all', { defaultValue: 'كافة الفترات' }) },
                { id: 'TODAY', label: t('audit_log.date_today', { defaultValue: 'اليوم' }) },
                { id: '24H', label: t('audit_log.date_24h', { defaultValue: 'آخر 24 ساعة' }) },
                { id: '7D', label: t('audit_log.date_7d', { defaultValue: 'آخر 7 أيام' }) },
                { id: '30D', label: t('audit_log.date_30d', { defaultValue: 'آخر 30 يوماً' }) },
              ].map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setSelectedTimeRange(tab.id)}
                  style={{
                    padding: '0.45rem 0.75rem',
                    borderRadius: '8px',
                    border: 'none',
                    background: selectedTimeRange === tab.id ? 'var(--accent-color)' : 'transparent',
                    color: selectedTimeRange === tab.id ? '#000' : 'var(--text-muted)',
                    fontWeight: selectedTimeRange === tab.id ? '700' : '500',
                    fontSize: '0.82rem',
                    cursor: 'pointer',
                    transition: 'all 0.15s'
                  }}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          {/* View Mode Toggle */}
          <div style={{ display: 'flex', background: 'var(--surface-highlight)', borderRadius: '10px', padding: '3px', border: '1px solid var(--border-color)', marginLeft: 'auto' }}>
            <button
              onClick={() => setViewMode('timeline')}
              style={{
                padding: '0.45rem 0.85rem',
                borderRadius: '8px',
                border: 'none',
                background: viewMode === 'timeline' ? 'var(--accent-color)' : 'transparent',
                color: viewMode === 'timeline' ? '#000' : 'var(--text-muted)',
                fontWeight: viewMode === 'timeline' ? '700' : '500',
                fontSize: '0.82rem',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '0.35rem'
              }}
            >
              <Activity size={14} />
              {t('audit_log.view_timeline', { defaultValue: 'الخط الزمني' })}
            </button>
            <button
              onClick={() => setViewMode('table')}
              style={{
                padding: '0.45rem 0.85rem',
                borderRadius: '8px',
                border: 'none',
                background: viewMode === 'table' ? 'var(--accent-color)' : 'transparent',
                color: viewMode === 'table' ? '#000' : 'var(--text-muted)',
                fontWeight: viewMode === 'table' ? '700' : '500',
                fontSize: '0.82rem',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '0.35rem'
              }}
            >
              <Layers size={14} />
              {t('audit_log.view_table', { defaultValue: 'عرض الجدول' })}
            </button>
          </div>
        </div>

        {/* Row 2: Action Category Pills */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem',
          flexWrap: 'wrap',
          borderTop: '1px solid var(--border-color)',
          paddingTop: '0.85rem'
        }}>
          <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)', fontWeight: '600', marginLeft: '0.5rem' }}>
            {t('audit_log.filter_action', { defaultValue: 'نوع الحركة' })}:
          </span>
          <button
            onClick={() => setSelectedActionType('ALL')}
            style={{
              padding: '0.35rem 0.85rem',
              borderRadius: '20px',
              border: selectedActionType === 'ALL' ? '1px solid var(--accent-color)' : '1px solid var(--border-color)',
              background: selectedActionType === 'ALL' ? 'rgba(var(--accent-rgb), 0.15)' : 'transparent',
              color: selectedActionType === 'ALL' ? 'var(--accent-color)' : 'var(--text-muted)',
              fontSize: '0.82rem',
              fontWeight: selectedActionType === 'ALL' ? '700' : '500',
              cursor: 'pointer'
            }}
          >
            {t('audit_log.filter_all_actions', { defaultValue: 'جميع التحركات' })} ({logs.length.toLocaleString('ar-SA')})
          </button>

          {Object.entries(ACTION_TYPES).map(([typeKey, meta]) => {
            const count = logs.filter(l => l.action_type === typeKey).length;
            if (count === 0 && selectedActionType !== typeKey) return null;
            const isSelected = selectedActionType === typeKey;
            return (
              <button
                key={typeKey}
                onClick={() => setSelectedActionType(typeKey)}
                style={{
                  padding: '0.35rem 0.85rem',
                  borderRadius: '20px',
                  border: isSelected ? `2px solid ${meta.color}` : `1px solid ${meta.border}`,
                  background: isSelected ? meta.bg : 'transparent',
                  color: isSelected ? meta.color : 'var(--text-muted)',
                  fontSize: '0.82rem',
                  fontWeight: isSelected ? '700' : '500',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.35rem',
                  transition: 'all 0.15s'
                }}
              >
                <span style={{ color: meta.color }}>{getActionIcon(typeKey)}</span>
                {meta.label}
                <span style={{
                  background: isSelected ? meta.color : 'rgba(255,255,255,0.1)',
                  color: isSelected ? '#000' : 'var(--text-muted)',
                  borderRadius: '10px',
                  padding: '0.1rem 0.4rem',
                  fontSize: '0.72rem',
                  fontWeight: '700'
                }}>
                  {count.toLocaleString('ar-SA')}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* ═══ Content View ═══ */}
      <div ref={contentTopRef}>
        {loading ? (
          <div style={{ textAlign: 'center', padding: '5rem 2rem', color: 'var(--text-muted)' }}>
            <RefreshCw size={36} className="spin-anim" style={{ margin: '0 auto 1rem auto', color: 'var(--accent-color)' }} />
            <p style={{ fontSize: '1.1rem' }}>جاري تحميل ومزامنة سجل العمليات...</p>
          </div>
        ) : filteredLogs.length === 0 ? (
          <div style={{
            textAlign: 'center',
            padding: '5rem 2rem',
            background: 'var(--surface-color)',
            borderRadius: '16px',
            border: '1px solid var(--border-color)',
            color: 'var(--text-muted)'
          }}>
            <ShieldAlert size={48} style={{ margin: '0 auto 1rem auto', opacity: 0.5, color: 'var(--accent-color)' }} />
            <h3 style={{ color: 'var(--text-main)', marginBottom: '0.5rem' }}>{t('audit_log.empty_logs', { defaultValue: 'لا توجد حركات مسجلة تطابق معايير البحث والفلترة المحددة.' })}</h3>
            <p style={{ fontSize: '0.9rem', maxWidth: '450px', margin: '0 auto 1.5rem auto' }}>
              يمكنك تجربة تغيير خيارات البحث أو الفلترة للاطلاع على حركات أخرى.
            </p>
            <button
              onClick={() => { setSelectedActionType('ALL'); setSelectedEmployee('ALL'); setSelectedScreen('ALL'); setSelectedTimeRange('ALL'); setSearchQuery(''); }}
              className="btn btn-outline"
            >
              إعادة تعيين جميع الفلاتر
            </button>
          </div>
        ) : viewMode === 'timeline' ? (

          /* ═══ Timeline Feed View ═══ */
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {paginatedLogs.map((log) => {
              const meta = getActionMeta(log.action_type);
              const screen = getScreenInfo(log);
              const detailedSummary = formatDetailedLogSummary(log);
              const hasChanges = log.details?.changes && Array.isArray(log.details.changes) && log.details.changes.length > 0;
              const hasSnapshot = !!log.details?.fullSnapshot;
              const isDeletedAction = log.action_type === 'DELETE';

              return (
                <div
                  key={log.id}
                  style={{
                    background: 'var(--surface-color)',
                    borderRadius: '14px',
                    border: `1px solid var(--border-color)`,
                    borderRight: `5px solid ${meta.color}`,
                    padding: '1.25rem 1.5rem',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    flexWrap: 'wrap',
                    gap: '1.25rem',
                    transition: 'transform 0.15s, box-shadow 0.15s',
                    boxShadow: '0 3px 12px rgba(0,0,0,0.05)',
                    cursor: 'pointer'
                  }}
                  onClick={() => setSelectedLog(log)}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.transform = 'translateY(-2px)';
                    e.currentTarget.style.boxShadow = `0 8px 24px ${meta.color}15`;
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.transform = 'translateY(0)';
                    e.currentTarget.style.boxShadow = '0 3px 12px rgba(0,0,0,0.05)';
                  }}
                >
                  {/* Right Side: Icon, Screen Origin Badge, Details, Changes */}
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: '1rem', flex: '1 1 580px' }}>
                    
                    {/* Action Icon Badge */}
                    <div style={{
                      width: '42px',
                      height: '42px',
                      borderRadius: '12px',
                      background: meta.bg,
                      border: `1px solid ${meta.border}`,
                      color: meta.color,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                      marginTop: '0.2rem'
                    }}>
                      {getActionIcon(log.action_type)}
                    </div>

                    <div style={{ flex: 1 }}>
                      {/* Top Badges Row: Action Badge + Screen Origin Badge + Model ID + Actor */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '0.5rem' }}>
                        
                        {/* Action Badge */}
                        <span style={{
                          background: meta.bg,
                          color: meta.color,
                          border: `1px solid ${meta.border}`,
                          padding: '0.18rem 0.65rem',
                          borderRadius: '6px',
                          fontSize: '0.78rem',
                          fontWeight: '800'
                        }}>
                          {meta.label}
                        </span>

                        {/* Screen Origin Badge (User explicitly requested knowing screen) */}
                        <span style={{
                          background: 'rgba(212, 175, 55, 0.08)',
                          color: 'var(--accent-color)',
                          border: '1px solid rgba(212, 175, 55, 0.25)',
                          padding: '0.18rem 0.65rem',
                          borderRadius: '6px',
                          fontSize: '0.78rem',
                          fontWeight: '700',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '0.35rem'
                        }}>
                          <span>{screen.icon || '🖥️'}</span>
                          من شاشة: {screen.nameAr}
                        </span>

                        {/* Model / Entity ID */}
                        {log.entity_id && (
                          <span style={{
                            background: 'var(--surface-highlight)',
                            color: 'var(--text-main)',
                            border: '1px solid var(--border-color)',
                            padding: '0.18rem 0.65rem',
                            borderRadius: '6px',
                            fontSize: '0.82rem',
                            fontWeight: '800',
                            letterSpacing: '0.02em'
                          }}>
                            #{log.entity_id}
                          </span>
                        )}

                        {/* Employee Actor */}
                        <span style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '0.3rem',
                          color: 'var(--text-main)',
                          fontSize: '0.86rem',
                          fontWeight: '700',
                          marginRight: '0.35rem'
                        }}>
                          <User size={14} color="var(--accent-color)" />
                          بواسطة الموظف: <strong style={{ color: 'var(--accent-color)' }}>{log.username}</strong>
                          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 'normal' }}>
                            ({log.user_role || 'مستخدم'})
                          </span>
                        </span>
                      </div>

                      {/* Detailed Narrative Summary */}
                      <div style={{ fontSize: '0.98rem', fontWeight: '600', color: 'var(--text-main)', lineHeight: '1.5', marginBottom: '0.4rem' }}>
                        {detailedSummary}
                      </div>

                      {/* Prominent COPY relationship badge */}
                      {(log.action_type === 'COPY' || (log.action || '').toUpperCase().includes('COPY')) && (
                        <div style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '0.6rem',
                          background: 'rgba(139, 92, 246, 0.12)',
                          border: '1px solid rgba(139, 92, 246, 0.35)',
                          borderRadius: '8px',
                          padding: '0.3rem 0.8rem',
                          fontSize: '0.84rem',
                          fontWeight: '700',
                          color: '#a78bfa',
                          margin: '0.35rem 0'
                        }}>
                          {getCopiedFromModel(log) ? (
                            <>
                              <span>📋 تم النسخ من:</span>
                              <span style={{ color: '#fff', background: 'rgba(139, 92, 246, 0.3)', padding: '0.1rem 0.5rem', borderRadius: '5px' }}>
                                #{getCopiedFromModel(log)}
                              </span>
                              <ArrowRight size={13} color="#a78bfa" />
                              <span>إلى الموديل الجديد:</span>
                              <span style={{ color: 'var(--accent-color)', background: 'rgba(212, 175, 55, 0.15)', padding: '0.1rem 0.5rem', borderRadius: '5px' }}>
                                #{log.entity_id}
                              </span>
                            </>
                          ) : (
                            <>
                              <span>📋 طلبية مستنسخة ومولدة برقم:</span>
                              <span style={{ color: 'var(--accent-color)', background: 'rgba(212, 175, 55, 0.15)', padding: '0.1rem 0.5rem', borderRadius: '5px' }}>
                                #{log.entity_id}
                              </span>
                            </>
                          )}
                        </div>
                      )}

                      {/* Quick Diff Preview Pills */}
                      {hasChanges && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap', marginTop: '0.4rem' }}>
                          {log.details.changes.slice(0, 4).map((ch, ci) => (
                            <div
                              key={ci}
                              style={{
                                fontSize: '0.76rem',
                                background: 'rgba(255,255,255,0.04)',
                                border: '1px solid var(--border-color)',
                                borderRadius: '6px',
                                padding: '0.2rem 0.5rem',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '0.3rem'
                              }}
                            >
                              <span style={{ color: 'var(--text-muted)' }}>{translateFieldToArabic(ch.label || ch.field)}:</span>
                              <span style={{ color: '#ef4444', textDecoration: 'line-through' }}>{ch.from || '-'}</span>
                              <ArrowRight size={10} color="var(--accent-color)" />
                              <span style={{ color: '#10b981', fontWeight: 'bold' }}>{ch.to || '-'}</span>
                            </div>
                          ))}
                          {log.details.changes.length > 4 && (
                            <span style={{ fontSize: '0.72rem', color: 'var(--accent-color)', fontWeight: 'bold' }}>
                              +{log.details.changes.length - 4} تغييرات أخرى
                            </span>
                          )}
                        </div>
                      )}

                      {/* Informative note when UPDATE has no field diffs */}
                      {!hasChanges && (log.action_type === 'UPDATE' || (log.action || '').toUpperCase().includes('UPDATE')) && (
                        <div style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '0.4rem',
                          fontSize: '0.76rem',
                          color: 'var(--text-muted)',
                          background: 'rgba(255,255,255,0.03)',
                          border: '1px solid var(--border-color)',
                          borderRadius: '6px',
                          padding: '0.2rem 0.55rem',
                          marginTop: '0.3rem'
                        }}>
                          <span>ℹ️ حفظ وتأكيد بيانات الطلبية (تحديث عام للسجل والمرفقات)</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Left Side: Time, Action buttons */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexShrink: 0 }}>
                    <div style={{ textAlign: 'left' }}>
                      <div style={{ fontSize: '0.85rem', fontWeight: '700', color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                        <Clock size={13} color="var(--accent-color)" />
                        {formatRelativeTime(log.created_at)}
                      </div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                        {new Date(log.created_at).toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' })}
                        {' - '}
                        {new Date(log.created_at).toLocaleDateString('ar-SA', { month: 'numeric', day: 'numeric', year: 'numeric' })}
                      </div>
                    </div>

                    {/* 1-Click Restore Button if Deleted Order */}
                    {isDeletedAction && hasSnapshot && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleRestore(log);
                        }}
                        disabled={isRestoring}
                        className="btn"
                        style={{
                          background: 'rgba(34, 197, 94, 0.15)',
                          border: '1px solid rgba(34, 197, 94, 0.4)',
                          color: '#22c55e',
                          padding: '0.45rem 0.85rem',
                          borderRadius: '8px',
                          fontSize: '0.82rem',
                          fontWeight: '700',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.35rem',
                          cursor: 'pointer'
                        }}
                        title={t('audit_log.btn_restore_order', { defaultValue: 'استعادة هذه الطلبية إلى النظام' })}
                      >
                        <RotateCcw size={14} />
                        {t('audit_log.btn_restore_order', { defaultValue: 'استعادة هذه الطلبية' })}
                      </button>
                    )}

                    <button
                      onClick={() => setSelectedLog(log)}
                      className="btn btn-outline"
                      style={{
                        padding: '0.45rem 0.85rem',
                        borderRadius: '8px',
                        fontSize: '0.82rem',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.35rem'
                      }}
                    >
                      <Eye size={14} />
                      {t('audit_log.btn_view_details', { defaultValue: 'عرض التفاصيل' })}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (

          /* ═══ Table View ═══ */
          <div style={{
            background: 'var(--surface-color)',
            borderRadius: '16px',
            border: '1px solid var(--border-color)',
            overflow: 'hidden',
            boxShadow: '0 4px 20px rgba(0,0,0,0.08)'
          }}>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'right', fontSize: '0.88rem' }}>
                <thead>
                  <tr style={{ background: 'var(--surface-highlight)', borderBottom: '1px solid var(--border-color)', color: 'var(--text-muted)' }}>
                    <th style={{ padding: '0.85rem 1rem' }}>التاريخ والوقت</th>
                    <th style={{ padding: '0.85rem 1rem' }}>الموظف المسؤول</th>
                    <th style={{ padding: '0.85rem 1rem' }}>الشاشة المصدر</th>
                    <th style={{ padding: '0.85rem 1rem' }}>نوع الإجراء</th>
                    <th style={{ padding: '0.85rem 1rem' }}>الموديل / المعرف</th>
                    <th style={{ padding: '0.85rem 1rem' }}>تفاصيل الحركة الكاملة</th>
                    <th style={{ padding: '0.85rem 1rem', textAlign: 'center' }}>الإجراءات</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedLogs.map((log) => {
                    const meta = getActionMeta(log.action_type);
                    const screen = getScreenInfo(log);
                    const detailedSummary = formatDetailedLogSummary(log);

                    return (
                      <tr
                        key={log.id}
                        style={{
                          borderBottom: '1px solid var(--border-color)',
                          transition: 'background-color 0.15s',
                          cursor: 'pointer'
                        }}
                        onClick={() => setSelectedLog(log)}
                        onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.03)'}
                        onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                      >
                        <td style={{ padding: '0.85rem 1rem', whiteSpace: 'nowrap' }}>
                          <div style={{ fontWeight: '600', color: 'var(--text-main)' }}>
                            {formatRelativeTime(log.created_at)}
                          </div>
                          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                            {new Date(log.created_at).toLocaleString('ar-SA', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                          </div>
                        </td>

                        <td style={{ padding: '0.85rem 1rem' }}>
                          <div style={{ fontWeight: '700', color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                            <User size={13} color="var(--accent-color)" />
                            {log.username}
                          </div>
                          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{log.user_role || 'مستخدم'}</div>
                        </td>

                        <td style={{ padding: '0.85rem 1rem', whiteSpace: 'nowrap' }}>
                          <span style={{
                            background: 'rgba(212, 175, 55, 0.08)',
                            color: 'var(--accent-color)',
                            border: '1px solid rgba(212, 175, 55, 0.25)',
                            padding: '0.2rem 0.5rem',
                            borderRadius: '6px',
                            fontSize: '0.78rem',
                            fontWeight: '700',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '0.3rem'
                          }}>
                            <span>{screen.icon || '🖥️'}</span>
                            {screen.nameAr}
                          </span>
                        </td>

                        <td style={{ padding: '0.85rem 1rem' }}>
                          <span style={{
                            background: meta.bg,
                            color: meta.color,
                            border: `1px solid ${meta.border}`,
                            padding: '0.2rem 0.6rem',
                            borderRadius: '6px',
                            fontSize: '0.78rem',
                            fontWeight: '700',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '0.3rem'
                          }}>
                            {getActionIcon(log.action_type)}
                            {meta.label}
                          </span>
                        </td>

                        <td style={{ padding: '0.85rem 1rem' }}>
                          {log.entity_id ? (
                            <span style={{
                              background: 'var(--surface-highlight)',
                              color: 'var(--text-main)',
                              border: '1px solid var(--border-color)',
                              padding: '0.2rem 0.5rem',
                              borderRadius: '6px',
                              fontWeight: '700',
                              fontSize: '0.82rem'
                            }}>
                              #{log.entity_id}
                            </span>
                          ) : '-'}
                        </td>

                        <td style={{ padding: '0.85rem 1rem', fontWeight: '500', color: 'var(--text-main)', maxWidth: '400px' }}>
                          <div>{detailedSummary}</div>
                          {(log.action_type === 'COPY' || (log.action || '').toUpperCase().includes('COPY')) && (
                            <div style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '0.4rem',
                              marginTop: '0.35rem',
                              padding: '0.2rem 0.5rem',
                              borderRadius: '6px',
                              background: 'rgba(139, 92, 246, 0.12)',
                              border: '1px solid rgba(139, 92, 246, 0.3)',
                              color: '#a78bfa',
                              fontSize: '0.78rem',
                              fontWeight: '700'
                            }}>
                              <span>📋 من الأصل #{getCopiedFromModel(log) || 'غير محدد'}</span>
                              <ArrowRight size={11} color="#a78bfa" />
                              <span style={{ color: 'var(--accent-color)' }}>إلى #{log.entity_id}</span>
                            </div>
                          )}
                        </td>

                        <td style={{ padding: '0.85rem 1rem', textAlign: 'center' }}>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedLog(log);
                            }}
                            className="btn btn-outline"
                            style={{ padding: '0.35rem 0.75rem', fontSize: '0.8rem' }}
                          >
                            <Eye size={14} />
                            عرض
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ═══ Pagination Bar (تقليب الصفحات الاحترافي) ═══ */}
        {filteredLogs.length > 0 && (
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '1rem',
            marginTop: '1.5rem',
            padding: '1rem 1.5rem',
            background: 'var(--surface-color)',
            borderRadius: '14px',
            border: '1px solid var(--border-color)',
            boxShadow: '0 4px 16px rgba(0,0,0,0.06)'
          }}>
            {/* Left/Start: Counter & Page Size Selector */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
              <span style={{ fontSize: '0.88rem', color: 'var(--text-muted)' }}>
                عرض من <strong style={{ color: 'var(--text-main)' }}>{(startIndex + 1).toLocaleString('ar-SA')}</strong> إلى <strong style={{ color: 'var(--text-main)' }}>{endIndex.toLocaleString('ar-SA')}</strong> من إجمالي <strong style={{ color: 'var(--accent-color)' }}>{totalItems.toLocaleString('ar-SA')}</strong> حركة
              </span>

              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', borderRight: '1px solid var(--border-color)', paddingRight: '1rem' }}>
                <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>لكل صفحة:</span>
                <select
                  value={pageSize}
                  onChange={(e) => setPageSize(Number(e.target.value))}
                  style={{
                    padding: '0.3rem 0.6rem',
                    borderRadius: '8px',
                    border: '1px solid var(--border-color)',
                    background: 'var(--surface-highlight)',
                    color: 'var(--text-main)',
                    fontSize: '0.84rem',
                    cursor: 'pointer'
                  }}
                >
                  {PAGE_SIZE_OPTIONS.map(size => (
                    <option key={size} value={size}>{size}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Right/End: Page Navigation Buttons */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', flexWrap: 'wrap' }}>
              {/* First Page */}
              <button
                onClick={() => handlePageChange(1)}
                disabled={currentPage === 1}
                className="btn btn-outline"
                style={{ padding: '0.4rem 0.6rem', opacity: currentPage === 1 ? 0.4 : 1, cursor: currentPage === 1 ? 'not-allowed' : 'pointer' }}
                title="الصفحة الأولى"
              >
                <ChevronsRight size={16} />
              </button>

              {/* Previous Page */}
              <button
                onClick={() => handlePageChange(currentPage - 1)}
                disabled={currentPage === 1}
                className="btn btn-outline"
                style={{ padding: '0.4rem 0.8rem', opacity: currentPage === 1 ? 0.4 : 1, cursor: currentPage === 1 ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.85rem' }}
              >
                <ChevronRight size={16} />
                السابقة
              </button>

              {/* Numbered Page Buttons */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                {paginationRange.map((p, pIdx) => {
                  if (p === '...') {
                    return (
                      <span key={`ellipsis-${pIdx}`} style={{ padding: '0.4rem 0.6rem', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                        ...
                      </span>
                    );
                  }
                  const isCurrent = p === currentPage;
                  return (
                    <button
                      key={p}
                      onClick={() => handlePageChange(p)}
                      style={{
                        minWidth: '36px',
                        height: '36px',
                        padding: '0 0.5rem',
                        borderRadius: '8px',
                        border: isCurrent ? '1px solid var(--accent-color)' : '1px solid var(--border-color)',
                        background: isCurrent ? 'var(--accent-color)' : 'var(--surface-highlight)',
                        color: isCurrent ? '#000' : 'var(--text-main)',
                        fontWeight: isCurrent ? '800' : '500',
                        fontSize: '0.85rem',
                        cursor: 'pointer',
                        transition: 'all 0.15s'
                      }}
                    >
                      {p.toLocaleString('ar-SA')}
                    </button>
                  );
                })}
              </div>

              {/* Next Page */}
              <button
                onClick={() => handlePageChange(currentPage + 1)}
                disabled={currentPage === totalPages}
                className="btn btn-outline"
                style={{ padding: '0.4rem 0.8rem', opacity: currentPage === totalPages ? 0.4 : 1, cursor: currentPage === totalPages ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.85rem' }}
              >
                التالية
                <ChevronLeft size={16} />
              </button>

              {/* Last Page */}
              <button
                onClick={() => handlePageChange(totalPages)}
                disabled={currentPage === totalPages}
                className="btn btn-outline"
                style={{ padding: '0.4rem 0.6rem', opacity: currentPage === totalPages ? 0.4 : 1, cursor: currentPage === totalPages ? 'not-allowed' : 'pointer' }}
                title="الصفحة الأخيرة"
              >
                <ChevronsLeft size={16} />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ═══ Details & Diff Modal ═══ */}
      {selectedLog && (
        <div 
          style={{
            position: 'fixed',
            top: 0, left: 0, right: 0, bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.75)',
            backdropFilter: 'blur(6px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: '1.5rem',
            animation: 'fadeIn 0.2s ease'
          }}
          onClick={() => setSelectedLog(null)}
        >
          <div
            style={{
              backgroundColor: 'var(--surface-color)',
              border: '2px solid var(--accent-color)',
              borderRadius: '18px',
              width: '100%',
              maxWidth: '850px',
              maxHeight: '90vh',
              overflowY: 'auto',
              boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
              padding: '2rem',
              display: 'flex',
              flexDirection: 'column',
              gap: '1.5rem'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-color)', paddingBottom: '1rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <div style={{
                  width: '40px',
                  height: '40px',
                  borderRadius: '10px',
                  background: getActionMeta(selectedLog.action_type).bg,
                  color: getActionMeta(selectedLog.action_type).color,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}>
                  {getActionIcon(selectedLog.action_type)}
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: '1.3rem', color: 'var(--text-main)' }}>
                    {t('audit_log.modal_title', { defaultValue: 'تفاصيل الحركة والتدقيق' })}
                  </h3>
                  <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                    معرف الحركة: <code style={{ color: 'var(--accent-color)' }}>{selectedLog.id}</code>
                  </div>
                </div>
              </div>

              <button
                onClick={() => setSelectedLog(null)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--text-muted)',
                  cursor: 'pointer',
                  padding: '0.4rem',
                  borderRadius: '8px'
                }}
              >
                <X size={22} />
              </button>
            </div>

            {/* Actor & Screen & Metadata Grid */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
              gap: '1rem',
              background: 'var(--surface-highlight)',
              borderRadius: '12px',
              padding: '1.25rem',
              border: '1px solid var(--border-color)'
            }}>
              <div>
                <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: '0.2rem' }}>
                  {t('audit_log.employee', { defaultValue: 'الموظف المسؤول' })}
                </div>
                <div style={{ fontSize: '1rem', fontWeight: '700', color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  <User size={15} color="var(--accent-color)" />
                  {selectedLog.username}
                </div>
              </div>

              <div>
                <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: '0.2rem' }}>
                  الشاشة المصدر
                </div>
                <div style={{ fontSize: '0.95rem', fontWeight: '700', color: 'var(--accent-color)', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                  <span>{getScreenInfo(selectedLog).icon || '🖥️'}</span>
                  {getScreenInfo(selectedLog).nameAr}
                </div>
              </div>

              <div>
                <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: '0.2rem' }}>
                  {t('audit_log.timestamp', { defaultValue: 'تاريخ وتوقيت التنفيذ' })}
                </div>
                <div style={{ fontSize: '0.9rem', fontWeight: '600', color: 'var(--text-main)' }}>
                  {new Date(selectedLog.created_at).toLocaleString('ar-SA')}
                </div>
              </div>

              <div>
                <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: '0.2rem' }}>
                  {t('audit_log.entity_id', { defaultValue: 'المعرف / رقم الموديل' })}
                </div>
                <div style={{ fontSize: '1rem', fontWeight: '800', color: 'var(--accent-color)' }}>
                  {selectedLog.entity_id ? `#${selectedLog.entity_id}` : '-'}
                </div>
              </div>
            </div>

            {/* Detailed Narrative Banner */}
            <div style={{
              padding: '1.15rem 1.25rem',
              borderRadius: '10px',
              background: getActionMeta(selectedLog.action_type).bg,
              border: `1px solid ${getActionMeta(selectedLog.action_type).border}`,
              color: 'var(--text-main)',
              fontSize: '1rem',
              fontWeight: '600',
              lineHeight: '1.6'
            }}>
              <span style={{ color: getActionMeta(selectedLog.action_type).color, fontWeight: '800', marginLeft: '0.5rem' }}>
                [{getActionMeta(selectedLog.action_type).label}]:
              </span>
              {formatDetailedLogSummary(selectedLog)}
            </div>

            {/* Dedicated COPY Relationship Card */}
            {(selectedLog.action_type === 'COPY' || (selectedLog.action || '').toUpperCase().includes('COPY')) && (
              <div style={{
                background: 'linear-gradient(135deg, rgba(139, 92, 246, 0.12), rgba(139, 92, 246, 0.04))',
                border: '1.5px solid rgba(139, 92, 246, 0.4)',
                borderRadius: '14px',
                padding: '1.25rem 1.5rem',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-around',
                flexWrap: 'wrap',
                gap: '1rem',
                boxShadow: '0 4px 16px rgba(139, 92, 246, 0.08)'
              }}>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: '0.82rem', color: '#a78bfa', fontWeight: '700', marginBottom: '0.35rem' }}>
                    📋 الموديل الأصلي (المستنسخ منه)
                  </div>
                  <div style={{
                    fontSize: '1.2rem',
                    fontWeight: '800',
                    color: '#fff',
                    background: 'rgba(139, 92, 246, 0.25)',
                    border: '1px solid #a78bfa',
                    padding: '0.3rem 1.2rem',
                    borderRadius: '8px',
                    letterSpacing: '0.04em'
                  }}>
                    {getCopiedFromModel(selectedLog) ? `#${getCopiedFromModel(selectedLog)}` : 'موديل سابق (أرشيف)'}
                  </div>
                </div>

                <div style={{
                  width: '42px',
                  height: '42px',
                  borderRadius: '50%',
                  background: 'rgba(139, 92, 246, 0.25)',
                  color: '#a78bfa',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontWeight: 'bold',
                  fontSize: '1.3rem'
                }}>
                  ➔
                </div>

                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: '0.82rem', color: '#10b981', fontWeight: '700', marginBottom: '0.35rem' }}>
                    ✨ الموديل الجديد (المستنسخ إليه)
                  </div>
                  <div style={{
                    fontSize: '1.2rem',
                    fontWeight: '800',
                    color: 'var(--accent-color)',
                    background: 'rgba(212, 175, 55, 0.15)',
                    border: '1px solid var(--accent-color)',
                    padding: '0.3rem 1.2rem',
                    borderRadius: '8px',
                    letterSpacing: '0.04em'
                  }}>
                    #{selectedLog.entity_id}
                  </div>
                </div>
              </div>
            )}

            {/* Changes Diff Table (If available) */}
            {selectedLog.details?.changes && Array.isArray(selectedLog.details.changes) && selectedLog.details.changes.length > 0 && (
              <div>
                <h4 style={{ color: 'var(--accent-color)', marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <Edit size={16} />
                  {t('audit_log.changes_table', { defaultValue: 'جدول مقارنة الفروقات والتعديلات' })} ({selectedLog.details.changes.length})
                </h4>

                <div style={{ border: '1px solid var(--border-color)', borderRadius: '10px', overflow: 'hidden' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'right', fontSize: '0.85rem' }}>
                    <thead>
                      <tr style={{ background: 'var(--surface-highlight)', borderBottom: '1px solid var(--border-color)', color: 'var(--text-muted)' }}>
                        <th style={{ padding: '0.75rem 1rem' }}>{t('audit_log.col_field', { defaultValue: 'الحقل' })}</th>
                        <th style={{ padding: '0.75rem 1rem' }}>{t('audit_log.col_before', { defaultValue: 'القيمة السابقة' })}</th>
                        <th style={{ padding: '0.75rem 1rem' }}>{t('audit_log.col_after', { defaultValue: 'القيمة الجديدة' })}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedLog.details.changes.map((ch, idx) => (
                        <tr key={idx} style={{ borderBottom: '1px solid var(--border-color)' }}>
                          <td style={{ padding: '0.75rem 1rem', fontWeight: '700', color: 'var(--text-main)' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap' }}>
                              <span style={{ color: 'var(--accent-color)' }}>
                                {translateFieldToArabic(ch.label || ch.field)}
                              </span>
                              {ch.label && ch.label !== translateFieldToArabic(ch.label) && (
                                <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', background: 'rgba(255,255,255,0.06)', padding: '1px 6px', borderRadius: '4px' }}>
                                  ({ch.label})
                                </span>
                              )}
                            </div>
                          </td>
                          <td style={{ padding: '0.75rem 1rem', color: '#ef4444', backgroundColor: 'rgba(239, 68, 68, 0.05)' }}>
                            <span style={{ textDecoration: 'line-through' }}>{ch.from || '-'}</span>
                          </td>
                          <td style={{ padding: '0.75rem 1rem', color: '#10b981', fontWeight: 'bold', backgroundColor: 'rgba(16, 185, 129, 0.05)' }}>
                            {ch.to || '-'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Explanatory note when UPDATE has no field-level diffs */}
            {(!selectedLog.details?.changes || selectedLog.details.changes.length === 0) && (selectedLog.action_type === 'UPDATE' || (selectedLog.action || '').toUpperCase().includes('UPDATE')) && (
              <div style={{
                background: 'rgba(245, 158, 11, 0.08)',
                border: '1px solid rgba(245, 158, 11, 0.3)',
                borderRadius: '12px',
                padding: '1.1rem 1.25rem',
                display: 'flex',
                alignItems: 'flex-start',
                gap: '0.85rem'
              }}>
                <AlertTriangle size={22} color="#f59e0b" style={{ flexShrink: 0, marginTop: '2px' }} />
                <div>
                  <div style={{ fontWeight: '700', color: '#f59e0b', fontSize: '0.95rem', marginBottom: '0.3rem' }}>
                    تحديث وحفظ عام لسجل الطلبية
                  </div>
                  <div style={{ fontSize: '0.86rem', color: 'var(--text-muted)', lineHeight: '1.6' }}>
                    تم تسجيل هذه الحركة عند قيام الموظف بتأكيد أو حفظ الطلبية. لم تطرأ اختلافات على الحقول المالية أو الكميات المحورية الأساسية (مثل السعر أو إجمالي القطع أو اسم المصنع)، وقد شمل الإجراء تعديل الملاحظات، الصور، أو إعادة تأكيد البيانات.
                  </div>
                </div>
              </div>
            )}

            {/* Deleted Item Snapshot Backup & 1-Click Restore */}
            {selectedLog.details?.fullSnapshot && (
              <div style={{
                background: 'rgba(239, 68, 68, 0.06)',
                border: '1px solid rgba(239, 68, 68, 0.3)',
                borderRadius: '12px',
                padding: '1.25rem'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem', flexWrap: 'wrap', gap: '0.75rem' }}>
                  <h4 style={{ margin: 0, color: '#ef4444', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <Trash2 size={16} />
                    {t('audit_log.deleted_snapshot_title', { defaultValue: 'النسخة الاحتياطية للبيانات المحذوفة' })}
                  </h4>

                  <button
                    onClick={() => handleRestore(selectedLog)}
                    disabled={isRestoring}
                    className="btn"
                    style={{
                      background: '#10b981',
                      color: '#000',
                      fontWeight: 'bold',
                      padding: '0.5rem 1.25rem',
                      borderRadius: '8px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.5rem',
                      cursor: 'pointer',
                      boxShadow: '0 4px 14px rgba(16, 185, 129, 0.4)'
                    }}
                  >
                    <RotateCcw size={16} />
                    {t('audit_log.btn_restore_order', { defaultValue: 'استعادة هذه الطلبية إلى النظام' })}
                  </button>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.75rem', fontSize: '0.85rem' }}>
                  <div>
                    <span style={{ color: 'var(--text-muted)' }}>رقم الموديل: </span>
                    <strong style={{ color: 'var(--accent-color)' }}>{selectedLog.details.fullSnapshot.serialNumber || selectedLog.entity_id}</strong>
                  </div>
                  <div>
                    <span style={{ color: 'var(--text-muted)' }}>اسم المنتج: </span>
                    <strong>{selectedLog.details.fullSnapshot.productName || '-'}</strong>
                  </div>
                  <div>
                    <span style={{ color: 'var(--text-muted)' }}>المشتري: </span>
                    <strong>{selectedLog.details.fullSnapshot.buyerCompany || selectedLog.details.fullSnapshot.buyerId || '-'}</strong>
                  </div>
                  <div>
                    <span style={{ color: 'var(--text-muted)' }}>المصنع: </span>
                    <strong>{selectedLog.details.fullSnapshot.factoryId || '-'}</strong>
                  </div>
                  <div>
                    <span style={{ color: 'var(--text-muted)' }}>إجمالي الكمية: </span>
                    <strong>{selectedLog.details.fullSnapshot.totalQuantity || '-'}</strong>
                  </div>
                  <div>
                    <span style={{ color: 'var(--text-muted)' }}>سعر القطعة: </span>
                    <strong>{selectedLog.details.fullSnapshot.productPrice || '-'} {selectedLog.details.fullSnapshot.currency || ''}</strong>
                  </div>
                </div>
              </div>
            )}

            {/* Device & Browser Info */}
            {selectedLog.user_agent && (
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', borderTop: '1px solid var(--border-color)', paddingTop: '0.75rem' }}>
                بيانات المتصفح والنظام: <code>{selectedLog.user_agent}</code>
              </div>
            )}

            {/* Footer Buttons */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', borderTop: '1px solid var(--border-color)', paddingTop: '1rem' }}>
              <button
                onClick={() => setSelectedLog(null)}
                className="btn btn-outline"
                style={{ padding: '0.5rem 1.5rem' }}
              >
                إغلاق
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AuditLog;
