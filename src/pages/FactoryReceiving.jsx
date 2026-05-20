import React, { useState } from 'react';
import { useAppData } from '../context/AppDataContext';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../supabaseClient';
import { Search, Save, PackageCheck, AlertCircle, Info, Box, Palette, Calculator, CheckCircle2, XCircle, Download, Printer, X, Factory } from 'lucide-react';
import toast from 'react-hot-toast';
import * as XLSX from 'xlsx';
import { useTranslation } from 'react-i18next';
import { extractColorCSS } from '../utils/textUtils';
import { appendActivity, createActivityItem } from '../utils/activityLog';

const FactoryReceiving = () => {
  const { t } = useTranslation();
  const { lookups } = useAppData();
  const { user, hasPermission } = useAuth();
  
  const [modelNo, setModelNo] = useState('');
  const [isFetched, setIsFetched] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  
  // F9 Search States
  const [showSerialsList, setShowSerialsList] = useState(false);
  const [availableSerials, setAvailableSerials] = useState([]);
  const [serialSearchQuery, setSerialSearchQuery] = useState('');
  const [fetchingSerials, setFetchingSerials] = useState(false);
  const serialSearchRef = React.useRef(null);
  
  // Header Info State
  const [productInfo, setProductInfo] = useState({
    mainBarcode: '',
    prodFullName: '',
    prodShortName: '',
    prodPrice: 0,
    priceCurrency: '',
    reqCartons: '',
    reqTotalQuantity: 0,
    productStatus: '',
    factoryId: '',
    factoryName: ''
  });

  // Package Table State
  const [packages, setPackages] = useState(Array.from({ length: 4 }).map((_, i) => ({
    id: `Package_${i + 1}`,
    kind: '',
    status: '',
    fromCtn: '',
    toCtn: '',
    pcsPerCtn: '',
    active: i === 0 // Only the first package is active by default
  })));

  // Factory Packages State (Read-only)
  const [factoryPackages, setFactoryPackages] = useState([]);

  // Colors Table State
  const [colors, setColors] = useState(Array.from({ length: 9 }).map((_, i) => ({
    id: `Colors_${i + 1}`,
    colorName: '',
    quantity: '',
    expected: 0
  })));

  // Calculate fields for a package
  const getPackageCalculations = (pkg) => {
    const from = parseInt(pkg.fromCtn);
    const to = parseInt(pkg.toCtn);
    const units = parseInt(pkg.pcsPerCtn);

    const hasRange = !isNaN(from) && !isNaN(to) && to >= from;
    const hasUnits = !isNaN(units) && units > 0;

    const totalCtnQty = hasRange ? (to - from + 1) : 0;
    const ctnNo = hasRange ? (from === to ? `${from}` : `${from}-${to}`) : '';
    
    const multiplier = pkg.kind === 'Doz' ? 12 : 1;
    const kindTxt = pkg.kind === 'Doz' ? ` ${t('receiving.packages.doz')}` : ` ${t('receiving.packages.pcs')}`;

    const ctnQtyString = (hasRange && hasUnits) ? `${totalCtnQty}${t('receiving.packages.cartons')} * ${units}${kindTxt}` : '';
    const totalProdQty = (hasRange && hasUnits) ? (totalCtnQty * units * multiplier) : 0;
    
    return { totalCtnQty, ctnNo, ctnQtyString, totalProdQty };
  };

  const totals = packages.reduce((acc, pkg) => {
    if (!pkg.active) return acc;
    const calc = getPackageCalculations(pkg);
    return {
      totalCtn: acc.totalCtn + calc.totalCtnQty,
      totalProd: acc.totalProd + calc.totalProdQty
    };
  }, { totalCtn: 0, totalProd: 0 });

  const totalAmount = totals.totalProd * (productInfo.prodPrice || 0);

  // Colors validation removed as requested

  const handleSearch = async (overrideSerial) => {
    const termToSearch = typeof overrideSerial === 'string' ? overrideSerial : modelNo;
    if (!termToSearch.trim()) return;
    setModelNo(termToSearch);
    setIsSearching(true);
    
    try {
      const { data: recData } = await supabase
        .from('receivings')
        .select('receive_data')
        .eq('serial_number', termToSearch.trim())
        .single();

      const { data: oDataResp, error: oError } = await supabase
        .from('orders')
        .select('order_data')
        .eq('serial_number', termToSearch.trim())
        .single();
        
      if (oError || !oDataResp) {
         toast.error(`${t('receiving.messages.not_found')} ${termToSearch}`);
         setIsSearching(false);
         setIsFetched(false);
         return;
      }
      
      const oData = oDataResp.order_data;

      if (user && user.role !== 'admin') {
         const allowedFactories = user.permissions?.allowed_factories || [];
         const allowedCompanies = user.permissions?.allowed_companies || [];
         if (allowedFactories.length > 0 && !allowedFactories.includes(oData.factoryId)) {
            toast.error(t('auth.unauthorized_factory'));
            setIsSearching(false);
            setIsFetched(false);
            return;
         }
         if (allowedCompanies.length > 0 && !allowedCompanies.includes(oData.buyerCompany)) {
            toast.error(t('auth.unauthorized_company'));
            setIsSearching(false);
            setIsFetched(false);
            return;
         }
      }

      setProductInfo({
        mainBarcode: oData.barcode || `1000${oData.serialNumber}`,
        prodFullName: oData.productName || t('receiving.messages.unregistered'),
        prodShortName: oData.productName || t('receiving.messages.unregistered'),
        prodPrice: parseFloat(oData.productPrice) || 0,
        priceCurrency: oData.currency || '',
        reqCartons: `${oData.cartonQty || '?'} ${t('units.carton')} * ${oData.cartonSize || '?'} ${t('units.piece')} (${oData.totalQuantity || '?'} ${t('receiving.packages.total_pcs')})`,
        reqTotalQuantity: parseInt(oData.totalQuantity) || 0,
        productStatus: (recData && recData.receive_data && recData.receive_data.status && (
          recData.receive_data.status.includes('Received') || 
          recData.receive_data.status === 'مستلمة' || 
          recData.receive_data.status === '已收货' || 
          recData.receive_data.status === 'تم الاستلام' || 
          recData.receive_data.status === 'Received' ||
          recData.receive_data.status === 'received' ||
          recData.receive_data.status === 'مستلم'
        )) ? 'Received' : 'Not Received',
        factoryId: oData.factoryId || t('receiving.messages.undefined'),
        factoryName: ''
      });
      
      if (recData && recData.receive_data && recData.receive_data.packages) {
        // Ensure fetched packages have an 'active' status if they contain data
        const fetchedPkgs = recData.receive_data.packages.map((p, idx) => ({
           ...p,
           active: p.active !== undefined ? p.active : (p.fromCtn || p.toCtn || p.pcsPerCtn || idx === 0)
        }));
        setPackages(fetchedPkgs);
      } else {
        const newPkgs = Array.from({ length: 4 }).map((_, i) => ({
          id: `Package_${i + 1}`, kind: '', status: '', fromCtn: '', toCtn: '', pcsPerCtn: '', active: i === 0
        }));
        setPackages(newPkgs);
      }
      
      if (oData.factoryPackages && Array.isArray(oData.factoryPackages)) {
        setFactoryPackages(oData.factoryPackages.filter(p => p.active && (p.fromCtn || p.toCtn || p.pcsPerCtn)));
      } else {
        setFactoryPackages([]);
      }
      
      const newCols = Array.from({ length: 9 }).map((_, i) => ({
        id: `Colors_${i + 1}`, colorName: '', quantity: '0', expected: 0, factoryActual: 0
      }));

      if (recData && recData.receive_data && recData.receive_data.colors) {
         // Merge with latest factoryActual from oData
         const mergedCols = recData.receive_data.colors.map(col => {
            let factAct = 0;
            if (col.colorName && oData.factoryProduction && oData.factoryProduction[col.colorName]) {
                factAct = oData.factoryProduction[col.colorName];
            }
            return { ...col, factoryActual: factAct };
         });
         setColors(mergedCols);
      } else {
        if (oData.colorDistribution) {
           let idx = 0;
           for (const [colorStr, sizesObj] of Object.entries(oData.colorDistribution)) {
              if (idx >= 9) break;
              let sum = 0;
              for (const qty of Object.values(sizesObj)) {
                 sum += parseInt(qty) || 0;
              }
              const factAct = (oData.factoryProduction && oData.factoryProduction[colorStr]) ? oData.factoryProduction[colorStr] : 0;
              newCols[idx].colorName = colorStr;
              newCols[idx].quantity = factAct ? factAct.toString() : sum.toString();
              newCols[idx].expected = sum;
              newCols[idx].factoryActual = factAct;
              idx++;
           }
        }
        setColors(newCols);
      }
      
      setIsFetched(true);
      
      if (recData && recData.receive_data) {
         toast.success(t('receiving.messages.fetch_previous'));
      } else {
         toast.success(`${t('receiving.messages.fetch_success')}: ${termToSearch}`);
      }

    } catch (err) {
      toast.error(t('receiving.messages.db_error'));
      console.error(err);
    } finally {
      setIsSearching(false);
    }
  };

  const handleF9Press = async (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSearch();
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

  const handlePackageChange = (index, field, value) => {
    const updated = [...packages];
    updated[index][field] = value;
    setPackages(updated);
  };

  const handleColorChange = (index, value) => {
    const updated = [...colors];
    updated[index].quantity = value;
    setColors(updated);
  };

  const expectedTotalQty = productInfo.reqTotalQuantity || 0;
  const isQtyMatching = isFetched && expectedTotalQty > 0 && totals.totalProd === expectedTotalQty;
  const isStatusReceived = productInfo.productStatus === 'Received';
  
  const totalColorsQty = colors.reduce((acc, col) => acc + (parseInt(col.quantity) || 0), 0);
  const isColorsQtyMatching = isFetched && totalColorsQty === totals.totalProd && totals.totalProd > 0;

  const canSave = isStatusReceived && totals.totalProd > 0;

  const handleSave = async () => {
    if (!isFetched) {
      toast.error(t('export.messages.enter_serial'));
      return;
    }
    if (!isStatusReceived) {
      toast.error(t('receiving.messages.received_status_required'));
      return;
    }


    const payload = {
      serial_number: modelNo.trim(),
      receive_data: {
        packages: packages,
        colors: colors,
        status: productInfo.productStatus,
        receivedAt: new Date().toISOString()
      }
    };
    
    const toastId = toast.loading(t('receiving.messages.saving'));
    try {
      const { error } = await supabase.from('receivings').upsert(payload);
      if (error) throw error;
      const { data: orderRow } = await supabase
        .from('orders')
        .select('order_data')
        .eq('serial_number', modelNo.trim())
        .single();
      if (orderRow?.order_data) {
        const orderWithActivity = appendActivity(orderRow.order_data, createActivityItem({
          action: 'receive',
          user,
          note: t('activity.notes.received', { count: totals.totalProd }),
          meta: {
            source: 'factory-receiving',
            cartons: totals.totalCtn,
            pieces: totals.totalProd,
            colors: colors.filter(c => c.colorName && parseInt(c.quantity)).length,
          },
        }));
        await supabase
          .from('orders')
          .update({ order_data: orderWithActivity })
          .eq('serial_number', modelNo.trim());
      }
      toast.success(t('receiving.messages.save_success'), { id: toastId });
      
      // Reset form to allow entering a new model
      setModelNo('');
      setIsFetched(false);
      setProductInfo({
        mainBarcode: '', prodFullName: '', prodShortName: '', prodPrice: 0,
        priceCurrency: '', reqCartons: '', reqTotalQuantity: 0, productStatus: 'Not Received',
        factoryId: '', factoryName: ''
      });
      setPackages(Array.from({ length: 4 }).map((_, i) => ({
        id: `Package_${i + 1}`, kind: '', status: '', fromCtn: '', toCtn: '', pcsPerCtn: '', active: i === 0
      })));
      setFactoryPackages([]);
      setColors(Array.from({ length: 9 }).map((_, i) => ({
        id: `Colors_${i + 1}`, colorName: '', quantity: '', expected: 0
      })));

    } catch (err) {
      toast.error(`${t('entry.messages.save_error')}: ${err.message}`, { id: toastId });
    }
  };

  const exportToExcel = () => {
    if (!isFetched) return toast.error(t('receiving.messages.no_data_export'));
    
    const excelData = {
      [t('export.doc.model_no')]: modelNo,
      [t('receiving.info.full_name')]: productInfo.prodFullName,
      [t('receiving.info.barcode')]: productInfo.mainBarcode,
      [t('receiving.info.factory')]: `${productInfo.factoryId} - ${productInfo.factoryName}`,
      [t('receiving.info.original_order')]: productInfo.reqTotalQuantity,
      [t('receiving.summary.total_ctn')]: totals.totalCtn,
      [t('receiving.summary.total_qty')]: totals.totalProd,
      [t('receiving.info.status')]: productInfo.productStatus === 'Received' ? t('receiving.info.received') : t('receiving.info.not_received'),
      [t('receiving.summary.qty_match')]: (isQtyMatching && isColorsQtyMatching) ? t('receiving.summary.match') : t('receiving.summary.mismatch')
    };

    const pkgsData = packages.filter(p => p.kind).map(p => ({
        [t('receiving.packages.id') || 'ID']: p.id,
        [t('receiving.packages.kind')]: p.kind,
        [t('receiving.packages.carton_status')]: p.status,
        [t('receiving.packages.from')]: p.fromCtn,
        [t('receiving.packages.to')]: p.toCtn,
        [t('receiving.packages.pcs_per_ctn')]: p.pcsPerCtn,
        [t('receiving.packages.total_pcs')]: getPackageCalculations(p).totalProdQty
    }));

    const colorsData = colors.filter(c => c.colorName).map(c => ({
        [t('receiving.colors.title')]: c.colorName,
        [t('receiving.colors.expected')]: c.expected,
        [t('receiving.colors.receive')]: c.quantity || 0,
        [t('receiving.summary.mismatch')]: (parseInt(c.quantity) || 0) - c.expected
    }));

    const workbook = XLSX.utils.book_new();
    
    const ws1 = XLSX.utils.json_to_sheet([excelData]);
    XLSX.utils.book_append_sheet(workbook, ws1, t('receiving.summary.excel_summary'));

    if (pkgsData.length > 0) {
        const ws2 = XLSX.utils.json_to_sheet(pkgsData);
        XLSX.utils.book_append_sheet(workbook, ws2, t('receiving.summary.excel_packages'));
    }

    if (colorsData.length > 0) {
        const ws3 = XLSX.utils.json_to_sheet(colorsData);
        XLSX.utils.book_append_sheet(workbook, ws3, t('receiving.summary.excel_colors'));
    }

    XLSX.writeFile(workbook, `Receiving_${modelNo}_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  const exportToPDF = async () => {
    if (!isFetched) return toast.error(t('receiving.messages.no_data_export'));
    const toastId = toast.loading(t('receiving.messages.preparing_report'));
    const element = document.getElementById('receiving-print-area');

    // Just clean up shadows for a crisper PDF — keep all colors as-is
    const origBoxShadow = element.style.boxShadow;
    const origPadding = element.style.padding;
    element.style.boxShadow = 'none';
    element.style.padding = '20px';

    try {
       const { default: html2canvas } = await import('html2canvas');
       const { default: jsPDF } = await import('jspdf');

       await new Promise(r => setTimeout(r, 100));

       // Get the actual background color from CSS variables
       const computedBg = getComputedStyle(document.documentElement).getPropertyValue('--bg-color').trim() || '#0d1117';

       const canvas = await html2canvas(element, { 
         scale: 2, 
         useCORS: true, 
         logging: false, 
         windowWidth: element.scrollWidth,
         backgroundColor: computedBg
       });
       const imgData = canvas.toDataURL('image/png');
       const imgWidthPx = canvas.width;
       const imgHeightPx = canvas.height;

       const pdfWidthMM = 210; 
       const margin = 5;
       const contentWidthMM = pdfWidthMM - margin * 2;
       const contentHeightMM = (imgHeightPx * contentWidthMM) / imgWidthPx;
       const pdfHeightMM = contentHeightMM + margin * 2;

       const pdf = new jsPDF({
         orientation: 'portrait',
         unit: 'mm',
         format: [pdfWidthMM, Math.max(pdfHeightMM, 297)],
       });

       // Fill PDF background with the same dark color
       pdf.setFillColor(computedBg);
       pdf.rect(0, 0, pdfWidthMM, Math.max(pdfHeightMM, 297), 'F');

       pdf.addImage(imgData, 'PNG', margin, margin, contentWidthMM, contentHeightMM);
       pdf.save(`Receiving_${modelNo}_${new Date().toISOString().split('T')[0]}.pdf`);
       
       toast.success(t('receiving.messages.export_success'), { id: toastId });
    } catch (err) {
       toast.error(t('entry.messages.save_error'), { id: toastId });
       console.error(err);
    } finally {
       element.style.boxShadow = origBoxShadow;
       element.style.padding = origPadding;
    }
  };


  // Helper component for Product Info fields
  const InfoBox = ({ label, value, highlight }) => (
    <div style={{ background: highlight ? 'rgba(212,175,55,0.05)' : 'var(--bg-color)', padding: '12px 16px', borderRadius: '10px', border: highlight ? '1px solid rgba(212,175,55,0.3)' : '1px solid var(--border-color)', display: 'flex', flexDirection: 'column', gap: '4px' }}>
      <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{label}</span>
      <span style={{ fontSize: '1rem', fontWeight: 'bold', color: highlight ? 'var(--accent-color)' : 'var(--text-main)' }}>{value || '---'}</span>
    </div>
  );

  return (
    <div className="fade-in" style={{ paddingBottom: '2rem' }}>
      {/* ─── HEADER ─── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h1 style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', fontSize: '2.2rem', margin: 0 }}>
            <PackageCheck size={40} color="var(--accent-color)" />
            {t('receiving.title')}
          </h1>
          <p style={{ color: 'var(--text-muted)', margin: '0.5rem 0 0' }}>
            {t('receiving.desc')}
          </p>
        </div>
      </div>

      {/* ─── SEARCH SECTION ─── */}
      <div className="card" style={{ marginBottom: '2rem', border: '1px solid var(--accent-color)', boxShadow: '0 8px 30px rgba(212, 175, 55, 0.1)' }}>
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <div className="form-group" style={{ flex: 1, marginBottom: 0 }}>
            <label className="form-label">{t('receiving.search.label')}</label>
            <div style={{ position: 'relative' }}>
              <input
                type="text"
                id="fetchSerialInput"
                className="form-control"
                value={modelNo}
                onChange={(e) => setModelNo(e.target.value)}
                onKeyDown={handleF9Press}
                placeholder={t('receiving.search.placeholder')}
                style={{ fontSize: '1.2rem', padding: '14px 20px', paddingLeft: '50px', background: 'var(--surface-color)' }}
                autoComplete="off"
              />
              <Search size={22} style={{ position: 'absolute', left: '16px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
              
              {showSerialsList && (
                <div style={{
                  position: 'absolute', top: '100%', right: 0, marginTop: '4px',
                  width: '100%', maxHeight: '250px', overflowY: 'auto',
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
                            handleSearch(filtered[0]);
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
                                        handleSearch(serial);
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
          <button className="btn btn-primary" onClick={() => handleSearch()} disabled={isSearching} style={{ padding: '14px 30px', fontSize: '1.1rem' }}>
            {isSearching ? <div className="spinner" style={{ width: '22px', height: '22px', border: '3px solid #fff', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 1s linear infinite' }} /> : t('receiving.search.btn')}
          </button>
        </div>
        
        {/* Export Action Buttons */}
        {isFetched && (
          <div className="fade-in" style={{ display: 'flex', gap: '1rem', marginTop: '1.5rem', paddingTop: '1.5rem', borderTop: '1px solid var(--border-color)', justifyContent: 'flex-end' }}>
            <button className="btn" onClick={exportToExcel} style={{ backgroundColor: '#10b981', color: 'white', boxShadow: '0 4px 15px rgba(16, 185, 129, 0.3)' }}>
              <Download size={20} /> {t('receiving.export.excel')}
            </button>
            <button className="btn" onClick={exportToPDF} style={{ backgroundColor: '#ef4444', color: 'white', boxShadow: '0 4px 15px rgba(239, 68, 68, 0.3)' }}>
              <Printer size={20} /> {t('receiving.export.pdf')}
            </button>
          </div>
        )}
      </div>

      {isFetched && (
        <div id="receiving-print-area" className="fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
          
          {/* ─── PRODUCT INFO CARD ─── */}
          <div className="card">
            <div className="tab-section-header">
              <h3><Info size={22} /> {t('receiving.info.title')}</h3>
            </div>
            
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
              <div style={{ background: 'rgba(212,175,55,0.05)', padding: '12px 16px', borderRadius: '10px', border: '1px solid rgba(212,175,55,0.3)', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{t('receiving.info.status')}</span>
                 <select 
                   className="form-control" 
                   value={productInfo.productStatus} 
                   onChange={e => setProductInfo({...productInfo, productStatus: e.target.value})} 
                   disabled={!(hasPermission('receiving', 'add') || hasPermission('receiving', 'edit'))}
                   style={{ 
                     padding: '4px', marginTop: '4px', fontWeight: 'bold', border: 'none', background: 'transparent',
                     color: productInfo.productStatus === 'Received' ? '#16a34a' : '#dc2626',
                     cursor: (hasPermission('receiving', 'add') || hasPermission('receiving', 'edit')) ? 'pointer' : 'not-allowed'
                   }}
                >
                  <option value="Not Received">{t('receiving.info.not_received')}</option>
                  <option value="Received">{t('receiving.info.received')}</option>
                </select>
              </div>
              <InfoBox label={t('receiving.info.factory')} value={`${productInfo.factoryId} - ${productInfo.factoryName}`} highlight />
              <InfoBox label={t('receiving.info.barcode')} value={productInfo.mainBarcode} />
              <InfoBox label={t('receiving.info.full_name')} value={productInfo.prodFullName} />
              <InfoBox label={t('receiving.info.price')} value={`${productInfo.prodPrice} ${productInfo.priceCurrency}`} />
              <InfoBox label={t('receiving.info.original_order')} value={productInfo.reqCartons} />
            </div>
          </div>

          {/* ─── PACKAGES ENTRY CARD ─── */}
          <div className="card">
            <div className="tab-section-header">
              <h3><Box size={22} /> {t('receiving.packages.title')}</h3>
            </div>
            
            {factoryPackages.length > 0 && (
              <div style={{ marginBottom: '1.5rem', padding: '1rem', background: 'rgba(212,175,55,0.05)', borderRadius: '10px', border: '1px solid rgba(212,175,55,0.2)' }}>
                <h4 style={{ fontSize: '1rem', color: 'var(--accent-color)', marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <Factory size={18} /> {t('receiving.packages.factory_entries')}
                </h4>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '0.75rem' }}>
                  {factoryPackages.map((pkg, idx) => {
                    const from = parseInt(pkg.fromCtn) || 0;
                    const to = parseInt(pkg.toCtn) || 0;
                    const totalCtn = (to >= from && from > 0) ? (to - from + 1) : 0;
                    const units = parseInt(pkg.pcsPerCtn) || 0;
                    const multiplier = pkg.kind === 'Doz' ? 12 : 1;
                    const totalProd = totalCtn * units * multiplier;
                    return (
                      <div key={idx} style={{ background: 'var(--surface-color)', padding: '0.75rem', borderRadius: '8px', border: '1px solid var(--border-color)', fontSize: '0.85rem' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                          <span style={{ fontWeight: 'bold' }}>{pkg.id}</span>
                          <span style={{ color: 'var(--text-muted)' }}>{pkg.kind} • {pkg.status}</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-main)' }}>
                          <span>{t('receiving.packages.cartons')}: {from} - {to} ({totalCtn})</span>
                          <span>{t('receiving.packages.qty')}: {units} / {pkg.kind}</span>
                        </div>
                        {totalProd > 0 && (
                          <div style={{ marginTop: '6px', paddingTop: '6px', borderTop: '1px solid rgba(255,255,255,0.05)', color: 'var(--accent-color)', fontWeight: 'bold' }}>
                            {t('receiving.packages.total_pcs')}: {totalProd}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {packages.map((pkg, idx) => {
                const calc = getPackageCalculations(pkg);
                return (
                  <div key={idx} style={{ 
                    display: 'flex', flexDirection: 'column', gap: '0.75rem', 
                    background: pkg.active ? 'var(--surface-highlight)' : 'rgba(255, 255, 255, 0.02)', 
                    padding: '1rem', borderRadius: '12px', 
                    border: pkg.active ? '1px solid var(--border-color)' : '1px dashed var(--border-color)',
                    transition: 'all 0.3s ease',
                    opacity: pkg.active ? 1 : 0.8,
                    pointerEvents: (hasPermission('receiving', 'add') || hasPermission('receiving', 'edit')) ? 'auto' : 'none'
                  }}>
                    {/* Package Header with Checkbox */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                       <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                          <div style={{ 
                             background: pkg.active ? 'var(--accent-color)' : 'var(--border-color)', 
                             color: pkg.active ? '#000' : 'var(--text-muted)', 
                             padding: '4px 12px', borderRadius: '8px', fontWeight: 'bold', fontSize: '0.85rem',
                             transition: 'all 0.3s'
                          }}>
                            {pkg.id}
                          </div>
                          {idx > 0 && (
                             <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', userSelect: 'none', fontSize: '0.9rem', color: pkg.active ? 'var(--accent-color)' : 'var(--text-muted)' }}>
                                <input 
                                  type="checkbox" 
                                  checked={pkg.active} 
                                  onChange={(e) => handlePackageChange(idx, 'active', e.target.checked)}
                                  style={{ width: '18px', height: '18px', accentColor: 'var(--accent-color)', cursor: 'pointer' }}
                                />
                                {pkg.active ? t('receiving.packages.active') : t('receiving.packages.add')}
                             </label>
                          )}
                       </div>
                       
                    </div>
                    
                    {/* Fields - only if active */}
                    {pkg.active && (
                      <div className="fade-in" style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem', alignItems: 'flex-end', paddingTop: '0.5rem', borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                        <div className="form-group" style={{ flex: 1, minWidth: '120px', marginBottom: 0 }}>
                          <label className="form-label" style={{ fontSize: '0.75rem' }}>{t('receiving.packages.kind')}</label>
                          <select className="form-control" value={pkg.kind} onChange={e => handlePackageChange(idx, 'kind', e.target.value)}>
                            <option value=""></option>
                            <option value="Pcs">{t('receiving.packages.pcs')}</option>
                            <option value="Doz">{t('receiving.packages.doz')}</option>
                          </select>
                        </div>
                        <div className="form-group" style={{ flex: 1.5, minWidth: '150px', marginBottom: 0 }}>
                          <label className="form-label" style={{ fontSize: '0.75rem' }}>{t('receiving.packages.carton_status')}</label>
                          <select className="form-control" value={pkg.status} onChange={e => handlePackageChange(idx, 'status', e.target.value)}>
                            <option value=""></option>
                            <option value="Full">{t('receiving.packages.full')}</option>
                            <option value="Not Full">{t('receiving.packages.not_full')}</option>
                          </select>
                        </div>
                        <div className="form-group" style={{ flex: 1, minWidth: '80px', marginBottom: 0 }}>
                          <label className="form-label" style={{ fontSize: '0.75rem' }}>{t('receiving.packages.from')}</label>
                          <input type="number" className="form-control" value={pkg.fromCtn} onChange={e => handlePackageChange(idx, 'fromCtn', e.target.value)} />
                        </div>
                        <div className="form-group" style={{ flex: 1, minWidth: '80px', marginBottom: 0 }}>
                          <label className="form-label" style={{ fontSize: '0.75rem' }}>{t('receiving.packages.to')}</label>
                          <input type="number" className="form-control" value={pkg.toCtn} onChange={e => handlePackageChange(idx, 'toCtn', e.target.value)} />
                        </div>
                        <div className="form-group" style={{ flex: 1.5, minWidth: '120px', marginBottom: 0 }}>
                          <label className="form-label" style={{ fontSize: '0.75rem' }}>{t('receiving.packages.pcs_per_ctn')}</label>
                          <input type="number" className="form-control" value={pkg.pcsPerCtn} onChange={e => handlePackageChange(idx, 'pcsPerCtn', e.target.value)} />
                        </div>

                        {/* Result Segment Restored */}
                        {calc.totalProdQty > 0 && (
                          <div className="fade-in" style={{ 
                            flexShrink: 0, 
                            display: 'flex', gap: '1.5rem', 
                            background: 'var(--surface-color)', 
                            padding: '10px 20px', borderRadius: '8px', 
                            border: '1px solid rgba(74, 222, 128, 0.4)',
                            alignSelf: 'flex-end',
                            marginBottom: '2px'
                          }}>
                            <div style={{ textAlign: 'center' }}>
                              <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', display: 'block' }}>{t('receiving.packages.total_ctns')}</span>
                              <strong style={{ fontSize: '1.2rem', color: '#4ade80' }}>{calc.totalCtnQty}</strong>
                            </div>
                            <div style={{ width: '1px', background: 'var(--border-color)' }}></div>
                            <div style={{ textAlign: 'center' }}>
                              <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', display: 'block' }}>{t('receiving.packages.received_pcs')}</span>
                              <strong style={{ fontSize: '1.2rem', color: '#4ade80' }}>{calc.totalProdQty}</strong>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* ─── COLORS DISTRIBUTION CARD ─── */}
          <div className="card">
            <div className="tab-section-header">
              <h3 style={{ margin: 0 }}><Palette size={22} /> {t('receiving.colors.title')}</h3>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: '1rem', marginTop: '1.5rem' }}>
              {colors.filter(c => c.colorName).map((c, i) => (
                <div key={i} style={{ 
                    background: 'var(--surface-highlight)', border: '1px solid var(--border-color)', borderRadius: '10px', overflow: 'hidden',
                    pointerEvents: (hasPermission('receiving', 'add') || hasPermission('receiving', 'edit')) ? 'auto' : 'none',
                    opacity: (hasPermission('receiving', 'add') || hasPermission('receiving', 'edit')) ? 1 : 0.7
                }}>
                  <div style={{ background: 'var(--surface-color)', padding: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', fontSize: '0.85rem', fontWeight: 'bold', borderBottom: '1px solid var(--border-color)' }}>
                    <div style={{ width: '16px', height: '16px', borderRadius: '50%', border: '1px solid rgba(255,255,255,0.2)', backgroundColor: extractColorCSS(c.colorName, lookups?.colors || []), flexShrink: 0 }}></div>
                    {c.colorName}
                  </div>
                  <div style={{ padding: '10px', display: 'flex', flexDirection: 'column', gap: '5px' }}>
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', display: 'flex', justifyContent: 'space-between' }}>
                      <span>{t('receiving.colors.expected')}</span> <strong>{c.expected}</strong>
                    </div>
                    {c.factoryActual > 0 && (
                        <div style={{ fontSize: '0.8rem', color: '#d4af37', display: 'flex', justifyContent: 'space-between' }}>
                          <span>{t('receiving.colors.actual')}</span> <strong>{c.factoryActual}</strong>
                        </div>
                    )}
                    <input
                      type="number"
                      className="form-control"
                      value={c.quantity}
                      onChange={(e) => handleColorChange(i, e.target.value)}
                      placeholder={t('receiving.colors.receive')}
                      style={{ textAlign: 'center', background: 'var(--bg-color)', padding: '6px', fontSize: '1.1rem' }}
                    />
                  </div>
                </div>
              ))}
            </div>
            {colors.filter(c => c.colorName).length === 0 && (
               <div style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '2rem' }}>{t('receiving.colors.no_colors')}</div>
            )}
          </div>

        </div>
      )}

      {/* ─── SUMMARY & ACTION BAR (NON-FIXED) ─── */}
      {isFetched && (
        <div className="fade-in card" style={{ 
          marginTop: '2rem',
          background: 'linear-gradient(135deg, var(--surface-color) 0%, rgba(30, 41, 59, 0.95) 100%)', 
          border: '2px solid var(--accent-color)', borderRadius: '16px', 
          padding: '1.25rem 2rem', boxShadow: '0 10px 40px rgba(0,0,0,0.5)',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem'
        }}>
          
          <div style={{ display: 'flex', gap: '3rem' }}>
            <div>
              <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>{t('receiving.summary.total_ctn')}</span>
              <div style={{ fontSize: '1.6rem', fontWeight: '900', color: '#fff', display: 'flex', gap: '4px', alignItems: 'baseline' }}>
                <PackageCheck size={20} color="var(--accent-color)" /> {totals.totalCtn} <span style={{ fontSize: '1rem', color: 'var(--text-muted)', fontWeight: 'normal' }}>{t('receiving.packages.cartons')}</span>
              </div>
            </div>
            <div style={{ width: '1px', background: 'rgba(212, 175, 55, 0.3)' }}></div>
            <div>
              <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>{t('receiving.summary.total_qty')}</span>
              <div style={{ fontSize: '1.6rem', fontWeight: '900', color: '#fff', display: 'flex', gap: '4px', alignItems: 'baseline' }}>
                <Box size={20} color="#4ade80" /> {totals.totalProd} <span style={{ fontSize: '1rem', color: 'var(--text-muted)', fontWeight: 'normal' }}>{t('receiving.packages.pcs')}</span>
              </div>
            </div>
            <div style={{ width: '1px', background: 'rgba(212, 175, 55, 0.3)' }}></div>
            <div>
              <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>{t('receiving.summary.total_amount')}</span>
              <div style={{ fontSize: '1.6rem', fontWeight: '900', color: 'var(--accent-color)', display: 'flex', gap: '4px', alignItems: 'baseline' }}>
                <Calculator size={20} /> {totalAmount.toLocaleString('en-US', { minimumFractionDigits: 2 })} <span style={{ fontSize: '1rem', color: 'var(--text-muted)', fontWeight: 'normal' }}>{productInfo.priceCurrency}</span>
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', alignItems: 'flex-end' }}>
             {!isStatusReceived && isFetched && (
                <div style={{ color: '#f87171', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '4px', fontWeight: 'bold' }}>
                   <AlertCircle size={14} /> {t('receiving.messages.received_status_required')}
                </div>
             )}
             {!isQtyMatching && isFetched && totals.totalProd > 0 && (
                <div style={{ color: '#eab308', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '4px', fontWeight: 'bold' }}>
                   <AlertCircle size={14} /> {t('receiving.messages.qty_mismatch_warning', { received: totals.totalProd, expected: expectedTotalQty })}
                </div>
             )}
             {!isColorsQtyMatching && isFetched && totals.totalProd > 0 && (
                <div style={{ color: '#eab308', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '4px', fontWeight: 'bold' }}>
                   <AlertCircle size={14} /> {t('receiving.messages.colors_mismatch_warning', { colors: totalColorsQty, total: totals.totalProd })}
                </div>
             )}
             
             {(hasPermission('receiving', 'add') || hasPermission('receiving', 'edit')) && (
               <button 
                 className="btn btn-primary" 
                 onClick={handleSave}
                 disabled={!canSave}
                 style={{ 
                   padding: '16px 40px', fontSize: '1.2rem', 
                   background: canSave ? 'linear-gradient(to right, #22c55e, #16a34a)' : 'var(--bg-color)',
                   color: canSave ? '#fff' : 'var(--text-muted)',
                   border: canSave ? 'none' : '1px solid var(--border-color)',
                 }}
               >
                 <Save size={24} />
                 {t('receiving.summary.save_btn')}
               </button>
             )}
          </div>
        </div>
      )}
      
    </div>
  );
};

export default FactoryReceiving;
