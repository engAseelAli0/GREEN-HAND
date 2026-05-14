import React, { useState, useMemo, useRef } from 'react';
import { supabase } from '../supabaseClient';
import { useAppData } from '../context/AppDataContext';
import { Filter, Download, FileText, ChevronDown, ChevronUp, Printer, Calendar, Factory, ArrowUpDown, Camera, X, Brain, ShieldCheck, AlertTriangle, Clock, Activity, CheckCircle2, Trophy, Coins, TrendingUp } from 'lucide-react';
import toast from 'react-hot-toast';
import { useTranslation } from 'react-i18next';
import { CustomDateInput } from '../components/CustomDateInput';
import * as XLSX from 'xlsx';
import { englishOnly } from '../utils/textUtils';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { analyzeOrder, buildOperationalIntelligence } from '../utils/orderIntelligence';
import { activitySummary, formatActivityTime } from '../utils/activityLog';
import { useAuth } from '../context/AuthContext';

const calculateTotalPiecesCount = (orderData) => {
  if (!orderData) return 0;
  const colorsDist = orderData.colorDistribution || {};
  let total = 0;
  Object.keys(colorsDist).forEach(color => {
    if (colorsDist[color] && typeof colorsDist[color] === 'object') {
      Object.values(colorsDist[color]).forEach(val => {
        total += (parseInt(val, 10) || 0);
      });
    }
  });
  return total;
};

const ReportsPortal = () => {
  const { t } = useTranslation();
  const { lookups } = useAppData();
  const { hasPermission } = useAuth();
  const [orders, setOrders] = useState([]);
  const [receivings, setReceivings] = useState([]);
  const [filteredOrders, setFilteredOrders] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [dataLoaded, setDataLoaded] = useState(false);
  const [sortConfig, setSortConfig] = useState({ key: 'serial_number', direction: 'desc' });
  const intelligence = useMemo(
    () => buildOperationalIntelligence(filteredOrders, receivings, lookups),
    [filteredOrders, receivings, lookups]
  );
  const receivingMap = useMemo(
    () => new Map(receivings.map(item => [item.serial_number, item])),
    [receivings]
  );
  const executiveDashboard = useMemo(() => {
    const receivingBySerial = new Map(receivings.map(item => [item.serial_number, item]));
    const factoryMap = new Map();
    const productMap = new Map();
    let totalValue = 0;
    let delayedOrders = 0;

    filteredOrders.forEach(order => {
      const data = order.order_data || {};
      const factoryName = data.factoryId || 'غير محدد';
      const productName = englishOnly(data.productName) || data.productName || 'غير محدد';
      const qty = calculateTotalPiecesCount(data) || parseInt(data.totalQuantity, 10) || 0;
      const value = qty * (parseFloat(data.productPrice) || 0);
      const insight = analyzeOrder(order, receivingBySerial.get(order.serial_number), lookups);
      const isDelayed = insight.stage === 'overdue';
      totalValue += value;
      if (isDelayed) delayedOrders += 1;

      const factoryStats = factoryMap.get(factoryName) || {
        name: factoryName,
        orders: 0,
        quantity: 0,
        value: 0,
        delayed: 0,
        received: 0,
        health: 0,
      };
      factoryStats.orders += 1;
      factoryStats.quantity += qty;
      factoryStats.value += value;
      factoryStats.delayed += isDelayed ? 1 : 0;
      factoryStats.received += insight.stage === 'received' ? 1 : 0;
      factoryStats.health += insight.healthScore;
      factoryMap.set(factoryName, factoryStats);

      const productStats = productMap.get(productName) || { name: productName, orders: 0, quantity: 0, value: 0 };
      productStats.orders += 1;
      productStats.quantity += qty;
      productStats.value += value;
      productMap.set(productName, productStats);
    });

    const factories = [...factoryMap.values()]
      .map(item => ({
        ...item,
        avgHealth: item.orders ? Math.round(item.health / item.orders) : 0,
        delayRate: item.orders ? Math.round((item.delayed / item.orders) * 100) : 0,
        receiveRate: item.orders ? Math.round((item.received / item.orders) * 100) : 0,
      }))
      .sort((a, b) => b.orders - a.orders);

    return {
      totalValue,
      delayedOrders,
      factories,
      bestFactories: [...factories].sort((a, b) => b.avgHealth - a.avgHealth).slice(0, 5),
      delayedFactories: [...factories].filter(item => item.delayed > 0).sort((a, b) => b.delayed - a.delayed).slice(0, 5),
      topProducts: [...productMap.values()].sort((a, b) => b.quantity - a.quantity).slice(0, 6),
    };
  }, [filteredOrders, receivings, lookups]);

  
  // Filters state
  const [filters, setFilters] = useState({
    fromSerial: '',
    toSerial: '',
    fromDate: '',
    toDate: '',
    factory: '',
  });

  // F9 Lookup States
  const [showSerialsList, setShowSerialsList] = useState(false);
  const [availableSerials, setAvailableSerials] = useState([]);
  const [fetchingSerials, setFetchingSerials] = useState(false);
  const [serialSearchQuery, setSerialSearchQuery] = useState('');
  const [activeSerialField, setActiveSerialField] = useState(null); // 'fromSerial' or 'toSerial'
  const serialSearchRef = useRef(null);

  const handleF9Press = async (e, fieldName) => {
    if (e.key === 'F9') {
      e.preventDefault();
      if (showSerialsList || fetchingSerials) return;
      
      setActiveSerialField(fieldName);
      setFetchingSerials(true);
      setShowSerialsList(true);
      setSerialSearchQuery('');
      
      try {
        const { data, error } = await supabase
          .from('orders')
          .select('serial_number')
          .order('created_at', { ascending: false })
          .limit(2000);
        if (data && !error) {
           setAvailableSerials(data.map(d => d.serial_number));
        }
      } catch (err) {
        console.error(err);
      } finally {
         setFetchingSerials(false);
         setTimeout(() => serialSearchRef.current?.focus(), 100);
      }
    } else if (e.key === 'Escape') {
      setShowSerialsList(false);
      setSerialSearchQuery('');
    }
  };

  const updateFilter = (field, value) => {
    setFilters(prev => ({ ...prev, [field]: value }));
  };

  const [expandedRows, setExpandedRows] = useState([]);

  const fetchOrders = async () => {
    setIsLoading(true);
    let sortedData = [];
    try {
      const { data, error } = await supabase
        .from('orders')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;

      const { data: recData, error: recError } = await supabase
        .from('receivings')
        .select('*');

      if (!recError) {
        setReceivings(recData || []);
      } else {
        console.warn('Could not fetch receivings for intelligence:', recError);
        setReceivings([]);
      }
      
      sortedData = (data || []).sort((a, b) => {
         return (parseInt(b.serial_number) || 0) - (parseInt(a.serial_number) || 0);
      });
      
      setOrders(sortedData);
      setFilteredOrders(sortedData);
      setDataLoaded(true);
    } catch (err) {
      console.error(err);
      toast.error(t('reports.messages.fetch_error'));
    } finally {
      setIsLoading(false);
    }
    return sortedData;
  };

  const applyFilters = async () => {
    let currentData = orders;
    if (!dataLoaded) {
      currentData = await fetchOrders();
    }
    
    let result = [...currentData];

    if (filters.fromSerial) {
      result = result.filter(o => parseInt(o.serial_number) >= parseInt(filters.fromSerial));
    }
    if (filters.toSerial) {
      result = result.filter(o => parseInt(o.serial_number) <= parseInt(filters.toSerial));
    }
    if (filters.fromDate) {
      result = result.filter(o => new Date(o.order_data.requestDate || o.created_at) >= new Date(filters.fromDate));
    }
    if (filters.toDate) {
      result = result.filter(o => new Date(o.order_data.requestDate || o.created_at) <= new Date(filters.toDate));
    }
    if (filters.factory) {
      result = result.filter(o => (o.order_data.factoryId || '').includes(filters.factory));
    }

    // Apply dynamic sorting based on sortConfig
    result.sort((a, b) => {
      const dA = a.order_data || {};
      const dB = b.order_data || {};
      let valA, valB;
      switch(sortConfig.key) {
        case 'serial_number':
          valA = parseInt(a.serial_number) || 0;
          valB = parseInt(b.serial_number) || 0;
          break;
        case 'productName':
          valA = (dA.productName || '').toLowerCase();
          valB = (dB.productName || '').toLowerCase();
          break;
        case 'buyerCompany':
          valA = (dA.buyerCompany || '').toLowerCase();
          valB = (dB.buyerCompany || '').toLowerCase();
          break;
        case 'factoryId':
          valA = (dA.factoryId || '').toLowerCase();
          valB = (dB.factoryId || '').toLowerCase();
          break;
        case 'totalQuantity':
          valA = calculateTotalPiecesCount(dA) || parseInt(dA.totalQuantity) || 0;
          valB = calculateTotalPiecesCount(dB) || parseInt(dB.totalQuantity) || 0;
          break;
        case 'requestDate':
          valA = new Date(dA.requestDate || a.created_at).getTime();
          valB = new Date(dB.requestDate || b.created_at).getTime();
          break;
        default:
          valA = 0; valB = 0;
      }
      if (valA < valB) return sortConfig.direction === 'asc' ? -1 : 1;
      if (valA > valB) return sortConfig.direction === 'asc' ? 1 : -1;
      return 0;
    });

    setFilteredOrders(result);
    setExpandedRows([]);
    toast.success(t('reports.messages.found_orders', { count: result.length }), { id: 'filter-toast' });
  };

  const clearFilters = () => {
    setFilters({
      fromSerial: '',
      toSerial: '',
      fromDate: '',
      toDate: '',
      factory: '',
    });
    setFilteredOrders(orders);
    setExpandedRows([]);
  };

  const handleSort = (key) => {
    let direction = 'desc';
    if (sortConfig.key === key && sortConfig.direction === 'desc') {
      direction = 'asc';
    }
    const newConfig = { key, direction };
    setSortConfig(newConfig);

    // Apply sort immediately to filteredOrders
    const sorted = [...filteredOrders].sort((a, b) => {
      const dA = a.order_data || {};
      const dB = b.order_data || {};
      let valA, valB;
      switch(key) {
        case 'serial_number':
          valA = parseInt(a.serial_number) || 0;
          valB = parseInt(b.serial_number) || 0;
          break;
        case 'productName':
          valA = (dA.productName || '').toLowerCase();
          valB = (dB.productName || '').toLowerCase();
          break;
        case 'buyerCompany':
          valA = (dA.buyerCompany || '').toLowerCase();
          valB = (dB.buyerCompany || '').toLowerCase();
          break;
        case 'factoryId':
          valA = (dA.factoryId || '').toLowerCase();
          valB = (dB.factoryId || '').toLowerCase();
          break;
        case 'totalQuantity':
          valA = calculateTotalPiecesCount(dA) || parseInt(dA.totalQuantity) || 0;
          valB = calculateTotalPiecesCount(dB) || parseInt(dB.totalQuantity) || 0;
          break;
        case 'requestDate':
          valA = new Date(dA.requestDate || a.created_at).getTime();
          valB = new Date(dB.requestDate || b.created_at).getTime();
          break;
        default:
          valA = 0; valB = 0;
      }
      if (valA < valB) return direction === 'asc' ? -1 : 1;
      if (valA > valB) return direction === 'asc' ? 1 : -1;
      return 0;
    });
    setFilteredOrders(sorted);
  };

  const toggleRow = (serial) => {
    setExpandedRows(prev => 
      prev.includes(serial) ? prev.filter(s => s !== serial) : [...prev, serial]
    );
  };

  // ─── Export Handlers ───
  const getFactoryCode = (factoryId) => {
    if (!factoryId) return '';
    const factory = Array.isArray(lookups.factories) ? lookups.factories.find(f => (f.name === factoryId || f === factoryId)) : null;
    return (factory && factory.code) ? factory.code : '';
  };

  const exportToExcel = () => {
    if (filteredOrders.length === 0) return toast.error(t('reports.messages.no_data_export'));
    
    const excelData = filteredOrders.map(o => {
      const d = o.order_data || {};
      const computedTotal = calculateTotalPiecesCount(d);
      return {
        [t('reports.excel_headers.serial')]: o.serial_number || '-',
        [t('reports.excel_headers.buyer')]: d.buyerCompany || '-',
        [t('reports.excel_headers.product')]: englishOnly(d.productName) || '-',
        [t('reports.excel_headers.factory')]: d.factoryId || '-',
        [t('reports.excel_headers.factory_code')]: getFactoryCode(d.factoryId) || '-',
        [t('reports.excel_headers.brand')]: d.tradeMark || '-',
        [t('reports.excel_headers.sizes')]: `${d.sizeFrom || '-'} ⟵ ${d.sizeTo || '-'}`,
        [t('reports.excel_headers.total_qty')]: computedTotal > 0 ? computedTotal : (d.totalQuantity || 0),
        [t('reports.excel_headers.unit_price')]: d.productPrice || 0,
        [t('reports.excel_headers.currency')]: d.currency || '-',
        [t('reports.excel_headers.total_price')]: (parseFloat(d.productPrice || 0) * (computedTotal > 0 ? computedTotal : parseInt(d.totalQuantity || 0))) || 0,
        [t('reports.excel_headers.remarks')]: d.remarks || '-',
        [t('reports.excel_headers.order_date')]: d.requestDate || o.created_at?.split('T')[0],
        [t('reports.excel_headers.delivery_date')]: d.deliveryDate || '-',
        [t('reports.excel_headers.system_date')]: new Date(o.created_at).toLocaleString(),
      };
    });

    const worksheet = XLSX.utils.json_to_sheet(excelData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, t('reports.excel_headers.sheet_name', { defaultValue: 'Orders Report' }));
    XLSX.writeFile(workbook, `Report_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  const exportToPDF = async () => {
    if (filteredOrders.length === 0) return toast.error(t('reports.messages.no_data_export'));
    
    const toastId = toast.loading(t('reports.messages.preparing_pdf'));

    try {
       const pdf = new jsPDF({
         orientation: 'landscape',
         unit: 'mm',
         format: 'a4',
       });

       const pageW = pdf.internal.pageSize.getWidth();
       const margin = 10;

       // === Title ===
       pdf.setFontSize(18);
       pdf.setFont('helvetica', 'bold');
       pdf.text('Orders Report', pageW / 2, 16, { align: 'center' });
       pdf.setFontSize(10);
       pdf.setFont('helvetica', 'normal');
       pdf.text(`Generated: ${new Date().toLocaleDateString()} | Total: ${filteredOrders.length} orders`, pageW / 2, 23, { align: 'center' });
       pdf.setDrawColor(30, 41, 59);
       pdf.setLineWidth(0.5);
       pdf.line(margin, 26, pageW - margin, 26);

       // === Data Table ===
       const tblHead = [[
         '#', 
         t('reports.table.cols.serial'), 
         t('reports.table.cols.product'), 
         t('reports.table.cols.buyer'), 
         t('reports.table.cols.factory'), 
         t('reports.excel_headers.factory_code'), 
         t('reports.excel_headers.sizes'), 
         t('reports.table.cols.total_qty'), 
         t('reports.excel_headers.unit_price'), 
         t('reports.excel_headers.currency'), 
         t('reports.excel_headers.total_price'), 
         t('reports.table.cols.order_date'), 
         t('reports.excel_headers.delivery_date')
       ]];

       const tblBody = filteredOrders.map((order, idx) => {
         const d = order.order_data || {};
         const computedTotal = calculateTotalPiecesCount(d);
         const qty = computedTotal > 0 ? computedTotal : (parseInt(d.totalQuantity) || 0);
         const totalPrice = (parseFloat(d.productPrice || 0) * qty) || 0;
         return [
           idx + 1,
           order.serial_number || '-',
           englishOnly(d.productName) || '-',
           d.buyerCompany || '-',
           d.factoryId || '-',
           getFactoryCode(d.factoryId) || '-',
           `${d.sizeFrom || '-'} - ${d.sizeTo || '-'}`,
           qty,
           d.productPrice || 0,
           d.currency || '-',
           totalPrice.toLocaleString(undefined, { minimumFractionDigits: 2 }),
           d.requestDate || '-',
           d.deliveryDate || '-',
         ];
       });

       autoTable(pdf, {
         startY: 30,
         head: tblHead,
         body: tblBody,
         theme: 'grid',
         headStyles: { fillColor: [226, 232, 240], textColor: [15, 23, 42], fontStyle: 'bold', fontSize: 7, halign: 'center', cellPadding: 2.5 },
         styles: { fontSize: 7, cellPadding: 2, halign: 'center', font: 'helvetica', overflow: 'linebreak' },
         columnStyles: {
           0: { cellWidth: 8 },
           1: { cellWidth: 16 },
           2: { cellWidth: 40, halign: 'left' },
           3: { cellWidth: 25, halign: 'left' },
           4: { cellWidth: 22, halign: 'left' },
           5: { cellWidth: 16 },
           6: { cellWidth: 20 },
           7: { cellWidth: 16 },
           8: { cellWidth: 16 },
           9: { cellWidth: 14 },
           10: { cellWidth: 22 },
           11: { cellWidth: 22 },
           12: { cellWidth: 22 },
         },
         margin: { left: margin, right: margin },
          didDrawPage: () => {
           // Footer on each page
           pdf.setFontSize(7);
           pdf.setFont('helvetica', 'normal');
           pdf.text(`Page ${pdf.internal.getNumberOfPages()}`, pageW - margin, pdf.internal.pageSize.getHeight() - 5, { align: 'right' });
         },
       });

       pdf.save(`Report_${new Date().toISOString().split('T')[0]}.pdf`);
       
       toast.success(t('reports.messages.pdf_success'), { id: toastId });
    } catch (err) {
       toast.error(t('reports.messages.pdf_error'), { id: toastId });
       console.error(err);
    }
  };

  const renderSerialsLookup = () => (
    <div style={{
      position: 'absolute', top: '100%', right: 0, marginTop: '4px',
      width: '250px', maxHeight: '300px', overflowY: 'auto',
      backgroundColor: 'var(--surface-color)',
      border: '1px solid var(--accent-color)',
      borderRadius: 'var(--radius-md)',
      boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
      zIndex: 1000,
      animation: 'fadeIn 0.2s ease'
    }}>
      <div style={{ padding: '0.75rem', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: 'var(--surface-highlight)' }}>
          <span style={{ fontSize: '0.9rem', fontWeight: 'bold', color: 'var(--accent-color)' }}>{t('export.select_saved')}:</span>
          <button onClick={() => { setShowSerialsList(false); setSerialSearchQuery(''); }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-main)', padding: 0, display: 'flex', alignItems: 'center' }}>
             <X size={18} />
          </button>
      </div>
      
      <div style={{ padding: '0.5rem', borderBottom: '1px solid var(--border-color)', backgroundColor: 'var(--bg-color)' }}>
        <input
          ref={serialSearchRef}
          type="text"
          placeholder={t('export.search_placeholder')}
          value={serialSearchQuery}
          onChange={(e) => setSerialSearchQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              setShowSerialsList(false);
              setSerialSearchQuery('');
            }
            if (e.key === 'Enter') {
              const filtered = availableSerials.filter(s => s.toString().includes(serialSearchQuery));
              if (filtered.length > 0) {
                updateFilter(activeSerialField, filtered[0]);
                setShowSerialsList(false);
                setSerialSearchQuery('');
              }
            }
          }}
          style={{
            width: '100%',
            padding: '0.6rem',
            fontSize: '0.9rem',
            border: '1px solid var(--border-color)',
            borderRadius: '4px',
            backgroundColor: 'var(--surface-color)',
            color: 'var(--text-main)',
            outline: 'none',
            direction: 'rtl'
          }}
          autoComplete="off"
        />
      </div>
      
      {fetchingSerials ? (
          <div style={{ padding: '1.5rem', textAlign: 'center', fontSize: '0.85rem', color: 'var(--text-muted)' }}>{t('print.search.loading')}</div>
      ) : (
         (() => {
           const filteredSerials = serialSearchQuery.trim()
             ? availableSerials.filter(s => s.toString().includes(serialSearchQuery.trim()))
             : availableSerials;
           return filteredSerials.length === 0 ? (
             <div style={{ padding: '1.5rem', textAlign: 'center', fontSize: '0.85rem', color: 'var(--text-muted)' }}>{t('entry.actions.no_match')}</div>
           ) : (
            <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                {filteredSerials.map(serial => (
                  <li 
                      key={serial} 
                      onClick={() => {
                          updateFilter(activeSerialField, serial);
                          setShowSerialsList(false);
                          setSerialSearchQuery('');
                      }}
                      style={{ padding: '0.75rem 1rem', cursor: 'pointer', borderBottom: '1px solid var(--border-color)', transition: 'background 0.2s', fontSize: '0.95rem' }}
                      onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--surface-highlight)'}
                      onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                  >
                      <strong>{serial}</strong>
                  </li>
                ))}
            </ul>
           );
         })()
      )}
    </div>
  );

  return (
    <div className="fade-in" style={{ padding: '0 1rem' }}>
      
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
        <div>
          <h1 className="text-gradient" style={{ fontSize: '2.5rem', marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <FileText size={40} color="var(--accent-color)" /> {t('reports.title')}
          </h1>
          <p style={{ color: 'var(--text-muted)' }}>{t('reports.subtitle')}</p>
        </div>
        <div style={{ display: 'flex', gap: '1rem' }}>
          {hasPermission('reports', 'export') && (
            <>
              <button className="btn" onClick={exportToExcel} style={{ backgroundColor: '#10b981', color: 'white', boxShadow: '0 4px 15px rgba(16, 185, 129, 0.3)' }}>
                <Download size={20} /> {t('reports.export_excel')}
              </button>
              <button className="btn" onClick={exportToPDF} style={{ backgroundColor: '#ef4444', color: 'white', boxShadow: '0 4px 15px rgba(239, 68, 68, 0.3)' }}>
                <Printer size={20} /> {t('reports.export_pdf')}
              </button>
            </>
          )}
        </div>
      </div>

      {dataLoaded && (
        <div className="card glass-panel" style={{ marginBottom: '2rem', border: '1px solid rgba(212,175,55,0.18)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem', marginBottom: '1.25rem' }}>
            <div>
              <h3 style={{ margin: 0, color: 'var(--text-strong)', display: 'flex', alignItems: 'center', gap: '0.55rem' }}>
                <TrendingUp size={22} color="var(--accent-color)" /> Dashboard تنفيذية
              </h3>
              <p style={{ margin: '0.35rem 0 0', color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                مؤشرات مالية وتشغيلية مختصرة حسب النتائج الحالية.
              </p>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: '0.8rem', marginBottom: '1rem' }}>
            {[
              { label: 'إجمالي قيمة البضاعة', value: executiveDashboard.totalValue.toLocaleString(), icon: Coins, color: '#d4af37' },
              { label: 'طلبات متأخرة', value: executiveDashboard.delayedOrders, icon: Clock, color: '#fb7185' },
              { label: 'عدد المصانع', value: executiveDashboard.factories.length, icon: Factory, color: '#38bdf8' },
              { label: 'منتجات نشطة', value: executiveDashboard.topProducts.length, icon: Trophy, color: '#34d399' },
            ].map(item => {
              const Icon = item.icon;
              return (
                <div key={item.label} style={{ padding: '1rem', borderRadius: 16, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', gap: '0.8rem' }}>
                  <div style={{ width: 42, height: 42, borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', color: item.color, background: `${item.color}1f` }}>
                    <Icon size={20} />
                  </div>
                  <div>
                    <div style={{ color: 'var(--text-strong)', fontWeight: 900, fontSize: '1.22rem', fontFamily: 'Outfit, sans-serif' }}>{item.value}</div>
                    <div style={{ color: 'var(--text-muted)', fontSize: '0.78rem' }}>{item.label}</div>
                  </div>
                </div>
              );
            })}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1rem' }}>
            <div style={{ padding: '1rem', borderRadius: 14, background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.05)' }}>
              <h4 style={{ margin: '0 0 0.75rem', color: 'var(--text-strong)', display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                <Factory size={18} color="#38bdf8" /> أداء المصانع
              </h4>
              {executiveDashboard.bestFactories.length === 0 ? (
                <div style={{ color: 'var(--text-muted)' }}>لا توجد بيانات مصانع ضمن النتائج.</div>
              ) : executiveDashboard.bestFactories.map(factory => (
                <div key={factory.name} style={{ marginBottom: '0.75rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-strong)', fontSize: '0.85rem', marginBottom: 5 }}>
                    <strong>{factory.name}</strong>
                    <span>{factory.avgHealth}% صحة</span>
                  </div>
                  <div style={{ height: 8, borderRadius: 999, background: 'rgba(255,255,255,0.06)', overflow: 'hidden' }}>
                    <div style={{ width: `${factory.avgHealth}%`, height: '100%', background: factory.avgHealth >= 80 ? '#34d399' : factory.avgHealth >= 55 ? '#fbbf24' : '#fb7185' }} />
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-muted)', fontSize: '0.72rem', marginTop: 4 }}>
                    <span>{factory.orders} طلب</span>
                    <span>{factory.receiveRate}% استلام</span>
                  </div>
                </div>
              ))}
            </div>

            <div style={{ padding: '1rem', borderRadius: 14, background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.05)' }}>
              <h4 style={{ margin: '0 0 0.75rem', color: 'var(--text-strong)', display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                <AlertTriangle size={18} color="#fb7185" /> التأخير حسب المصنع
              </h4>
              {executiveDashboard.delayedFactories.length === 0 ? (
                <div style={{ color: '#34d399', display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                  <CheckCircle2 size={17} /> لا توجد تأخيرات في النتائج الحالية.
                </div>
              ) : executiveDashboard.delayedFactories.map(factory => (
                <div key={factory.name} style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: '0.75rem', alignItems: 'center', padding: '0.55rem 0', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                  <div>
                    <strong style={{ color: 'var(--text-strong)' }}>{factory.name}</strong>
                    <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>{factory.orders} طلب، معدل التأخير {factory.delayRate}%</div>
                  </div>
                  <span style={{ color: '#fb7185', fontWeight: 900 }}>{factory.delayed}</span>
                </div>
              ))}
            </div>

            <div style={{ padding: '1rem', borderRadius: 14, background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.05)' }}>
              <h4 style={{ margin: '0 0 0.75rem', color: 'var(--text-strong)', display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                <Trophy size={18} color="#d4af37" /> المنتجات الأكثر طلبًا
              </h4>
              {executiveDashboard.topProducts.length === 0 ? (
                <div style={{ color: 'var(--text-muted)' }}>لا توجد بيانات منتجات ضمن النتائج.</div>
              ) : executiveDashboard.topProducts.map((product, index) => (
                <div key={product.name} style={{ display: 'grid', gridTemplateColumns: 'auto 1fr auto', gap: '0.65rem', alignItems: 'center', padding: '0.5rem 0', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                  <span style={{ color: index === 0 ? '#d4af37' : 'var(--text-muted)', fontWeight: 900 }}>#{index + 1}</span>
                  <div>
                    <strong style={{ color: 'var(--text-strong)', fontSize: '0.86rem' }}>{product.name}</strong>
                    <div style={{ color: 'var(--text-muted)', fontSize: '0.74rem' }}>{product.orders} طلب</div>
                  </div>
                  <span style={{ color: 'var(--accent-color)', fontWeight: 900 }}>{product.quantity.toLocaleString()}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {dataLoaded && (
        <div className="card glass-panel" style={{ marginBottom: '2rem', border: '1px solid rgba(56,189,248,0.18)', boxShadow: '0 18px 50px rgba(0,0,0,0.22)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem', marginBottom: '1.25rem' }}>
            <div>
              <h3 style={{ margin: 0, color: 'var(--text-strong)', display: 'flex', alignItems: 'center', gap: '0.55rem' }}>
                <Brain size={22} color="#38bdf8" /> مركز الذكاء التشغيلي
              </h3>
              <p style={{ margin: '0.35rem 0 0', color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                تحليل تلقائي لصحة الطلبات، مراحلها، والمشاكل التي قد توقف الطباعة أو التصدير أو الاستلام.
              </p>
            </div>
            <div style={{ minWidth: 92, height: 92, borderRadius: 18, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: intelligence.avgHealth >= 80 ? 'rgba(16,185,129,0.12)' : intelligence.avgHealth >= 55 ? 'rgba(245,158,11,0.12)' : 'rgba(244,63,94,0.12)', border: '1px solid rgba(255,255,255,0.08)' }}>
              <strong style={{ fontSize: '1.8rem', color: intelligence.avgHealth >= 80 ? '#34d399' : intelligence.avgHealth >= 55 ? '#fbbf24' : '#fb7185', lineHeight: 1 }}>{intelligence.avgHealth}</strong>
              <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem', marginTop: 4 }}>صحة النظام</span>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(165px, 1fr))', gap: '0.8rem', marginBottom: '1rem' }}>
            {[
              { label: 'الطلبات', value: filteredOrders.length, icon: FileText, color: '#38bdf8' },
              { label: 'إجمالي القطع', value: intelligence.totalQuantity.toLocaleString(), icon: Activity, color: '#d4af37' },
              { label: 'مخاطر عالية', value: intelligence.riskCounts.high || 0, icon: AlertTriangle, color: '#fb7185' },
              { label: 'تم الاستلام', value: intelligence.stageCounts.received || 0, icon: CheckCircle2, color: '#34d399' },
              { label: 'متأخر', value: intelligence.stageCounts.overdue || 0, icon: Clock, color: '#f97316' },
            ].map(item => {
              const Icon = item.icon;
              return (
                <div key={item.label} style={{ padding: '1rem', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 14, display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                  <div style={{ width: 40, height: 40, borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', background: `${item.color}1f`, color: item.color }}>
                    <Icon size={19} />
                  </div>
                  <div>
                    <div style={{ color: 'var(--text-strong)', fontWeight: 900, fontSize: '1.2rem', fontFamily: 'Outfit, sans-serif' }}>{item.value}</div>
                    <div style={{ color: 'var(--text-muted)', fontSize: '0.78rem' }}>{item.label}</div>
                  </div>
                </div>
              );
            })}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(260px, 1.1fr) minmax(260px, 0.9fr)', gap: '1rem' }}>
            <div style={{ padding: '1rem', background: 'rgba(255,255,255,0.025)', borderRadius: 14, border: '1px solid rgba(255,255,255,0.05)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', color: 'var(--text-strong)', fontWeight: 800, marginBottom: '0.75rem' }}>
                <ShieldCheck size={18} color="#34d399" /> أولويات الإصلاح الذكية
              </div>
              {intelligence.topIssues.length === 0 ? (
                <div style={{ color: '#34d399', display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                  <CheckCircle2 size={17} /> لا توجد مشاكل تشغيلية واضحة في النتائج الحالية.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  {intelligence.topIssues.map(issue => (
                    <div key={issue.label} style={{ display: 'grid', gridTemplateColumns: 'auto 1fr auto', alignItems: 'center', gap: '0.65rem', padding: '0.65rem 0.75rem', borderRadius: 12, background: issue.severity === 'critical' ? 'rgba(244,63,94,0.08)' : 'rgba(245,158,11,0.08)', border: '1px solid rgba(255,255,255,0.05)' }}>
                      <AlertTriangle size={16} color={issue.severity === 'critical' ? '#fb7185' : '#fbbf24'} />
                      <div>
                        <div style={{ color: 'var(--text-strong)', fontWeight: 700, fontSize: '0.86rem' }}>{issue.label}</div>
                        <div style={{ color: 'var(--text-muted)', fontSize: '0.76rem', marginTop: 2 }}>{issue.fix}</div>
                      </div>
                      <strong style={{ color: 'var(--accent-color)' }}>{issue.count}</strong>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div style={{ padding: '1rem', background: 'rgba(255,255,255,0.025)', borderRadius: 14, border: '1px solid rgba(255,255,255,0.05)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', color: 'var(--text-strong)', fontWeight: 800, marginBottom: '0.75rem' }}>
                <Clock size={18} color="#fbbf24" /> طلبات تحتاج متابعة الآن
              </div>
              {intelligence.urgentOrders.length === 0 ? (
                <div style={{ color: 'var(--text-muted)' }}>لا توجد طلبات عاجلة ضمن النتائج الحالية.</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
                  {intelligence.urgentOrders.map(item => (
                    <button key={item.serial} onClick={() => toggleRow(item.serial)} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem', width: '100%', border: '1px solid rgba(255,255,255,0.06)', background: 'rgba(255,255,255,0.03)', color: 'var(--text-strong)', borderRadius: 12, padding: '0.55rem 0.7rem', cursor: 'pointer', fontFamily: 'Tajawal, sans-serif' }}>
                      <span style={{ fontWeight: 800 }}>#{item.serial}</span>
                      <span style={{ color: item.stageColor, fontSize: '0.8rem' }}>{item.stageLabel}</span>
                      <span style={{ color: item.healthScore < 55 ? '#fb7185' : '#fbbf24', fontWeight: 900 }}>{item.healthScore}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Filter Card */}
      <div className="card glass-panel" style={{ marginBottom: '2rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1.5rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '1rem' }}>
          <Filter color="var(--accent-color)" />
          <h3 style={{ margin: 0 }}>{t('reports.filters.title')}</h3>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1.5rem' }}>
          <div className="form-group" style={{ position: 'relative' }}>
            <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}><FileText size={14}/> {t('reports.filters.from_serial')}</label>
            <input type="number" className="form-control" placeholder={t('print.search.placeholder')} value={filters.fromSerial} onChange={(e) => updateFilter('fromSerial', e.target.value)} onKeyDown={(e) => handleF9Press(e, 'fromSerial')} />
            {showSerialsList && activeSerialField === 'fromSerial' && renderSerialsLookup()}
          </div>
          
          <div className="form-group" style={{ position: 'relative' }}>
            <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}><FileText size={14}/> {t('reports.filters.to_serial')}</label>
            <input type="number" className="form-control" placeholder={t('print.search.placeholder')} value={filters.toSerial} onChange={(e) => updateFilter('toSerial', e.target.value)} onKeyDown={(e) => handleF9Press(e, 'toSerial')} />
            {showSerialsList && activeSerialField === 'toSerial' && renderSerialsLookup()}
          </div>

          <CustomDateInput 
            label={<><Calendar size={14}/> {t('reports.filters.from_date')}</>}
            value={filters.fromDate}
            onChange={(val) => updateFilter('fromDate', val)}
          />

          <CustomDateInput 
            label={<><Calendar size={14}/> {t('reports.filters.to_date')}</>}
            value={filters.toDate}
            onChange={(val) => updateFilter('toDate', val)}
          />

          <div className="form-group">
            <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}><Factory size={14}/> {t('reports.filters.select_factory')}</label>
            <select className="form-control" value={filters.factory} onChange={(e) => updateFilter('factory', e.target.value)}>
              <option value="">{t('reports.filters.all_factories')}</option>
              {lookups.factories?.map((f, i) => {
                const factoryName = typeof f === 'object' ? f.name : f;
                return <option key={i} value={factoryName}>{factoryName}</option>;
              })}
            </select>
          </div>
          
        </div>
        
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '1rem', marginTop: '2rem' }}>
          <button className="btn btn-outline" onClick={clearFilters}>{t('reports.filters.clear_btn')}</button>
          <button className="btn btn-accent" onClick={async () => { await fetchOrders(); toast.success(t('reports.messages.all_shown'), { id: 'filter-toast' }); }} style={{ backgroundColor: 'var(--accent-color)', color: '#000', fontWeight: 'bold', padding: '0.5rem 1.5rem' }}>{t('reports.filters.show_all_btn')}</button>
          <button className="btn btn-primary" onClick={applyFilters} style={{ padding: '0.5rem 3rem' }}>{t('reports.filters.search_btn')}</button>
        </div>
      </div>

      {/* Results Section */}
      <div className="card" id="report-print-area">
        <div style={{ marginBottom: '1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={{ margin: 0, color: 'var(--text-strong)' }}>{t('reports.results.title')}</h3>
          <span style={{ backgroundColor: 'var(--surface-highlight)', padding: '0.5rem 1rem', borderRadius: '50px', fontSize: '0.9rem', color: 'var(--accent-color)', fontWeight: 'bold' }}>
            {t('reports.results.matching_orders', { count: filteredOrders.length })}
          </span>
        </div>

        {isLoading ? (
          <div style={{ textAlign: 'center', padding: '4rem', color: 'var(--text-muted)' }}>{t('reports.results.loading')}</div>
        ) : !dataLoaded ? (
          <div style={{ textAlign: 'center', padding: '4rem', backgroundColor: 'var(--surface-highlight)', borderRadius: 'var(--radius-md)' }}>
            <p style={{ color: 'var(--text-muted)', fontSize: '1.1rem' }}>{t('reports.results.select_criteria')}</p>
          </div>
        ) : filteredOrders.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '4rem', backgroundColor: 'var(--surface-highlight)', borderRadius: 'var(--radius-md)' }}>
            <p style={{ color: 'var(--text-muted)', fontSize: '1.1rem' }}>{t('reports.results.no_results')}</p>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'right' }}>
              <thead>
                <tr style={{ backgroundColor: 'rgba(212, 175, 55, 0.1)', borderBottom: '2px solid var(--accent-color)' }}>
                  <th style={{ padding: '1rem', color: sortConfig.key === 'serial_number' ? 'var(--accent-color)' : 'inherit', cursor: 'pointer', userSelect: 'none' }} onClick={() => handleSort('serial_number')}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', justifyContent: 'flex-start' }}>{t('reports.table.cols.serial')} <ArrowUpDown size={14} opacity={sortConfig.key === 'serial_number' ? 1 : 0.3}/></div>
                  </th>
                  <th style={{ padding: '1rem', color: sortConfig.key === 'productName' ? 'var(--accent-color)' : 'inherit', cursor: 'pointer', userSelect: 'none' }} onClick={() => handleSort('productName')}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', justifyContent: 'flex-start' }}>{t('reports.table.cols.product')} <ArrowUpDown size={14} opacity={sortConfig.key === 'productName' ? 1 : 0.3}/></div>
                  </th>
                  <th style={{ padding: '1rem', color: sortConfig.key === 'buyerCompany' ? 'var(--accent-color)' : 'inherit', cursor: 'pointer', userSelect: 'none' }} onClick={() => handleSort('buyerCompany')}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', justifyContent: 'flex-start' }}>{t('reports.table.cols.buyer')} <ArrowUpDown size={14} opacity={sortConfig.key === 'buyerCompany' ? 1 : 0.3}/></div>
                  </th>
                  <th style={{ padding: '1rem', color: sortConfig.key === 'factoryId' ? 'var(--accent-color)' : 'inherit', cursor: 'pointer', userSelect: 'none' }} onClick={() => handleSort('factoryId')}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', justifyContent: 'flex-start' }}>{t('reports.table.cols.factory')} <ArrowUpDown size={14} opacity={sortConfig.key === 'factoryId' ? 1 : 0.3}/></div>
                  </th>
                  <th style={{ padding: '1rem', color: sortConfig.key === 'totalQuantity' ? 'var(--accent-color)' : 'inherit', cursor: 'pointer', userSelect: 'none' }} onClick={() => handleSort('totalQuantity')}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', justifyContent: 'center' }}>{t('reports.table.cols.total_qty')} <ArrowUpDown size={14} opacity={sortConfig.key === 'totalQuantity' ? 1 : 0.3}/></div>
                  </th>
                  <th style={{ padding: '1rem', color: sortConfig.key === 'requestDate' ? 'var(--accent-color)' : 'inherit', cursor: 'pointer', userSelect: 'none' }} onClick={() => handleSort('requestDate')}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', justifyContent: 'center' }}>{t('reports.table.cols.order_date')} <ArrowUpDown size={14} opacity={sortConfig.key === 'requestDate' ? 1 : 0.3}/></div>
                  </th>
                  <th style={{ padding: '1rem', textAlign: 'center' }}>المرحلة</th>
                  <th style={{ padding: '1rem', textAlign: 'center' }}>الصحة</th>
                  <th style={{ padding: '1rem', textAlign: 'center' }}>آخر نشاط</th>
                  <th style={{ padding: '1rem', textAlign: 'center' }}>{t('reports.table.cols.details')}</th>
                </tr>
              </thead>
              <tbody>
                {filteredOrders.map((order, idx) => {
                  const d = order.order_data || {};
                  const isExpanded = expandedRows.includes(order.serial_number);
                  const computedTotal = calculateTotalPiecesCount(d);
                  const insight = analyzeOrder(order, receivingMap.get(order.serial_number), lookups);
                  const activities = d.activityLog || [];
                  const actSummary = activitySummary(activities);

                  return (
                    <React.Fragment key={idx}>
                      <tr style={{ borderBottom: '1px solid var(--border-color)', backgroundColor: idx % 2 === 0 ? 'transparent' : 'var(--surface-highlight)', transition: 'background-color 0.2s' }}>
                        <td style={{ padding: '1rem', fontWeight: 'bold', color: 'var(--text-strong)', fontSize: '1.2rem' }}>{order.serial_number || '-'}</td>
                        <td style={{ padding: '1rem' }}>{englishOnly(d.productName) || '-'}</td>
                        <td style={{ padding: '1rem' }}>{d.buyerCompany || '-'}</td>
                        <td style={{ padding: '1rem' }}>
                           {d.factoryId || '-'}
                           {getFactoryCode(d.factoryId) && (
                              <span style={{ display: 'block', fontSize: '0.85rem', color: 'var(--accent-color)', fontWeight: 'bold' }}>
                                 {getFactoryCode(d.factoryId)}
                              </span>
                           )}
                        </td>
                        <td style={{ padding: '1rem', textAlign: 'center' }}>
                            <span style={{ backgroundColor: 'var(--accent-color)', color: '#fff', padding: '0.2rem 0.8rem', borderRadius: '50px', fontWeight: 'bold' }}>
                                {computedTotal > 0 ? computedTotal : (d.totalQuantity || '-')}
                            </span>
                        </td>
                        <td style={{ padding: '1rem', textAlign: 'center' }}>{d.requestDate || '-'}</td>
                        <td style={{ padding: '1rem', textAlign: 'center' }}>
                          <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', minWidth: 92, padding: '0.28rem 0.65rem', borderRadius: 999, color: insight.stageColor, background: `${insight.stageColor}18`, border: `1px solid ${insight.stageColor}33`, fontWeight: 800, fontSize: '0.78rem' }}>
                            {insight.stageLabel}
                          </span>
                        </td>
                        <td style={{ padding: '1rem', textAlign: 'center' }}>
                          <span title={insight.issues.map(i => i.label).join(' | ') || 'سليم'} style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 46, height: 46, borderRadius: '50%', color: insight.healthScore >= 80 ? '#34d399' : insight.healthScore >= 55 ? '#fbbf24' : '#fb7185', background: insight.healthScore >= 80 ? 'rgba(16,185,129,0.1)' : insight.healthScore >= 55 ? 'rgba(245,158,11,0.1)' : 'rgba(244,63,94,0.1)', border: '1px solid rgba(255,255,255,0.08)', fontWeight: 900 }}>
                            {insight.healthScore}
                          </span>
                        </td>
                        <td style={{ padding: '1rem', textAlign: 'center' }}>
                          {actSummary.last ? (
                            <div title={formatActivityTime(actSummary.last.at)} style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
                              <span style={{ color: actSummary.last.color || 'var(--accent-color)', fontWeight: 800, fontSize: '0.78rem' }}>{actSummary.last.actionLabel}</span>
                              <span style={{ color: 'var(--text-muted)', fontSize: '0.7rem' }}>{actSummary.last.actor}</span>
                            </div>
                          ) : (
                            <span style={{ color: 'var(--text-muted)', fontSize: '0.78rem' }}>لا يوجد</span>
                          )}
                        </td>
                        <td style={{ padding: '1rem', textAlign: 'center' }}>
                          <button 
                            className="btn btn-outline" 
                            style={{ padding: '0.4rem', border: 'none', background: isExpanded ? 'rgba(212, 175, 55, 0.2)' : 'rgba(255, 255, 255, 0.05)' }} 
                            onClick={() => toggleRow(order.serial_number)}
                          >
                            {isExpanded ? <ChevronUp size={20} color="var(--accent-color)" /> : <ChevronDown size={20} />}
                          </button>
                        </td>
                      </tr>
                      {/* Expanded Section for Details */}
                      <tr className="expandable-content" style={{ display: isExpanded ? 'table-row' : 'none', backgroundColor: 'rgba(0,0,0,0.2)' }}>
                          <td colSpan={10} style={{ padding: '1.5rem', borderBottom: '1px solid var(--border-color)' }}>
                             
                             <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.75rem', marginBottom: '1rem' }}>
                               <div style={{ padding: '0.9rem', borderRadius: 12, background: `${insight.stageColor}12`, border: `1px solid ${insight.stageColor}33` }}>
                                 <span style={{ color: 'var(--text-muted)', fontSize: '0.78rem' }}>مرحلة الطلب</span>
                                 <div style={{ color: insight.stageColor, fontWeight: 900, marginTop: 4 }}>{insight.stageLabel}</div>
                               </div>
                               <div style={{ padding: '0.9rem', borderRadius: 12, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
                                 <span style={{ color: 'var(--text-muted)', fontSize: '0.78rem' }}>درجة الصحة</span>
                                 <div style={{ color: insight.healthScore >= 80 ? '#34d399' : insight.healthScore >= 55 ? '#fbbf24' : '#fb7185', fontWeight: 900, marginTop: 4 }}>{insight.healthScore}/100</div>
                               </div>
                               <div style={{ padding: '0.9rem', borderRadius: 12, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
                                 <span style={{ color: 'var(--text-muted)', fontSize: '0.78rem' }}>مشاكل حرجة / تنبيهات</span>
                                 <div style={{ color: 'var(--text-strong)', fontWeight: 900, marginTop: 4 }}>{insight.criticalCount} / {insight.warningCount}</div>
                               </div>
                             </div>

                             {insight.issues.length > 0 && (
                               <div style={{ marginBottom: '1rem', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: '0.6rem' }}>
                                 {insight.issues.map((issue, issueIdx) => (
                                   <div key={issueIdx} style={{ padding: '0.75rem', borderRadius: 12, background: issue.severity === 'critical' ? 'rgba(244,63,94,0.08)' : issue.severity === 'warning' ? 'rgba(245,158,11,0.08)' : 'rgba(56,189,248,0.08)', border: '1px solid rgba(255,255,255,0.06)' }}>
                                     <div style={{ color: issue.severity === 'critical' ? '#fb7185' : issue.severity === 'warning' ? '#fbbf24' : '#38bdf8', fontWeight: 800, fontSize: '0.85rem' }}>{issue.label}</div>
                                     <div style={{ color: 'var(--text-muted)', fontSize: '0.78rem', marginTop: 3 }}>{issue.fix}</div>
                                   </div>
                                 ))}
                               </div>
                             )}

                             <div style={{ marginBottom: '1rem', padding: '1rem', borderRadius: 14, background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.06)' }}>
                               <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem', marginBottom: '0.85rem' }}>
                                 <h4 style={{ margin: 0, color: 'var(--text-strong)', display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                                   <Activity size={18} color="var(--accent-color)" /> سجل النشاط الذكي
                                 </h4>
                                 <div style={{ display: 'flex', gap: '0.45rem', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                                   {[
                                     ['الأحداث', actSummary.total],
                                     ['الطباعة', actSummary.prints],
                                     ['التحديثات', actSummary.updates],
                                     ['الاستلام', actSummary.receives],
                                   ].map(([label, value]) => (
                                     <span key={label} style={{ padding: '0.25rem 0.55rem', borderRadius: 999, background: 'rgba(212,175,55,0.08)', color: 'var(--accent-color)', border: '1px solid rgba(212,175,55,0.12)', fontSize: '0.75rem', fontWeight: 800 }}>
                                       {label}: {value}
                                     </span>
                                   ))}
                                 </div>
                               </div>
                               {activities.length === 0 ? (
                                 <div style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                                   لا يوجد سجل نشاط قديم لهذا الطلب. سيتم تسجيل الأحداث الجديدة تلقائيًا من الآن.
                                 </div>
                               ) : (
                                 <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem', maxHeight: 340, overflow: 'auto', paddingLeft: 4 }}>
                                   {activities.slice(0, 12).map(item => (
                                     <div key={item.id || `${item.action}-${item.at}`} style={{ display: 'grid', gridTemplateColumns: '14px 1fr', gap: '0.7rem' }}>
                                       <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                                         <span style={{ width: 12, height: 12, borderRadius: '50%', background: item.color || '#94a3b8', boxShadow: `0 0 0 4px ${(item.color || '#94a3b8')}22`, marginTop: 7 }} />
                                         <span style={{ width: 1, flex: 1, background: 'rgba(255,255,255,0.08)', marginTop: 6 }} />
                                       </div>
                                       <div style={{ padding: '0.75rem 0.85rem', borderRadius: 12, background: 'rgba(255,255,255,0.035)', border: '1px solid rgba(255,255,255,0.06)' }}>
                                         <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.7rem', marginBottom: 4 }}>
                                           <strong style={{ color: item.color || 'var(--text-strong)' }}>{item.actionLabel || item.action}</strong>
                                           <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>{formatActivityTime(item.at)}</span>
                                         </div>
                                         <div style={{ color: 'var(--text-strong)', fontSize: '0.86rem' }}>{item.note}</div>
                                         <div style={{ color: 'var(--text-muted)', fontSize: '0.76rem', marginTop: 4 }}>بواسطة: {item.actor || 'system'}</div>
                                         {item.changes?.length > 0 && (
                                           <div style={{ marginTop: '0.6rem', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.35rem' }}>
                                             {item.changes.map(change => (
                                               <div key={`${item.id}-${change.field}`} style={{ padding: '0.45rem', borderRadius: 8, background: 'rgba(0,0,0,0.14)', fontSize: '0.75rem' }}>
                                                 <strong style={{ color: 'var(--accent-color)' }}>{change.label}</strong>
                                                 <div style={{ color: 'var(--text-muted)', direction: 'ltr', textAlign: 'left' }}>{change.from} → {change.to}</div>
                                               </div>
                                             ))}
                                           </div>
                                         )}
                                       </div>
                                     </div>
                                   ))}
                                 </div>
                               )}
                             </div>

                             <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', marginBottom: '1.5rem', padding: '1.5rem', background: 'rgba(255,255,255,0.03)', borderRadius: 'var(--radius-md)', border: '1px solid rgba(255,255,255,0.05)' }}>
                                <div>
                                   <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem', display: 'block', marginBottom: '0.4rem' }}>{t('reports.details.sizes')}</span>
                                   <div style={{ fontWeight: 'bold', color: '#fff', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                      <span>{d.sizeFrom || '-'}</span>
                                      <span style={{ color: 'var(--accent-color)' }}>⟵</span>
                                      <span>{d.sizeTo || '-'}</span>
                                   </div>
                                </div>
                                <div>
                                   <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem', display: 'block', marginBottom: '0.2rem' }}>{t('reports.details.delivery_date')}</span>
                                   <div style={{ fontWeight: 'bold', color: '#fff' }}>{d.deliveryDate || '-'}</div>
                                </div>
                                <div>
                                   <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem', display: 'block', marginBottom: '0.2rem' }}>{t('reports.details.unit_price')}</span>
                                   <div style={{ fontWeight: 'bold', color: '#fff' }}>{d.productPrice || '0'} {d.currency || ''}</div>
                                </div>
                                <div>
                                   <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem', display: 'block', marginBottom: '0.2rem' }}>{t('reports.details.total_price')}</span>
                                   <div style={{ fontWeight: '900', color: 'var(--accent-color)', fontSize: '1.1rem' }}>
                                     {(parseFloat(d.productPrice || 0) * (computedTotal > 0 ? computedTotal : parseInt(d.totalQuantity || 0))).toLocaleString()} {d.currency || ''}
                                   </div>
                                </div>
                             </div>

                             {d.colorDistribution && Object.keys(d.colorDistribution).length > 0 && (
                               <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
                                 {Object.keys(d.colorDistribution).map((color, cIdx) => {
                                   if (!d.colorDistribution[color] || typeof d.colorDistribution[color] !== 'object') return null;
                                   return (
                                     <div key={cIdx} style={{ backgroundColor: 'var(--surface-color)', padding: '1rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)', minWidth: '150px' }}>
                                        <h4 style={{ margin: '0 0 0.8rem 0', color: 'var(--accent-color)', borderBottom: '1px dashed var(--border-color)', paddingBottom: '0.5rem' }}>{color}</h4>
                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', fontSize: '0.9rem' }}>
                                          {Object.entries(d.colorDistribution[color]).map(([size, qty]) => {
                                          if(!qty || parseInt(qty) <= 0) return null;
                                          return (
                                            <div key={size} style={{ display: 'flex', justifyContent: 'space-between' }}>
                                              <span style={{ color: 'var(--text-muted)' }}>{size}:</span>
                                              <span style={{ fontWeight: 'bold' }}>{qty}</span>
                                            </div>
                                          );
                                        })}
                                      </div>
                                   </div>
                                   );
                                 })}
                               </div>
                             )}

                             {d.remarks && (
                               <div style={{ marginTop: '1rem', padding: '1.2rem', backgroundColor: 'var(--surface-highlight)', borderRadius: 'var(--radius-md)', borderRight: '4px solid var(--accent-color)' }}>
                                 <strong style={{ color: 'var(--accent-color)', display: 'block', marginBottom: '0.5rem' }}>{t('reports.details.remarks')} </strong> 
                                 <span style={{ lineHeight: '1.6' }}>{d.remarks}</span>
                               </div>
                             )}

                             {/* Product Images Details */}
                             {d.productImages && d.productImages.length > 0 && (
                               <div style={{ marginTop: '2rem' }}>
                                 <h4 style={{ color: 'var(--text-strong)', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem' }}>
                                   <Camera size={18} color="var(--accent-color)" /> {t('reports.details.images')}
                                 </h4>
                                 <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: '1rem' }}>
                                   {d.productImages.map((img, idx) => (
                                     <div key={idx} style={{ borderRadius: '8px', overflow: 'hidden', border: '1px solid var(--border-color)', backgroundColor: 'var(--surface-color)', transition: 'transform 0.2s', cursor: 'pointer' }} onMouseEnter={e => e.currentTarget.style.transform = 'scale(1.02)'} onMouseLeave={e => e.currentTarget.style.transform = 'scale(1)'}>
                                       <img src={img.url} alt={img.name} style={{ width: '100%', height: '150px', objectFit: 'cover', display: 'block' }} crossOrigin="anonymous"/>
                                       <div style={{ padding: '0.4rem', fontSize: '0.75rem', textAlign: 'center', color: 'var(--text-muted)' }}>{img.name}</div>
                                     </div>
                                   ))}
                                 </div>
                               </div>
                             )}
                          </td>
                        </tr>
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default ReportsPortal;
