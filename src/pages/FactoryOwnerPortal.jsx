import React, { useState, useRef } from 'react';
import { supabase } from '../supabaseClient';
import { Search, Save, Factory, AlertCircle, Info, Palette, CheckCircle2, X, Box } from 'lucide-react';
import toast from 'react-hot-toast';
import { useTranslation } from 'react-i18next';
import { extractColorCSS } from '../utils/textUtils';

const FactoryOwnerPortal = () => {
  const { t } = useTranslation();
  const [modelNo, setModelNo] = useState('');
  const [isFetched, setIsFetched] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  
  // F9 Search States
  const [showSerialsList, setShowSerialsList] = useState(false);
  const [availableSerials, setAvailableSerials] = useState([]);
  const [serialSearchQuery, setSerialSearchQuery] = useState('');
  const [fetchingSerials, setFetchingSerials] = useState(false);
  const serialSearchRef = useRef(null);
  
  // Header Info State
  const [productInfo, setProductInfo] = useState({
    mainBarcode: '',
    prodFullName: '',
    prodPrice: 0,
    priceCurrency: '',
    reqTotalQuantity: 0,
    factoryId: '',
    factoryName: '',
    factoryStatus: t('owner.info.not_delivered') // Default Status
  });

  // Colors Table State
  const [colors, setColors] = useState([]);

  // Package Table State
  const [packages, setPackages] = useState(Array.from({ length: 4 }).map((_, i) => ({
    id: `Package_${i + 1}`,
    kind: '',
    status: '',
    fromCtn: '',
    toCtn: '',
    pcsPerCtn: '',
    active: i === 0
  })));

  // Original Order Data (so we don't overwrite other fields)
  const [originalOrderData, setOriginalOrderData] = useState(null);

  const handleSearch = async (overrideSerial) => {
    const termToSearch = typeof overrideSerial === 'string' ? overrideSerial : modelNo;
    if (!termToSearch.trim()) return;
    setModelNo(termToSearch);
    setIsSearching(true);
    
    try {
      const { data: oDataResp, error: oError } = await supabase
        .from('orders')
        .select('order_data')
        .eq('serial_number', termToSearch.trim())
        .single();
        
      if (oError || !oDataResp) {
         toast.error(`${t('owner.messages.not_found')} ${termToSearch}`);
         setIsSearching(false);
         setIsFetched(false);
         return;
      }
      
      const oData = oDataResp.order_data;
      setOriginalOrderData(oData);

      setProductInfo({
        mainBarcode: oData.barcode || `1000${oData.serialNumber}`,
        prodFullName: oData.productName || t('owner.messages.unregistered'),
        prodPrice: parseFloat(oData.productPrice) || 0,
        priceCurrency: oData.currency || '',
        reqTotalQuantity: parseInt(oData.totalQuantity) || 0,
        factoryId: oData.factoryId || t('owner.messages.undefined'),
        factoryName: '',
        factoryStatus: oData.factoryStatus || t('owner.info.not_delivered')
      });
      
      const newCols = [];

      if (oData.colorDistribution) {
         for (const [colorStr, sizesObj] of Object.entries(oData.colorDistribution)) {
            let expectedSum = 0;
            for (const qty of Object.values(sizesObj)) {
               expectedSum += parseInt(qty) || 0;
            }
            // Check if factory production data already exists
            const actualQty = oData.factoryProduction && oData.factoryProduction[colorStr] 
                ? oData.factoryProduction[colorStr] 
                : '';
                
            newCols.push({
                colorName: colorStr,
                expected: expectedSum,
                actualQuantity: actualQty
            });
         }
      }
      setColors(newCols);
      
      if (oData.factoryPackages) {
        setPackages(oData.factoryPackages);
      } else {
        setPackages(Array.from({ length: 4 }).map((_, i) => ({
          id: `Package_${i + 1}`, kind: '', status: '', fromCtn: '', toCtn: '', pcsPerCtn: '', active: i === 0
        })));
      }
      
      setIsFetched(true);
      toast.success(`${t('owner.messages.fetch_success')}: ${termToSearch}`);

    } catch (err) {
      toast.error(t('owner.messages.db_error'));
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

  const handleColorChange = (index, value) => {
    const updated = [...colors];
    updated[index].actualQuantity = value;
    setColors(updated);
  };

  const handlePackageChange = (index, field, value) => {
    const updated = [...packages];
    updated[index][field] = value;
    setPackages(updated);
  };

  const getPackageCalculations = (pkg) => {
    const from = parseInt(pkg.fromCtn);
    const to = parseInt(pkg.toCtn);
    const units = parseInt(pkg.pcsPerCtn);
    const hasRange = !isNaN(from) && !isNaN(to) && to >= from;
    const hasUnits = !isNaN(units) && units > 0;
    const totalCtnQty = hasRange ? (to - from + 1) : 0;
    const multiplier = pkg.kind === 'Doz' ? 12 : 1;
    const totalProdQty = (hasRange && hasUnits) ? (totalCtnQty * units * multiplier) : 0;
    return { totalCtnQty, totalProdQty };
  };

  const totals = packages.reduce((acc, pkg) => {
    if (!pkg.active) return acc;
    const calc = getPackageCalculations(pkg);
    return {
      totalCtn: acc.totalCtn + calc.totalCtnQty,
      totalProd: acc.totalProd + calc.totalProdQty
    };
  }, { totalCtn: 0, totalProd: 0 });

  const handleSave = async () => {
    if (!isFetched || !originalOrderData) {
      toast.error(t('owner.search.placeholder'));
      return;
    }

    const hasActualQuantities = colors.some(c => c.actualQuantity !== '' && parseInt(c.actualQuantity) > 0);
    if (hasActualQuantities) {
        if (productInfo.factoryStatus !== t('owner.info.delivered')) {
            toast.error(t('owner.messages.delivered_status_required'));
            return;
        }
    }

    const factoryProductionData = {};
    colors.forEach(c => {
        if (c.actualQuantity !== '') {
            factoryProductionData[c.colorName] = parseInt(c.actualQuantity) || 0;
        }
    });

    const updatedOrderData = {
        ...originalOrderData,
        factoryStatus: productInfo.factoryStatus,
        factoryProduction: factoryProductionData,
        factoryPackages: packages
    };
    
    const toastId = toast.loading(t('owner.messages.saving'));
    try {
      const { error } = await supabase
        .from('orders')
        .update({ order_data: updatedOrderData })
        .eq('serial_number', modelNo.trim());

      if (error) throw error;
      toast.success(t('owner.messages.save_success'), { id: toastId });
      
      // Reset form to allow entering a new model
      setModelNo('');
      setIsFetched(false);
      setProductInfo({
        mainBarcode: '', prodFullName: '', prodPrice: 0, priceCurrency: '',
        reqTotalQuantity: 0, factoryId: '', factoryName: '', factoryStatus: t('owner.info.not_delivered')
      });
      setColors([]);
      setPackages(Array.from({ length: 4 }).map((_, i) => ({
        id: `Package_${i + 1}`, kind: '', status: '', fromCtn: '', toCtn: '', pcsPerCtn: '', active: i === 0
      })));
      setOriginalOrderData(null);
      
    } catch (err) {
      toast.error(`${t('entry.messages.save_error')}: ${err.message}`, { id: toastId });
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
    <div className="fade-in" style={{ paddingBottom: '16rem' }}>
      {/* ─── HEADER ─── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h1 style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', fontSize: '2.2rem', margin: 0 }}>
            <Factory size={40} color="var(--accent-color)" />
            {t('owner.title')}
          </h1>
          <p style={{ color: 'var(--text-muted)', margin: '0.5rem 0 0' }}>
            {t('owner.desc')}
          </p>
        </div>
      </div>

      {/* ─── SEARCH SECTION ─── */}
      <div className="card" style={{ marginBottom: '2rem', border: '1px solid var(--accent-color)', boxShadow: '0 8px 30px rgba(212, 175, 55, 0.1)' }}>
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <div className="form-group" style={{ flex: 1, marginBottom: 0 }}>
            <label className="form-label">{t('owner.search.label')}</label>
            <div style={{ position: 'relative' }}>
              <input
                type="text"
                id="fetchSerialInput"
                className="form-control"
                value={modelNo}
                onChange={(e) => setModelNo(e.target.value)}
                onKeyDown={handleF9Press}
                placeholder={t('owner.search.placeholder')}
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
            {isSearching ? <div className="spinner" style={{ width: '22px', height: '22px', border: '3px solid #fff', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 1s linear infinite' }} /> : t('owner.search.btn')}
          </button>
        </div>
      </div>

      {isFetched && (
        <div id="factory-print-area" className="fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
          
          {/* ─── PRODUCT INFO CARD ─── */}
          <div className="card">
            <div className="tab-section-header">
              <h3><Info size={22} /> {t('owner.info.title')}</h3>
            </div>
            
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
              <div style={{ background: 'rgba(212,175,55,0.05)', padding: '12px 16px', borderRadius: '10px', border: '1px solid rgba(212,175,55,0.3)', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{t('owner.info.status')}</span>
                <select 
                   className="form-control" 
                   value={productInfo.factoryStatus} 
                   onChange={e => setProductInfo({...productInfo, factoryStatus: e.target.value})} 
                   style={{ 
                     padding: '4px', marginTop: '4px', fontWeight: 'bold', border: 'none', background: 'transparent',
                     color: productInfo.factoryStatus === t('owner.info.delivered') ? '#16a34a' : '#dc2626',
                     cursor: 'pointer'
                   }}
                >
                  <option value={t('owner.info.not_delivered')}>{t('owner.info.not_delivered')}</option>
                  <option value={t('owner.info.delivered')}>{t('owner.info.delivered')}</option>
                </select>
              </div>
              <InfoBox label={t('owner.info.factory')} value={`${productInfo.factoryId} - ${productInfo.factoryName}`} highlight />
              <InfoBox label={t('owner.info.barcode')} value={productInfo.mainBarcode} />
              <InfoBox label={t('owner.info.full_name')} value={productInfo.prodFullName} />
              <InfoBox label={t('owner.info.total_req')} value={productInfo.reqTotalQuantity} />
            </div>
          </div>

          {/* ─── PACKAGES ENTRY CARD (Optional) ─── */}
          <div className="card">
            <div className="tab-section-header">
              <h3><Box size={22} /> {t('owner.packages.title')}</h3>
            </div>
            
            <p style={{ color: 'var(--text-muted)', marginBottom: '1rem', fontSize: '0.9rem' }}>
              {t('owner.packages.desc')}
            </p>

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
                    opacity: pkg.active ? 1 : 0.8
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
                                {pkg.active ? t('owner.packages.active') : t('owner.packages.add')}
                             </label>
                          )}
                       </div>
                    </div>
                    
                    {/* Fields - only if active */}
                    {pkg.active && (
                      <div className="fade-in" style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem', alignItems: 'flex-end', paddingTop: '0.5rem', borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                        <div className="form-group" style={{ flex: 1, minWidth: '120px', marginBottom: 0 }}>
                          <label className="form-label" style={{ fontSize: '0.75rem' }}>{t('owner.packages.kind')}</label>
                          <select className="form-control" value={pkg.kind} onChange={e => handlePackageChange(idx, 'kind', e.target.value)}>
                            <option value=""></option>
                            <option value="Pcs">{t('owner.packages.pcs')}</option>
                            <option value="Doz">{t('owner.packages.doz')}</option>
                          </select>
                        </div>
                        <div className="form-group" style={{ flex: 1.5, minWidth: '150px', marginBottom: 0 }}>
                          <label className="form-label" style={{ fontSize: '0.75rem' }}>{t('owner.packages.carton_status')}</label>
                          <select className="form-control" value={pkg.status} onChange={e => handlePackageChange(idx, 'status', e.target.value)}>
                            <option value=""></option>
                            <option value="Full">{t('owner.packages.full')}</option>
                            <option value="Not Full">{t('owner.packages.not_full')}</option>
                          </select>
                        </div>
                        <div className="form-group" style={{ flex: 1, minWidth: '80px', marginBottom: 0 }}>
                          <label className="form-label" style={{ fontSize: '0.75rem' }}>{t('owner.packages.from')}</label>
                          <input type="number" className="form-control" value={pkg.fromCtn} onChange={e => handlePackageChange(idx, 'fromCtn', e.target.value)} />
                        </div>
                        <div className="form-group" style={{ flex: 1, minWidth: '80px', marginBottom: 0 }}>
                          <label className="form-label" style={{ fontSize: '0.75rem' }}>{t('owner.packages.to')}</label>
                          <input type="number" className="form-control" value={pkg.toCtn} onChange={e => handlePackageChange(idx, 'toCtn', e.target.value)} />
                        </div>
                        <div className="form-group" style={{ flex: 1.5, minWidth: '120px', marginBottom: 0 }}>
                          <label className="form-label" style={{ fontSize: '0.75rem' }}>{t('owner.packages.pcs_per_ctn')}</label>
                          <input type="number" className="form-control" value={pkg.pcsPerCtn} onChange={e => handlePackageChange(idx, 'pcsPerCtn', e.target.value)} />
                        </div>

                        {/* Result Segment */}
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
                              <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', display: 'block' }}>{t('owner.packages.total_ctns')}</span>
                              <strong style={{ fontSize: '1.2rem', color: '#4ade80' }}>{calc.totalCtnQty}</strong>
                            </div>
                            <div style={{ width: '1px', background: 'var(--border-color)' }}></div>
                            <div style={{ textAlign: 'center' }}>
                              <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', display: 'block' }}>{t('owner.packages.produced_pcs')}</span>
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
            
            {/* Total Packages Summary */}
            {totals.totalProd > 0 && (
                <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '1rem', padding: '1rem', background: 'rgba(212,175,55,0.05)', borderRadius: '10px', border: '1px solid rgba(212,175,55,0.2)' }}>
                   <div style={{ display: 'flex', gap: '2rem' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                         <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{t('owner.packages.factory_ctns')}</span>
                         <strong style={{ fontSize: '1.4rem', color: 'var(--accent-color)' }}>{totals.totalCtn}</strong>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                         <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{t('owner.packages.packed_pcs')}</span>
                         <strong style={{ fontSize: '1.4rem', color: 'var(--accent-color)' }}>{totals.totalProd}</strong>
                      </div>
                   </div>
                </div>
            )}
          </div>

          {/* ─── COLORS DISTRIBUTION CARD (Actual Manufactured) ─── */}
          <div className="card">
            <div className="tab-section-header">
              <h3 style={{ margin: 0 }}><Palette size={22} /> {t('owner.colors.title')}</h3>
            </div>
            
            <p style={{ color: 'var(--text-muted)', marginBottom: '1rem', fontSize: '0.9rem' }}>
              {t('owner.colors.desc')}
            </p>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: '1rem', marginTop: '1.5rem' }}>
              {colors.filter(c => c.colorName).map((c, i) => (
                <div key={i} style={{ background: 'var(--surface-highlight)', border: '1px solid var(--border-color)', borderRadius: '10px', overflow: 'hidden' }}>
                  <div style={{ background: 'var(--surface-color)', padding: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', fontSize: '0.85rem', fontWeight: 'bold', borderBottom: '1px solid var(--border-color)' }}>
                    <div style={{ width: '16px', height: '16px', borderRadius: '50%', border: '1px solid rgba(255,255,255,0.2)', backgroundColor: extractColorCSS(c.colorName), flexShrink: 0 }}></div>
                    {c.colorName}
                  </div>
                  <div style={{ padding: '10px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', display: 'flex', justifyContent: 'space-between' }}>
                      <span>{t('owner.colors.required')}</span> <strong>{c.expected}</strong>
                    </div>
                    <div>
                        <span style={{ fontSize: '0.75rem', color: 'var(--accent-color)' }}>{t('owner.colors.actual')}</span>
                        <input
                        type="number"
                        className="form-control"
                        value={c.actualQuantity}
                        onChange={(e) => handleColorChange(i, e.target.value)}
                        placeholder={t('owner.colors.qty')}
                        style={{ textAlign: 'center', background: 'var(--bg-color)', padding: '6px', fontSize: '1.1rem', marginTop: '4px' }}
                        />
                    </div>
                  </div>
                </div>
              ))}
            </div>
            {colors.filter(c => c.colorName).length === 0 && (
               <div style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '2rem' }}>{t('owner.colors.no_colors')}</div>
            )}
          </div>

        </div>
      )}

      {/* ─── FLOATING ACTION BAR ─── */}
      {isFetched && (
        <div className="fade-in" style={{ 
          position: 'fixed', bottom: '2rem', left: '50%', transform: 'translateX(-50%)', 
          width: '90%', maxWidth: '1200px', zIndex: 100, 
          background: 'linear-gradient(135deg, var(--surface-color) 0%, rgba(30, 41, 59, 0.95) 100%)', 
          border: '2px solid var(--accent-color)', borderRadius: '16px', 
          padding: '1.25rem 2rem', boxShadow: '0 10px 40px rgba(0,0,0,0.5)',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem'
        }}>
          
          <div style={{ display: 'flex', gap: '3rem' }}>
             <div style={{ color: '#fff', fontSize: '1rem', display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 'bold' }}>
                 {t('owner.summary.current_status')} <span style={{ color: productInfo.factoryStatus === t('owner.info.delivered') ? '#4ade80' : '#f87171' }}>{productInfo.factoryStatus}</span>
             </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', alignItems: 'flex-end' }}>
             {colors.some(c => c.actualQuantity !== '' && parseInt(c.actualQuantity) > 0) && (
                 <>
                   {colors.reduce((acc, c) => acc + (parseInt(c.actualQuantity) || 0), 0) !== productInfo.reqTotalQuantity && (
                     <div style={{ color: '#eab308', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '4px', fontWeight: 'bold' }}>
                        <AlertCircle size={14} /> {t('owner.summary.mismatch_warning', { total: productInfo.reqTotalQuantity })}
                     </div>
                   )}
                   {productInfo.factoryStatus !== t('owner.info.delivered') && (
                     <div style={{ color: '#f87171', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '4px', fontWeight: 'bold' }}>
                        <AlertCircle size={14} /> {t('owner.summary.delivery_required')}
                     </div>
                   )}
                   {totals.totalProd > 0 && totals.totalProd !== colors.reduce((acc, c) => acc + (parseInt(c.actualQuantity) || 0), 0) && (
                     <div style={{ color: '#eab308', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '4px', fontWeight: 'bold' }}>
                        <AlertCircle size={14} /> {t('owner.summary.packing_mismatch', { packed: totals.totalProd })}
                     </div>
                   )}
                 </>
             )}
             <button 
               className="btn btn-primary" 
               onClick={handleSave}
               style={{ 
                 padding: '16px 40px', fontSize: '1.2rem', 
                 background: 'linear-gradient(to right, #d4af37, #b48c1e)',
                 color: '#000',
                 opacity: (colors.some(c => c.actualQuantity !== '' && parseInt(c.actualQuantity) > 0) && productInfo.factoryStatus !== t('owner.info.delivered')) ? 0.5 : 1,
                 cursor: (colors.some(c => c.actualQuantity !== '' && parseInt(c.actualQuantity) > 0) && productInfo.factoryStatus !== t('owner.info.delivered')) ? 'not-allowed' : 'pointer'
               }}
             >
               <Save size={24} />
               {t('owner.summary.save_btn')}
             </button>
          </div>
        </div>
      )}
      
    </div>
  );
};

export default FactoryOwnerPortal;
