import React, { useState, useMemo, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { normalizeImageUrl } from '../utils/imageUtils';
import { supabase } from '../supabaseClient';
import { useAppData } from '../context/AppDataContext';
import { useAuth } from '../context/AuthContext';
import { useFilteredLookups } from '../hooks/useFilteredLookups';
import { Filter, Download, FileText, ChevronDown, ChevronUp, Printer, Calendar, Factory, ArrowUpDown, Camera, X, Brain, ShieldCheck, AlertTriangle, Clock, Activity, CheckCircle2, Trophy, Coins, TrendingUp, Search, ListChecks, Eye, Pin, BookmarkCheck, Sparkles, Edit3, Plus, Trash2, Layers } from 'lucide-react';
import toast from 'react-hot-toast';
import { useTranslation } from 'react-i18next';
import { CustomDateInput } from '../components/CustomDateInput';
import * as XLSX from 'xlsx';
import { englishOnly, chineseOnly } from '../utils/textUtils';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { analyzeOrder } from '../utils/orderIntelligence';
import { activitySummary, formatActivityTime, getActivityActionLabel, getActivityNote } from '../utils/activityLog';

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

const getSizeRange = (orderData) => {
  if (!orderData) return '-';
  if (orderData.manualSizes && Array.isArray(orderData.manualSizes) && orderData.manualSizes.length > 0) {
    const validSizes = orderData.manualSizes
      .map(s => s !== null && s !== undefined ? String(s).trim() : '')
      .filter(s => s !== '');
    if (validSizes.length > 0) {
      const sizeOrderArr = ['XXS', 'XS', 'S', 'M', 'L', 'XL', 'XXL', 'XXXL', '2XL', '3XL', '4XL', '5XL', 'F', 'FREE'];
      const sortedSizes = [...validSizes].sort((a, b) => {
        const ai = sizeOrderArr.indexOf(a.toUpperCase());
        const bi = sizeOrderArr.indexOf(b.toUpperCase());
        if (ai !== -1 && bi !== -1) return ai - bi;
        if (ai !== -1) return -1;
        if (bi !== -1) return 1;
        const numA = parseFloat(a);
        const numB = parseFloat(b);
        if (!isNaN(numA) && !isNaN(numB)) return numA - numB;
        return a.localeCompare(b);
      });
      const minSize = sortedSizes[0];
      const maxSize = sortedSizes[sortedSizes.length - 1];
      return minSize === maxSize ? minSize : `${minSize} - ${maxSize}`;
    }
  }
  if (orderData.sizeFrom && orderData.sizeTo) {
    return `${orderData.sizeFrom} - ${orderData.sizeTo}`;
  }
  if (orderData.sizeFrom) return orderData.sizeFrom;
  if (orderData.sizeTo) return orderData.sizeTo;
  return '-';
};

const compareSerialNumbers = (a, b) => {
  if (a === undefined || a === null || b === undefined || b === null) return 0;
  const strA = String(a).trim();
  const strB = String(b).trim();
  const isPureNumA = /^\d+$/.test(strA);
  const isPureNumB = /^\d+$/.test(strB);
  if (isPureNumA && isPureNumB) {
    return parseInt(strA, 10) - parseInt(strB, 10);
  }
  return strA.localeCompare(strB, undefined, { numeric: true, sensitivity: 'base' });
};

const OrderReports = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { lookups, updateLookup } = useAppData();
  const { user, hasPermission } = useAuth();
  const filteredLookups = useFilteredLookups();
  const [orders, setOrders] = useState([]);
  const [receivings, setReceivings] = useState([]);
  const [filteredOrders, setFilteredOrders] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [dataLoaded, setDataLoaded] = useState(false);
  const [showConditionsEditor, setShowConditionsEditor] = useState(false);
  const [sortConfig, setSortConfig] = useState({ key: 'serial_number', direction: 'desc' });
  const receivingMap = useMemo(
    () => new Map(receivings.map(item => [item.serial_number, item])),
    [receivings]
  );

  const [fixedTerms, setFixedTerms] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem('gh_fixed_order_terms') || '[]');
      return Array.isArray(saved) ? saved : [];
    } catch {
      return [];
    }
  });
  const [selectedTerms, setSelectedTerms] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem('gh_fixed_order_terms') || '[]');
      return Array.isArray(saved) ? saved : [];
    } catch {
      return [];
    }
  });
  const [showTermsDropdown, setShowTermsDropdown] = useState(false);
  const [tempSelectedTerms, setTempSelectedTerms] = useState([]);
  const termsDropdownRef = useRef(null);
  const [termsSearchQuery, setTermsSearchQuery] = useState('');

  const toggleFixedTerm = (termName) => {
    setFixedTerms(prev => {
      const isAlreadyFixed = prev.includes(termName);
      const next = isAlreadyFixed ? prev.filter(t => t !== termName) : [...prev, termName];
      localStorage.setItem('gh_fixed_order_terms', JSON.stringify(next));
      if (!isAlreadyFixed) {
        setSelectedTerms(curr => curr.includes(termName) ? curr : [...curr, termName]);
        setTempSelectedTerms(curr => curr.includes(termName) ? curr : [...curr, termName]);
        toast.success(t('reports.messages.term_pinned', { name: termName, defaultValue: `📌 تم تعيين "${termName}" كشرط ثابت تلقائياً!` }), { id: 'term-pin-toast' });
      } else {
        toast.success(t('reports.messages.term_unpinned', { name: termName, defaultValue: `تم إلغاء تثبيت "${termName}" من الشروط الثابتة` }), { id: 'term-pin-toast' });
      }
      return next;
    });
  };

  const handleSaveCurrentAsFixed = () => {
    const toSave = [...tempSelectedTerms];
    setFixedTerms(toSave);
    localStorage.setItem('gh_fixed_order_terms', JSON.stringify(toSave));
    setSelectedTerms(toSave);
    setShowTermsDropdown(false);
    toast.success(t('reports.messages.terms_saved_fixed', { count: toSave.length, defaultValue: `📌 تم حفظ (${toSave.length}) شروط ثابتة افتراضياً لكل الفواتير القادمة!` }), { id: 'fixed-terms-toast' });
  };

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (termsDropdownRef.current && !termsDropdownRef.current.contains(e.target)) {
        setShowTermsDropdown(false);
      }
    };
    if (showTermsDropdown) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showTermsDropdown]);

  
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
      
      let validData = data || [];
      if (user && user.role !== 'admin') {
        const allowedFactories = user.permissions?.allowed_factories || [];
        const allowedCompanies = user.permissions?.allowed_companies || [];
        
        if (allowedFactories.length > 0) {
          validData = validData.filter(o => allowedFactories.includes(o.order_data?.factoryId));
        }
        if (allowedCompanies.length > 0) {
          validData = validData.filter(o => allowedCompanies.includes(o.order_data?.buyerCompany));
        }
      }

      sortedData = validData.sort((a, b) => {
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

  const applyFilters = async (customFilters = null) => {
    // Prevent standard event arguments from being treated as filter values
    const activeFilters = (customFilters && typeof customFilters === 'object' && !customFilters.nativeEvent) ? customFilters : filters;
    let currentData = orders;
    if (!dataLoaded) {
      currentData = await fetchOrders();
    }
    
    let result = [...currentData];

    if (activeFilters.fromSerial) {
      const fromVal = String(activeFilters.fromSerial).trim();
      result = result.filter(o => o.serial_number && compareSerialNumbers(o.serial_number, fromVal) >= 0);
    }
    if (activeFilters.toSerial) {
      const toVal = String(activeFilters.toSerial).trim();
      result = result.filter(o => o.serial_number && compareSerialNumbers(o.serial_number, toVal) <= 0);
    }
    if (activeFilters.fromDate) {
      result = result.filter(o => {
        const orderDateStr = o.order_data?.requestDate || o.created_at?.split('T')[0];
        return orderDateStr ? orderDateStr >= activeFilters.fromDate : false;
      });
    }
    if (activeFilters.toDate) {
      result = result.filter(o => {
        const orderDateStr = o.order_data?.requestDate || o.created_at?.split('T')[0];
        return orderDateStr ? orderDateStr <= activeFilters.toDate : false;
      });
    }
    if (activeFilters.factory) {
      result = result.filter(o => o.order_data?.factoryId === activeFilters.factory);
    }
    if (activeFilters.productName) {
      const query = activeFilters.productName.toLowerCase().trim();
      result = result.filter(o => {
        const prodName = (o.order_data?.productName || '').toLowerCase();
        return prodName.includes(query);
      });
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

  const removeFilter = (key) => {
    const newFilters = { ...filters, [key]: '' };
    setFilters(newFilters);
    applyFilters(newFilters);
  };

  const clearFilters = () => {
    const cleared = {
      fromSerial: '',
      toSerial: '',
      fromDate: '',
      toDate: '',
      factory: '',
    };
    setFilters(cleared);
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
        [t('reports.excel_headers.product')]: englishOnly(d.productName) || '-',
        [t('reports.excel_headers.buyer')]: d.buyerCompany || '-',
        
        [t('reports.excel_headers.factory')]: d.factoryId || '-',
        [t('reports.excel_headers.factory_code')]: getFactoryCode(d.factoryId) || '-',
        [t('reports.excel_headers.brand')]: d.tradeMark || '-',
        [t('reports.excel_headers.sizes')]: getSizeRange(d).replace(' - ', ' ⟵ '),
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

  const getFactoryDetails = (factoryId) => {
    const factory = Array.isArray(lookups.factories) ? lookups.factories.find(f => (f.name === factoryId || f === factoryId)) : null;
    if (factory && typeof factory === 'object') {
      return { name: factory.name || '', mobile: factory.mobile || '', address: factory.address || '', code: factory.code || '' };
    }
    return { name: factoryId || '', mobile: '', address: '', code: '' };
  };

  const exportToPDF = async () => {
    if (filteredOrders.length === 0) return toast.error(t('reports.messages.no_data_export'));
    const toastId = toast.loading(t('reports.messages.preparing_pdf'));
    try {
       const firstData = filteredOrders[0]?.order_data || {};
       const fDet = getFactoryDetails(firstData.factoryId);
       const custCode = firstData.buyerMobile || firstData.buyerId || '-';
       const custMobile = firstData.buyerNumber || firstData.buyerMobile || '-';
       const reqDate = firstData.requestDate || new Date().toISOString().split('T')[0];
       const delDate = firstData.deliveryDate || '-';
       let contNo = '00001';
       try {
         const { data: counterVal, error: rpcError } = await supabase.rpc('increment_contract_counter');
         if (rpcError) {
           console.error("RPC error incrementing contract counter, falling back to local storage:", rpcError);
           let lastCN = parseInt(localStorage.getItem('gh_pdf_contract_counter') || '0', 10);
           lastCN += 1;
           localStorage.setItem('gh_pdf_contract_counter', String(lastCN));
           contNo = String(lastCN).padStart(5, '0');
         } else {
           contNo = String(counterVal).padStart(5, '0');
         }
       } catch (err) {
         console.error("Exception calling increment_contract_counter RPC, falling back to local storage:", err);
         let lastCN = parseInt(localStorage.getItem('gh_pdf_contract_counter') || '0', 10);
         lastCN += 1;
         localStorage.setItem('gh_pdf_contract_counter', String(lastCN));
         contNo = String(lastCN).padStart(5, '0');
       }
       const fD = (d) => { if (!d || d === '-') return '-'; const p = d.split('-'); return p.length === 3 ? p[2]+'/'+p[1]+'/'+p[0] : d; };
       let gQty = 0, gAmt = 0;
       const cur = firstData.currency || 'RMB';
       const rows = filteredOrders.map((order, idx) => {
         const d = order.order_data || {};
         const ct = calculateTotalPiecesCount(d);
         const qty = ct > 0 ? ct : (parseInt(d.totalQuantity) || 0);
         const pr = parseFloat(d.productPrice || 0);
         const tp = pr * qty;
         const clrs = d.colorDistribution ? Object.keys(d.colorDistribution).length : 0;
         const sr = getSizeRange(d);
         const bc = d.barcode || '';
         let sc = 0;
         if (d.colorDistribution) { const ss = new Set(); Object.values(d.colorDistribution).forEach(c => { if (c && typeof c === 'object') Object.keys(c).forEach(s => ss.add(s)); }); sc = ss.size; }
         gQty += qty; gAmt += tp;
          let pnDisplay = '-';
          if (d.productName) {
            const engFull = englishOnly(d.productName) || '';
            const eng3 = engFull.split(/\s+/).slice(0, 3).join(' ');
            const chi = chineseOnly(d.productName) || '';
            pnDisplay = (eng3 + (chi ? ' <span style="font-weight:bold;">' + chi + '</span>' : '')).trim() || '-';
          }
          return { n: idx+1, sn: order.serial_number||'-', bc: bc||'-', pn: pnDisplay, clrs, sc, sr, qty, cur: d.currency||'RMB', pr, tp, cn: d.contractNotes||'' };
       });
       const b = 'border:1px solid #000;padding:7px 6px;font-weight:600;';
       const tc = b+'text-align:center;font-size:14px;';
       const bl = b+'text-align:left;font-size:14px;';
       const hr = b+'font-weight:900;text-align:center;font-size:13px;background:#b41e1e;color:#fff;';
       const hg = b+'font-weight:800;text-align:center;font-size:14px;background:#e6e6e6;color:#000;';

       // Determine dynamic columns based on active data
       const columns = [
         { id: 'n', labelZh: '数字', labelEn: 'No', style: tc, width: '4%' },
         { id: 'sn', labelZh: '款号', labelEn: 'Model No.', style: tc, width: '7%' },
         { id: 'bc', labelZh: '条形码', labelEn: 'Barcode No.', style: tc, width: '10%' },
         { id: 'pn', labelZh: '产品名称', labelEn: 'Product Name', style: bl, width: '' },
         { id: 'clrs', labelZh: '颜色', labelEn: 'Colors', style: tc, width: '5%' },
         { id: 'sc', labelZh: '尺寸', labelEn: 'Size', style: tc, width: '4%' },
         { id: 'sr', labelZh: '码段', labelEn: 'Prod Sizes', style: tc, width: '8%' },
         { id: 'qty', labelZh: '数量', labelEn: 'Prod Qty', style: tc, width: '6%' },
         { id: 'cur', labelZh: '货币', labelEn: 'Currency', style: tc, width: '5%' },
         { id: 'pr', labelZh: '产品价格', labelEn: 'Prod Price', style: tc, width: '7%' },
         { id: 'tp', labelZh: '总金额', labelEn: 'Tot. Amount', style: tc, width: '10%' },
         { id: 'cn', labelZh: '订单备注', labelEn: 'Contract Notes', style: tc, width: '9%' },
       ];

       const activeCols = columns.filter(col => {
         if (['n', 'sn', 'pn', 'qty', 'cur', 'pr', 'tp'].includes(col.id)) return true;
         return rows.some(r => {
           const val = r[col.id];
           if (col.id === 'clrs' || col.id === 'sc') {
             return val && val !== 0 && val !== '0';
           }
           if (col.id === 'sr') {
             return val && val !== '-' && val !== ' - ' && val !== '';
           }
           return val && val !== '-' && val !== '';
         });
       });

       // Generate Header HTML dynamically
       let headerHtml = '<tr>';
       activeCols.forEach(col => {
         headerHtml += `<td style="${hr}${col.width ? `width:${col.width};` : ''}">${col.labelZh}<br/>${col.labelEn}</td>`;
       });
       headerHtml += '</tr>';

       const tbs = 'border-collapse:collapse;width:100%;border:2px solid #000;';
        
       // Define metadata fields dynamically to hide empty ones
       const metaFields = [
         { label: 'Fact. Name 工厂名字', value: fDet.name },
         { label: 'Cont No.', value: contNo, isHeader: true },
         { label: 'Fact. Mobile 工厂电话', value: fDet.mobile },
         { label: 'Cust. Code 客户代码', value: custCode },
         { label: 'Fact. Address 工厂地址', value: fDet.address },
         { label: 'Cust. Mobile 客户手机', value: custMobile }
       ].filter(item => item.value && item.value !== '-' && item.value !== '');

       let metaHtml = '';
       if (metaFields.length > 0) {
         metaHtml += `<table style="${tbs}"><tbody>`;
         for (let i = 0; i < metaFields.length; i += 2) {
           const item1 = metaFields[i];
           const item2 = metaFields[i + 1];
           metaHtml += '<tr>';
           if (item1) {
             const bgStyle = item1.isHeader ? 'background:#b41e1e;color:#fff;font-weight:900;' : '';
             metaHtml += `<td style="${bl}white-space:nowrap;width:1%;${bgStyle}"><b>${item1.label}：</b></td>`;
             metaHtml += `<td style="${tc}font-weight:800;font-size:14px;${bgStyle}">${item1.value}</td>`;
           }
           if (item2) {
             const bgStyle = item2.isHeader ? 'background:#b41e1e;color:#fff;font-weight:900;' : '';
             metaHtml += `<td style="${bl}white-space:nowrap;width:1%;${bgStyle}"><b>${item2.label}：</b></td>`;
             metaHtml += `<td style="${tc}font-weight:800;font-size:14px;${bgStyle}">${item2.value}</td>`;
           } else if (metaFields.length > 1) {
             metaHtml += `<td style="${bl}width:1%;"></td><td style="${tc}"></td>`;
           }
           metaHtml += '</tr>';
         }
         metaHtml += '</tbody></table>';
       }

       // Define date fields dynamically to hide empty ones
       let dateHtml = '';
       const hasReqDate = reqDate && reqDate !== '-' && reqDate !== '';
       const hasDelDate = delDate && delDate !== '-' && delDate !== '';
       if (hasReqDate || hasDelDate) {
         dateHtml += `<table style="${tbs}border-top:none;"><tbody><tr>`;
         if (hasReqDate) {
           dateHtml += `<td style="${hg}width:25%;">Request Date 订单日期</td>`;
           dateHtml += `<td style="${tc}font-weight:800;font-size:14px;width:25%;">${fD(reqDate)}</td>`;
         }
         if (hasDelDate) {
           dateHtml += `<td style="${hg}width:25%;">Delivery Date 交货日期</td>`;
           dateHtml += `<td style="${tc}font-weight:800;font-size:14px;width:25%;">${fD(delDate)}</td>`;
         }
         if (hasReqDate !== hasDelDate) {
           dateHtml += `<td style="${hg}width:25%;"></td><td style="${tc}width:25%;"></td>`;
         }
         dateHtml += `</tr></tbody></table>`;
       }

        // Split conditions: Column 1 = Fixed Default Conditions, Column 2 = Additional Conditions (or handwriting space)
        const fixedSelected = fixedTerms.filter(t => selectedTerms.includes(t));
        const extraSelected = selectedTerms.filter(t => !fixedTerms.includes(t));

        // If user has not designated any fixed terms yet, but has selected terms, show them in Col 1
        const finalCol1 = fixedSelected.length > 0 ? fixedSelected : (selectedTerms.length > 0 && fixedTerms.length === 0 ? selectedTerms : []);
        const finalCol2 = fixedSelected.length > 0 ? extraSelected : [];

        const maxItemsCount = Math.max(finalCol1.length, finalCol2.length);
        const minCondHeight = Math.max(220, maxItemsCount * 28 + 30);

        let conditionsHtml = 
          `<table style="border-collapse:collapse;width:100%;border:2px solid #000;border-top:none;"><tbody>
            <tr>
              <td colspan="2" style="${bl}background:#e6e6e6;font-weight:800;font-size:14px;padding:6px 12px;">
                Conditions 状况：
              </td>
            </tr>
            <tr>
              <td style="${bl}width:50%;height:${minCondHeight}px;vertical-align:top;padding:12px 16px;border-right:1px solid #000;">
                ${finalCol1.length > 0 ? `
                  <ul style="margin:0;padding-left:18px;font-size:12px;font-weight:bold;line-height:1.6;">
                    ${finalCol1.map(t => `<li style="margin-bottom:8px;">${t}</li>`).join('')}
                  </ul>
                ` : '&nbsp;'}
              </td>
              <td style="${bl}width:50%;height:${minCondHeight}px;vertical-align:top;padding:12px 16px;">
                ${finalCol2.length > 0 ? `
                  <ul style="margin:0;padding-left:18px;font-size:12px;font-weight:bold;line-height:1.6;">
                    ${finalCol2.map(t => `<li style="margin-bottom:8px;">${t}</li>`).join('')}
                  </ul>
                ` : '&nbsp;'}
              </td>
            </tr>
          </tbody></table>`;

       // Signature block HTML
       const signatureHtml = 
         '<table style="border-collapse:collapse;width:100%;border:2px solid #000;border-top:none;"><tbody><tr>'+
           '<td style="'+bl+'width:25%;padding:14px 10px;">'+
             '<div style="font-weight:800;font-size:13px;margin-bottom:20px;">Name 名字</div>'+
             '<div style="font-weight:800;font-size:13px;">Signature 签名</div>'+
           '</td>'+
           '<td style="'+tc+'width:25%;padding:14px 10px;vertical-align:top;">'+
             '<div style="color:#b41e1e;font-weight:800;font-size:13px;margin-bottom:20px;">Buyer 买方</div>'+
             '<div style="border-bottom:2px solid #000;width:80%;margin:0 auto;height:22px;"></div>'+
           '</td>'+
           '<td style="'+tc+'width:25%;padding:14px 10px;vertical-align:top;">'+
             '<div style="color:#b41e1e;font-weight:800;font-size:13px;margin-bottom:20px;">Coordinator 协调员</div>'+
             '<div style="border-bottom:2px solid #000;width:80%;margin:0 auto;height:22px;"></div>'+
           '</td>'+
           '<td style="'+tc+'width:25%;padding:14px 10px;vertical-align:top;">'+
             '<div style="color:#b41e1e;font-weight:800;font-size:13px;margin-bottom:20px;">Factory 工厂</div>'+
             '<div style="border-bottom:2px solid #000;width:80%;margin:0 auto;height:22px;"></div>'+
           '</td>'+
         '</tr></tbody></table>';

       // Generate Total Row HTML dynamically
       let totalRowHtml = '<tr style="background:#e6e6e6;">';
       activeCols.forEach((col, idx) => {
         if (col.id === 'n') {
           totalRowHtml += `<td style="${tc}font-weight:900;">Total \u5408\u8BA1</td>`;
         } else if (col.id === 'sn') {
           totalRowHtml += `<td style="${tc}font-weight:900;">${rows.length} Items</td>`;
         } else if (col.id === 'qty') {
           totalRowHtml += `<td style="${tc}font-weight:900;font-size:15px;">${gQty.toLocaleString()} PCS</td>`;
         } else if (col.id === 'tp') {
           totalRowHtml += `<td style="${tc}font-weight:900;font-size:15px;">${gAmt.toLocaleString(undefined, { minimumFractionDigits: 2 })} ${cur}</td>`;
         } else {
           totalRowHtml += `<td style="${tc}"></td>`;
         }
       });
       totalRowHtml += '</tr>';

       // ─── PAGINATION: Split rows into pages ───
       const ROWS_PER_PAGE = 25;
       const totalPages = Math.max(1, Math.ceil(rows.length / ROWS_PER_PAGE));
       const { default: html2canvas } = await import('html2canvas');
       const pW = 210;
       const pM = 5;
       const cW = pW - pM * 2;
       let pdf = null;

       for (let pageIdx = 0; pageIdx < totalPages; pageIdx++) {
         const startRow = pageIdx * ROWS_PER_PAGE;
         const endRow = Math.min(startRow + ROWS_PER_PAGE, rows.length);
         const pageRows = rows.slice(startRow, endRow);
         const isLastPage = pageIdx === totalPages - 1;

         // Build row HTML for this page chunk
         let pageRowsHtml = '';
         pageRows.forEach(r => {
           pageRowsHtml += '<tr>';
           activeCols.forEach(col => {
             let val = '';
             if (col.id === 'pr') {
               val = r.pr ? r.pr.toFixed(2) : '0.00';
             } else if (col.id === 'tp') {
               val = r.tp > 0 ? r.tp.toLocaleString(undefined, { minimumFractionDigits: 2 }) : '0.00';
             } else if (col.id === 'sc') {
               val = r.sc > 0 ? r.sc : '-';
             } else {
               val = r[col.id] || '-';
             }
             pageRowsHtml += `<td style="${col.style}">${val}</td>`;
           });
           pageRowsHtml += '</tr>';
         });

         // Pad empty rows up to 25 rows per page
         const emptyRowsCount = ROWS_PER_PAGE - pageRows.length;
         for (let eIdx = 0; eIdx < emptyRowsCount; eIdx++) {
           pageRowsHtml += '<tr>';
           activeCols.forEach(col => {
             pageRowsHtml += `<td style="${col.style};height:28px;">&nbsp;</td>`;
           });
           pageRowsHtml += '</tr>';
         }

         // Build full page HTML with flex layout to keep signatures always at bottom
         const pageEl = document.createElement('div');
         pageEl.style.cssText = 'position:fixed;left:-9999px;top:0;width:1050px;min-height:1440px;box-sizing:border-box;display:flex;flex-direction:column;justify-content:space-between;background:#fff;padding:22px 26px;font-family:"Microsoft YaHei",SimHei,SimSun,Inter,sans-serif;color:#000;font-size:15px;line-height:1.4;direction:ltr;text-align:left;-webkit-font-smoothing:antialiased;';

         let pageHtml = '';
         // Top section
         pageHtml += '<div style="width:100%;flex:1;display:flex;flex-direction:column;">';
         
         // Title
         pageHtml += '<div style="text-align:center;margin-bottom:12px;">';
         pageHtml += '<span style="font-size:36px;font-weight:900;color:#b41e1e;letter-spacing:1px;">Order Contract 订单合同</span>';
         if (totalPages > 1) {
           pageHtml += `<span style="font-size:14px;color:#666;margin-right:10px;display:block;margin-top:4px;">Page ${pageIdx + 1} / ${totalPages}</span>`;
         }
         pageHtml += '</div>';
         
         // Meta + Date
         pageHtml += metaHtml;
         pageHtml += dateHtml;
         
         // Table with header + page rows
         pageHtml += `<table style="${tbs}border-top:none;"><tbody>`;
         pageHtml += headerHtml;
         pageHtml += pageRowsHtml;
         
         // Total row on last page only
         if (isLastPage) {
           pageHtml += totalRowHtml;
         }
         pageHtml += '</tbody></table>';
         
         // Conditions on last page only
         if (isLastPage && conditionsHtml) {
           pageHtml += conditionsHtml;
         }
         
         pageHtml += '</div>'; // End Top section

         // Signature always pinned to the bottom of the page
         pageHtml += '<div style="width:100%;margin-top:auto;">';
         pageHtml += signatureHtml;
         pageHtml += '</div>';

         pageEl.innerHTML = pageHtml;
         document.body.appendChild(pageEl);

         const canvas = await html2canvas(pageEl, { scale: 3, useCORS: true, logging: false, backgroundColor: '#ffffff' });
         document.body.removeChild(pageEl);

         const imgData = canvas.toDataURL('image/jpeg', 1.0);
         const cH = (canvas.height * cW) / canvas.width;

         if (pageIdx === 0) {
           pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: [pW, Math.max(cH + pM * 2, 297)] });
         } else {
           pdf.addPage([pW, Math.max(cH + pM * 2, 297)]);
         }
         pdf.addImage(imgData, 'JPEG', pM, pM, cW, cH);
       }

       pdf.save('Order_Contract_' + contNo + '_' + new Date().toISOString().split('T')[0] + '.pdf');
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
      
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h1 className="text-gradient" style={{ fontSize: '2.5rem', marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <FileText size={40} color="var(--accent-color)" /> {t('reports.title')}
          </h1>
          <p style={{ color: 'var(--text-muted)' }}>{t('reports.subtitle')}</p>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
          {hasPermission('order-reports', 'export') && (
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



      {/* Filter Card */}
      <div className="card glass-panel" style={{ marginBottom: '2rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1.5rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '1rem' }}>
          <Filter color="var(--accent-color)" />
          <h3 style={{ margin: 0 }}>{t('reports.filters.title')}</h3>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1.5rem' }}>
          <div className="form-group" style={{ position: 'relative' }}>
            <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}><FileText size={14}/> {t('reports.filters.from_serial')}</label>
            <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
              <input type="text" className="form-control" placeholder={t('print.search.placeholder')} value={filters.fromSerial} onChange={(e) => updateFilter('fromSerial', e.target.value)} onKeyDown={(e) => handleF9Press(e, 'fromSerial')} style={{ flex: 1 }} />
              <button
                className="inline-f9-btn"
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={(e) => {
                  const input = e.currentTarget.previousElementSibling;
                  if (input) {
                    input.focus();
                    handleF9Press({ key: 'F9', preventDefault: () => {} }, 'fromSerial');
                  }
                }}
              >
                <Search size={14} strokeWidth={2.5} />
                F9
              </button>
            </div>
            {showSerialsList && activeSerialField === 'fromSerial' && renderSerialsLookup()}
          </div>
          
          <div className="form-group" style={{ position: 'relative' }}>
            <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}><FileText size={14}/> {t('reports.filters.to_serial')}</label>
            <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
              <input type="text" className="form-control" placeholder={t('print.search.placeholder')} value={filters.toSerial} onChange={(e) => updateFilter('toSerial', e.target.value)} onKeyDown={(e) => handleF9Press(e, 'toSerial')} style={{ flex: 1 }} />
              <button
                className="inline-f9-btn"
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={(e) => {
                  const input = e.currentTarget.previousElementSibling;
                  if (input) {
                    input.focus();
                    handleF9Press({ key: 'F9', preventDefault: () => {} }, 'toSerial');
                  }
                }}
              >
                <Search size={14} strokeWidth={2.5} />
                F9
              </button>
            </div>
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

            <div className="form-group" style={{ marginBottom: '1rem' }}>
              <label className="form-label">{t('reports.filters.factory')}</label>
              <select className="form-control" value={filters.factory} onChange={(e) => updateFilter('factory', e.target.value)}>
                <option value="">{t('reports.filters.all_factories')}</option>
                {filteredLookups.factories?.map((f, idx) => (
                  <option key={idx} value={typeof f === 'object' ? f.name : f}>{typeof f === 'object' ? f.name : f}</option>
                ))}
              </select>
            </div>

          
          
        </div>
        
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '1rem', marginTop: '2rem' }}>
          <button className="btn btn-outline" onClick={clearFilters}>{t('reports.filters.clear_btn')}</button>
          <button className="btn btn-accent" onClick={async () => { await fetchOrders(); toast.success(t('reports.messages.all_shown'), { id: 'filter-toast' }); }} style={{ backgroundColor: 'var(--accent-color)', color: '#000', fontWeight: 'bold', padding: '0.5rem 1.5rem' }}>{t('reports.filters.show_all_btn')}</button>
          <button className="btn btn-primary" onClick={() => applyFilters()} style={{ padding: '0.5rem 3rem' }}>{t('reports.filters.search_btn')}</button>
        </div>
      </div>

      {/* Detailed Terms Selection */}
      <div className="card glass-panel" style={{ marginBottom: '2rem' }}>
        {/* Header Bar with Toggle */}
        <div 
          onClick={() => {
            if (!showTermsDropdown) {
              setTempSelectedTerms([...selectedTerms]);
              setTermsSearchQuery('');
            }
            setShowTermsDropdown(!showTermsDropdown);
          }}
          style={{ 
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'space-between',
            cursor: 'pointer',
            paddingBottom: showTermsDropdown ? '0.75rem' : '0',
            borderBottom: showTermsDropdown ? '1px solid var(--border-color)' : 'none',
            userSelect: 'none'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
            <ListChecks color="var(--accent-color)" size={20} />
            <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 'bold' }}>
              {t('reports.detailed_terms', { defaultValue: 'الشروط المطلوبة للفاتورة' })}
            </h3>
            
            {/* Quick Status Count */}
            <span style={{ 
              fontSize: '0.8rem', 
              backgroundColor: 'rgba(212, 175, 55, 0.12)', 
              color: 'var(--accent-color)', 
              border: '1px solid rgba(212, 175, 55, 0.3)', 
              borderRadius: '20px', 
              padding: '2px 10px',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px'
            }}>
              <CheckCircle2 size={12} />
              {selectedTerms.length > 0 ? t('reports.selected_terms_count', { count: selectedTerms.length, defaultValue: `تم اختيار ${selectedTerms.length} شرط` }) : t('reports.no_conditions_selected', { defaultValue: 'لم يتم اختيار شروط' })}
              {fixedTerms.length > 0 && t('reports.fixed_status_count', { count: fixedTerms.length, defaultValue: ` (${fixedTerms.length} ثابتة تلقائياً)` })}
            </span>
          </div>

          <button 
            type="button"
            className="btn btn-outline"
            style={{ 
              padding: '0.35rem 0.85rem', 
              fontSize: '0.85rem', 
              display: 'flex', 
              alignItems: 'center', 
              gap: '0.4rem',
              borderColor: 'var(--border-color)'
            }}
          >
            <span>{showTermsDropdown ? t('reports.toggle_terms_hide', { defaultValue: 'إخفاء القائمة' }) : t('reports.toggle_terms_show', { defaultValue: 'تحديد / تعديل الشروط' })}</span>
            <ChevronDown size={16} style={{ 
              transform: showTermsDropdown ? 'rotate(180deg)' : 'rotate(0deg)',
              transition: 'transform 0.2s'
            }} />
          </button>
        </div>

        {/* Collapsible Selection Body (Rendered Inline - No Overlaps!) */}
        {showTermsDropdown && (
          <div style={{ marginTop: '1rem', animation: 'fadeIn 0.2s ease' }}>
            {/* Top Toolbar: Search + Quick Actions */}
            <div style={{ 
              display: 'flex', 
              alignItems: 'center', 
              justifyContent: 'space-between', 
              gap: '1rem', 
              marginBottom: '1rem',
              flexWrap: 'wrap'
            }}>
              {/* Search Box */}
              <div style={{ position: 'relative', flex: 1, minWidth: '240px' }}>
                <input
                  type="text"
                  placeholder={t('reports.search_terms_placeholder', { defaultValue: 'البحث في الشروط المطلوبة...' })}
                  value={termsSearchQuery}
                  onChange={(e) => setTermsSearchQuery(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '0.55rem 2.2rem 0.55rem 0.75rem',
                    fontSize: '0.9rem',
                    border: '1px solid var(--border-color)',
                    borderRadius: '8px',
                    backgroundColor: 'var(--surface-color)',
                    color: 'var(--text-main)',
                    outline: 'none',
                    textAlign: 'right',
                    direction: 'rtl'
                  }}
                />
                <Search size={15} style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', opacity: 0.5 }} />
              </div>

              {/* Action Buttons */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                <button 
                  type="button"
                  onClick={() => setShowConditionsEditor(true)}
                  title={t('reports.edit_master_list', { defaultValue: 'تعديل قائمة الشروط الأساسية في النظام' })}
                  className="btn btn-outline"
                  style={{ 
                    padding: '0.45rem 0.9rem', 
                    fontSize: '0.82rem',
                    borderColor: 'var(--border-color)',
                    color: 'var(--text-main)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px'
                  }}
                >
                  <Edit3 size={13} style={{ fill: 'none' }} />
                  <span>{t('reports.edit_list_btn', { defaultValue: 'إدارة الشروط الأساسية' })}</span>
                </button>
                <button 
                  type="button"
                  onClick={handleSaveCurrentAsFixed}
                  title={t('reports.save_as_fixed_title', { defaultValue: 'حفظ الشروط المحددة لتظهر تلقائياً كشروط ثابتة في كل الفواتير القادمة' })}
                  className="btn btn-outline"
                  style={{ 
                    padding: '0.45rem 0.9rem', 
                    fontSize: '0.82rem',
                    borderColor: 'var(--accent-color)',
                    color: 'var(--accent-color)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px'
                  }}
                >
                  <Pin size={13} style={{ fill: 'currentColor' }} />
                  <span>{t('reports.save_as_fixed_btn', { defaultValue: 'حفظ المحددة كشروط ثابتة دائماً' })}</span>
                </button>

                <button 
                  type="button"
                  onClick={() => setTempSelectedTerms([])}
                  className="btn btn-outline"
                  style={{ padding: '0.45rem 0.8rem', fontSize: '0.82rem' }}
                >
                  {t('reports.clear_all', { defaultValue: 'مسح التحديد' })}
                </button>

                <button 
                  type="button"
                  onClick={() => {
                    setSelectedTerms(tempSelectedTerms);
                    setShowTermsDropdown(false);
                    toast.success(t('reports.terms_updated', { defaultValue: 'تم تطبيق الشروط المختارة على الفاتورة' }));
                  }}
                  className="btn btn-accent"
                  style={{ 
                    padding: '0.45rem 1.4rem', 
                    fontSize: '0.85rem',
                    backgroundColor: 'var(--accent-color)',
                    color: '#000',
                    fontWeight: 'bold'
                  }}
                >
                  {t('reports.ok_btn', { defaultValue: 'موافق وتطبيق' })}
                </button>
              </div>
            </div>

            {/* Terms List Grid */}
            <div style={{ 
              maxHeight: '280px', 
              overflowY: 'auto', 
              padding: '0.5rem',
              backgroundColor: 'rgba(0, 0, 0, 0.2)',
              borderRadius: '8px',
              border: '1px solid var(--border-color)',
              display: 'flex',
              flexDirection: 'column',
              gap: '0.5rem'
            }}>
              {(() => {
                const filtered = (lookups.packagingConditionsList || []).filter(term => {
                  const termName = typeof term === 'object' ? term.name : term;
                  return termName.toLowerCase().includes(termsSearchQuery.toLowerCase());
                });
                if (filtered.length > 0) {
                  return filtered.map((term, idx) => {
                    const termName = typeof term === 'object' ? term.name : term;
                    const isSelected = tempSelectedTerms.includes(termName);
                    const isFixed = fixedTerms.includes(termName);
                    return (
                      <div 
                        key={idx}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          gap: '1rem',
                          padding: '0.65rem 0.9rem',
                          borderRadius: '6px',
                          backgroundColor: isSelected ? 'rgba(212, 175, 55, 0.09)' : 'var(--surface-color)',
                          border: isFixed ? '1px solid var(--accent-color)' : (isSelected ? '1px solid rgba(212, 175, 55, 0.3)' : '1px solid var(--border-color)'),
                          transition: 'all 0.2s',
                          userSelect: 'none'
                        }}
                      >
                        {/* Checkbox and Text */}
                        <label style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', cursor: 'pointer', flex: 1, margin: 0 }}>
                          <input 
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => {
                              setTempSelectedTerms(prev => 
                                isSelected ? prev.filter(t => t !== termName) : [...prev, termName]
                              );
                            }}
                            style={{
                              width: '18px',
                              height: '18px',
                              accentColor: 'var(--accent-color)',
                              cursor: 'pointer',
                              flexShrink: 0
                            }}
                          />
                          <span style={{ 
                            fontSize: '0.92rem',
                            color: isSelected ? 'var(--text-strong)' : 'var(--text-main)',
                            fontWeight: isSelected ? '600' : 'normal',
                            lineHeight: '1.4'
                          }}>{termName}</span>
                        </label>

                        {/* Pin / Permanent Status Toggle Button */}
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleFixedTerm(termName);
                          }}
                          title={isFixed ? t('reports.unpin_term_title', { defaultValue: 'شرط ثابت دائماً (انقر لإلغاء تثبيته)' }) : t('reports.pin_term_title', { defaultValue: 'تثبيت كشرط دائم افتراضي لكل الفواتير' })}
                          style={{
                            background: isFixed ? 'rgba(212, 175, 55, 0.2)' : 'transparent',
                            border: isFixed ? '1px solid var(--accent-color)' : '1px dashed var(--border-color)',
                            borderRadius: '6px',
                            padding: '4px 10px',
                            cursor: 'pointer',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '5px',
                            fontSize: '0.78rem',
                            color: isFixed ? 'var(--accent-color)' : 'var(--text-muted)',
                            flexShrink: 0,
                            fontWeight: isFixed ? 'bold' : 'normal',
                            transition: 'all 0.2s'
                          }}
                        >
                          <Pin size={12} style={{ fill: isFixed ? 'currentColor' : 'none' }} />
                          <span>{isFixed ? t('reports.pinned_term_status', { defaultValue: 'ثابت دائماً' }) : t('reports.pin_term_action', { defaultValue: 'تثبيت' })}</span>
                        </button>
                      </div>
                    );
                  });
                }
                return (
                  <div style={{ textAlign: 'center', padding: '1.5rem', color: 'var(--text-muted)' }}>
                    {t('reports.no_matching_terms', { defaultValue: 'لا توجد شروط مطابقة للبحث' })}
                  </div>
                );
              })()}
            </div>
          </div>
        )}

        {/* Selected Terms Badges Display (Always clean & clearly organized) */}
        {selectedTerms.length > 0 && (
          <div style={{ 
            marginTop: '1.25rem',
            paddingTop: '0.75rem',
            borderTop: '1px dashed var(--border-color)',
            display: 'flex',
            flexDirection: 'column',
            gap: '0.75rem'
          }}>
            {/* 1. Fixed Terms Section */}
            {selectedTerms.filter(t => fixedTerms.includes(t)).length > 0 && (
              <div>
                <div style={{ fontSize: '0.8rem', fontWeight: 'bold', color: 'var(--accent-color)', marginBottom: '0.4rem', display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <Pin size={13} style={{ fill: 'currentColor' }} />
                  <span>{t('reports.fixed_terms_section_title', { defaultValue: 'الشروط الثابتة الدائمة (ستظهر في النصف الأول من الفاتورة):' })}</span>
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                  {selectedTerms.filter(t => fixedTerms.includes(t)).map((term, i) => (
                    <div 
                      key={i}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '0.4rem',
                        backgroundColor: 'rgba(212, 175, 55, 0.15)',
                        border: '1px solid var(--accent-color)',
                        borderRadius: '6px',
                        padding: '0.3rem 0.7rem',
                        fontSize: '0.85rem',
                        color: 'var(--text-strong)',
                        fontWeight: '500'
                      }}
                    >
                      <Pin size={12} style={{ fill: 'currentColor', color: 'var(--accent-color)' }} />
                      <span>{term}</span>
                      <button 
                        type="button"
                        onClick={() => setSelectedTerms(prev => prev.filter(t => t !== term))}
                        title={t('reports.unpin_for_this_invoice', { defaultValue: 'إلغاء التحديد لهذه الفاتورة فقط' })}
                        style={{
                          background: 'none',
                          border: 'none',
                          padding: 0,
                          cursor: 'pointer',
                          color: '#ef4444',
                          display: 'inline-flex',
                          alignItems: 'center',
                          marginRight: '2px'
                        }}
                      >
                        <X size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 2. Additional Custom Terms Section */}
            {selectedTerms.filter(t => !fixedTerms.includes(t)).length > 0 && (
              <div>
                <div style={{ fontSize: '0.8rem', fontWeight: 'bold', color: 'var(--text-muted)', marginBottom: '0.4rem', display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <Sparkles size={13} />
                  <span>{t('reports.additional_terms_section_title', { defaultValue: 'الشروط الإضافية الخاصة (ستظهر في النصف الثاني من الفاتورة):' })}</span>
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                  {selectedTerms.filter(t => !fixedTerms.includes(t)).map((term, i) => (
                    <div 
                      key={i}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '0.4rem',
                        backgroundColor: 'var(--surface-color)',
                        border: '1px solid var(--border-color)',
                        borderRadius: '6px',
                        padding: '0.3rem 0.7rem',
                        fontSize: '0.85rem',
                        color: 'var(--text-main)'
                      }}
                    >
                      <span>{term}</span>
                      <button 
                        type="button"
                        onClick={() => setSelectedTerms(prev => prev.filter(t => t !== term))}
                        title={t('reports.remove_extra_term', { defaultValue: 'حذف الشرط الإضافي' })}
                        style={{
                          background: 'none',
                          border: 'none',
                          padding: 0,
                          cursor: 'pointer',
                          color: '#ef4444',
                          display: 'inline-flex',
                          alignItems: 'center',
                          marginRight: '2px'
                        }}
                      >
                        <X size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Active Filter Pills (Upgraded UX) */}
      {Object.values(filters).some(val => val !== '') && (
        <div style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: '0.75rem',
          alignItems: 'center',
          marginBottom: '2rem',
          padding: '1rem 1.5rem',
          background: 'var(--glass-bg)',
          border: '1px solid rgba(212, 175, 55, 0.15)',
          borderRadius: '16px',
          boxShadow: '0 8px 32px rgba(0, 0, 0, 0.2)',
          backdropFilter: 'blur(12px)',
          animation: 'fadeIn 0.3s ease'
        }}>
          <span style={{ fontSize: '0.9rem', color: 'var(--accent-color)', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
            <span>🔍</span> {t('reports.filters.active_filters')}
          </span>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.6rem' }}>
            {filters.fromSerial && (
              <div 
                className="filter-badge-premium"
                onClick={() => removeFilter('fromSerial')}
              >
                <span>{t('reports.filters.from_serial')}:</span>
                <strong style={{ color: 'var(--accent-color)' }}>{filters.fromSerial}</strong>
                <span style={{ marginInlineStart: '4px', opacity: 0.7 }}>✕</span>
              </div>
            )}
            {filters.toSerial && (
              <div 
                className="filter-badge-premium"
                onClick={() => removeFilter('toSerial')}
              >
                <span>{t('reports.filters.to_serial')}:</span>
                <strong style={{ color: 'var(--accent-color)' }}>{filters.toSerial}</strong>
                <span style={{ marginInlineStart: '4px', opacity: 0.7 }}>✕</span>
              </div>
            )}
            {filters.fromDate && (
              <div 
                className="filter-badge-premium"
                onClick={() => removeFilter('fromDate')}
              >
                <span>{t('reports.filters.from_date')}:</span>
                <strong style={{ color: 'var(--accent-color)' }}>{filters.fromDate}</strong>
                <span style={{ marginInlineStart: '4px', opacity: 0.7 }}>✕</span>
              </div>
            )}
            {filters.toDate && (
              <div 
                className="filter-badge-premium"
                onClick={() => removeFilter('toDate')}
              >
                <span>{t('reports.filters.to_date')}:</span>
                <strong style={{ color: 'var(--accent-color)' }}>{filters.toDate}</strong>
                <span style={{ marginInlineStart: '4px', opacity: 0.7 }}>✕</span>
              </div>
            )}
            {filters.factory && (
              <div 
                className="filter-badge-premium"
                onClick={() => removeFilter('factory')}
              >
                <span>{t('reports.filters.select_factory')}:</span>
                <strong style={{ color: 'var(--accent-color)' }}>{filters.factory}</strong>
                <span style={{ marginInlineStart: '4px', opacity: 0.7 }}>✕</span>
              </div>
            )}
            
          </div>
          <button 
            className="btn btn-outline" 
            onClick={clearFilters}
            style={{ 
              padding: '0.35rem 0.75rem', 
              fontSize: '0.8rem', 
              marginInlineStart: 'auto', 
              borderColor: 'rgba(239, 68, 68, 0.3)', 
              color: '#ef4444' 
            }}
          >
            {t('reports.filters.clear_btn')}
          </button>
        </div>
      )}

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
                  <th style={{ padding: '1rem', textAlign: 'center' }}>{t('reports.table.cols.stage')}</th>
                  <th style={{ padding: '1rem', textAlign: 'center' }}>{t('reports.table.cols.health')}</th>
                  <th style={{ padding: '1rem', textAlign: 'center' }}>{t('reports.table.cols.last_activity')}</th>
                  <th style={{ padding: '1rem', textAlign: 'center' }}>{t('reports.table.cols.details')}</th>
                  <th style={{ padding: '1rem', textAlign: 'center' }}>{t('reports.table.cols.review_order', 'استعراض')}</th>
                </tr>
              </thead>
              <tbody>
                {filteredOrders.map((order, idx) => {
                  const d = order.order_data || {};
                  const isExpanded = expandedRows.includes(order.serial_number);
                  const computedTotal = calculateTotalPiecesCount(d);
                  const insight = analyzeOrder(order, receivingMap ? receivingMap.get(order.serial_number) : null, lookups);
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
                          <span title={insight.issues.map(i => i.label).join(' | ') || t('reports.table.cols.healthy')} style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 46, height: 46, borderRadius: '50%', color: insight.healthScore >= 80 ? '#34d399' : insight.healthScore >= 55 ? '#fbbf24' : '#fb7185', background: insight.healthScore >= 80 ? 'rgba(16,185,129,0.1)' : insight.healthScore >= 55 ? 'rgba(245,158,11,0.1)' : 'rgba(244,63,94,0.1)', border: '1px solid rgba(255,255,255,0.08)', fontWeight: 900 }}>
                            {insight.healthScore}
                          </span>
                        </td>
                        <td style={{ padding: '1rem', textAlign: 'center' }}>
                          {actSummary.last ? (
                            <div title={formatActivityTime(actSummary.last.at)} style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
                              <span style={{ color: actSummary.last.color || 'var(--accent-color)', fontWeight: 800, fontSize: '0.78rem' }}>{getActivityActionLabel(actSummary.last, t)}</span>
                              <span style={{ color: 'var(--text-muted)', fontSize: '0.7rem' }}>{actSummary.last.actor}</span>
                            </div>
                          ) : (
                            <span style={{ color: 'var(--text-muted)', fontSize: '0.78rem' }}>{t('reports.table.cols.none')}</span>
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
                        <td style={{ padding: '1rem', textAlign: 'center' }}>
                          <button
                            type="button"
                            className="btn btn-primary"
                            onClick={() => navigate(`/entry?serial=${encodeURIComponent(order.serial_number)}`)}
                            style={{
                              padding: '0.4rem 0.85rem',
                              fontSize: '0.82rem',
                              display: 'inline-flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              gap: '0.4rem',
                              borderRadius: '8px',
                              fontWeight: 'bold',
                              boxShadow: '0 2px 8px rgba(0,0,0,0.18)',
                              cursor: 'pointer',
                              whiteSpace: 'nowrap'
                            }}
                            title={t('reports.table.cols.review_tooltip', 'استعراض وتوثيق الطلبية في شاشة الإدخال')}
                          >
                            <Eye size={15} />
                            <span>{t('reports.table.cols.review_order', 'استعراض')}</span>
                          </button>
                        </td>
                      </tr>
                      {/* Expanded Section for Details */}
                      <tr className="expandable-content" style={{ display: isExpanded ? 'table-row' : 'none', backgroundColor: 'rgba(0,0,0,0.2)' }}>
                          <td colSpan={11} style={{ padding: '1.5rem', borderBottom: '1px solid var(--border-color)' }}>
                             {isExpanded && (
                               <div className="expandable-content-wrapper">
                                 <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.75rem' }}>
                                   <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.75rem', flex: 1 }}>
                                     <div style={{ padding: '0.9rem', borderRadius: 12, background: `${insight.stageColor}12`, border: `1px solid ${insight.stageColor}33` }}>
                                       <span style={{ color: 'var(--text-muted)', fontSize: '0.78rem' }}>{t('reports.table.cols.order_stage')}</span>
                                       <div style={{ color: insight.stageColor, fontWeight: 900, marginTop: 4 }}>{insight.stageLabel}</div>
                                     </div>
                                     <div style={{ padding: '0.9rem', borderRadius: 12, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
                                       <span style={{ color: 'var(--text-muted)', fontSize: '0.78rem' }}>{t('reports.table.cols.health_score')}</span>
                                       <div style={{ color: insight.healthScore >= 80 ? '#34d399' : insight.healthScore >= 55 ? '#fbbf24' : '#fb7185', fontWeight: 900, marginTop: 4 }}>{insight.healthScore}/100</div>
                                     </div>
                                     <div style={{ padding: '0.9rem', borderRadius: 12, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
                                       <span style={{ color: 'var(--text-muted)', fontSize: '0.78rem' }}>{t('reports.table.cols.issues_alerts')}</span>
                                       <div style={{ color: 'var(--text-strong)', fontWeight: 900, marginTop: 4 }}>{insight.criticalCount} / {insight.warningCount}</div>
                                     </div>
                                   </div>
                                   <button
                                     type="button"
                                     className="btn btn-primary"
                                     onClick={() => navigate(`/entry?serial=${encodeURIComponent(order.serial_number)}`)}
                                     style={{
                                       padding: '0.6rem 1.2rem',
                                       fontSize: '0.88rem',
                                       display: 'inline-flex',
                                       alignItems: 'center',
                                       gap: '0.5rem',
                                       borderRadius: '10px',
                                       fontWeight: 'bold',
                                       whiteSpace: 'nowrap',
                                       cursor: 'pointer'
                                     }}
                                   >
                                     <Eye size={16} />
                                     <span>{t('reports.table.cols.review_order', 'استعراض في شاشة التوثيق')}</span>
                                    </button>
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
                                       <Activity size={18} color="var(--accent-color)" /> {t('reports.activity.smart_log')}
                                     </h4>
                                     <div style={{ display: 'flex', gap: '0.45rem', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                                       {[
                                         [t('reports.activity.events'), actSummary.total],
                                         [t('reports.activity.prints'), actSummary.prints],
                                         [t('reports.activity.updates'), actSummary.updates],
                                         [t('reports.activity.receives'), actSummary.receives],
                                       ].map(([label, value]) => (
                                         <span key={label} style={{ padding: '0.25rem 0.55rem', borderRadius: 999, background: 'rgba(212,175,55,0.08)', color: 'var(--accent-color)', border: '1px solid rgba(212,175,55,0.12)', fontSize: '0.75rem', fontWeight: 800 }}>
                                           {label}: {value}
                                         </span>
                                       ))}
                                     </div>
                                   </div>
                                   {activities.length === 0 ? (
                                     <div style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                                       {t('reports.activity.no_log')}
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
                                               <strong style={{ color: item.color || 'var(--text-strong)' }}>{getActivityActionLabel(item, t)}</strong>
                                               <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>{formatActivityTime(item.at)}</span>
                                             </div>
                                             <div style={{ color: 'var(--text-strong)', fontSize: '0.86rem' }}>{getActivityNote(item, t)}</div>
                                             <div style={{ color: 'var(--text-muted)', fontSize: '0.76rem', marginTop: 4 }}>{t('reports.activity.by', { actor: item.actor || 'system' })}</div>
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
                                       {(() => {
                                          const range = getSizeRange(d);
                                          if (range && range !== '-') {
                                            const parts = range.split(' - ');
                                            if (parts.length === 2) {
                                              return (
                                                <div style={{ fontWeight: 'bold', color: '#fff', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                                  <span>{parts[0]}</span>
                                                  <span style={{ color: 'var(--accent-color)' }}>⟵</span>
                                                  <span>{parts[1]}</span>
                                                </div>
                                              );
                                            }
                                            return <div style={{ fontWeight: 'bold', color: '#fff' }}>{range}</div>;
                                          }
                                          return <div style={{ fontWeight: 'bold', color: '#fff' }}>-</div>;
                                        })()}
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
                                           <img
                                             src={normalizeImageUrl(img)}
                                             alt={img.name || 'product'}
                                             onError={(e) => {
                                               e.target.onerror = null;
                                               e.target.src = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 24 24" fill="none" stroke="%2394a3b8" stroke-width="1.5"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg>';
                                             }}
                                             style={{ width: '100%', height: '150px', objectFit: 'cover', display: 'block' }}
                                             crossOrigin="anonymous"
                                           />
                                           <div style={{ padding: '0.4rem', fontSize: '0.75rem', textAlign: 'center', color: 'var(--text-muted)' }}>{img.name}</div>
                                         </div>
                                       ))}
                                     </div>
                                   </div>
                                 )}
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

      {showConditionsEditor && (
        <PackagingConditionsEditorModal 
           isOpen={showConditionsEditor}
           onClose={() => setShowConditionsEditor(false)}
           lookups={lookups}
           updateLookup={updateLookup}
           hasPermission={hasPermission}
        />
      )}
    </div>
  );
};

const PackagingConditionsEditorModal = ({ isOpen, onClose, lookups, updateLookup, hasPermission }) => {
  const { t } = useTranslation();
  const [newValue, setNewValue] = useState('');
  const [editIndex, setEditIndex] = useState(null);

  if (!isOpen) return null;

  const currentList = lookups.packagingConditionsList || [];

  const handleSave = () => {
    if (!hasPermission('admin', editIndex !== null ? 'edit' : 'add')) {
      toast.error(t('auth.unauthorized_desc', {defaultValue: 'لا تملك صلاحية لهذه العملية.'}));
      return;
    }
    if (!newValue.trim()) {
      toast.error(t('entry.packaging.empty_condition', {defaultValue: 'الرجاء إدخال نص الشرط'}));
      return;
    }
    
    let newList = [...currentList];
    if (editIndex !== null) {
      newList[editIndex] = newValue.trim();
      setEditIndex(null);
      toast.success(t('entry.packaging.edit_success', {defaultValue: 'تم التعديل بنجاح'}));
    } else {
      newList.push(newValue.trim());
      toast.success(t('entry.packaging.add_success', {defaultValue: 'تمت الإضافة بنجاح'}));
    }
    updateLookup('packagingConditionsList', newList);
    setNewValue('');
  };

  const handleDelete = (index) => {
    if (!hasPermission('admin', 'delete')) {
      toast.error(t('auth.unauthorized_desc', {defaultValue: 'لا تملك صلاحية لهذه العملية.'}));
      return;
    }
    if(window.confirm(t('entry.packaging.confirm_delete', {defaultValue: 'هل أنت متأكد من حذف هذا الشرط من القائمة الأساسية؟'}))) {
       let newList = [...currentList];
       newList.splice(index, 1);
       updateLookup('packagingConditionsList', newList);
       toast.success(t('entry.packaging.delete_success', {defaultValue: 'تم الحذف بنجاح'}));
    }
  }

  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, 
      backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 9999, 
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      backdropFilter: 'blur(4px)'
    }}>
      <div style={{
         backgroundColor: 'var(--bg-color)', padding: '1.5rem', borderRadius: '12px',
         width: '90%', maxWidth: '600px', maxHeight: '80vh', overflowY: 'auto',
         boxShadow: '0 10px 25px rgba(0,0,0,0.2)', border: '1px solid var(--border-color)',
         direction: 'rtl'
      }}>
         <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem'}}>
            <h3 style={{margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem'}}>
              <Edit3 size={20} color="var(--accent-color)" />
              {t('entry.packaging.edit_conditions_list', {defaultValue: 'إدارة قائمة الشروط الأساسية'})}
            </h3>
            <button onClick={onClose} style={{background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)'}}><X size={20}/></button>
         </div>

         <div style={{display: 'flex', gap: '0.5rem', marginBottom: '1.5rem'}}>
            <input 
              type="text" 
              className="form-control" 
              placeholder={t('entry.packaging.new_condition_placeholder', {defaultValue: 'اكتب نص الشرط الجديد...'})}
              value={newValue}
              onChange={(e) => setNewValue(e.target.value)}
              style={{flex: 1}}
              onKeyDown={(e) => e.key === 'Enter' && handleSave()}
            />
            <button className="btn btn-primary" onClick={handleSave} style={{display: 'flex', alignItems: 'center', gap: '4px'}}>
               {editIndex !== null ? <Edit3 size={16} /> : <Plus size={16} />}
               <span>{editIndex !== null ? t('entry.packaging.btn_edit', {defaultValue: 'تعديل'}) : t('entry.packaging.btn_add', {defaultValue: 'إضافة'})}</span>
            </button>
            {editIndex !== null && (
               <button className="btn btn-outline" onClick={() => {setEditIndex(null); setNewValue('');}}>
                 {t('entry.packaging.btn_cancel', {defaultValue: 'إلغاء'})}
               </button>
            )}
         </div>

         <div style={{border: '1px solid var(--border-color)', borderRadius: '8px', overflow: 'hidden'}}>
            {currentList.map((cond, idx) => (
               <div key={idx} style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center', 
                  padding: '0.75rem 1rem', borderBottom: idx < currentList.length - 1 ? '1px solid var(--border-color)' : 'none',
                  backgroundColor: editIndex === idx ? 'var(--surface-color)' : 'transparent',
                  transition: 'background-color 0.2s'
               }}>
                  <div style={{flex: 1, paddingLeft: '1rem', color: 'var(--text-main)', fontSize: '0.95rem'}}>{cond}</div>
                  <div style={{display: 'flex', gap: '0.25rem'}}>
                     <button onClick={() => {setEditIndex(idx); setNewValue(cond);}} style={{background: 'rgba(212, 175, 55, 0.1)', border: '1px solid rgba(212, 175, 55, 0.2)', color: 'var(--accent-color)', cursor: 'pointer', padding: '0.4rem', borderRadius: '4px'}} title={t('entry.packaging.btn_edit', {defaultValue: 'تعديل'})}>
                        <Edit3 size={15} />
                     </button>
                     <button onClick={() => handleDelete(idx)} style={{background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.2)', color: '#ef4444', cursor: 'pointer', padding: '0.4rem', borderRadius: '4px'}} title={t('entry.packaging.btn_delete', {defaultValue: 'حذف'})}>
                        <Trash2 size={15} />
                     </button>
                  </div>
               </div>
            ))}
            {currentList.length === 0 && (
               <div style={{padding: '3rem 2rem', textAlign: 'center', color: 'var(--text-muted)'}}>
                  <Layers size={32} style={{opacity: 0.5, marginBottom: '0.5rem'}} />
                  <div>{t('entry.packaging.no_conditions_yet', {defaultValue: 'لا توجد شروط مضافة حالياً.'})}</div>
               </div>
            )}
         </div>
      </div>
    </div>
  );
};

export default OrderReports;
