import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../supabaseClient';
import { useAppData } from '../context/AppDataContext';
import { useAuth } from '../context/AuthContext';
import { englishOnly } from '../utils/textUtils';
import { Printer, Plus, Trash2, Search, FileText, Settings, LayoutGrid, AlertCircle, X, FileSpreadsheet } from 'lucide-react';
import toast from 'react-hot-toast';
import { useTranslation } from 'react-i18next';
import { CustomDateInput } from '../components/CustomDateInput';

const toEnglishNumbers = (str) => {
  if (str === null || str === undefined) return '';
  return str.toString().replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d));
};

const ShippingInvoice = () => {
  const { t } = useTranslation();
  const { hasPermission } = useAuth();
  const today = new Date();
  const localDate = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

  const [headerInfo, setHeaderInfo] = useState({
    companyName: 'ARABIAN FRIENDSHIP TRADING CO.,LIMITED',
    tel: 'Tel:(8620)-83265754',
    fax: 'FAX:(8620)-83265204',
    invoiceNo: '',
    branch: '',
    date: localDate
  });

  const { lookups } = useAppData();
  const companies = lookups?.companies || [];
  const factories = lookups?.factories || [];
  const [showCompanyDropdown, setShowCompanyDropdown] = useState(false);

  const [rows, setRows] = useState([
    { id: Date.now(), serial: '', desc: '', arabicName: '', qty: '', currency: '¥ RMB', unitPrice: '', totalAmount: 0, details: '', image: '', factoryCode: '' }
  ]);

  const [footerInfo, setFooterInfo] = useState({
    commissionPercent: '5',
    containerFee: '',
    insurance: '',
    internalShipping: '',
    containerNo: '',
    sealNo: ''
  });

  const [isExporting] = useState(false);
  const [showFetchDialog, setShowFetchDialog] = useState(false);
  const [showImageColumn, setShowImageColumn] = useState(false);

  // F9 States
  const [showSerialsList, setShowSerialsList] = useState(false);
  const [availableSerials, setAvailableSerials] = useState([]);
  const [serialSearchQuery, setSerialSearchQuery] = useState('');
  const [fetchingSerials, setFetchingSerials] = useState(false);
  const [activeF9RowId, setActiveF9RowId] = useState(null);
  const [f9Position, setF9Position] = useState({ top: 0, left: 0 });
  const serialSearchRef = useRef(null);

  // Validation States
  const [showValidationModal, setShowValidationModal] = useState(false);
  const [invalidSerials, setInvalidSerials] = useState([]);
  const [pendingFetchOptions, setPendingFetchOptions] = useState(null);
  const [highlightedSerials, setHighlightedSerials] = useState([]);

  // Clear Confirm State
  const [showClearConfirm, setShowClearConfirm] = useState(false);

  const clearAllData = () => {
    setRows([{ id: Date.now(), serial: '', desc: '', arabicName: '', qty: '', currency: '¥ RMB', unitPrice: '', totalAmount: 0, details: '', image: '', factoryCode: '' }]);
    setHeaderInfo(prev => ({ ...prev, invoiceNo: '', branch: '' }));
    setShowClearConfirm(false);
    toast.success(t('shipping.messages.clear_success'));
  };

  // Auto-calculate Total Amount for each row when Qty or Unit Price changes
  useEffect(() => {
    const updatedRows = rows.map(r => {
      const q = parseFloat(r.qty) || 0;
      const p = parseFloat(r.unitPrice) || 0;
      return { ...r, totalAmount: q * p };
    });
    
    // Only update if there's an actual change in totals to prevent infinite loops
    const hasChanges = updatedRows.some((r, i) => r.totalAmount !== rows[i].totalAmount);
    if (hasChanges) {
      setRows(updatedRows);
    }
  }, [rows]);

  const addRow = () => {
    setRows([...rows, { id: Date.now(), serial: '', desc: '', arabicName: '', qty: '', currency: '¥ RMB', unitPrice: '', totalAmount: 0, details: '', image: '', factoryCode: '' }]);
  };

  const removeRow = (id) => {
    if (rows.length === 1) return;
    setRows(rows.filter(r => r.id !== id));
  };

  const fetchRowData = async (_id, serial) => {
    if (!serial?.trim()) {
      toast.error(t('shipping.messages.enter_serials_first'));
      return;
    }
    await fetchAllData(false, [], false);
  };

  const handleRowChange = (id, field, value) => {
    // Force English numbers for numeric fields
    let finalValue = value;
    if (['qty', 'unitPrice', 'serial'].includes(field)) {
        finalValue = toEnglishNumbers(value);
    }
    setRows(rows.map(r => r.id === id ? { ...r, [field]: finalValue } : r));
  };

  const calculateTotalPiecesCount = (orderData) => {
      if (!orderData) return 0;
      const colorsDist = orderData.colorDistribution || {};
      let total = 0;
      Object.keys(colorsDist).forEach(color => {
          if (colorsDist[color] && typeof colorsDist[color] === 'object') {
              Object.values(colorsDist[color]).forEach(val => {
                  total += (parseInt(val) || 0);
              });
          }
      });
      return total;
  };

  const handleSerialKeyDown = async (e, rowId) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      addRow();
      setTimeout(() => {
        const inputs = document.querySelectorAll('.serial-input');
        if (inputs.length) inputs[inputs.length - 1].focus();
      }, 50);
    } else if (e.key === 'F9') {
      e.preventDefault();
      if (showSerialsList || fetchingSerials) return;
      
      const rect = e.target.getBoundingClientRect();
      let popupLeft = rect.left + (rect.width / 2);
      if (popupLeft < 125) popupLeft = 125;
      if (popupLeft > window.innerWidth - 125) popupLeft = window.innerWidth - 125;
      setF9Position({ top: rect.bottom + 4, left: popupLeft });
      
      setActiveF9RowId(rowId);
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
      setActiveF9RowId(null);
    }
  };

  const validateBeforeFetch = async (withImage) => {
      setShowFetchDialog(false);
      const serialsToCheck = rows.map(r => r.serial.trim()).filter(Boolean);
      
      if (serialsToCheck.length === 0) {
          return toast.error(t('shipping.messages.enter_serials_first'));
      }

      const toastId = toast.loading(t('shipping.messages.checking_status'));
      let invalidItems = [];

      try {
          const { data: ordersData } = await supabase.from('orders').select('serial_number').in('serial_number', serialsToCheck);
          const existingOrders = new Set(ordersData?.map(o => o.serial_number) || []);
          
          const { data: recData } = await supabase.from('receivings').select('serial_number, receive_data').in('serial_number', serialsToCheck);
          const receivedMap = new Map();
          recData?.forEach(r => {
              if (r.receive_data && r.receive_data.status === 'مستلمة') {
                  receivedMap.set(r.serial_number, true);
              }
          });

          rows.forEach(r => {
              const s = r.serial.trim();
              if (s) {
                  if (!existingOrders.has(s)) {
                      invalidItems.push({ id: r.id, serial: s, reason: t('shipping.validation.reasons.not_found') });
                  } else if (!receivedMap.has(s)) {
                      invalidItems.push({ id: r.id, serial: s, reason: t('shipping.validation.reasons.not_received') });
                  }
              }
          });

          toast.dismiss(toastId);

          if (invalidItems.length > 0) {
              setInvalidSerials(invalidItems);
              setPendingFetchOptions(withImage);
              setShowValidationModal(true);
          } else {
              setHighlightedSerials([]);
              fetchAllData(withImage, [], false);
          }
      } catch {
          toast.dismiss(toastId);
          toast.error(t('shipping.messages.check_error'));
      }
  };

  const fetchAllData = async (withImage, badSerialsToSkip = [], removeBadRows = false) => {
    setShowImageColumn(withImage);
    const toastId = toast.loading(t('shipping.messages.fetching_data'));
    let successCount = 0;
    
    // Create a copy of rows
    let updatedRows = [...rows];
    if (removeBadRows) {
        updatedRows = updatedRows.filter(r => !badSerialsToSkip.includes(r.serial.trim()));
    }
    for (let i = 0; i < updatedRows.length; i++) {
        let r = updatedRows[i];
        if (r.serial.trim() && !badSerialsToSkip.includes(r.serial.trim())) { // Always fetch fresh data
            try {
                const { data, error } = await supabase
                    .from('orders')
                    .select('order_data')
                    .eq('serial_number', r.serial.trim())
                    .single();

                if (!error && data) {
                    const d = data.order_data;
                    const totalPieces = calculateTotalPiecesCount(d) || parseInt(d.totalQuantity) || 0;
                    
                    let imageUrl = '';
                    if (withImage && d.productImages && Array.isArray(d.productImages) && d.productImages.length > 0) {
                        const firstImage = d.productImages[0];
                        imageUrl = typeof firstImage === 'object' ? firstImage.url : firstImage;
                    }

                    const factName = d.factoryId || '';
                    const factoryObj = factories.find(f => (f.name || f) === factName);
                    const factoryCode = typeof factoryObj === 'object' ? factoryObj.code : (d.factoryCode || '');

                    updatedRows[i] = {
                        ...r,
                        desc: englishOnly(d.productName) || '',
                        arabicName: englishOnly(d.productName) || '',
                        qty: totalPieces.toString(),
                        currency: d.currency || '¥ RMB',
                        unitPrice: d.productPrice || '',
                        image: imageUrl,
                        factoryCode: factoryCode || ''
                    };
                    successCount++;
                }
            } catch {
                // ignore
            }
        }
    }
    
    setRows(updatedRows);

    if (successCount > 0) {
        toast.success(t('shipping.messages.fetch_success', { count: successCount }), { id: toastId });
    } else {
        toast.error(t('shipping.messages.fetch_no_data'), { id: toastId });
    }
  };

  // Calculations
  const totalItemsCount = rows.filter(r => r.serial.trim() !== '').length;
  const totalPcs = rows.reduce((acc, r) => acc + (parseFloat(r.qty) || 0), 0);
  const subTotalAmount = rows.reduce((acc, r) => acc + (r.totalAmount || 0), 0);

  const commPercent = parseFloat(footerInfo.commissionPercent) || 0;
  const commissionAmount = subTotalAmount * (commPercent / 100);
  
  const contFee = parseFloat(footerInfo.containerFee) || 0;
  const ins = parseFloat(footerInfo.insurance) || 0;
  const intShip = parseFloat(footerInfo.internalShipping) || 0;

  const invoiceTotal = subTotalAmount + commissionAmount + contFee + ins + intShip;

  // Primary currency from first row
  const primaryCurrency = rows[0]?.currency || 'RMB ¥';

  const exportToPDF = () => {
    window.print();
  };

  const exportToExcel = async () => {
    try {
      const { utils, writeFile } = await import('xlsx');
      
      const excelData = [];
      
      // Header
      excelData.push([t('shipping.title')]);
      excelData.push([]);
      excelData.push([t('shipping.header.invoice_no'), headerInfo.invoiceNo, t('shipping.header.date'), headerInfo.date]);
      excelData.push([t('shipping.header.branch'), headerInfo.branch]);
      excelData.push([]);
      
      // Table Header
      excelData.push([
        t('shipping.table.cols.no'),
        t('shipping.table.cols.item_no'),
        t('shipping.table.cols.desc'),
        t('shipping.table.cols.arabic_name'),
        t('shipping.table.cols.qty'),
        t('shipping.table.cols.currency'),
        t('shipping.table.cols.unit_price'),
        t('shipping.table.cols.total_amount'),
        'تفاصيل أخرى'
      ]);
      
      // Table Rows
      rows.forEach((row, index) => {
        excelData.push([
          index + 1,
          row.serial,
          row.desc,
          row.arabicName,
          row.qty,
          row.currency,
          row.unitPrice,
          row.totalAmount,
          row.factoryCode || row.details || '-'
        ]);
      });
      
      excelData.push([]);
      
      // Footer
      excelData.push([t('shipping.footer.total'), totalItemsCount, '', '', totalPcs, '', '', subTotalAmount, '']);
      excelData.push(['', '', '', '', '', '', t('shipping.footer.commission') + ` (${footerInfo.commissionPercent}%)`, commissionAmount, '']);
      excelData.push(['', '', '', '', '', '', t('shipping.footer.container_fee'), footerInfo.containerFee, '']);
      excelData.push(['', '', '', '', '', '', t('shipping.footer.insurance'), footerInfo.insurance, '']);
      excelData.push(['', '', '', '', '', '', t('shipping.footer.internal_shipping'), footerInfo.internalShipping, '']);
      excelData.push(['', '', '', '', '', '', t('shipping.footer.invoice_total'), invoiceTotal, '']);
      
      const ws = utils.aoa_to_sheet(excelData);
      ws['!dir'] = 'rtl'; // Right to left
      
      // Merge title row
      ws['!merges'] = [
        { s: { r: 0, c: 0 }, e: { r: 0, c: 8 } }
      ];
      
      // Set column widths
      ws['!cols'] = [
        { wch: 5 },  // No
        { wch: 15 }, // Item No
        { wch: 25 }, // Desc
        { wch: 25 }, // Arabic Name
        { wch: 10 }, // Qty
        { wch: 10 }, // Currency
        { wch: 15 }, // Unit Price
        { wch: 15 }, // Total Amount
        { wch: 20 }  // Other Details
      ];
      
      const wb = utils.book_new();
      utils.book_append_sheet(wb, ws, "Shipping Invoice");
      
      writeFile(wb, `Shipping_Invoice_${headerInfo.invoiceNo || 'Export'}.xlsx`);
      toast.success('تم تحميل ملف الإكسل بنجاح');
    } catch (error) {
      console.error('Error exporting to Excel:', error);
      toast.error('حدث خطأ أثناء تحميل ملف الإكسل');
    }
  };

  return (
    <div className="fade-in" style={{ paddingBottom: '4rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
        <div>
          <h1 style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', fontSize: '2.2rem', margin: 0, color: 'var(--text-strong)' }}>
            <FileText size={40} color="var(--accent-color)" />
            {t('shipping.title')}
          </h1>
          <p style={{ color: 'var(--text-muted)', margin: '0.5rem 0 0', paddingRight: '3.5rem' }}>
            {t('shipping.subtitle')}
          </p>
        </div>
        <div style={{ display: 'flex', gap: '1rem' }}>
          {hasPermission('shipping-invoice', 'export') && (
            <>
              <button className="btn btn-outline no-print" onClick={exportToExcel} disabled={isExporting} style={{ padding: '12px 24px', fontSize: '1.1rem', color: '#107c41', borderColor: '#107c41', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <FileSpreadsheet size={20} /> تحميل إكسل
              </button>
              <button className="btn btn-primary no-print" onClick={exportToPDF} disabled={isExporting} style={{ padding: '12px 24px', fontSize: '1.1rem' }}>
                {isExporting ? <div className="spinner" style={{ width: '20px', height: '20px' }}/> : <><Printer size={20} /> {t('shipping.print_btn')}</>}
              </button>
            </>
          )}
        </div>
      </div>

      <div id="invoice-print-area" style={{ 
          background: 'var(--surface-color)', 
          border: '2px solid var(--accent-color)', 
          borderRadius: '16px', 
          overflow: 'hidden',
          boxShadow: '0 10px 30px rgba(0,0,0,0.5)',
          color: 'var(--text-main)',
          direction: 'ltr'
      }}>
        
        {/* Print Styles */}
        <style>
          {`
            @media print {
              @page { size: portrait; margin: 6mm 8mm; }
              *, *::before, *::after { box-sizing: border-box; }
              body, html {
                background: #fff !important;
                color: #000 !important;
                margin: 0 !important; padding: 0 !important;
                font-size: 10px !important;
              }
              body * { visibility: hidden; }
              #invoice-print-area, #invoice-print-area * { visibility: visible; }
              #invoice-print-area {
                position: absolute; left: 0; top: 0; width: 100% !important;
                border: none !important; box-shadow: none !important;
                border-radius: 0 !important; overflow: visible !important;
                background: #fff !important; color: #000 !important;
                padding: 0 !important;
              }
              .no-print { display: none !important; }
              .inv-header-section {
                border-bottom: 3px solid #1a5276 !important;
                padding: 12px !important;
                background: #fff !important;
              }
              .inv-header-section input {
                font-size: 15px !important; color: #1a5276 !important; font-family: 'Arial', sans-serif !important; font-weight: bold !important;
              }
              .inv-header-section .company-tel input {
                font-size: 11px !important; color: #555 !important; font-family: sans-serif !important;
              }
              .inv-meta-grid {
                padding: 8px 12px !important; gap: 8px !important;
                background: #f8fafc !important; border: 1px solid #cbd5e1 !important;
                border-radius: 4px !important; margin-top: 8px !important;
              }
              .inv-meta-grid label { font-size: 9px !important; color: #64748b !important; margin-bottom: 2px !important; text-transform: uppercase !important; letter-spacing: 0.5px !important; }
              .inv-meta-grid input, .inv-meta-grid .form-control {
                font-size: 11px !important; padding: 4px 6px !important;
                border: 1px solid #94a3b8 !important; color: #0f172a !important; font-weight: bold !important;
                background: #fff !important; min-height: unset !important;
                height: auto !important;
              }
              .inv-title-h2 { font-size: 16px !important; margin: 12px 0 8px !important; text-transform: uppercase !important; letter-spacing: 1.5px !important; color: #1a5276 !important; font-weight: 900 !important; }
              /* Table compact */
              .inv-main-table { font-size: 10px !important; table-layout: auto !important; border-collapse: collapse !important; border: 2px solid #1a5276 !important; }
              .inv-main-table th {
                padding: 6px 4px !important; font-size: 9px !important;
                background: #1a5276 !important; -webkit-print-color-adjust: exact; print-color-adjust: exact;
                border: 1px solid #1a5276 !important; color: #fff !important;
                white-space: normal !important; text-transform: uppercase !important; letter-spacing: 0.5px !important;
              }
              .inv-main-table td {
                padding: 4px !important; border: 1px solid #94a3b8 !important;
                color: #0f172a !important; white-space: normal !important;
                word-wrap: break-word !important; overflow-wrap: break-word !important;
              }
              .inv-main-table td span { color: #0f172a !important; }
              .inv-main-table input {
                font-size: 10px !important; color: #0f172a !important; font-weight: bold !important;
                padding: 0 !important; height: auto !important;
                min-height: unset !important;
                display: none !important;
              }
              .inv-main-table .print-val {
                display: inline !important; font-size: 10px !important;
                color: #0f172a !important; font-weight: bold !important;
              }
              .inv-main-table img { width: 35px !important; height: 45px !important; border-radius: 2px !important; border: 1px solid #ccc !important; }
              /* Footer table */
              .inv-footer-table { font-size: 11px !important; border-collapse: collapse !important; border: 2px solid #1a5276 !important; }
              .inv-footer-table td {
                padding: 6px 8px !important; border: 1px solid #94a3b8 !important;
                color: #0f172a !important; font-weight: bold !important;
              }
              .inv-footer-table input {
                font-size: 11px !important; color: #0f172a !important; font-weight: bold !important;
                padding: 0 !important;
              }
              .inv-footer-table .highlight-cell {
                background: #f8fafc !important; -webkit-print-color-adjust: exact; print-color-adjust: exact;
              }
              .inv-footer-table .total-cell {
                background: #eaf2f8 !important; -webkit-print-color-adjust: exact; print-color-adjust: exact;
                font-weight: 900 !important; border-top: 2px solid #1a5276 !important; border-bottom: 2px solid #1a5276 !important; color: #1a5276 !important;
              }
              /* Bottom details */
              .inv-bottom-details { font-size: 10px !important; gap: 2px !important; margin-top: 6px !important; }
              .inv-bottom-details > div {
                padding: 3px 8px !important; border-radius: 0 !important;
                background: #fff !important; border: 1px solid #000 !important;
              }
              .inv-bottom-details input {
                font-size: 10px !important; color: #000 !important;
              }
            }
          `}
        </style>
        
        {/* ─── INVOICE HEADER ─── */}
        <div className="inv-header-section" style={{ 
            background: 'var(--surface-highlight)', 
            borderBottom: '2px solid var(--accent-color)',
            padding: '1.5rem',
            textAlign: 'center',
            position: 'relative'
        }}>
           <div 
             onClick={() => setShowCompanyDropdown(!showCompanyDropdown)}
             style={{ cursor: 'pointer', display: 'inline-block', width: '100%', padding: '0.5rem', borderRadius: '8px', transition: 'background-color 0.2s' }}
             onMouseEnter={e => e.currentTarget.style.backgroundColor = 'rgba(212, 175, 55, 0.05)'}
             onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}
           >
             <div style={{ fontSize: '1.6rem', fontWeight: '900', color: 'var(--text-main)', marginBottom: '0.5rem', textTransform: 'uppercase' }}>
               {headerInfo.companyName}
             </div>
             <div className="company-tel" style={{ display: 'flex', justifyContent: 'center', gap: '2rem', color: 'var(--text-muted)', fontWeight: 'bold', direction: 'ltr' }}>
               <span>{headerInfo.fax}</span>
               <span>{headerInfo.tel}</span>
             </div>
           </div>

           {/* Dropdown for Companies */}
           {showCompanyDropdown && (
             <div className="no-print" style={{
               position: 'absolute', top: '100%', left: '50%', transform: 'translateX(-50%)',
               width: '400px', backgroundColor: 'var(--surface-color)', border: '2px solid var(--accent-color)',
               borderRadius: 'var(--radius-md)', boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
               zIndex: 100, maxHeight: '300px', overflowY: 'auto', marginTop: '0.5rem'
             }}>
               {companies.length === 0 ? (
                 <div style={{ padding: '1rem', color: 'var(--text-muted)' }}>لا توجد شركات مضافة، يرجى إضافتها من لوحة الإدارة.</div>
               ) : (
                 companies.map((comp, idx) => (
                   <div 
                     key={idx}
                     onClick={() => {
                       setHeaderInfo({
                         ...headerInfo,
                         companyName: comp.name || '',
                         fax: comp.fax ? `FAX:${comp.fax} :FAX` : '',
                         tel: comp.mobile ? `Tel:${comp.mobile} :Tel` : ''
                       });
                       setShowCompanyDropdown(false);
                     }}
                     style={{
                       padding: '1rem', borderBottom: '1px solid var(--border-color)',
                       cursor: 'pointer', textAlign: 'center', transition: 'background-color 0.2s'
                     }}
                     onMouseEnter={e => e.currentTarget.style.backgroundColor = 'rgba(212, 175, 55, 0.1)'}
                     onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}
                   >
                     <div style={{ fontWeight: 'bold', fontSize: '1.1rem', color: 'var(--text-main)', textTransform: 'uppercase' }}>{comp.name}</div>
                     <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginTop: '0.25rem', direction: 'ltr' }}>
                       {comp.fax && <span>FAX: {comp.fax} | </span>}
                       {comp.mobile && <span>Tel: {comp.mobile}</span>}
                     </div>
                   </div>
                 ))
               )}
             </div>
           )}
        </div>

        <div style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
           
           <div className="inv-meta-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem', background: 'rgba(212, 175, 55, 0.05)', padding: '1rem', borderRadius: '8px', border: '1px solid rgba(212, 175, 55, 0.2)' }}>
              <div>
                 <label style={{ fontSize: '0.85rem', color: 'var(--accent-color)', fontWeight: 'bold', display: 'block', marginBottom: '4px' }}>{t('shipping.header.invoice_no')}</label>
                 <input type="text" className="form-control" value={headerInfo.invoiceNo} onChange={e => setHeaderInfo({...headerInfo, invoiceNo: toEnglishNumbers(e.target.value)})} style={{ background: 'var(--bg-color)' }} />
              </div>
              <div>
                 <label style={{ fontSize: '0.85rem', color: 'var(--accent-color)', fontWeight: 'bold', display: 'block', marginBottom: '4px' }}>{t('shipping.header.branch')}</label>
                 <input type="text" className="form-control" value={headerInfo.branch} onChange={e => setHeaderInfo({...headerInfo, branch: e.target.value})} style={{ background: 'var(--bg-color)' }} />
              </div>
                 <div style={{ position: 'relative' }}>
                    <label style={{ fontSize: '0.85rem', color: 'var(--accent-color)', fontWeight: 'bold', display: 'block', marginBottom: '4px' }}>{t('shipping.header.date')}</label>
                    <CustomDateInput 
                      value={headerInfo.date} 
                      onChange={val => setHeaderInfo({...headerInfo, date: val})}
                    />
                 </div>
           </div>

           <h2 className="inv-title-h2" style={{ textAlign: 'center', margin: '1rem 0', fontSize: '1.8rem', color: 'var(--text-strong)' }}>{t('shipping.header.list_title')}</h2>

           {/* ─── INVOICE TABLE ─── */}
           <div style={{ overflowX: 'auto' }}>
             <table className="inv-main-table" style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'center', fontSize: '0.9rem' }}>
               <thead>
                 <tr style={{ background: 'var(--surface-highlight)', borderBottom: '2px solid var(--accent-color)' }}>
                   <th style={{ padding: '10px 5px', border: '1px solid var(--border-color)', width: '40px' }}>{t('shipping.table.cols.no')}</th>
                   <th style={{ padding: '10px 5px', border: '1px solid var(--border-color)', width: '140px' }}>{t('shipping.table.cols.item_no')}<br/><span style={{fontSize:'0.75rem', color:'var(--text-muted)'}}>{t('shipping.table.cols.item_no_ar')}</span></th>
                   <th style={{ padding: '10px 5px', border: '1px solid var(--border-color)' }}>{t('shipping.table.cols.desc')}<br/><span style={{fontSize:'0.75rem', color:'var(--text-muted)'}}>{t('shipping.table.cols.desc_ar')}</span></th>
                   <th style={{ padding: '10px 5px', border: '1px solid var(--border-color)' }}>{t('shipping.table.cols.arabic_name')}<br/><span style={{fontSize:'0.75rem', color:'var(--text-muted)'}}>{t('shipping.table.cols.arabic_name_en')}</span></th>
                   <th style={{ padding: '10px 5px', border: '1px solid var(--border-color)', width: '80px' }}>{t('shipping.table.cols.qty')}<br/><span style={{fontSize:'0.75rem', color:'var(--text-muted)'}}>{t('shipping.table.cols.qty_ar')}</span></th>
                   <th style={{ padding: '10px 5px', border: '1px solid var(--border-color)', width: '80px' }}>{t('shipping.table.cols.currency')}<br/><span style={{fontSize:'0.75rem', color:'var(--text-muted)'}}>{t('shipping.table.cols.currency_ar')}</span></th>
                   <th style={{ padding: '10px 5px', border: '1px solid var(--border-color)', width: '90px' }}>{t('shipping.table.cols.unit_price')}<br/><span style={{fontSize:'0.75rem', color:'var(--text-muted)'}}>{t('shipping.table.cols.unit_price_ar')}</span></th>
                   <th style={{ padding: '10px 5px', border: '1px solid var(--border-color)', width: '120px' }}>{t('shipping.table.cols.total_amount')}<br/><span style={{fontSize:'0.75rem', color:'var(--text-muted)'}}>{t('shipping.table.cols.total_amount_ar')}</span></th>
                   {showImageColumn && (
                       <th style={{ padding: '10px 5px', border: '1px solid var(--border-color)', width: '90px' }}>{t('shipping.table.cols.item_image')}<br/><span style={{fontSize:'0.75rem', color:'var(--text-muted)'}}>{t('shipping.table.cols.item_image_ar')}</span></th>
                   )}
                   <th style={{ padding: '10px 5px', border: '1px solid var(--border-color)', width: '90px' }}>تفاصيل أخرى<br/><span style={{fontSize:'0.75rem', color:'var(--text-muted)'}}>Other Details</span></th>
                   <th className="no-print" style={{ padding: '10px 5px', width: '40px', border: '1px solid var(--border-color)' }}></th>
                 </tr>
               </thead>
               <tbody>
                 {rows.map((row, index) => (
                   <tr key={row.id} style={{ background: index % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.02)', transition: 'background-color 0.2s' }}>
                     <td style={{ border: '1px solid var(--border-color)', padding: '5px', fontWeight: 'bold' }}>{index + 1}</td>
                     
                     <td style={{ border: '1px solid var(--border-color)', padding: '5px', position: 'relative' }}>
                        <input 
                          className="serial-input"
                          type="text" 
                          value={row.serial} 
                          onChange={e => handleRowChange(row.id, 'serial', e.target.value)}
                          onKeyDown={e => handleSerialKeyDown(e, row.id)}
                          placeholder={t('shipping.table.serial_placeholder')}
                          style={{ width: '100%', background: 'transparent', border: 'none', color: highlightedSerials.includes(row.serial.trim()) ? '#ef4444' : 'var(--text-main)', textAlign: 'center', fontWeight: 'bold' }}
                        />
                        {activeF9RowId === row.id && showSerialsList && (
                          <div style={{
                            position: 'fixed', top: f9Position.top, left: f9Position.left, transform: 'translateX(-50%)',
                            width: '250px', maxHeight: '250px', overflowY: 'auto',
                            backgroundColor: 'var(--surface-color)',
                            border: '1px solid var(--border-color)',
                            borderRadius: 'var(--radius-md)',
                            boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
                            zIndex: 99999,
                            textAlign: 'right'
                          }}>
                            <div style={{ padding: '0.5rem', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: 'var(--surface-highlight)' }}>
                                <span style={{ fontSize: '0.85rem', fontWeight: 'bold' }}>{t('print.search.title')}</span>
                                <button onClick={() => { setShowSerialsList(false); setSerialSearchQuery(''); setActiveF9RowId(null); }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-color)', padding: 0, display: 'flex', alignItems: 'center' }}>
                                   <X size={16} />
                                </button>
                            </div>
                            <div style={{ padding: '0.5rem', borderBottom: '1px solid var(--border-color)', backgroundColor: 'var(--bg-color)' }}>
                              <input
                                ref={serialSearchRef}
                                type="text"
                                placeholder={t('print.search.placeholder')}
                                value={serialSearchQuery}
                                onChange={(e) => setSerialSearchQuery(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === 'Escape') {
                                    setShowSerialsList(false);
                                    setSerialSearchQuery('');
                                    setActiveF9RowId(null);
                                  }
                                  if (e.key === 'Enter') {
                                    const filtered = availableSerials.filter(s => s.toString().includes(serialSearchQuery));
                                    if (filtered.length > 0) {
                                      setShowSerialsList(false);
                                      setSerialSearchQuery('');
                                      setActiveF9RowId(null);
                                      handleRowChange(row.id, 'serial', filtered[0]);
                                    }
                                  }
                                }}
                                style={{ width: '100%', padding: '0.5rem', fontSize: '0.9rem', border: '1px solid var(--border-color)', borderRadius: '6px', backgroundColor: 'var(--surface-color)', color: 'var(--text-color)', outline: 'none' }}
                                autoComplete="off"
                              />
                            </div>
                            {fetchingSerials ? (
                                <div style={{ padding: '1rem', textAlign: 'center', fontSize: '0.85rem', color: 'var(--text-muted)' }}>{t('print.search.loading')}</div>
                            ) : (
                               (() => {
                                 const filteredSerials = serialSearchQuery.trim()
                                   ? availableSerials.filter(s => s.toString().includes(serialSearchQuery.trim()))
                                   : availableSerials;
                                 return filteredSerials.length === 0 ? (
                                   <div style={{ padding: '1rem', textAlign: 'center', fontSize: '0.85rem', color: 'var(--text-muted)' }}>{t('entry.actions.no_match')}</div>
                                 ) : (
                                  <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                                      {filteredSerials.map(serial => {
                                          const query = serialSearchQuery.trim();
                                          const serialStr = serial.toString();
                                          const matchIdx = query ? serialStr.indexOf(query) : -1;
                                          return (
                                          <li 
                                              key={serial} 
                                              onClick={() => {
                                                  setShowSerialsList(false);
                                                  setSerialSearchQuery('');
                                                  setActiveF9RowId(null);
                                                  handleRowChange(row.id, 'serial', serial);
                                              }}
                                              style={{ padding: '0.6rem 1rem', cursor: 'pointer', borderBottom: '1px solid var(--border-color)', fontSize: '0.9rem', color: 'var(--text-color)' }}
                                              onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--surface-highlight)'}
                                              onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                                          >
                                              {matchIdx !== -1 ? (
                                                <strong>
                                                  {serialStr.substring(0, matchIdx)}
                                                  <span style={{ color: 'var(--accent-color)', textDecoration: 'underline' }}>{serialStr.substring(matchIdx, matchIdx + query.length)}</span>
                                                  {serialStr.substring(matchIdx + query.length)}
                                                </strong>
                                              ) : (
                                                <strong>{serialStr}</strong>
                                              )}
                                          </li>
                                          );
                                      })}
                                  </ul>
                                 );
                               })()
                            )}
                          </div>
                        )}
                        <span className="print-val" style={{ display: 'none' }}>{row.serial}</span>
                     </td>
                     
                     <td style={{ border: '1px solid var(--border-color)', padding: '5px' }}>
                        <input type="text" value={row.desc} onChange={e => handleRowChange(row.id, 'desc', e.target.value)} style={{ width: '100%', background: 'transparent', border: 'none', color: 'var(--text-main)', textAlign: 'center' }} />
                        <span className="print-val" style={{ display: 'none' }}>{row.desc}</span>
                     </td>
                     
                     <td style={{ border: '1px solid var(--border-color)', padding: '5px' }}>
                        <input type="text" value={row.arabicName} onChange={e => handleRowChange(row.id, 'arabicName', e.target.value)} style={{ width: '100%', background: 'transparent', border: 'none', color: 'var(--text-main)', textAlign: 'center', direction: 'rtl' }} />
                        <span className="print-val" style={{ display: 'none' }}>{row.arabicName}</span>
                     </td>
                     
                     <td style={{ border: '1px solid var(--border-color)', padding: '5px' }}>
                        <input type="number" value={row.qty} onChange={e => handleRowChange(row.id, 'qty', e.target.value)} style={{ width: '100%', background: 'transparent', border: 'none', color: 'var(--text-main)', textAlign: 'center', fontWeight: 'bold' }} />
                        <span className="print-val" style={{ display: 'none' }}>{row.qty}</span>
                     </td>
                     
                     <td style={{ border: '1px solid var(--border-color)', padding: '5px' }}>
                        <input type="text" value={row.currency} onChange={e => handleRowChange(row.id, 'currency', e.target.value)} style={{ width: '100%', background: 'transparent', border: 'none', color: 'var(--text-main)', textAlign: 'center' }} />
                        <span className="print-val" style={{ display: 'none' }}>{row.currency}</span>
                     </td>
                     
                     <td style={{ border: '1px solid var(--border-color)', padding: '5px' }}>
                        <input type="number" value={row.unitPrice} onChange={e => handleRowChange(row.id, 'unitPrice', e.target.value)} style={{ width: '100%', background: 'transparent', border: 'none', color: 'var(--text-main)', textAlign: 'center' }} />
                        <span className="print-val" style={{ display: 'none' }}>{row.unitPrice}</span>
                     </td>
                     
                     <td style={{ border: '1px solid var(--border-color)', padding: '5px', fontWeight: 'bold', color: 'var(--accent-color)' }}>
                        {row.totalAmount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                     </td>
                     
                     {showImageColumn && (
                        <td style={{ border: '1px solid var(--border-color)', padding: '5px', textAlign: 'center' }}>
                            {row.image ? (
                                <img src={row.image} alt="Product" style={{ width: '60px', height: '80px', objectFit: 'contain', borderRadius: '4px' }} />
                            ) : (
                                <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{t('shipping.table.no_image')}</span>
                            )}
                        </td>
                     )}
                     
                     <td style={{ border: '1px solid var(--border-color)', padding: '5px', fontWeight: 'bold' }}>
                        <input type="text" value={row.factoryCode || row.details} onChange={e => handleRowChange(row.id, 'factoryCode', e.target.value)} style={{ width: '100%', background: 'transparent', border: 'none', color: 'var(--text-main)', textAlign: 'center' }} placeholder="-" />
                        <span className="print-val" style={{ display: 'none' }}>{row.factoryCode || row.details || '-'}</span>
                     </td>

                        <td className="no-print" style={{ border: '1px solid var(--border-color)', padding: '5px', textAlign: 'center' }}>
                            <div style={{ display: 'flex', gap: '4px', justifyContent: 'center' }}>
                                {(hasPermission('shipping-invoice', 'delete') || hasPermission('shipping-invoice', 'edit')) && (
                                  <button onClick={() => removeRow(row.id)} style={{ background: 'rgba(239, 68, 68, 0.1)', border: 'none', color: '#ef4444', padding: '4px', borderRadius: '4px', cursor: 'pointer' }}>
                                      <Trash2 size={14} />
                                  </button>
                                )}
                                <button className="no-print" onClick={() => fetchRowData(row.id, row.serial)} style={{ background: 'none', border: 'none', color: 'var(--accent-color)', cursor: 'pointer', padding: '2px' }}>
                                    <Search size={14} />
                                </button>
                            </div>
                        </td>
                   </tr>
                 ))}
               </tbody>
             </table>
           </div>


           {!isExporting && (
             <div className="no-print" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', marginTop: '1rem', gap: '1rem' }}>
                {hasPermission('shipping-invoice', 'add') && (
                  <button onClick={addRow} className="btn btn-outline" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--accent-color)', borderColor: 'var(--accent-color)' }}>
                     <Plus size={18} /> {t('shipping.actions.add_row')}
                  </button>
                )}
                <button onClick={() => setShowFetchDialog(true)} className="btn btn-primary" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: 'linear-gradient(to right, #10b981, #059669)', border: 'none', padding: '10px 24px' }}>
                   <Search size={18} /> {t('shipping.actions.fetch_all')}
                </button>
                {hasPermission('shipping-invoice', 'delete') && (
                  <button onClick={() => setShowClearConfirm(true)} className="btn btn-outline" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#ef4444', borderColor: '#ef4444' }}>
                     <Trash2 size={18} /> {t('shipping.actions.clear_all')}
                  </button>
                )}
             </div>
           )}

           {/* ─── FOOTER CALCULATIONS (LTR LAYOUT) ─── */}
           <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '2rem' }}>
              <table className="inv-footer-table" style={{ width: '60%', minWidth: '600px', borderCollapse: 'collapse', textAlign: 'center', fontWeight: 'bold' }} dir="ltr">
                 <tbody>
                    {/* Row 1: {t('shipping.footer.total')}s */}
                    <tr>
                       <td style={{ padding: '12px', background: 'rgba(212, 175, 55, 0.1)', border: '1px solid var(--border-color)', color: 'var(--text-strong)', fontSize: '1.2rem' }} className="highlight-cell">{t('shipping.footer.total')}</td>
                       <td style={{ padding: '12px', border: '1px solid var(--border-color)' }}>{totalItemsCount} {t('shipping.footer.items')}</td>
                       <td style={{ padding: '12px', border: '1px solid var(--border-color)' }}>{totalPcs} {t('shipping.footer.pcs')}</td>
                       <td style={{ padding: '12px', background: 'rgba(212, 175, 55, 0.1)', border: '1px solid var(--border-color)', fontSize: '1.2rem', color: 'var(--accent-color)' }} className="highlight-cell">
                          {subTotalAmount.toLocaleString('en-US', { minimumFractionDigits: 2 })} {primaryCurrency}
                       </td>
                    </tr>
                    
                    {/* Row 2: {t('shipping.footer.commission')} */}
                    <tr>
                       <td colSpan={2} style={{ border: 'none' }}></td>
                       <td style={{ padding: '12px', background: 'rgba(212, 175, 55, 0.05)', border: '1px solid var(--border-color)' }}>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                             {t('shipping.footer.commission')} <input type="number" value={footerInfo.commissionPercent} onChange={e => setFooterInfo({...footerInfo, commissionPercent: e.target.value})} style={{ width: '40px', background: 'var(--bg-color)', border: '1px solid var(--border-color)', color: 'var(--text-main)', textAlign: 'center', borderRadius: '4px' }} /> %
                          </div>
                       </td>
                       <td style={{ padding: '12px', border: '1px solid var(--border-color)' }}>
                          {commissionAmount > 0 ? commissionAmount.toLocaleString('en-US', { minimumFractionDigits: 2 }) + ' ' + primaryCurrency : '0.00'}
                       </td>
                    </tr>

                    {/* Row 3: {t('shipping.footer.container_fee')} */}
                    <tr>
                       <td colSpan={2} style={{ border: 'none' }}></td>
                       <td style={{ padding: '12px', background: 'rgba(212, 175, 55, 0.05)', border: '1px solid var(--border-color)' }}>{t('shipping.footer.container_fee')}</td>
                       <td style={{ padding: '8px', border: '1px solid var(--border-color)' }}>
                          <input type="number" value={footerInfo.containerFee} onChange={e => setFooterInfo({...footerInfo, containerFee: e.target.value})} placeholder="0.00" style={{ width: '100%', background: 'transparent', border: 'none', color: 'var(--text-main)', textAlign: 'center', fontWeight: 'bold', fontSize: '1rem' }} />
                       </td>
                    </tr>

                    {/* Row 4: {t('shipping.footer.insurance')} */}
                    <tr>
                       <td colSpan={2} style={{ border: 'none' }}></td>
                       <td style={{ padding: '12px', background: 'rgba(212, 175, 55, 0.05)', border: '1px solid var(--border-color)' }}>{t('shipping.footer.insurance')}</td>
                       <td style={{ padding: '8px', border: '1px solid var(--border-color)' }}>
                          <input type="number" value={footerInfo.insurance} onChange={e => setFooterInfo({...footerInfo, insurance: e.target.value})} placeholder="0.00" style={{ width: '100%', background: 'transparent', border: 'none', color: 'var(--text-main)', textAlign: 'center', fontWeight: 'bold', fontSize: '1rem' }} />
                       </td>
                    </tr>

                    {/* Row 5: {t('shipping.footer.internal_shipping')} */}
                    <tr>
                       <td colSpan={2} style={{ border: 'none' }}></td>
                       <td style={{ padding: '12px', background: 'rgba(212, 175, 55, 0.05)', border: '1px solid var(--border-color)' }}>{t('shipping.footer.internal_shipping')}</td>
                       <td style={{ padding: '8px', border: '1px solid var(--border-color)' }}>
                          <input type="number" value={footerInfo.internalShipping} onChange={e => setFooterInfo({...footerInfo, internalShipping: e.target.value})} placeholder="0.00" style={{ width: '100%', background: 'transparent', border: 'none', color: 'var(--text-main)', textAlign: 'center', fontWeight: 'bold', fontSize: '1rem' }} />
                       </td>
                    </tr>

                    {/* Row 6: Final Total */}
                    <tr>
                       <td colSpan={2} style={{ border: 'none' }}></td>
                       <td style={{ padding: '12px', background: 'var(--accent-color)', color: '#000', border: '1px solid var(--border-color)' }} className="total-cell">{t('shipping.footer.invoice_total')}</td>
                       <td style={{ padding: '12px', background: 'rgba(212, 175, 55, 0.5)', border: '1px solid var(--border-color)', color: 'var(--accent-color)', fontSize: '1.4rem' }} className="total-cell">
                          {invoiceTotal.toLocaleString('en-US', { minimumFractionDigits: 2 })} {primaryCurrency}
                       </td>
                    </tr>
                 </tbody>
              </table>
           </div>

           {/* ─── BOTTOM DETAILS ─── */}
           <div className="inv-bottom-details" style={{ marginTop: '2rem', display: 'flex', flexDirection: 'column', gap: '0.5rem', fontWeight: 'bold', fontSize: '1.1rem' }} dir="ltr">
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', background: 'var(--surface-highlight)', padding: '10px 15px', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                 <span style={{ width: '200px' }}>{t('shipping.footer.say_total')}</span>
                 <span style={{ color: 'var(--accent-color)' }}>{invoiceTotal.toLocaleString('en-US', { minimumFractionDigits: 2 })} {primaryCurrency}</span>
                 <span style={{ margin: '0 1rem' }}>&</span>
                 <span style={{ color: 'var(--accent-color)' }}>{totalPcs} {t('shipping.footer.pcs')}</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', background: 'var(--surface-highlight)', padding: '10px 15px', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                 <span style={{ width: '200px' }}>{t('shipping.footer.container_no')}</span>
                 <input type="text" value={footerInfo.containerNo} onChange={e => setFooterInfo({...footerInfo, containerNo: e.target.value})} style={{ flex: 1, background: 'transparent', border: 'none', borderBottom: '1px dashed var(--accent-color)', color: 'var(--text-main)', fontSize: '1.1rem', fontWeight: 'bold', padding: '0 10px' }} />
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', background: 'var(--surface-highlight)', padding: '10px 15px', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                 <span style={{ width: '200px' }}>{t('shipping.footer.seal_no')}</span>
                 <input type="text" value={footerInfo.sealNo} onChange={e => setFooterInfo({...footerInfo, sealNo: e.target.value})} style={{ width: '300px', background: 'transparent', border: 'none', borderBottom: '1px dashed var(--accent-color)', color: 'var(--text-main)', fontSize: '1.1rem', fontWeight: 'bold', padding: '0 10px' }} />
              </div>
           </div>

        </div>
      </div>

      {/* ─── FETCH DIALOG ─── */}
      {showFetchDialog && (
         <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.8)', zIndex: 9999, display: 'flex', justifyContent: 'center', alignItems: 'center', backdropFilter: 'blur(5px)' }}>
            <div className="card fade-in" style={{ width: '450px', textAlign: 'center', border: '2px solid var(--accent-color)', boxShadow: '0 10px 40px rgba(212,175,55,0.2)' }}>
               <h3 style={{ marginBottom: '1rem', color: 'var(--accent-color)' }}>{t('shipping.fetch_dialog.title')}</h3>
               <p style={{ marginBottom: '2rem', fontSize: '1.2rem' }}>{t('shipping.fetch_dialog.question')}</p>
               <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center' }}>
                  <button onClick={() => validateBeforeFetch(true)} className="btn btn-primary" style={{ flex: 1, background: 'linear-gradient(135deg, var(--accent-color), #b58d27)', color: '#000', padding: '12px', fontSize: '1.1rem' }}>
                     {t('shipping.fetch_dialog.with_images')}
                  </button>
                  <button onClick={() => validateBeforeFetch(false)} className="btn btn-outline" style={{ flex: 1, padding: '12px', fontSize: '1.1rem', color: 'var(--text-main)', borderColor: 'var(--border-color)' }}>
                     {t('shipping.fetch_dialog.without_images')}
                  </button>
               </div>
               <button onClick={() => setShowFetchDialog(false)} style={{ marginTop: '1.5rem', background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', textDecoration: 'underline', fontSize: '1rem' }}>
                  {t('shipping.fetch_dialog.cancel')}
               </button>
            </div>
         </div>
      )}

      {/* ─── F9 OVERLAY ─── */}
      {showSerialsList && (
          <div 
            style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 99998 }} 
            onClick={() => { setShowSerialsList(false); setActiveF9RowId(null); setSerialSearchQuery(''); }}
          />
      )}

      {/* ─── VALIDATION MODAL ─── */}
      {showValidationModal && (
         <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.8)', zIndex: 9999, display: 'flex', justifyContent: 'center', alignItems: 'center', backdropFilter: 'blur(5px)' }}>
            <div className="card fade-in" style={{ width: '550px', border: '2px solid #ef4444', boxShadow: '0 10px 40px rgba(239, 68, 68, 0.2)' }}>
               <h3 style={{ marginBottom: '1rem', color: '#ef4444', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <AlertCircle size={24} /> {t('shipping.validation.title')}
               </h3>
               <p style={{ marginBottom: '1rem', fontSize: '1.1rem', color: 'var(--text-main)' }}>
                 {t('shipping.validation.desc')}
               </p>
               <ul style={{ background: 'var(--surface-color)', padding: '1rem', borderRadius: '8px', maxHeight: '150px', overflowY: 'auto', marginBottom: '1.5rem', listStyle: 'none' }}>
                  {invalidSerials.map((inv, idx) => (
                      <li key={idx} style={{ padding: '6px 0', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', color: '#ef4444' }}>
                          <span style={{ fontWeight: 'bold' }}>{inv.serial}</span>
                          <span style={{ fontSize: '0.85rem' }}>{inv.reason}</span>
                      </li>
                  ))}
               </ul>
               <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center' }}>
                  <button onClick={() => {
                      const badSerials = invalidSerials.map(inv => inv.serial);
                      setHighlightedSerials([]);
                      setShowValidationModal(false);
                      setTimeout(() => fetchAllData(pendingFetchOptions, badSerials, true), 0);
                  }} className="btn btn-primary" style={{ flex: 1, background: '#ef4444', color: '#fff', border: 'none', padding: '12px', fontSize: '1.1rem' }}>
                     {t('shipping.validation.remove_invalid')}
                  </button>
                  <button onClick={() => {
                      const badSerials = invalidSerials.map(inv => inv.serial);
                      setHighlightedSerials(badSerials);
                      setShowValidationModal(false);
                      setTimeout(() => fetchAllData(pendingFetchOptions, badSerials, false), 0);
                  }} className="btn btn-outline" style={{ flex: 1, padding: '12px', fontSize: '1.1rem', color: 'var(--text-main)', borderColor: 'var(--border-color)' }}>
                     {t('shipping.validation.keep_all')}
                  </button>
               </div>
            </div>
         </div>
      )}

      {/* ─── CLEAR CONFIRM MODAL ─── */}
      {showClearConfirm && (
         <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.8)', zIndex: 9999, display: 'flex', justifyContent: 'center', alignItems: 'center', backdropFilter: 'blur(5px)' }}>
            <div className="card fade-in" style={{ width: '400px', border: '2px solid #ef4444', boxShadow: '0 10px 40px rgba(239, 68, 68, 0.2)', textAlign: 'center' }}>
               <h3 style={{ marginBottom: '1rem', color: '#ef4444', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                  <AlertCircle size={32} /> {t('shipping.clear_confirm.title')}
               </h3>
               <p style={{ marginBottom: '2rem', fontSize: '1.1rem', color: 'var(--text-main)' }}>
                 {t('shipping.clear_confirm.desc')}
               </p>
               <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center' }}>
                  <button onClick={clearAllData} className="btn btn-primary" style={{ flex: 1, background: '#ef4444', color: '#fff', border: 'none', padding: '10px', fontSize: '1.1rem' }}>
                     {t('shipping.clear_confirm.confirm')}
                  </button>
                  <button onClick={() => setShowClearConfirm(false)} className="btn btn-outline" style={{ flex: 1, padding: '10px', fontSize: '1.1rem', color: 'var(--text-main)', borderColor: 'var(--border-color)' }}>
                     {t('shipping.fetch_dialog.cancel')}
                  </button>
               </div>
            </div>
         </div>
      )}
    </div>
  );
};

export default ShippingInvoice;
