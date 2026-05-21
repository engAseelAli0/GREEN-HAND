import React, { useState, useMemo, useRef, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import { useAppData } from '../context/AppDataContext';
import { useAuth } from '../context/AuthContext';
import { useFilteredLookups } from '../hooks/useFilteredLookups';
import { Filter, Download, FileText, ChevronDown, ChevronUp, Printer, Calendar, Factory, ArrowUpDown, Camera, X, Brain, ShieldCheck, AlertTriangle, Clock, Activity, CheckCircle2, Trophy, Coins, TrendingUp, Search, ListChecks } from 'lucide-react';
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

const OrderReports = () => {
  const { t } = useTranslation();
  const { lookups } = useAppData();
  const { user, hasPermission } = useAuth();
  const filteredLookups = useFilteredLookups();
  const [orders, setOrders] = useState([]);
  const [receivings, setReceivings] = useState([]);
  const [filteredOrders, setFilteredOrders] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [dataLoaded, setDataLoaded] = useState(false);
  const [sortConfig, setSortConfig] = useState({ key: 'serial_number', direction: 'desc' });
  const receivingMap = useMemo(
    () => new Map(receivings.map(item => [item.serial_number, item])),
    [receivings]
  );

  const [selectedTerms, setSelectedTerms] = useState([]);
  const [showTermsDropdown, setShowTermsDropdown] = useState(false);
  const [tempSelectedTerms, setTempSelectedTerms] = useState([]);
  const termsDropdownRef = useRef(null);
  const [termsSearchQuery, setTermsSearchQuery] = useState('');

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
      result = result.filter(o => o.serial_number && parseInt(o.serial_number) >= parseInt(activeFilters.fromSerial));
    }
    if (activeFilters.toSerial) {
      result = result.filter(o => o.serial_number && parseInt(o.serial_number) <= parseInt(activeFilters.toSerial));
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
         const sr = (d.sizeFrom || '-') + ' - ' + (d.sizeTo || '-');
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
       const el = document.createElement('div');
       el.style.cssText = 'position:fixed;left:-9999px;top:0;width:1050px;background:#fff;padding:22px 26px;font-family:"Microsoft YaHei",SimHei,SimSun,Inter,sans-serif;color:#000;font-size:15px;line-height:1.4;direction:ltr;text-align:left;-webkit-font-smoothing:antialiased;';
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
         // Core columns that should always show
         if (['n', 'sn', 'pn', 'qty', 'cur', 'pr', 'tp'].includes(col.id)) return true;
         // Check if at least one row has data for this column
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

       // Generate Rows HTML dynamically (No empty row padding as per user request)
       let dH = '';
       rows.forEach(r => {
         dH += '<tr>';
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
           dH += `<td style="${col.style}">${val}</td>`;
         });
         dH += '</tr>';
       });

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

        // Define conditions block dynamically to hide it when empty
        let conditionsHtml = '';
        if (selectedTerms.length > 0) {
          conditionsHtml += 
            `<table style="border-collapse:collapse;width:100%;border:2px solid #000;border-top:none;"><tbody>
              <tr><td style="${bl}background:#e6e6e6;font-weight:800;font-size:14px;">Conditions 状况：</td></tr>
              <tr><td style="${bl}height:${Math.max(90, selectedTerms.length * 22)}px;vertical-align:top;padding:8px;">
                <ul style="margin:0;padding-left:20px;font-size:13px;font-weight:bold;">
                  ${selectedTerms.map(t => `<li style="margin-bottom:6px;">${t}</li>`).join('')}
                </ul>
              </td></tr>
            </tbody></table>`;
        }

        el.innerHTML =
          '<div style="text-align:center;margin-bottom:12px;">'+
            '<span style="font-size:36px;font-weight:900;color:#b41e1e;letter-spacing:1px;">Order Contract 订单合同</span>'+
          '</div>'+
          metaHtml +
          dateHtml +
          '<table style="'+tbs+'border-top:none;"><tbody>'+
            headerHtml +
            dH +
            totalRowHtml +
          '</tbody></table>'+
          conditionsHtml +
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
       document.body.appendChild(el);
       const { default: html2canvas } = await import('html2canvas');
       const canvas = await html2canvas(el, { scale: 3, useCORS: true, logging: false, backgroundColor: '#ffffff' });
       document.body.removeChild(el);
       const imgData = canvas.toDataURL('image/jpeg', 1.0);
       const pW = 210;
       const pM = 5;
       const cW = pW - pM * 2;
       const cH = (canvas.height * cW) / canvas.width;
       const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: [pW, Math.max(cH + pM * 2, 297)] });
       pdf.addImage(imgData, 'JPEG', pM, pM, cW, cH);
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
              <input type="number" className="form-control" placeholder={t('print.search.placeholder')} value={filters.fromSerial} onChange={(e) => updateFilter('fromSerial', e.target.value)} onKeyDown={(e) => handleF9Press(e, 'fromSerial')} style={{ flex: 1 }} />
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
              <input type="number" className="form-control" placeholder={t('print.search.placeholder')} value={filters.toSerial} onChange={(e) => updateFilter('toSerial', e.target.value)} onKeyDown={(e) => handleF9Press(e, 'toSerial')} style={{ flex: 1 }} />
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
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.75rem' }}>
          <ListChecks color="var(--accent-color)" />
          <h3 style={{ margin: 0 }}>{t('reports.detailed_terms', { defaultValue: 'الشروط المطلوبة للفاتورة' })}</h3>
        </div>
        
        <div ref={termsDropdownRef} style={{ position: 'relative', width: '100%', maxWidth: '500px' }}>
          <button 
            type="button"
            onClick={() => {
              if (!showTermsDropdown) {
                setTempSelectedTerms([...selectedTerms]);
                setTermsSearchQuery('');
              }
              setShowTermsDropdown(!showTermsDropdown);
            }}
            className="form-control"
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              cursor: 'pointer',
              backgroundColor: 'var(--surface-color)',
              border: '1px solid var(--border-color)',
              padding: '0.75rem 1rem',
              borderRadius: 'var(--radius-md)',
              color: 'var(--text-main)',
              fontSize: '0.95rem',
              textAlign: 'right',
              direction: 'rtl'
            }}
          >
            <span style={{ fontWeight: '500' }}>
              {selectedTerms.length > 0 
                ? `${t('reports.selected_terms_count', { count: selectedTerms.length, defaultValue: `تم اختيار ${selectedTerms.length} شرط` })}`
                : `${t('reports.select_terms_placeholder', { defaultValue: 'اختر الشروط المطلوبة...' })}`
              }
            </span>
            <ChevronDown size={18} style={{ 
              transform: showTermsDropdown ? 'rotate(180deg)' : 'rotate(0deg)',
              transition: 'transform 0.2s',
              marginRight: 'auto',
              marginLeft: '4px'
            }} />
          </button>

          {showTermsDropdown && (
            <div style={{
              position: 'absolute',
              top: 'calc(100% + 6px)',
              right: 0,
              left: 0,
              backgroundColor: 'var(--surface-color)',
              border: '2px solid var(--accent-color)',
              borderRadius: 'var(--radius-md)',
              boxShadow: '0 12px 32px rgba(0,0,0,0.4)',
              zIndex: 999,
              padding: '1rem',
              maxHeight: '350px',
              overflowY: 'auto',
              animation: 'fadeIn 0.15s ease'
            }}>
              {/* Search filter input inside dropdown */}
              <div style={{ marginBottom: '0.75rem', position: 'relative' }}>
                <input
                  type="text"
                  placeholder={t('reports.search_terms_placeholder', { defaultValue: 'البحث في الشروط المطلوبة...' })}
                  value={termsSearchQuery}
                  onChange={(e) => setTermsSearchQuery(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '0.5rem 2rem 0.5rem 0.75rem',
                    fontSize: '0.9rem',
                    border: '1px solid var(--border-color)',
                    borderRadius: 'var(--radius-sm, 6px)',
                    backgroundColor: 'var(--bg-color)',
                    color: 'var(--text-main)',
                    outline: 'none',
                    textAlign: 'right',
                    direction: 'rtl'
                  }}
                />
                <Search size={15} style={{ position: 'absolute', right: '8px', top: '50%', transform: 'translateY(-50%)', opacity: 0.5 }} />
              </div>

              <div style={{ 
                maxHeight: '220px', 
                overflowY: 'auto', 
                marginBottom: '1rem',
                display: 'flex',
                flexDirection: 'column',
                gap: '0.5rem',
                paddingRight: '4px'
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
                      return (
                        <label 
                          key={idx}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.75rem',
                            padding: '0.6rem 0.8rem',
                            borderRadius: '6px',
                            cursor: 'pointer',
                            backgroundColor: isSelected ? 'rgba(212, 175, 55, 0.08)' : 'transparent',
                            transition: 'background-color 0.2s',
                            userSelect: 'none'
                          }}
                          onMouseEnter={(e) => {
                            if (!isSelected) e.currentTarget.style.backgroundColor = 'var(--surface-highlight)';
                          }}
                          onMouseLeave={(e) => {
                            if (!isSelected) e.currentTarget.style.backgroundColor = 'transparent';
                          }}
                        >
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
                              cursor: 'pointer'
                            }}
                          />
                          <span style={{ 
                            fontSize: '0.95rem',
                            color: isSelected ? 'var(--text-strong)' : 'var(--text-main)',
                            fontWeight: isSelected ? 'bold' : 'normal'
                          }}>{termName}</span>
                        </label>
                      );
                    });
                  }
                  return (
                    <div style={{ textAlign: 'center', padding: '1rem', color: 'var(--text-muted)' }}>
                      {t('reports.no_matching_terms', { defaultValue: 'لا توجد شروط مطابقة للبحث' })}
                    </div>
                  );
                })()}
              </div>
              
              <div style={{ 
                display: 'flex', 
                justifyContent: 'flex-end', 
                gap: '0.5rem', 
                borderTop: '1px solid var(--border-color)', 
                paddingTop: '0.75rem' 
              }}>
                <button 
                  type="button"
                  onClick={() => setTempSelectedTerms([])}
                  className="btn btn-outline"
                  style={{ padding: '0.4rem 1rem', fontSize: '0.85rem' }}
                >
                  {t('reports.clear_all', { defaultValue: 'مسح الكل' })}
                </button>
                <button 
                  type="button"
                  onClick={() => {
                    setSelectedTerms(tempSelectedTerms);
                    setShowTermsDropdown(false);
                    toast.success(t('reports.terms_updated', { defaultValue: 'تم تحديث الشروط المختارة' }));
                  }}
                  className="btn btn-accent"
                  style={{ 
                    padding: '0.4rem 1.5rem', 
                    fontSize: '0.85rem',
                    backgroundColor: 'var(--accent-color)',
                    color: '#000',
                    fontWeight: 'bold'
                  }}
                >
                  {t('reports.ok_btn', { defaultValue: 'موافق' })}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Selected Terms Badges Display for immediate visual feedback */}
        {selectedTerms.length > 0 && (
          <div style={{ 
            display: 'flex', 
            flexWrap: 'wrap', 
            gap: '0.5rem', 
            marginTop: '1rem',
            paddingTop: '0.75rem',
            borderTop: '1px dashed var(--border-color)'
          }}>
            {selectedTerms.map((term, i) => (
              <div 
                key={i}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.4rem',
                  backgroundColor: 'rgba(212, 175, 55, 0.1)',
                  border: '1px solid rgba(212, 175, 55, 0.3)',
                  borderRadius: '6px',
                  padding: '0.3rem 0.6rem',
                  fontSize: '0.85rem',
                  color: 'var(--text-strong)'
                }}
              >
                <span>{term}</span>
                <button 
                  type="button"
                  onClick={() => setSelectedTerms(prev => prev.filter(t => t !== term))}
                  style={{
                    background: 'none',
                    border: 'none',
                    padding: 0,
                    cursor: 'pointer',
                    color: '#ef4444',
                    display: 'inline-flex',
                    alignItems: 'center'
                  }}
                >
                  <X size={14} />
                </button>
              </div>
            ))}
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
                      </tr>
                      {/* Expanded Section for Details */}
                      <tr className="expandable-content" style={{ display: isExpanded ? 'table-row' : 'none', backgroundColor: 'rgba(0,0,0,0.2)' }}>
                          <td colSpan={10} style={{ padding: '1.5rem', borderBottom: '1px solid var(--border-color)' }}>
                             {isExpanded && (
                               <div className="expandable-content-wrapper">
                                 <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.75rem', marginBottom: '1rem' }}>
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

export default OrderReports;
