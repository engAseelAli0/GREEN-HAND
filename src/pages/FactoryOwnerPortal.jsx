import React, { useState, useRef } from 'react';
import { useAppData } from '../context/AppDataContext';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../supabaseClient';
import { Search, Save, Factory, AlertCircle, Info, Palette, CheckCircle2, X, Box, History } from 'lucide-react';
import toast from 'react-hot-toast';
import { useTranslation } from 'react-i18next';
import { extractColorCSS } from '../utils/textUtils';
import { isOrderAllowedForUser, fetchAllowedSerials, resolveFactoryDisplay } from '../utils/permissionUtils';

const InfoBox = ({ label, value, highlight }) => (
  <div style={{ background: highlight ? 'rgba(212,175,55,0.05)' : 'var(--bg-color)', padding: '12px 16px', borderRadius: '10px', border: highlight ? '1px solid rgba(212,175,55,0.3)' : '1px solid var(--border-color)', display: 'flex', flexDirection: 'column', gap: '4px' }}>
    <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{label}</span>
    <span style={{ fontSize: '1rem', fontWeight: 'bold', color: highlight ? 'var(--accent-color)' : 'var(--text-main)' }}>{value || '---'}</span>
  </div>
);

const FactoryOwnerPortal = () => {
  const { t } = useTranslation();
  const { lookups } = useAppData();
  const { user } = useAuth();
  const [modelNo, setModelNo] = useState('');
  const [isFetched, setIsFetched] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [showFactoryHistory, setShowFactoryHistory] = useState(false);
  const [savedFactoryReceivings, setSavedFactoryReceivings] = useState([]);
  const [factoryHistorySearch, setFactoryHistorySearch] = useState('');
  const [isLoadingFactoryHistory, setIsLoadingFactoryHistory] = useState(false);
  
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
      const { data: dedicatedRecord, error: dedicatedError } = await supabase
        .from('factory_receivings')
        .select('serial_number, factory_id, factory_name, company_name, receiving_data, order_data')
        .ilike('serial_number', termToSearch.trim())
        .maybeSingle();
      if (dedicatedError && dedicatedError.code !== 'PGRST205') throw dedicatedError;

      const { data: orderRecord } = await supabase
        .from('orders')
        .select('serial_number, order_data')
        .ilike('serial_number', termToSearch.trim())
        .single();

      let oDataResp = orderRecord;
      if (dedicatedRecord) {
        oDataResp = {
          serial_number: dedicatedRecord.serial_number,
          order_data: {
            ...(orderRecord?.order_data || {}),
            ...(dedicatedRecord.order_data || {}),
            ...(dedicatedRecord.receiving_data || {}),
            factoryId: dedicatedRecord.factory_id || dedicatedRecord.order_data?.factoryId || orderRecord?.order_data?.factoryId || '',
            factoryName: dedicatedRecord.factory_name || dedicatedRecord.order_data?.factoryName || orderRecord?.order_data?.factoryName || '',
            buyerCompany: dedicatedRecord.company_name || dedicatedRecord.order_data?.buyerCompany || orderRecord?.order_data?.buyerCompany || ''
          }
        };
      }

      if (!oDataResp) {
         toast.error(`${t('owner.messages.not_found')} ${termToSearch}`);
         setIsSearching(false);
         setIsFetched(false);
         return;
      }
      
      const oData = oDataResp.order_data;

      // Scoped permissions check: ensure user has access to this factory
      if (!isOrderAllowedForUser(oDataResp, user, lookups?.factories)) {
         toast.error(t('auth.unauthorized_factory', { defaultValue: 'ليس لديك صلاحية للوصول إلى بيانات هذا المصنع' }));
         setIsSearching(false);
         setIsFetched(false);
         setOriginalOrderData(null);
         return;
      }

      setModelNo(oDataResp.serial_number);
      setOriginalOrderData(oData);

      const factoryDisplay = resolveFactoryDisplay(oData.factoryId, lookups?.factories);

      setProductInfo({
        mainBarcode: oData.barcode || `1000${oData.serialNumber}`,
        prodFullName: oData.productName || t('owner.messages.unregistered'),
        prodPrice: parseFloat(oData.productPrice) || 0,
        priceCurrency: oData.currency || '',
        reqTotalQuantity: parseInt(oData.totalQuantity) || 0,
        factoryId: factoryDisplay.code || oData.factoryId || t('owner.messages.undefined'),
        factoryName: factoryDisplay.name || '',
        factoryLabel: factoryDisplay.label || oData.factoryId || t('owner.messages.undefined'),
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

  const loadSavedFactoryReceivings = async () => {
    setIsLoadingFactoryHistory(true);
    try {
      const { data: dedicatedData, error: dedicatedError } = await supabase
        .from('factory_receivings')
        .select('serial_number, factory_id, factory_name, company_name, receiving_data, order_data, updated_at')
        .order('updated_at', { ascending: false })
        .limit(500);

      let data = [];
      if (dedicatedError?.code === 'PGRST205') {
        const { data: legacyData, error: legacyError } = await supabase
          .from('orders')
          .select('serial_number, order_data')
          .limit(500);
        if (legacyError) throw legacyError;
        data = legacyData || [];
      } else if (dedicatedError) {
        throw dedicatedError;
      } else {
        data = (dedicatedData || []).map(record => ({
          ...record,
          order_data: {
            ...(record.order_data || {}),
            ...(record.receiving_data || {}),
            factoryId: record.factory_id || record.order_data?.factoryId || '',
            factoryName: record.factory_name || record.order_data?.factoryName || '',
            buyerCompany: record.company_name || record.order_data?.buyerCompany || record.order_data?.company || ''
          }
        }));

        // Include old order mirrors until existing data is migrated.
        const { data: legacyData, error: legacyError } = await supabase
          .from('orders')
          .select('serial_number, order_data')
          .limit(500);
        if (!legacyError && legacyData) {
          const recordsBySerial = new Map(legacyData.map(record => [String(record.serial_number), record]));
          data.forEach(record => recordsBySerial.set(String(record.serial_number), record));
          data = Array.from(recordsBySerial.values());
        }
      }

      const saved = (data || []).filter(record => {
        if (!record.serial_number || !isOrderAllowedForUser(record, user, lookups?.factories)) return false;
        const orderData = record.order_data || {};
        return Boolean(
          orderData.factoryStatus
          || Object.keys(orderData.factoryProduction || {}).length > 0
          || (Array.isArray(orderData.factoryPackages) && orderData.factoryPackages.some(pkg => pkg && pkg.active && (pkg.fromCtn || pkg.toCtn || pkg.pcsPerCtn)))
        );
      });
      setSavedFactoryReceivings(saved);
    } catch (error) {
      console.error('Error loading saved factory receivings:', error);
      setSavedFactoryReceivings([]);
      toast.error(t('owner.messages.db_error'));
    } finally {
      setIsLoadingFactoryHistory(false);
    }
  };

  const openFactoryHistory = () => {
    setFactoryHistorySearch('');
    setShowFactoryHistory(true);
    loadSavedFactoryReceivings();
  };

  const filteredSavedFactoryReceivings = savedFactoryReceivings.filter(record => {
    const query = factoryHistorySearch.trim().toLowerCase();
    if (!query) return true;
    const orderData = record.order_data || {};
    return [record.serial_number, orderData.factoryId, orderData.productName]
      .some(value => String(value || '').toLowerCase().includes(query));
  });

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
        const serials = await fetchAllowedSerials(supabase, user, lookups?.factories);
        setAvailableSerials(serials);
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

    if (!isOrderAllowedForUser({ order_data: originalOrderData }, user, lookups?.factories)) {
      toast.error(t('auth.unauthorized_factory', { defaultValue: 'ليس لديك صلاحية للوصول إلى بيانات هذا المصنع' }));
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
    const dedicatedPayload = {
        serial_number: modelNo.trim(),
        factory_id: productInfo.factoryId || originalOrderData.factoryId || '',
        factory_name: productInfo.factoryName || originalOrderData.factoryName || '',
        company_name: originalOrderData.buyerCompany || originalOrderData.company || '',
        receiving_data: {
          factoryStatus: productInfo.factoryStatus,
          factoryProduction: factoryProductionData,
          factoryPackages: packages,
          savedAt: new Date().toISOString()
        },
        order_data: updatedOrderData,
        received_at: new Date().toISOString()
    };
    
    const toastId = toast.loading(t('owner.messages.saving'));
    try {
      const { error: dedicatedError } = await supabase
        .from('factory_receivings')
        .upsert(dedicatedPayload, { onConflict: 'serial_number' });
      if (dedicatedError && dedicatedError.code !== 'PGRST205') throw dedicatedError;

      const { error } = await supabase
        .from('orders')
        .update({ order_data: updatedOrderData })
        .ilike('serial_number', modelNo.trim());

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

  return (
    <div className="fade-in" style={{ paddingBottom: '2rem' }}>
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
          <button type="button" className="btn btn-outline" onClick={openFactoryHistory} style={{ padding: '14px 18px', display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
            <History size={18} /> {t('export.select_saved')}
          </button>
        </div>

        {showFactoryHistory && (
          <div className="card fade-in" style={{ marginTop: '1.25rem', padding: 0, overflow: 'hidden', border: '1px solid var(--accent-color)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem', padding: '1rem 1.25rem', borderBottom: '1px solid var(--border-color)', background: 'var(--surface-highlight)' }}>
              <strong>{t('export.select_saved')}</strong>
              <button type="button" onClick={() => setShowFactoryHistory(false)} style={{ background: 'none', border: 'none', color: 'var(--text-main)', cursor: 'pointer', display: 'flex' }}>
                <X size={20} />
              </button>
            </div>
            <div style={{ padding: '0.85rem', borderBottom: '1px solid var(--border-color)' }}>
              <input
                type="text"
                className="form-control"
                value={factoryHistorySearch}
                onChange={event => setFactoryHistorySearch(event.target.value)}
                placeholder={t('export.search_placeholder')}
              />
            </div>
            <div style={{ maxHeight: '260px', overflowY: 'auto' }}>
              {isLoadingFactoryHistory ? (
                <div style={{ padding: '1.5rem', textAlign: 'center', color: 'var(--text-muted)' }}>{t('entry.actions.loading')}</div>
              ) : filteredSavedFactoryReceivings.length === 0 ? (
                <div style={{ padding: '1.5rem', textAlign: 'center', color: 'var(--text-muted)' }}>{t('entry.actions.no_saved_models')}</div>
              ) : (
                filteredSavedFactoryReceivings.map(record => (
                  <button
                    type="button"
                    key={record.serial_number}
                    onClick={() => {
                      setShowFactoryHistory(false);
                      handleSearch(String(record.serial_number));
                    }}
                    style={{ width: '100%', padding: '0.8rem 1rem', border: 'none', borderBottom: '1px solid var(--border-color)', background: 'transparent', color: 'var(--text-main)', textAlign: 'start', cursor: 'pointer', fontWeight: 'bold' }}
                  >
                    {record.serial_number}
                    <span style={{ display: 'block', marginTop: '0.2rem', fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 'normal' }}>
                      {record.order_data?.factoryId || '-'} · {record.order_data?.productName || '-'}
                    </span>
                  </button>
                ))
              )}
            </div>
          </div>
        )}
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
              <InfoBox label={t('owner.info.factory')} value={productInfo.factoryLabel || (productInfo.factoryName ? `${productInfo.factoryId} - ${productInfo.factoryName}` : productInfo.factoryId)} highlight />
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
                    <div style={{ width: '16px', height: '16px', borderRadius: '50%', border: '1px solid rgba(255,255,255,0.2)', backgroundColor: extractColorCSS(c.colorName, lookups?.colors || []), flexShrink: 0 }}></div>
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

      {/* ─── ACTION BAR (NON-FIXED) ─── */}
      {isFetched && (
        <div className="fade-in card" style={{ 
          marginTop: '2rem',
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
