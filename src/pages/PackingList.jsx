import React, { useState, useRef } from 'react';
import { supabase } from '../supabaseClient';
import { useTranslation } from 'react-i18next';
import { Printer, Plus, Trash2, Search, Package, Layers, AlertCircle, X } from 'lucide-react';
import { englishOnly } from '../utils/textUtils';
import toast from 'react-hot-toast';
import { CustomDateInput } from '../components/CustomDateInput';

const toEnglishNumbers = (str) => {
  if (str === null || str === undefined) return '';
  return str.toString().replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d));
};

const PackingList = () => {
  const { t } = useTranslation();
  const today = new Date();
  const localDate = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

  const [headerInfo, setHeaderInfo] = useState({
    companyName: 'ARABIAN FRIENDSHIP TRADING CO.,LIMITED',
    tel: 'Tel:(8620)-83265754',
    fax: 'FAX:(8620)-83265204',
    buyer: '',
    invoiceNo: '',
    branch: '',
    date: localDate
  });

  const [rows, setRows] = useState([
    { id: Date.now(), serial: '', desc: '', details: '', image: '', packages: [{ id: Date.now() + 1, cartonNo: '', cartonQty: '', packingKind: 'Pcs', qtyPerCarton: '' }] }
  ]);

  const [mixedGroups, setMixedGroups] = useState([]);

  const [footerInfo, setFooterInfo] = useState({
    containerNo: '',
    sealNo: ''
  });

  const [isExporting, setIsExporting] = useState(false);
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
    setRows([{ id: Date.now(), serial: '', desc: '', packages: [{ id: Date.now() + 1, cartonNo: '', cartonQty: '', packingKind: 'Pcs', qtyPerCarton: '' }], details: '', image: '' }]);
    setMixedGroups([]);
    setHeaderInfo(prev => ({ ...prev, buyer: '', invoiceNo: '', branch: '' }));
    setShowClearConfirm(false);
    toast.success(t('shipping.messages.clear_success'));
  };

  // Auto-calculate Totals Handlers
  const addRow = () => {
    setRows([...rows, { id: Date.now(), serial: '', desc: '', details: '', image: '', packages: [{ id: Date.now() + 1, cartonNo: '', cartonQty: '', packingKind: 'Pcs', qtyPerCarton: '' }] }]);
  };

  const removeRow = (id) => {
    if (rows.length === 1 && mixedGroups.length === 0) return;
    setRows(rows.filter(r => r.id !== id));
  };

  const handleRowChange = (id, field, value) => {
    let finalValue = value;
    if (field === 'serial') {
        finalValue = toEnglishNumbers(value);
    }
    setRows(rows.map(r => r.id === id ? { ...r, [field]: finalValue } : r));
  };

  const handlePackageChange = (rowId, pkgId, field, value) => {
    let finalValue = value;
    if (['cartonQty', 'qtyPerCarton'].includes(field)) {
        finalValue = toEnglishNumbers(value);
    }
    setRows(rows.map(r => {
      if (r.id === rowId) {
        return { ...r, packages: r.packages.map(p => p.id === pkgId ? { ...p, [field]: finalValue } : p) };
      }
      return r;
    }));
  };

  // Mixed groups are now auto-detected from receivings data (read-only)

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
      } catch (err) {
          toast.dismiss(toastId);
          toast.error(t('shipping.messages.check_error'));
      }
  };

   const fetchAllData = async (withImage, badSerialsToSkip = [], removeBadRows = false) => {
    setShowImageColumn(withImage);
    const toastId = toast.loading(t('shipping.messages.fetching_data'));
    let successCount = 0;
    let newBuyer = headerInfo.buyer;
    let newRows = [];

    // Map: serial -> { factoryId, receivedAt, cartonNumbers[], desc, image, packages[] }
    const serialCartonMap = [];
    
    // Determine the working rows
    let workingRows = [...rows];
    if (removeBadRows) {
        workingRows = workingRows.filter(r => !badSerialsToSkip.includes(r.serial.trim()));
    }

    for (let i = 0; i < workingRows.length; i++) {
        let row = workingRows[i];
        if (!row.serial.trim() || badSerialsToSkip.includes(row.serial.trim())) { newRows.push(row); continue; }
        
        try {
            const { data: orderData } = await supabase.from('orders').select('order_data').eq('serial_number', row.serial.trim()).single();
            const { data: recData } = await supabase.from('receivings').select('receive_data').eq('serial_number', row.serial.trim()).single();

            let desc = row.desc;
            let imageUrl = row.image;
            let factoryId = '';
            let receivedAt = '';
            
            if (orderData) {
                const d = orderData.order_data;
                factoryId = d.factoryId || '';
                if (withImage && d.productImages && Array.isArray(d.productImages) && d.productImages.length > 0) {
                    const firstImage = d.productImages[0];
                    imageUrl = typeof firstImage === 'object' ? firstImage.url : firstImage;
                }
                if (!newBuyer && d.buyerCompany) newBuyer = d.buyerCompany;
                if (!desc) desc = englishOnly(d.productName) || '';
            }

            if (recData && recData.receive_data) {
                receivedAt = recData.receive_data.receivedAt ? recData.receive_data.receivedAt.split('T')[0] : '';
            }

            let generatedPackages = [];
            let expandedCartons = []; // individual carton numbers for this serial
            if (recData && recData.receive_data && recData.receive_data.packages && Array.isArray(recData.receive_data.packages)) {
                const validPkgs = recData.receive_data.packages.filter(p => p.fromCtn && p.toCtn && p.pcsPerCtn);
                validPkgs.forEach((pkg, index) => {
                    const from = parseInt(pkg.fromCtn) || 0;
                    const to = parseInt(pkg.toCtn) || 0;
                    const qty = from <= to ? (to - from + 1) : 0;
                    generatedPackages.push({
                        id: Date.now() + Math.random() + index,
                        cartonNo: `${from}-${to}`,
                        cartonQty: qty > 0 ? qty.toString() : '',
                        packingKind: pkg.kind || 'Pcs',
                        qtyPerCarton: pkg.pcsPerCtn.toString()
                    });
                    for (let c = from; c <= to; c++) {
                        expandedCartons.push({ ctn: c, pcsPerCtn: pkg.pcsPerCtn.toString(), kind: pkg.kind || 'Pcs' });
                    }
                });
            }

            serialCartonMap.push({
                serial: row.serial.trim(),
                factoryId,
                receivedAt,
                expandedCartons,
                desc,
                imageUrl
            });

            newRows.push({
                id: row.id,
                serial: row.serial,
                desc: desc,
                details: row.details,
                image: imageUrl,
                packages: generatedPackages.length > 0 ? generatedPackages : row.packages
            });
            if (orderData) successCount++;
        } catch (err) {
            newRows.push(row);
        }
    }

    // ─── AUTO-DETECT MIXED CARTONS ───
    // Group by factoryId+receivedAt, then find carton numbers that appear in multiple serials
    const groupKey = (item) => `${item.factoryId}__${item.receivedAt}`;
    const factoryGroups = {};
    serialCartonMap.forEach(item => {
        if (!item.factoryId || !item.receivedAt) return;
        const key = groupKey(item);
        if (!factoryGroups[key]) factoryGroups[key] = [];
        factoryGroups[key].push(item);
    });

    const detectedMixedGroups = [];
    Object.values(factoryGroups).forEach(items => {
        if (items.length < 2) return; // need at least 2 serials to have a mix
        // Build map: cartonNumber -> [{ serial, desc, image, pcsPerCtn, kind }]
        const ctnMap = {};
        items.forEach(item => {
            item.expandedCartons.forEach(ec => {
                if (!ctnMap[ec.ctn]) ctnMap[ec.ctn] = [];
                ctnMap[ec.ctn].push({
                    serial: item.serial,
                    desc: item.desc,
                    imageUrl: item.imageUrl,
                    pcsPerCtn: ec.pcsPerCtn,
                    kind: ec.kind
                });
            });
        });
        // Find cartons with more than 1 serial
        Object.entries(ctnMap).forEach(([ctnNo, entries]) => {
            if (entries.length < 2) return;
            // Check it's actually different serials (not duplicates)
            const uniqueSerials = [...new Set(entries.map(e => e.serial))];
            if (uniqueSerials.length < 2) return;
            detectedMixedGroups.push({
                id: Date.now() + Math.random() + parseInt(ctnNo),
                cartonNo: ctnNo,
                cartonQty: '1',
                items: entries.map((e, idx) => ({
                    id: Date.now() + Math.random() + idx,
                    serial: e.serial,
                    desc: e.desc || '',
                    packingKind: e.kind || 'Pcs',
                    qtyPerCarton: e.pcsPerCtn || '',
                    details: '',
                    image: e.imageUrl || ''
                }))
            });
        });
    });

    setRows(newRows);
    setMixedGroups(detectedMixedGroups);
    
    if (!headerInfo.buyer && newBuyer) {
        setHeaderInfo(prev => ({ ...prev, buyer: newBuyer }));
    }

    if (successCount > 0) {
        const mixMsg = detectedMixedGroups.length > 0 ? ` | ${t('packing.messages.mix_detected', { count: detectedMixedGroups.length })}` : '';
        toast.success(t('packing.messages.fetch_success', { count: successCount, mixMsg }), { id: toastId });
    } else {
        toast.error(t('shipping.messages.fetch_no_data'), { id: toastId });
    }
  };

  // ─── CALCULATIONS ON THE FLY ───
  const serialTotals = {};
  let totalCtn = 0;
  let totalPcs = 0;
  let uniqueSerials = new Set();

  rows.forEach(r => {
      const s = r.serial.trim();
      let rowQty = 0;
      r.packages = r.packages || [];
      r.packages.forEach(p => {
          const c = parseFloat(p.cartonQty) || 0;
          const q = parseFloat(p.qtyPerCarton) || 0;
          const itemQty = c * q;
          totalCtn += c;
          totalPcs += itemQty;
          rowQty += itemQty;
      });
      if (s) {
          uniqueSerials.add(s);
          serialTotals[s] = (serialTotals[s] || 0) + rowQty;
      }
  });

  mixedGroups.forEach(g => {
      const c = parseFloat(g.cartonQty) || 0;
      totalCtn += c;
      g.items.forEach(item => {
          const q = parseFloat(item.qtyPerCarton) || 0;
          const itemQty = c * q;
          totalPcs += itemQty;
          const s = item.serial.trim();
          if (s) {
              uniqueSerials.add(s);
              serialTotals[s] = (serialTotals[s] || 0) + itemQty;
          }
      });
  });

  const exportToPDF = () => {
    window.print();
  };

  return (
    <div className="fade-in" style={{ paddingBottom: '4rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
        <div>
          <h1 style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', fontSize: '2.2rem', margin: 0, color: 'var(--text-strong)' }}>
            <Package size={40} color="var(--accent-color)" />
            {t('packing.title')}
          </h1>
          <p style={{ color: 'var(--text-muted)', margin: '0.5rem 0 0', paddingRight: '3.5rem' }}>
            {t('packing.subtitle')}
          </p>
        </div>
        <button onClick={exportToPDF} className="btn btn-primary" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: 'var(--accent-color)', color: '#000', padding: '10px 20px', fontSize: '1.1rem', border: 'none' }}>
          <Printer size={20} /> {t('packing.print_btn')}
        </button>
      </div>

      <div className="card" style={{ padding: '0', overflow: 'hidden', border: 'none', background: 'var(--surface-color)', boxShadow: '0 8px 30px rgba(0,0,0,0.12)' }}>
        
        {/* Print Styles */}
        <style>
          {`
            @media print {
              @page { size: portrait; margin: 6mm 8mm; }
              *, *::before, *::after { box-sizing: border-box; }
              body, html {
                background: #fff !important; color: #000 !important;
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
              .pl-header {
                border-bottom: 2px solid #000 !important;
                padding: 6px 10px !important;
                background: #fff !important;
              }
              .pl-header input { font-size: 13px !important; color: #000 !important; }
              .pl-header .pl-tel input { font-size: 10px !important; }
              .pl-meta {
                padding: 4px 10px !important; gap: 6px !important;
                background: #fff !important; border: none !important;
              }
              .pl-meta label { font-size: 8px !important; color: #000 !important; margin-bottom: 1px !important; }
              .pl-meta input, .pl-meta .form-control {
                font-size: 10px !important; padding: 2px 4px !important;
                border: 1px solid #000 !important; color: #000 !important;
                background: #fff !important; min-height: unset !important; height: auto !important;
              }
              .pl-title { font-size: 14px !important; margin: 4px 0 !important; }
              .pl-table { font-size: 9px !important; table-layout: auto !important; }
              .pl-table th {
                padding: 3px 2px !important; font-size: 7.5px !important;
                background: #d9e6f0 !important; -webkit-print-color-adjust: exact; print-color-adjust: exact;
                border: 1px solid #000 !important; color: #000 !important;
                white-space: normal !important;
              }
              .pl-table td {
                padding: 2px 3px !important; border: 1px solid #000 !important; color: #000 !important;
                white-space: normal !important; word-wrap: break-word !important; overflow-wrap: break-word !important;
              }
              .pl-table input {
                font-size: 9px !important; color: #000 !important;
                padding: 0 !important; height: auto !important; min-height: unset !important;
                white-space: normal !important; overflow: visible !important;
              }
              .pl-table img { width: 35px !important; height: 45px !important; }
              .pl-table .pl-total-row td {
                padding: 4px 6px !important; font-size: 10px !important;
                background: #d9e6f0 !important; -webkit-print-color-adjust: exact; print-color-adjust: exact;
              }
              .pl-table .pl-mixed-hdr td {
                background: #a8d5f2 !important; -webkit-print-color-adjust: exact; print-color-adjust: exact;
                font-size: 8px !important; padding: 3px !important;
              }
              .pl-bottom { font-size: 10px !important; gap: 2px !important; margin-top: 6px !important; }
              .pl-bottom > div {
                padding: 3px 8px !important; border-radius: 0 !important;
                background: #fff !important; border: 1px solid #000 !important;
              }
              .pl-bottom input { font-size: 10px !important; color: #000 !important; }
            }
          `}
        </style>

      <div id="invoice-print-area" style={{ 
          background: 'var(--surface-color)', 
          border: '2px solid var(--accent-color)', 
          borderRadius: '16px', 
          overflow: 'hidden',
          boxShadow: '0 10px 30px rgba(0,0,0,0.5)',
          color: 'var(--text-main)'
      }}>
           
           {/* ─── HEADER ─── */}
           <div className="pl-header" style={{ 
               background: 'var(--surface-highlight)', 
               borderBottom: '2px solid var(--accent-color)',
               padding: '1.5rem',
               textAlign: 'center'
           }}>
              <input 
                type="text" 
                value={headerInfo.companyName} 
                onChange={e => setHeaderInfo({...headerInfo, companyName: e.target.value})}
                style={{ width: '100%', textAlign: 'center', background: 'transparent', border: 'none', fontSize: '1.6rem', fontWeight: '900', color: 'var(--text-main)', marginBottom: '0.5rem' }}
              />
              <div className="pl-tel" style={{ display: 'flex', justifyContent: 'center', gap: '2rem' }}>
                 <div style={{ color: 'var(--text-muted)', fontWeight: 'bold' }}>{t('packing.header.tel')} <input type="text" value={headerInfo.tel} onChange={e => setHeaderInfo({...headerInfo, tel: e.target.value})} style={{ background: 'transparent', border: 'none', color: 'inherit', fontWeight: 'inherit', direction: 'ltr', outline: 'none', width: '140px' }} /></div>
                 <div style={{ color: 'var(--text-muted)', fontWeight: 'bold' }}>{t('packing.header.fax')} <input type="text" value={headerInfo.fax} onChange={e => setHeaderInfo({...headerInfo, fax: e.target.value})} style={{ background: 'transparent', border: 'none', color: 'inherit', fontWeight: 'inherit', direction: 'ltr', outline: 'none', width: '140px' }} /></div>
              </div>
           </div>

           <div style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div className="pl-meta" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1rem', background: 'rgba(212, 175, 55, 0.05)', padding: '1rem', borderRadius: '8px', border: '1px solid rgba(212, 175, 55, 0.2)' }}>
                 <div>
                    <label style={{ fontSize: '0.85rem', color: 'var(--accent-color)', fontWeight: 'bold', display: 'block', marginBottom: '4px' }}>{t('packing.header.buyer')}</label>
                    <input type="text" className="form-control" value={headerInfo.buyer} onChange={e => setHeaderInfo({...headerInfo, buyer: e.target.value})} style={{ background: 'var(--bg-color)' }} />
                 </div>
                 <div>
                    <label style={{ fontSize: '0.85rem', color: 'var(--accent-color)', fontWeight: 'bold', display: 'block', marginBottom: '4px' }}>{t('packing.header.invoice_no')}</label>
                    <input type="text" className="form-control" value={headerInfo.invoiceNo} onChange={e => setHeaderInfo({...headerInfo, invoiceNo: toEnglishNumbers(e.target.value)})} style={{ background: 'var(--bg-color)' }} />
                 </div>
                 <div>
                    <label style={{ fontSize: '0.85rem', color: 'var(--accent-color)', fontWeight: 'bold', display: 'block', marginBottom: '4px' }}>{t('packing.header.branch')}</label>
                    <input type="text" className="form-control" value={headerInfo.branch} onChange={e => setHeaderInfo({...headerInfo, branch: e.target.value})} style={{ background: 'var(--bg-color)' }} />
                 </div>
                 <div style={{ position: 'relative' }}>
                    <label style={{ fontSize: '0.85rem', color: 'var(--accent-color)', fontWeight: 'bold', display: 'block', marginBottom: '4px' }}>{t('packing.header.date')}</label>
                    <CustomDateInput 
                      value={headerInfo.date} 
                      onChange={val => setHeaderInfo({...headerInfo, date: val})}
                    />
                 </div>
              </div>

              <h2 className="pl-title" style={{ textAlign: 'center', margin: '1rem 0', fontSize: '1.8rem', color: 'var(--text-strong)' }}>{t('packing.header.list_title')}</h2>

           {/* ─── INVOICE TABLE ─── */}
           <div style={{ overflowX: 'auto' }}>
             <table className="pl-table" style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'center', fontSize: '0.9rem' }}>
               <thead>
                 <tr style={{ background: 'var(--surface-highlight)', borderBottom: '2px solid var(--accent-color)' }}>
                   <th style={{ padding: '10px 5px', border: '1px solid var(--border-color)', width: '40px' }}>{t('packing.table.cols.no')}</th>
                   <th style={{ padding: '10px 5px', border: '1px solid var(--border-color)', width: '80px' }}>{t('packing.table.cols.carton_no')}<br/><span style={{fontSize:'0.75rem', color:'var(--text-muted)'}}>{t('packing.table.cols.carton_no_ar')}</span></th>
                   <th style={{ padding: '10px 5px', border: '1px solid var(--border-color)', width: '100px' }}>{t('packing.table.cols.item_no')}<br/><span style={{fontSize:'0.75rem', color:'var(--text-muted)'}}>{t('packing.table.cols.item_no_ar')}</span></th>
                   <th style={{ padding: '10px 5px', border: '1px solid var(--border-color)' }}>{t('packing.table.cols.desc')}<br/><span style={{fontSize:'0.75rem', color:'var(--text-muted)'}}>{t('packing.table.cols.desc_ar')}</span></th>
                   <th style={{ padding: '10px 5px', border: '1px solid var(--border-color)', width: '60px' }}>{t('packing.table.cols.carton_qty')}<br/><span style={{fontSize:'0.75rem', color:'var(--text-muted)'}}>{t('packing.table.cols.carton_qty_ar')}</span></th>
                   <th style={{ padding: '10px 5px', border: '1px solid var(--border-color)', width: '60px' }}>{t('packing.table.cols.packing_kind')}<br/><span style={{fontSize:'0.75rem', color:'var(--text-muted)'}}>{t('packing.table.cols.packing_kind_ar')}</span></th>
                   <th style={{ padding: '10px 5px', border: '1px solid var(--border-color)', width: '60px' }}>{t('packing.table.cols.qty_per_ctn')}<br/><span style={{fontSize:'0.75rem', color:'var(--text-muted)'}}>{t('packing.table.cols.qty_per_ctn_ar')}</span></th>
                   <th style={{ padding: '10px 5px', border: '1px solid var(--border-color)', width: '60px' }}>{t('packing.table.cols.item_qty')}<br/><span style={{fontSize:'0.75rem', color:'var(--text-muted)'}}>{t('packing.table.cols.item_qty_ar')}</span></th>
                   <th style={{ padding: '10px 5px', border: '1px solid var(--border-color)', width: '60px' }}>{t('packing.table.cols.total_item_qty')}<br/><span style={{fontSize:'0.75rem', color:'var(--text-muted)'}}>{t('packing.table.cols.total_item_qty_ar')}</span></th>
                   {showImageColumn ? (
                       <th style={{ padding: '10px 5px', border: '1px solid var(--border-color)', width: '80px' }}>{t('packing.table.cols.image')}<br/><span style={{fontSize:'0.75rem', color:'var(--text-muted)'}}>{t('packing.table.cols.image_ar')}</span></th>
                   ) : (
                       <th style={{ padding: '10px 5px', border: '1px solid var(--border-color)' }}>{t('packing.table.cols.details')}<br/><span style={{fontSize:'0.75rem', color:'var(--text-muted)'}}>{t('packing.table.cols.details_ar')}</span></th>
                   )}
                   <th className="no-print" style={{ padding: '10px 5px', width: '40px', border: '1px solid var(--border-color)' }}></th>
                 </tr>
               </thead>
               <tbody>
                 {rows.map((row, index) => {
                    const totalItemQty = serialTotals[row.serial.trim()] || 0;
                    const packagesToRender = (row.packages && row.packages.length > 0) ? row.packages : [{ id: 'fallback_' + row.id, cartonNo: '', cartonQty: '', packingKind: 'Pcs', qtyPerCarton: '' }];

                    return (
                        <React.Fragment key={row.id}>
                            {packagesToRender.map((pkg, pIndex) => {
                                const isFirst = pIndex === 0;
                                const c = parseFloat(pkg.cartonQty) || 0;
                                const q = parseFloat(pkg.qtyPerCarton) || 0;
                                const itemQty = c * q;

                                return (
                                    <tr key={pkg.id} style={{ background: index % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.02)', transition: 'background-color 0.2s' }}>
                                        {isFirst && (
                                            <td rowSpan={packagesToRender.length} style={{ border: '1px solid var(--border-color)', padding: '5px', fontWeight: 'bold' }}>{index + 1}</td>
                                        )}
                                        <td style={{ border: '1px solid var(--border-color)', padding: '5px' }}>
                                            <input type="text" value={pkg.cartonNo} onChange={e => handlePackageChange(row.id, pkg.id, 'cartonNo', e.target.value)} style={{ width: '100%', background: 'transparent', border: 'none', textAlign: 'center', fontWeight: 'bold', outline: 'none', color: 'var(--text-main)' }} />
                                        </td>
                                        {isFirst && (
                                          <td rowSpan={packagesToRender.length} style={{ border: '1px solid var(--border-color)', padding: '5px', position: 'relative' }}>
                                            <input 
                                              className="serial-input"
                                              type="text" 
                                              value={row.serial} 
                                              onChange={e => handleRowChange(row.id, 'serial', e.target.value)}
                                              onKeyDown={e => handleSerialKeyDown(e, row.id)}
                                              placeholder={t('packing.table.serial_placeholder')}
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
                                                    <span style={{ fontSize: '0.85rem', fontWeight: 'bold' }}>{t('entry.actions.select_saved_model')}</span>
                                                    <button onClick={() => { setShowSerialsList(false); setSerialSearchQuery(''); setActiveF9RowId(null); }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-color)', padding: 0, display: 'flex', alignItems: 'center' }}>
                                                       <X size={16} />
                                                    </button>
                                                </div>
                                                <div style={{ padding: '0.5rem', borderBottom: '1px solid var(--border-color)', backgroundColor: 'var(--bg-color)' }}>
                                                  <input
                                                    ref={serialSearchRef}
                                                    type="text"
                                                    placeholder={t('entry.actions.search_serial_placeholder')}
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
                                                    <div style={{ padding: '1rem', textAlign: 'center', fontSize: '0.85rem', color: 'var(--text-muted)' }}>{t('entry.actions.loading')}</div>
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
                                        )}
                                        {isFirst && (
                                            <td rowSpan={packagesToRender.length} style={{ border: '1px solid var(--border-color)', padding: '5px' }}>
                                                <input type="text" value={row.desc} onChange={e => handleRowChange(row.id, 'desc', e.target.value)} style={{ width: '100%', background: 'transparent', border: 'none', textAlign: 'center', fontWeight: 'bold', outline: 'none', color: 'var(--text-main)' }} />
                                            </td>
                                        )}
                                        <td style={{ border: '1px solid var(--border-color)', padding: '5px' }}>
                                            <input type="number" value={pkg.cartonQty} onChange={e => handlePackageChange(row.id, pkg.id, 'cartonQty', e.target.value)} style={{ width: '100%', background: 'transparent', border: 'none', textAlign: 'center', fontWeight: 'bold', outline: 'none', color: 'var(--text-main)' }} />
                                        </td>
                                        <td style={{ border: '1px solid var(--border-color)', padding: '5px' }}>
                                            <input type="text" value={pkg.packingKind} onChange={e => handlePackageChange(row.id, pkg.id, 'packingKind', e.target.value)} style={{ width: '100%', background: 'transparent', border: 'none', textAlign: 'center', outline: 'none', color: 'var(--text-main)' }} />
                                        </td>
                                        <td style={{ border: '1px solid var(--border-color)', padding: '5px' }}>
                                            <input type="number" value={pkg.qtyPerCarton} onChange={e => handlePackageChange(row.id, pkg.id, 'qtyPerCarton', e.target.value)} style={{ width: '100%', background: 'transparent', border: 'none', textAlign: 'center', outline: 'none', color: 'var(--text-main)' }} />
                                        </td>
                                        <td style={{ border: '1px solid var(--border-color)', padding: '5px', fontWeight: 'bold', color: 'var(--text-main)' }}>
                                            {itemQty > 0 ? itemQty : ''}
                                        </td>
                                        {isFirst && (
                                            <td rowSpan={packagesToRender.length} style={{ border: '1px solid var(--border-color)', padding: '5px', fontWeight: 'bold', color: 'var(--accent-color)' }}>
                                                {totalItemQty > 0 ? totalItemQty : ''}
                                            </td>
                                        )}
                                        {isFirst && (
                                            showImageColumn ? (
                                                <td rowSpan={packagesToRender.length} style={{ border: '1px solid var(--border-color)', padding: '2px', textAlign: 'center' }}>
                                                    {row.image && <img src={row.image} alt="Item" style={{ width: '50px', height: '60px', objectFit: 'contain' }} />}
                                                </td>
                                            ) : (
                                                <td rowSpan={packagesToRender.length} style={{ border: '1px solid var(--border-color)', padding: '5px' }}>
                                                    <input type="text" value={row.details} onChange={e => handleRowChange(row.id, 'details', e.target.value)} style={{ width: '100%', background: 'transparent', border: 'none', textAlign: 'center', outline: 'none', color: 'var(--text-main)' }} />
                                                </td>
                                            )
                                        )}
                                        {isFirst && (
                                            <td rowSpan={packagesToRender.length} className="no-print" style={{ border: '1px solid var(--border-color)', padding: '5px', textAlign: 'center' }}>
                                                <button onClick={() => removeRow(row.id)} style={{ background: 'rgba(239, 68, 68, 0.1)', border: 'none', color: '#ef4444', padding: '4px', borderRadius: '4px', cursor: 'pointer' }}>
                                                    <Trash2 size={14} />
                                                </button>
                                            </td>
                                        )}
                                    </tr>
                                );
                            })}
                        </React.Fragment>
                    );
                 })}
                 
                 {/* ─── MIXED CARTONS GROUPS ─── */}
                 {mixedGroups.length > 0 && (
                     <tr className="pl-mixed-hdr">
                         <td colSpan={showImageColumn ? 11 : 11} style={{ border: '2px solid var(--border-color)', background: 'rgba(239, 68, 68, 0.1)', padding: '5px', textAlign: 'center', color: '#ef4444', fontWeight: 'bold' }}>
                            {t('packing.table.mixed_header')}
                         </td>
                     </tr>
                 )}

                 {mixedGroups.map((group, gIndex) => {
                     const c = parseFloat(group.cartonQty) || 0;
                     let totalGroupQty = 0;
                     group.items.forEach(i => {
                         totalGroupQty += c * (parseFloat(i.qtyPerCarton) || 0);
                     });

                     return (
                         <React.Fragment key={group.id}>
                             {group.items.map((item, iIndex) => {
                                 const isFirst = iIndex === 0;
                                 const itemQty = c * (parseFloat(item.qtyPerCarton) || 0);
                                 
                                 return (
                                     <tr key={item.id} style={{ background: iIndex % 2 === 0 ? 'rgba(255,255,255,0.01)' : 'transparent', transition: 'background-color 0.2s' }}>
                                         {isFirst ? (
                                             <td rowSpan={group.items.length} style={{ border: '1px solid var(--border-color)', padding: '5px', fontWeight: 'bold', background: 'var(--surface-highlight)' }}>
                                                -
                                             </td>
                                         ) : null}
                                         {isFirst ? (
                                             <td rowSpan={group.items.length} style={{ border: '1px solid var(--border-color)', padding: '5px', background: 'var(--surface-highlight)' }}>
                                                <span style={{ fontWeight: 'bold', color: 'var(--accent-color)' }}>{group.cartonNo}</span>
                                             </td>
                                         ) : null}
                                         
                                         <td style={{ border: '1px solid var(--border-color)', padding: '5px' }}>
                                             <span style={{ fontWeight: 'bold', color: 'var(--text-main)' }}>{item.serial}</span>
                                         </td>
                                         <td style={{ border: '1px solid var(--border-color)', padding: '5px' }}>
                                             <span style={{ fontWeight: 'bold', color: 'var(--text-main)' }}>{item.desc}</span>
                                         </td>

                                         {isFirst ? (
                                             <td rowSpan={group.items.length} style={{ border: '1px solid var(--border-color)', padding: '5px', background: 'var(--surface-highlight)' }}>
                                                <span style={{ fontWeight: 'bold', color: 'var(--text-main)' }}>{group.cartonQty}</span>
                                             </td>
                                         ) : null}

                                         <td style={{ border: '1px solid var(--border-color)', padding: '5px' }}>
                                             <span style={{ color: 'var(--text-main)' }}>{item.packingKind}</span>
                                         </td>
                                         <td style={{ border: '1px solid var(--border-color)', padding: '5px' }}>
                                             <span style={{ fontWeight: 'bold', color: 'var(--text-main)' }}>{item.qtyPerCarton}</span>
                                         </td>
                                         <td style={{ border: '1px solid var(--border-color)', padding: '5px', fontWeight: 'bold' }}>
                                             {itemQty > 0 ? itemQty : ''}
                                         </td>

                                         {isFirst ? (
                                             <td rowSpan={group.items.length} style={{ border: '1px solid var(--border-color)', padding: '5px', fontWeight: 'bold', background: 'var(--surface-highlight)', verticalAlign: 'middle' }}>
                                                {totalGroupQty > 0 ? totalGroupQty : ''}
                                             </td>
                                         ) : null}

                                         {showImageColumn ? (
                                             <td style={{ border: '1px solid var(--border-color)', padding: '2px', textAlign: 'center' }}>
                                                 {item.image && <img src={item.image} alt="Item" style={{ width: '50px', height: '60px', objectFit: 'contain' }} />}
                                             </td>
                                         ) : (
                                             <td style={{ border: '1px solid var(--border-color)', padding: '5px' }}>
                                                 <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>{item.details}</span>
                                             </td>
                                         )}

                                          {isFirst && (
                                         <td rowSpan={group.items.length} className="no-print" style={{ border: '1px solid var(--border-color)', padding: '5px', textAlign: 'center' }}>
                                              <span style={{ fontSize: '0.7rem', color: '#10b981', fontWeight: 'bold' }}>{t('receiving.table.auto')} ✓</span>
                                         </td>
                                         )}
                                     </tr>
                                 );
                             })}
                         </React.Fragment>
                     );
                 })}

                 {/* ─── TOTALS ROW ─── */}
                 <tr className="pl-total-row" style={{ background: 'var(--surface-highlight)', border: '2px solid var(--accent-color)', fontWeight: 'bold', fontSize: '1.2rem', color: 'var(--text-strong)' }}>
                    <td colSpan={3} style={{ padding: '12px', border: '1px solid var(--border-color)', background: 'rgba(212, 175, 55, 0.1)', color: 'var(--text-strong)' }}>{t('packing.footer.total')}</td>
                    <td style={{ padding: '12px', border: '1px solid var(--border-color)' }}>{uniqueSerials.size} {t('shipping.footer.items')}</td>
                    <td colSpan={3} style={{ padding: '12px', border: '1px solid var(--border-color)' }}>{totalCtn} {t('shipping.footer.ctn', { defaultValue: 'CTN' })}</td>
                    <td colSpan={4} style={{ padding: '12px', border: '1px solid var(--border-color)' }}>{totalPcs} {t('shipping.footer.pcs')}</td>
                 </tr>

               </tbody>
             </table>
           </div>

           {!isExporting && (
             <div className="no-print" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', marginTop: '1.5rem', gap: '1rem', flexWrap: 'wrap' }}>
                <button onClick={addRow} className="btn btn-outline" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--accent-color)', borderColor: 'var(--accent-color)' }}>
                   <Plus size={18} /> {t('shipping.actions.add_row')}
                </button>
                <button onClick={() => setShowFetchDialog(true)} className="btn btn-primary" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: 'linear-gradient(to right, #10b981, #059669)', border: 'none', padding: '10px 24px' }}>
                   <Search size={18} /> {t('shipping.actions.fetch_all')}
                </button>
                <button onClick={() => setShowClearConfirm(true)} className="btn btn-outline" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#ef4444', borderColor: '#ef4444' }}>
                   <Trash2 size={18} /> {t('shipping.actions.clear_all')}
                </button>
             </div>
           )}

           {/* ─── BOTTOM DETAILS ─── */}
           <div className="pl-bottom" style={{ marginTop: '2rem', display: 'flex', flexDirection: 'column', gap: '0.5rem', fontWeight: 'bold', fontSize: '1.1rem' }} dir="ltr">
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', background: 'var(--surface-highlight)', padding: '10px 15px', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                 <span style={{ width: '300px', color: 'var(--text-main)' }}>{t('packing.footer.summary_label')}</span>
                 <span style={{ padding: '0 15px', color: 'var(--accent-color)' }}>{totalCtn} {t('shipping.footer.ctn', { defaultValue: 'CTN' })}</span>
                 <span style={{ margin: '0 1rem', color: 'var(--text-muted)' }}>&</span>
                 <span style={{ padding: '0 15px', color: 'var(--accent-color)' }}>{totalPcs} {t('shipping.footer.pcs')}</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', background: 'var(--surface-highlight)', padding: '10px 15px', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                 <span style={{ width: '200px', color: 'var(--text-main)' }}>{t('packing.footer.container_no')}</span>
                 <input type="text" value={footerInfo.containerNo} onChange={e => setFooterInfo({...footerInfo, containerNo: e.target.value})} style={{ flex: 1, background: 'transparent', border: 'none', borderBottom: '1px dashed var(--accent-color)', color: 'var(--text-main)', fontSize: '1.1rem', fontWeight: 'bold', padding: '0 10px', outline: 'none' }} />
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', background: 'var(--surface-highlight)', padding: '10px 15px', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                 <span style={{ width: '200px', color: 'var(--text-main)' }}>{t('packing.footer.seal_no')}</span>
                 <input type="text" value={footerInfo.sealNo} onChange={e => setFooterInfo({...footerInfo, sealNo: e.target.value})} style={{ width: '300px', background: 'transparent', border: 'none', borderBottom: '1px dashed var(--accent-color)', color: 'var(--text-main)', fontSize: '1.1rem', fontWeight: 'bold', padding: '0 10px', outline: 'none' }} />
              </div>
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

export default PackingList;
