import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { supabase } from '../supabaseClient';
import toast from 'react-hot-toast';
import { Search, Printer, FileText, CheckCircle2, DownloadCloud, X } from 'lucide-react';
import { useAppData } from '../context/AppDataContext';
import { useAuth } from '../context/AuthContext';
import { englishOnly, chineseOnly } from '../utils/textUtils';

const ExportOrder = () => {
  const { t } = useTranslation();
  const { lookups } = useAppData();
  const { user, hasPermission } = useAuth();
  
  const [searchTerm, setSearchTerm] = useState('');
  const [order, setOrder] = useState(null);

  // F9 Search States
  const [showSerialsList, setShowSerialsList] = useState(false);
  const [availableSerials, setAvailableSerials] = useState([]);
  const [serialSearchQuery, setSerialSearchQuery] = useState('');
  const [fetchingSerials, setFetchingSerials] = useState(false);
  const serialSearchRef = React.useRef(null);
  
  const formatDate = (dateStr) => {
    if (!dateStr) return '-';
    const parts = dateStr.split('-');
    if (parts.length === 3) {
      const [year, month, day] = parts;
      return `${day}/${month}/${year}`;
    }
    return dateStr;
  };

  const handleFetch = async (overrideSerial) => {
    const termToSearch = typeof overrideSerial === 'string' ? overrideSerial : searchTerm;
    if (!termToSearch.trim()) {
      toast.error(t('export.messages.enter_serial'));
      return;
    }
    setSearchTerm(termToSearch);
    const toastId = toast.loading(t('export.messages.searching'));
    try {
      const { data, error } = await supabase
        .from('orders')
        .select('*')
        .ilike('serial_number', termToSearch.trim())
        .single();

      if (error || !data) {
        toast.error(t('export.messages.not_found'), { id: toastId });
        setOrder(null);
      } else {
        const orderData = data.order_data;
        
        // Data-Level Authorization Check
        if (user && user.role !== 'admin') {
          const allowedFactories = user.permissions?.allowed_factories || [];
          const allowedCompanies = user.permissions?.allowed_companies || [];
          
          if (allowedFactories.length > 0 && !allowedFactories.includes(orderData.factoryId)) {
             toast.error(t('auth.messages.unauthorized', { defaultValue: 'غير مصرح لك بمشاهدة طلبات هذا المصنع' }), { id: toastId });
             setOrder(null);
             return;
          }
          if (allowedCompanies.length > 0 && !allowedCompanies.includes(orderData.buyerCompany)) {
             toast.error(t('auth.messages.unauthorized', { defaultValue: 'غير مصرح لك بمشاهدة طلبات هذه الشركة' }), { id: toastId });
             setOrder(null);
             return;
          }
        }
        
        toast.success(t('export.messages.fetch_success'), { id: toastId });
        setSearchTerm(data.serial_number);
        setOrder({ serialNumber: data.serial_number, ...orderData });
      }
    } catch {
      toast.error(t('export.messages.connection_error'), { id: toastId });
    }
  };

  const handleF9Press = async (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleFetch();
    } else if (e.key === 'F9') {
      e.preventDefault();
      if (showSerialsList || fetchingSerials) return;
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

  const handleDownloadPDF = async () => {
    if (!order) return;
    const element = document.getElementById('export-doc');
    const toastId = toast.loading(t('export.messages.preparing_pdf'));
    
    // Backup and normalize element styles for a clean, flat PDF capture
    const originalShadow = element.style.boxShadow;
    element.style.boxShadow = 'none';

    const filename = `Order_${order.serialNumber || 'Export'}.pdf`;

    try {
       // Capture entire element as a single canvas image
       const { default: html2canvas } = await import('html2canvas');
       const { default: jsPDF } = await import('jspdf');

       const canvas = await html2canvas(element, {
         scale: 2,
         useCORS: true,
         logging: false,
       });

       const imgData = canvas.toDataURL('image/jpeg', 1.0);
       const imgWidthPx = canvas.width;
       const imgHeightPx = canvas.height;

       // A4 width in mm = 297 (landscape)
       const pdfWidthMM = 297;
       const margin = 8; // mm margin on each side
       const contentWidthMM = pdfWidthMM - margin * 2;
       // Calculate height proportionally to fit all content on one page
       const contentHeightMM = (imgHeightPx * contentWidthMM) / imgWidthPx;
       const pdfHeightMM = contentHeightMM + margin * 2;

       // Create PDF with custom page size that fits all content
       const pdf = new jsPDF({
         orientation: 'landscape',
         unit: 'mm',
         format: [pdfWidthMM, pdfHeightMM],
       });

       pdf.addImage(imgData, 'JPEG', margin, margin, contentWidthMM, contentHeightMM);

       const pdfBlob = pdf.output('blob');
       const blobUrl = URL.createObjectURL(new Blob([pdfBlob], { type: 'application/pdf' }));
       const link = document.createElement('a');
       link.href = blobUrl;
       link.download = filename;
       document.body.appendChild(link);
       link.click();
       document.body.removeChild(link);
       setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
       
       toast.success(t('export.messages.download_success'), { id: toastId });
    } catch (err) {
       toast.error(t('export.messages.download_error'), { id: toastId });
       console.error(err);
    } finally {
       element.style.boxShadow = originalShadow;
    }
  };

  const getFactoryDetails = (factoryId) => {
    const factory = Array.isArray(lookups.factories) ? lookups.factories.find(f => (f.name === factoryId || f === factoryId)) : null;
    if (factory && typeof factory === 'object') {
      return { name: factory.name || '', mobile: factory.mobile || '', address: factory.address || '', code: factory.code || '' };
    }
    return { name: factoryId || '', mobile: '', address: '', code: '' };
  };

  const factoryInfo = order ? getFactoryDetails(order.factoryId) : {};
  const activeColors = order && order.colorDistribution ? Object.keys(order.colorDistribution) : [];
  
  // Calculate specific sizes to show
  let activeSizesSet = new Set();
  if (order && order.colorDistribution) {
     activeColors.forEach(color => {
         Object.keys(order.colorDistribution[color] || {}).forEach(size => activeSizesSet.add(size));
     });
  }
  const sizeOrderArr = ['XXS', 'XS', 'S', 'M', 'L', 'XL', 'XXL', 'XXXL', '2XL', '3XL', '4XL', '5XL', 'F', 'FREE'];
  const sizesToRender = Array.from(activeSizesSet).sort((a, b) => {
      const ai = sizeOrderArr.indexOf(a.toUpperCase());
      const bi = sizeOrderArr.indexOf(b.toUpperCase());
      if (ai !== -1 && bi !== -1) return ai - bi;
      if (ai !== -1) return -1;
      if (bi !== -1) return 1;
      
      // Attempt numeric sort
      const numA = parseFloat(a);
      const numB = parseFloat(b);
      if (!isNaN(numA) && !isNaN(numB)) {
          return numA - numB;
      }
      
      // Fallback to string sort
      return a.localeCompare(b);
  });

  // Find Trademark Image
  const tmObj = order ? lookups.tradeMarks?.find(t => (typeof t === 'object' ? t.name : t) === order.tradeMark) : null;
  const tmImage = tmObj?.imageUrl || null;

  return (
    <div className="fade-in">
      <style>{`
        @media print {
          @page { size: landscape; margin: 5mm; }
          body * { visibility: hidden; }
          .app-container, .main-content { margin:0!important; padding:0!important; background:white!important; }
          .print-doc, .print-doc * { visibility: visible; }
          .print-doc {
            position: absolute; left:0; top:0; width:100%;
            background:#fff!important; padding:0!important;
            box-shadow:none!important; border:none!important;
            max-width:none!important; border-radius:0!important;
            zoom: 0.95;
          }
          html, body { min-height: auto !important; height: auto !important; padding: 0 !important; margin: 0 !important; }
          .no-print { display:none!important; }
          .hdr-blue, .hdr-grey, .hdr-light, .title-cell, .bg-cyan { 
            -webkit-print-color-adjust: exact !important; 
            print-color-adjust: exact !important; 
          }
        }

        .print-doc {
          background:#fff; color:#000; padding:10px; border-radius:8px;
          max-width:1400px; margin:0 auto; box-shadow:0 8px 30px rgba(0,0,0,0.45);
          font-family:'Inter','Tajawal',sans-serif;
        }

        .inv-table-new {
          width: 100%;
          border-collapse: collapse;
          border: 3px solid #000;
          table-layout: auto;
          background: #fff;
        }
        .inv-table-new th, .inv-table-new td {
          border: 1px solid #000;
          padding: 6px 4px;
          word-wrap: break-word;
          white-space: normal;
          line-height: 1.3;
        }
        
        /* Headers */
        .hdr-blue {
          background-color: #1a5276 !important;
          color: #fff !important;
          font-weight: 800;
          text-align: center;
          font-size: 15px;
        }
        .hdr-grey {
          background-color: #d5dbdb !important;
          color: #000 !important;
          font-weight: 800;
          text-align: center;
          font-size: 15px;
        }
        .hdr-light {
          background-color: #f2f2f2 !important;
          color: #000 !important;
          font-weight: 800;
          text-align: center;
          font-size: 14px;
        }
        .title-cell {
          background-color: #1a5276 !important;
          color: #fff !important;
          text-align: center;
          vertical-align: middle;
        }
        
        /* Values */
        .val-center {
          text-align: center;
          font-size: 15px;
          vertical-align: middle;
        }
        .val-left {
          text-align: left;
          font-size: 15px;
          vertical-align: middle;
        }
        .val-bold {
          font-weight: 800;
          color: #000;
        }
        .bg-cyan {
          background-color: #dcf4f5 !important;
        }
        .bg-light-blue {
          background-color: #eaf2f8 !important;
        }
      `}</style>

      {/* Control Navigation - No Print */}
      <div className="card no-print" style={{ marginBottom: '2rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-end', flex: 1, flexWrap: 'wrap' }}>
          <div className="form-group" style={{ marginBottom: 0, flex: 1, maxWidth: '300px' }}>
            <label className="form-label">{t('export.fetch_label')}</label>
            <div style={{ display: 'flex', gap: '0.5rem', position: 'relative' }}>
              <input 
                type="text" 
                id="fetchSerialInput"
                className="form-control" 
                placeholder={t('export.fetch_placeholder')} 
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                onKeyDown={handleF9Press}
                autoComplete="off"
              />
              <button
                className="inline-f9-btn"
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  const input = document.getElementById('fetchSerialInput');
                  if (input) {
                    input.focus();
                    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'F9', code: 'F9', keyCode: 120, bubbles: true, cancelable: true }));
                  }
                }}
              >
                <Search size={15} strokeWidth={2.5} />
                F9
              </button>
              <button className="btn btn-primary" onClick={() => handleFetch()}>
                <Search size={20} /> {t('export.fetch_btn')}
              </button>
              
              {showSerialsList && (
                <div style={{
                  position: 'absolute', top: '100%', right: 0, marginTop: '4px',
                  width: '200px', maxHeight: '250px', overflowY: 'auto',
                  backgroundColor: 'var(--surface-color)',
                  border: '1px solid var(--border-color)',
                  borderRadius: 'var(--radius-md)',
                  boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
                  zIndex: 1000
                }}>
                  <div style={{ padding: '0.5rem', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: 'var(--surface-highlight)' }}>
                      <span style={{ fontSize: '0.85rem', fontWeight: 'bold' }}>{t('export.select_saved')}</span>
                      <button onClick={() => { setShowSerialsList(false); setSerialSearchQuery(''); }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-color)', padding: 0, display: 'flex', alignItems: 'center' }}>
                         <X size={16} />
                      </button>
                  </div>
                  {/* Search Field */}
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
                            setShowSerialsList(false);
                            setSerialSearchQuery('');
                            handleFetch(filtered[0]);
                          }
                        }
                      }}
                      style={{
                        width: '100%',
                        padding: '0.5rem 0.75rem',
                        fontSize: '0.9rem',
                        border: '1px solid var(--border-color)',
                        borderRadius: 'var(--radius-sm, 6px)',
                        backgroundColor: 'var(--surface-color)',
                        color: 'var(--text-color)',
                        outline: 'none',
                        boxSizing: 'border-box',
                        direction: 'rtl',
                        transition: 'border-color 0.2s'
                      }}
                      onFocus={(e) => e.currentTarget.style.borderColor = 'var(--accent-color)'}
                      onBlur={(e) => e.currentTarget.style.borderColor = 'var(--border-color)'}
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
                         <div style={{ padding: '1rem', textAlign: 'center', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                           {availableSerials.length === 0 ? t('entry.actions.no_saved_models') : t('entry.actions.no_match')}
                         </div>
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
                                        handleFetch(serial);
                                    }}
                                    style={{ padding: '0.6rem 1rem', cursor: 'pointer', borderBottom: '1px solid var(--border-color)', transition: 'background-color 0.2s', fontSize: '0.9rem', color: 'var(--text-color)' }}
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
            </div>
          </div>
        </div>
        {order && hasPermission('export', 'export') && (
           <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'center' }}>
              <button className="btn btn-accent" style={{ padding: '0.8rem 2rem', fontSize: '1.15rem', gap: '0.75rem', borderRadius: '50px', background: 'linear-gradient(135deg, var(--accent-color), #b48c26)', color: '#000', fontWeight: 'bold', boxShadow: '0 4px 15px rgba(212, 175, 55, 0.4)' }} onClick={() => window.print()}>
               <Printer size={22} /> {t('export.print_btn')}
              </button>
              <button className="btn btn-accent" style={{ padding: '0.8rem 2rem', fontSize: '1.15rem', gap: '0.75rem', borderRadius: '50px', background: 'linear-gradient(135deg, #1a5276, #2980b9)', color: '#fff', fontWeight: 'bold', boxShadow: '0 4px 15px rgba(26, 82, 118, 0.4)' }} onClick={handleDownloadPDF}>
               <DownloadCloud size={22} /> {t('export.download_btn')}
              </button>
           </div>
        )}
      </div>

      {!order && (
        <div className="card no-print" style={{ textAlign: 'center', padding: '6rem 2rem', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(to bottom, var(--surface-color), var(--bg-color))' }}>
          <div style={{ padding: '1.5rem', background: 'var(--surface-highlight)', borderRadius: '50%', marginBottom: '1.5rem' }}>
             <FileText size={48} color="var(--accent-color)" />
          </div>
          <h2 style={{ color: 'var(--text-main)', fontSize: '1.8rem', fontWeight: '800' }}>{t('export.empty_title')}</h2>
          <p style={{ color: 'var(--text-muted)', marginTop: '0.75rem', maxWidth: '500px', lineHeight: '1.6' }}>
            {t('export.empty_desc')}
          </p>
        </div>
      )}

      {order && (
        <div className="print-doc" id="export-doc" dir="ltr">
          <table className="inv-table-new">
            <tbody>
              {/* ═══ ROW 1: HEADER ═══ */}
              <tr>
                <th colSpan={1} className="hdr-blue">{t('export.doc.order_no')}</th>
                <td colSpan={2} className="val-center val-bold">{order.orderNumber || '-'}</td>
                <th colSpan={2} className="hdr-blue">{t('export.doc.request_date')}</th>
                <td colSpan={2} className="val-center val-bold">{formatDate(order.requestDate)}</td>
                <th colSpan={2} className="hdr-blue">{t('export.doc.delivery_date')}</th>
                <td colSpan={2} className="val-center val-bold">{formatDate(order.deliveryDate)}</td>
              </tr>

              {/* ═══ ROW 2-4: BUYER & FACTORY INFO ═══ */}
              <tr>
                <th colSpan={1} rowSpan={3} className="title-cell">
                  <div style={{ fontSize: '20px', fontWeight: 900, marginBottom: '6px' }}>{t('export.doc.product_order_en')}</div>
                  <div style={{ fontSize: '20px', fontWeight: 900 }}>{t('export.doc.product_order_zh')}</div>
                </th>
                <th colSpan={2} className="hdr-light">{t('export.doc.buyer_name')}</th>
                <td colSpan={3} className="val-center val-bold">{order.buyerCompany || '-'}</td>
                <th colSpan={2} className="hdr-light">{t('export.doc.factory_name')}</th>
                <td colSpan={3} className="val-center val-bold">{factoryInfo.name || '-'}</td>
              </tr>
              <tr>
                <th colSpan={2} className="hdr-light">{t('export.doc.buyer_mobile')}</th>
                <td colSpan={3} className="val-center val-bold">{order.buyerNumber || '-'}</td>
                <th colSpan={2} className="hdr-light">{t('export.doc.factory_mobile')}</th>
                <td colSpan={3} className="val-center val-bold">{factoryInfo.mobile || '-'}</td>
              </tr>
              <tr>
                <th colSpan={2} className="hdr-light">{t('export.doc.customer_id')}</th>
                <td colSpan={3} className="val-center val-bold">{order.buyerMobile || '-'}</td>
                <th colSpan={2} className="hdr-light">{t('export.doc.factory_address')}</th>
                <td colSpan={3} className="val-center val-bold">{factoryInfo.address || '-'}</td>
              </tr>

              {/* ═══ ROW 5: PRODUCT COLUMNS ═══ */}
              <tr>
                <th className="hdr-blue">{t('export.doc.product_name')}</th>
                <th className="hdr-blue">{t('export.doc.model_no')}</th>
                <th className="hdr-blue">{t('export.doc.barcode')}</th>
                <th className="hdr-blue">{t('export.doc.qty')}</th>
                <th className="hdr-blue">{t('export.doc.price')}</th>
                <th className="hdr-blue">{t('export.doc.total_price')}</th>
                <th className="hdr-blue">{t('export.doc.size_qty')}</th>
                <th className="hdr-blue">{t('export.doc.size_range')}</th>
                <th className="hdr-blue">{t('export.doc.carton_size')}</th>
                <th className="hdr-blue">{t('export.doc.plastic_bag')}</th>
                <th className="hdr-blue">{t('export.doc.ctn_packaging')}</th>
              </tr>

              {/* ═══ ROW 6: PRODUCT VALUES ═══ */}
              <tr>
                <td className="val-center val-bold hdr-grey">
                  {englishOnly(order.productName)}
                  {chineseOnly(order.productName) && (
                    <span style={{ fontWeight: '800', marginLeft: '8px', color: '#333' }}>
                      - {chineseOnly(order.productName)}
                    </span>
                  )}
                  {(!englishOnly(order.productName) && !chineseOnly(order.productName)) && '-'}
                </td>
                <td className="val-center val-bold bg-cyan">{order.serialNumber || '-'}</td>
                <td className="val-center val-bold">{order.barcode ? `${order.barcode}` : '-'}</td>
                <td className="val-center val-bold">{order.totalQuantity || '-'}</td>
                <td className="val-center val-bold">¥ {order.productPrice || '-'}</td>
                <td className="val-center val-bold bg-light-blue">¥ {order.productPrice && order.totalQuantity ? (parseFloat(order.productPrice) * parseFloat(order.totalQuantity)).toFixed(2) : '-'}</td>
                <td className="val-center val-bold">{sizesToRender.length || '-'}</td>
                <td className="val-center val-bold">From {order.sizeFrom || '-'} - To {order.sizeTo || '-'}</td>
                <td className="val-center val-bold">{order.cartonSize || '-'}</td>
                <td className="val-center val-bold">{order.plasticBagSize || '-'}</td>
                <td className="val-center val-bold">
                  {(() => {
                    const getFirstNum = (str) => {
                      if (!str) return null;
                      const match = String(str).match(/\d+(\.\d+)?/);
                      return match ? match[0] : null;
                    };
                    const qNum = getFirstNum(order.cartonQty);
                    const pNum = getFirstNum(order.cartonPackage);
                    if (!qNum && !pNum) return '-';
                    if (qNum && pNum) return `${qNum} Carton × ${pNum} Pcs`;
                    if (qNum) return `${qNum} Carton`;
                    if (pNum) return `${pNum} Pcs`;
                    return '-';
                  })()}
                </td>
              </tr>

              {/* ═══ MEASUREMENTS BLOCK ═══ */}
              {(() => {
                let totalRows = 0;
                const parts = order.groupedMeasurements ? Object.keys(order.groupedMeasurements) : (order.measurements ? ['Product'] : []);
                
                parts.forEach(part => {
                  totalRows += 1; 
                  if (order.groupedMeasurements) {
                    totalRows += Object.keys(order.groupedMeasurements[part] || {}).length;
                  } else {
                    totalRows += Object.keys(order.measurements || {}).length;
                  }
                });

                if (totalRows === 0) totalRows = 2;

                const rows = [];
                let isFirstRow = true;

                if (parts.length === 0) {
                  rows.push(
                    <tr key="empty-m1">
                      <th className="hdr-grey">{t('export.doc.size_header')}</th>
                      <td colSpan={8} style={{ border: 'none', background: '#fff' }}></td>
                      <td colSpan={2} rowSpan={2} style={{ textAlign: 'center', verticalAlign: 'middle', padding: '4px', borderLeft: '3px solid #000' }}>
                           <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', alignItems: 'center' }}>
                             {order.productImages?.slice(0, 2).map((img, idx) => <img key={idx} src={img.url} alt="product" crossOrigin="anonymous" style={{ maxHeight: '130px', objectFit: 'contain' }} />)}
                             {tmImage && <img src={tmImage} alt="trademark" crossOrigin="anonymous" style={{ maxHeight: '60px', objectFit: 'contain', marginTop: order.productImages?.length > 0 ? '10px' : '0' }} />}
                           </div>
                      </td>
                    </tr>
                  );
                  rows.push(
                    <tr key="empty-m2">
                      <td style={{ height: '40px' }}></td>
                      <td colSpan={8} style={{ border: 'none', background: '#fff' }}></td>
                    </tr>
                  );
                  return rows;
                }

                parts.forEach(part => {
                  const partSizes = sizesToRender.slice(0, 8);
                  rows.push(
                    <tr key={`part-hdr-${part}`}>
                      <th className="hdr-grey">{t('export.doc.part_size_header', { part })}</th>
                      {partSizes.map(s => <th key={s} className="hdr-grey">{s}</th>)}
                      {partSizes.length < 8 && (
                        <td colSpan={8 - partSizes.length} style={{ border: 'none', background: '#fff' }}></td>
                      )}
                      
                      {isFirstRow && (
                        <td colSpan={2} rowSpan={totalRows} style={{ textAlign: 'center', verticalAlign: 'middle', padding: '4px', borderLeft: '3px solid #000' }}>
                           <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', alignItems: 'center' }}>
                             {order.productImages?.slice(0, 2).map((img, idx) => <img key={idx} src={img.url} alt="product" crossOrigin="anonymous" style={{ maxHeight: '130px', objectFit: 'contain' }} />)}
                             {tmImage && <img src={tmImage} alt="trademark" crossOrigin="anonymous" style={{ maxHeight: '60px', objectFit: 'contain', marginTop: order.productImages?.length > 0 ? '10px' : '0' }} />}
                           </div>
                        </td>
                      )}
                    </tr>
                  );
                  isFirstRow = false;

                  const measurementsObj = order.groupedMeasurements ? order.groupedMeasurements[part] : order.measurements;
                  Object.keys(measurementsObj || {}).forEach(mName => {
                    rows.push(
                      <tr key={`m-${part}-${mName}`}>
                        <td className="val-bold val-left" style={{ paddingLeft: '6px' }}>{mName}</td>
                        {partSizes.map(s => (
                           <td key={s} className="val-center val-bold">{measurementsObj[mName]?.[s] || ''}</td>
                        ))}
                        {partSizes.length < 8 && (
                          <td colSpan={8 - partSizes.length} style={{ border: 'none', background: '#fff' }}></td>
                        )}
                      </tr>
                    );
                  });
                });
                return rows;
              })()}

              {/* ═══ FABRICS & CONDITIONS ═══ */}
              {(() => {
                const numMaterials = [0, 1, 2].filter(i => order.materials && order.materials[i] && order.materials[i].name).length;
                const actualMaterials = Math.max(1, numMaterials);
                const fabricColSpan = 2 + 2 + (actualMaterials - 1); // 2 for header, 2 for first material, 1 for each additional
                const conditionsColSpan = 11 - 2 - fabricColSpan; // 11 total columns, 2 for Order Remarks

                return (
                  <React.Fragment>
                    <tr>
                      <th colSpan={fabricColSpan} className="hdr-blue">{t('export.doc.fabric_kind')}</th>
                      <th colSpan={conditionsColSpan} className="hdr-blue">{t('export.doc.conditions')}</th>
                      <th colSpan={2} className="hdr-blue">{t('export.doc.remarks_header')}</th>
                    </tr>
                    
                    <tr>
                      <td colSpan={fabricColSpan} className="val-center val-bold bg-light-blue" style={{ fontSize: '14px' }}>
                        {order.productFabric || t('export.doc.default_fabric')}
                      </td>
                      <td colSpan={conditionsColSpan} rowSpan={3} style={{ verticalAlign: 'top', padding: '8px', fontSize: '12px', color: '#c0392b', fontWeight: 800 }}>
                        {order.packagingConditions?.cond1 && <div style={{ marginBottom: '4px' }}>* {t('export.doc.cond1_text', { val1: order.packagingConditions.cond1_val1 || '-', val2: order.packagingConditions.cond1_val2 || '-' })}</div>}
                        {order.packagingConditions?.cond2 && <div style={{ marginBottom: '4px' }}>* {t('export.doc.cond2_text', { val1: order.packagingConditions.cond2_val1 || '-', val2: order.packagingConditions.cond2_val2 || '-' })}</div>}
                        {lookups.packagingConditionsList?.filter(c => order.packagingConditions?.[c]).map((c, i) => <div key={i} style={{ marginBottom: '4px' }}>* {c}</div>)}
                      </td>
                      <td colSpan={2} rowSpan={3} style={{ verticalAlign: 'top', padding: '8px', fontSize: '12px', fontWeight: 800 }}>
                        {order.remarks || ''}
                      </td>
                    </tr>
                    
                    <tr>
                      <th colSpan={2} className="hdr-light" style={{ backgroundColor: '#d0dbe5' }}>{t('export.doc.fabric_comp')}</th>
                      {[0,1,2].slice(0, actualMaterials).map(i => (
                        <td key={i} colSpan={i === 0 ? 2 : 1} className="val-center val-bold">
                           {order.materials?.[i]?.name || ''}
                        </td>
                      ))}
                    </tr>
                    <tr>
                      <th colSpan={2} className="hdr-light" style={{ backgroundColor: '#d0dbe5' }}>{t('export.doc.percentage')}</th>
                      {[0,1,2].slice(0, actualMaterials).map(i => (
                        <td key={i} colSpan={i === 0 ? 2 : 1} className="val-center val-bold" style={{ color: order.materials?.[i] ? '#38761d' : 'inherit' }}>
                           {order.materials?.[i] ? `${order.materials[i].percentage}%` : ''}
                        </td>
                      ))}
                    </tr>
                  </React.Fragment>
                );
              })()}

              {/* ═══ COLORS QTY & BARCODES ═══ */}
              <tr>
                <th colSpan={1} className="hdr-blue">{t('export.doc.colors_qty')}</th>
                <td colSpan={10} className="val-center val-bold bg-light-blue" style={{ fontSize: '16px' }}>
                   {activeColors.length || '0'}
                </td>
              </tr>
              
              {(() => {
                if (activeColors.length === 0) return null;
                
                // Determine number of chunks (each chunk is 9 colors)
                const CHUNK_SIZE = 9;
                const numChunks = Math.ceil(activeColors.length / CHUNK_SIZE);
                const chunks = [];
                for (let i = 0; i < numChunks; i++) {
                  const chunkColors = [];
                  for (let j = 0; j < CHUNK_SIZE; j++) {
                    const colorIndex = i * CHUNK_SIZE + j;
                    if (colorIndex < activeColors.length) {
                      chunkColors.push(activeColors[colorIndex]);
                    } else {
                      chunkColors.push(null);
                    }
                  }
                  chunks.push(chunkColors);
                }
                
                const getColSpans = (total, count) => {
                  if (count === 0) return [];
                  const base = Math.floor(total / count);
                  const rem = total % count;
                  return Array(count).fill(0).map((_, i) => base + (i < rem ? 1 : 0));
                };
                
                return chunks.map((chunk, chunkIndex) => {
                  const spans = getColSpans(10, chunk.length);
                  return (
                    <React.Fragment key={`color-chunk-${chunkIndex}`}>
                      <tr>
                        <th colSpan={1} className="hdr-light" style={{ borderTop: chunkIndex > 0 ? '3px solid #000' : '1px solid #000' }}>{t('export.doc.colors_zh')}</th>
                        {chunk.map((c, i) => {
                           let hex = '';
                           if (c) {
                             const cInfo = lookups.colors?.find(color => typeof color === 'object' ? color.name === c : color === c);
                             if (cInfo && typeof cInfo === 'object' && cInfo.hex) hex = cInfo.hex;
                           }
                           return (
                             <td key={`c-${i}`} colSpan={spans[i]} className={c ? "val-center val-bold bg-light-blue" : ""} style={{ borderTop: chunkIndex > 0 ? '3px solid #000' : '1px solid #000' }}>
                               {c ? (
                                 <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
                                   {hex && <div style={{ width: '14px', height: '14px', borderRadius: '50%', backgroundColor: hex, border: '1px solid #000', flexShrink: 0 }} />}
                                   <span>{c}</span>
                                 </div>
                               ) : ''}
                             </td>
                           );
                        })}
                      </tr>
                      <tr>
                        <th colSpan={1} className="hdr-light">{t('export.doc.qty_zh')}</th>
                        {chunk.map((c, i) => {
                           if (!c) return <td key={`q-${i}`} colSpan={spans[i]}></td>;
                           const qty = sizesToRender.reduce((sum, s) => sum + (parseInt(order.colorDistribution[c]?.[s]) || 0), 0);
                           return <td key={`q-${i}`} colSpan={spans[i]} className="val-center val-bold bg-light-blue">{qty}</td>;
                        })}
                      </tr>
                      <tr>
                        <th colSpan={1} className="hdr-light">{t('export.doc.color_barcodes')}</th>
                        {chunk.map((c, i) => {
                           if (!c) return <td key={`b-${i}`} colSpan={spans[i]}></td>;
                           const cInfo = lookups.colors?.find(color => typeof color === 'object' ? color.name === c : color === c);
                           const code = (cInfo && typeof cInfo === 'object') ? (cInfo.abbr || cInfo.code || '') : '';
                           return <td key={`b-${i}`} colSpan={spans[i]} className="val-center val-bold" style={{ whiteSpace: 'nowrap' }}>
                              {order.barcode ? `${order.barcode}${code ? '-' + code : ''}` : '-'}
                           </td>;
                        })}
                      </tr>
                      <tr>
                        <th colSpan={1} className="hdr-light" style={{ height: '70px', verticalAlign: 'middle' }}>{t('export.doc.fabric_samples')}</th>
                        {chunk.map((_, i) => (
                           <td key={`s-${i}`} colSpan={spans[i]}></td>
                        ))}
                      </tr>
                    </React.Fragment>
                  );
                });
              })()}

              {/* ═══ SIGNATURES ═══ */}
              <tr>
                <td colSpan={11} style={{ borderTop: '3px solid #000', padding: '15px 30px', backgroundColor: '#fff' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', paddingTop: '10px' }}>
                    
                    <div>
                      <div style={{ marginBottom: '25px', fontSize: '14px', fontWeight: 800 }}>
                        {t('export.doc.name_zh')} <span style={{ color: '#c0392b', marginLeft: '40px' }}>{t('export.doc.buyer_sign')}</span>
                      </div>
                      <div style={{ fontSize: '14px', fontWeight: 800, display: 'flex', alignItems: 'flex-end' }}>
                        {t('export.doc.signature_zh')} 
                        <div style={{ display: 'inline-block', width: '180px', borderBottom: '2px solid #000', marginLeft: '15px' }}></div>
                      </div>
                    </div>
                    
                    <div style={{ textAlign: 'center' }}>
                      <div style={{ color: '#c0392b', fontWeight: 800, fontSize: '14px', marginBottom: '25px' }}>{t('export.doc.coordinator_sign')}</div>
                      <div style={{ display: 'inline-block', width: '220px', borderBottom: '2px solid #000' }}></div>
                    </div>
                    
                    <div style={{ textAlign: 'center' }}>
                      <div style={{ color: '#c0392b', fontWeight: 800, fontSize: '14px', marginBottom: '25px' }}>{t('export.doc.factory_sign')}</div>
                      <div style={{ display: 'inline-block', width: '220px', borderBottom: '2px solid #000' }}></div>
                    </div>

                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default ExportOrder;
