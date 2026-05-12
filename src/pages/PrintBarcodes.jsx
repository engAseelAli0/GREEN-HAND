import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useAppData } from '../context/AppDataContext';
import { supabase } from '../supabaseClient';
import toast from 'react-hot-toast';
import { useTranslation } from 'react-i18next';
import { Search, Printer, ArrowRight, Barcode as BarcodeIcon, Hash, Package, Layers, Palette, Ruler, BarChart3, Sparkles, X, Settings, Save, RotateCcw } from 'lucide-react';
import { englishOnly } from '../utils/textUtils';
import { Link } from 'react-router-dom';
import ReactBarcode from 'react-barcode';

const LS_KEY = 'barcode_print_settings';
const DEFAULT_PRINT_SETTINGS = {
  paperWidth: 9.401, paperHeight: 2.601, orientation: 'portrait',
  marginTop: 0.051, marginBottom: 0.051, marginLeft: 0.036, marginRight: 0.036,
  labelWidth: 3.0, labelHeight: 2.499,
  columns: 3, rows: 1, columnGap: 0, rowGap: 0,
};

const loadSettings = () => {
  try { const s = localStorage.getItem(LS_KEY); return s ? { ...DEFAULT_PRINT_SETTINGS, ...JSON.parse(s) } : { ...DEFAULT_PRINT_SETTINGS }; }
  catch { return { ...DEFAULT_PRINT_SETTINGS }; }
};

const inputStyle = { width: 90, padding: '0.5rem 0.6rem', background: 'var(--bg-color)', border: '1px solid var(--border-color)', borderRadius: 10, color: '#fff', fontSize: '0.95rem', fontWeight: 700, fontFamily: "'Outfit', sans-serif", textAlign: 'center', direction: 'ltr' };
const rowStyle = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.7rem 0', borderBottom: '1px solid rgba(255,255,255,0.04)' };

const FieldRow = ({ label, fieldKey, unit = 'cm', settings, onUpdate }) => (
  <div style={rowStyle}>
    <label style={{ fontSize: '0.9rem', fontWeight: 500, color: 'var(--text-main)' }}>{label}</label>
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
      <input type="number" step="0.001" min="0" value={settings[fieldKey] ?? ''} onChange={e => onUpdate(fieldKey, e.target.value)} style={inputStyle} />
      <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 600 }}>{unit}</span>
    </div>
  </div>
);

const IntField = ({ label, fieldKey, unit = '', settings, onUpdate }) => (
  <div style={rowStyle}>
    <label style={{ fontSize: '0.9rem', fontWeight: 500, color: 'var(--text-main)' }}>{label}</label>
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
      <input type="number" step="1" min="1" value={settings[fieldKey] ?? ''} onChange={e => onUpdate(fieldKey, e.target.value)} style={{ ...inputStyle, width: 70 }} />
      {unit && <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 600 }}>{unit}</span>}
    </div>
  </div>
);

const PrintBarcodes = () => {
  const { t } = useTranslation();
  const { lookups } = useAppData();
  const [serialInput, setSerialInput] = useState('');
  const [order, setOrder] = useState(null);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [printSettings, setPrintSettings] = useState(loadSettings);
  const [tempSettings, setTempSettings] = useState(loadSettings);
  const [showPageSetup, setShowPageSetup] = useState(false);
  const [setupTab, setSetupTab] = useState('paper');
  const [showStickers, setShowStickers] = useState(false);
  const isPrintingRef = useRef(false);
  
  // F9 Search States
  const [showSerialsList, setShowSerialsList] = useState(false);
  const [availableSerials, setAvailableSerials] = useState([]);
  const [serialSearchQuery, setSerialSearchQuery] = useState('');
  const [fetchingSerials, setFetchingSerials] = useState(false);
  const serialSearchRef = React.useRef(null);
  
  const handleFetchOrder = async (overrideSerial) => {
    const termToSearch = typeof overrideSerial === 'string' ? overrideSerial : serialInput;
    if (!termToSearch.trim()) {
      toast.error(t('print.messages.enter_serial'));
      return;
    }
    setSerialInput(termToSearch);
    setLoading(true);
    const toastId = toast.loading(t('print.messages.fetching'));
    try {
      const { data, error } = await supabase
        .from('orders')
        .select('order_data')
        .eq('serial_number', termToSearch.trim())
        .single();
        
      if (error || !data) {
        toast.error(t('print.messages.not_found'), { id: toastId });
        setOrder(null);
        setRows([]);
      } else {
        toast.success(t('print.messages.found'), { id: toastId });
        generateRows(data.order_data, termToSearch.trim());
      }
    } catch (err) {
      toast.error(t('print.messages.conn_error'), { id: toastId });
    }
    setLoading(false);
  };

  const handleF9Press = async (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleFetchOrder();
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
  
  const generateRows = (orderData, serial) => {
    setOrder({ ...orderData, serial_number: serial });
    
    let codePrefix = '0000';
    if (orderData.productName && lookups.products) {
      const p = lookups.products.find(x => (typeof x === 'object' ? x.name : x) === orderData.productName);
      if (p && p.codePrefix) codePrefix = p.codePrefix;
    }
    
    const newRows = [];
    
    if (orderData.colorDistribution) {
       Object.keys(orderData.colorDistribution).forEach(colorName => {
         let abbr = '???';
         let hex = '#ffffff';
         const cInfo = lookups.colors?.find(c => typeof c === 'object' ? c.name === colorName : c === colorName);
         if (cInfo && typeof cInfo === 'object') {
             if (cInfo.abbr) abbr = cInfo.abbr;
             if (cInfo.hex) hex = cInfo.hex;
         }
         
         const batchBarcode = `${codePrefix}${serial}-${abbr}`;
         
         const sizeCols = orderData.colorDistribution[colorName];
         Object.keys(sizeCols).forEach(sizeName => {
           const qty = parseInt(sizeCols[sizeName]) || 0;
           if (qty > 0) {
             newRows.push({
               itemNumber: serial,
               itemName: englishOnly(orderData.productName) || 'Unknown',
               batchBarcode: batchBarcode,
               size: sizeName,
               quantity: qty,
               colorRef: colorName,
               colorHex: hex
             });
           }
         });
       });
    }
    
    setRows(newRows);
  };

  const handleSaveSettings = () => {
    const parsed = { ...tempSettings };
    ['paperWidth','paperHeight','marginTop','marginBottom','marginLeft','marginRight','labelWidth','labelHeight','columnGap','rowGap'].forEach(k => {
      parsed[k] = parseFloat(parsed[k]) || 0;
    });
    ['columns','rows'].forEach(k => {
      parsed[k] = parseInt(parsed[k]) || 1;
    });
    setPrintSettings(parsed);
    setTempSettings(parsed);
    localStorage.setItem(LS_KEY, JSON.stringify(parsed));
    setShowPageSetup(false);
    toast.success(t('print.messages.save_success'));
  };

  const handleOpenSetup = () => {
    setTempSettings({ ...printSettings });
    setSetupTab('paper');
    setShowPageSetup(true);
  };

  const handleResetSettings = () => {
    setTempSettings({ ...DEFAULT_PRINT_SETTINGS });
    toast(t('print.messages.reset_success'), { icon: '🔄' });
  };

  const updateTemp = (key, val) => {
    setTempSettings(prev => ({ ...prev, [key]: val }));
  };

  const handlePrint = () => {
    if (rows.length === 0) return;
    isPrintingRef.current = true;
    setShowStickers(true);
  };

  // When stickers are mounted in the DOM, trigger the actual print
  useEffect(() => {
    if (showStickers && isPrintingRef.current) {
      // Give the browser a moment to render all barcode SVGs
      const timer = setTimeout(() => {
        window.print();
        // After print dialog closes, remove stickers from DOM to free memory
        isPrintingRef.current = false;
        setShowStickers(false);
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [showStickers]);

  const totalQty = rows.reduce((sum, r) => sum + r.quantity, 0);
  const uniqueColors = [...new Set(rows.map(r => r.colorRef))];
  const uniqueSizes = [...new Set(rows.map(r => r.size))];

  // Compute size range string (e.g. "S-XXL") from standard size ordering
  const sizeOrder = ['XXS', 'XS', 'S', 'M', 'L', 'XL', 'XXL', 'XXXL', '3XL', '4XL', '5XL'];
  const getSizeRange = () => {
    if (uniqueSizes.length === 0) return '';
    if (uniqueSizes.length === 1) return uniqueSizes[0];
    const sorted = [...uniqueSizes].sort((a, b) => {
      const ai = sizeOrder.indexOf(a.toUpperCase());
      const bi = sizeOrder.indexOf(b.toUpperCase());
      if (ai === -1 && bi === -1) return a.localeCompare(b);
      if (ai === -1) return 1;
      if (bi === -1) return -1;
      return ai - bi;
    });
    return `${sorted[0]}-${sorted[sorted.length - 1]}`;
  };
  const sizeRange = getSizeRange();

  return (
    <div className="fade-in" style={{ minHeight: '100vh', padding: '1.5rem' }}>
      <style key={JSON.stringify(printSettings)}>{`
        /* ═══════════════════════════════════════════════════
           BARCODE PAGE — PREMIUM DESIGN SYSTEM
           ═══════════════════════════════════════════════════ */

        .bc-page-wrapper {
          max-width: 1280px;
          margin: 0 auto;
        }

        /* ── Header ── */
        .bc-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 1.5rem 2rem;
          background: linear-gradient(135deg, var(--surface-color), var(--bg-color));
          border-radius: 20px;
          border: 1px solid rgba(212, 175, 55, 0.15);
          box-shadow: 0 8px 32px rgba(0, 0, 0, 0.25), inset 0 1px 0 rgba(255,255,255,0.04);
          margin-bottom: 1.5rem;
        }

        .bc-header-title-group {
          display: flex;
          align-items: center;
          gap: 1rem;
        }

        .bc-header-icon {
          width: 52px;
          height: 52px;
          display: flex;
          align-items: center;
          justify-content: center;
          background: linear-gradient(135deg, var(--accent-color), #b58d27);
          border-radius: 14px;
          box-shadow: 0 6px 20px rgba(212, 175, 55, 0.3);
          flex-shrink: 0;
        }

        .bc-header h1 {
          margin: 0;
          font-size: 1.5rem;
          font-weight: 800;
          letter-spacing: -0.3px;
          background: linear-gradient(135deg, #fff, var(--accent-color));
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
        }

        .bc-header p {
          margin: 0.2rem 0 0 0;
          color: var(--text-muted);
          font-size: 0.88rem;
        }

        .bc-back-btn {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          padding: 0.65rem 1.25rem;
          background: rgba(255,255,255,0.04);
          border: 1px solid var(--border-color);
          border-radius: 12px;
          color: var(--text-muted);
          text-decoration: none;
          font-family: 'Tajawal', sans-serif;
          font-weight: 500;
          font-size: 0.9rem;
          transition: all 0.25s ease;
          cursor: pointer;
        }

        .bc-back-btn:hover {
          background: rgba(255,255,255,0.08);
          border-color: rgba(212, 175, 55, 0.3);
          color: var(--text-strong);
          transform: translateY(-1px);
        }

        /* ── Search Section ── */
        .bc-search-card {
          padding: 1.75rem 2rem;
          background: var(--surface-color);
          border-radius: 20px;
          border: 1px solid var(--border-color);
          box-shadow: 0 4px 24px rgba(0, 0, 0, 0.15);
          margin-bottom: 1.5rem;
        }

        .bc-search-label {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          font-size: 0.85rem;
          font-weight: 500;
          color: var(--text-muted);
          margin-bottom: 0.75rem;
        }

        .bc-search-row {
          display: flex;
          gap: 0.85rem;
          align-items: stretch;
        }

        .bc-search-input-wrap {
          position: relative;
          flex: 1;
          max-width: 420px;
        }

        .bc-search-input-wrap .search-icon {
          position: absolute;
          right: 14px;
          top: 50%;
          transform: translateY(-50%);
          color: var(--accent-color);
          pointer-events: none;
        }

        .bc-search-input {
          width: 100%;
          padding: 0.85rem 3rem 0.85rem 1rem;
          font-size: 1.15rem;
          font-weight: 700;
          letter-spacing: 2.5px;
          font-family: 'Outfit', 'Tajawal', sans-serif;
          background: var(--bg-color);
          color: #fff;
          border: 1.5px solid var(--border-color);
          border-radius: 14px;
          transition: all 0.3s ease;
        }

        .bc-search-input:focus {
          outline: none;
          border-color: var(--accent-color);
          box-shadow: 0 0 0 4px rgba(212, 175, 55, 0.12);
        }

        .bc-search-input::placeholder {
          color: rgba(255,255,255,0.2);
          font-weight: 400;
          letter-spacing: 1px;
        }

        .bc-generate-btn {
          display: inline-flex;
          align-items: center;
          gap: 0.5rem;
          padding: 0 2rem;
          background: linear-gradient(135deg, var(--accent-color), #b58d27);
          color: #000;
          border: none;
          border-radius: 14px;
          font-family: 'Tajawal', sans-serif;
          font-weight: 700;
          font-size: 1rem;
          cursor: pointer;
          transition: all 0.3s ease;
          box-shadow: 0 4px 16px rgba(212, 175, 55, 0.25);
          white-space: nowrap;
        }

        .bc-generate-btn:hover {
          transform: translateY(-2px);
          box-shadow: 0 8px 24px rgba(212, 175, 55, 0.35);
        }

        .bc-generate-btn:disabled {
          opacity: 0.6;
          cursor: not-allowed;
          transform: none;
        }

        .bc-print-btn {
          display: inline-flex;
          align-items: center;
          gap: 0.5rem;
          padding: 0 1.5rem;
          background: linear-gradient(135deg, #10b981, #059669);
          color: #fff;
          border: none;
          border-radius: 14px;
          font-family: 'Tajawal', sans-serif;
          font-weight: 600;
          font-size: 0.95rem;
          cursor: pointer;
          transition: all 0.3s ease;
          box-shadow: 0 4px 16px rgba(16, 185, 129, 0.2);
          white-space: nowrap;
        }

        .bc-print-btn:hover {
          transform: translateY(-2px);
          box-shadow: 0 8px 24px rgba(16, 185, 129, 0.3);
        }

        /* ── Stats Row ── */
        .bc-stats-row {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
          gap: 1rem;
          margin-bottom: 1.5rem;
        }

        .bc-stat-card {
          display: flex;
          align-items: center;
          gap: 0.85rem;
          padding: 1.15rem 1.25rem;
          background: var(--surface-color);
          border-radius: 16px;
          border: 1px solid var(--border-color);
          transition: all 0.25s ease;
        }

        .bc-stat-card:hover {
          border-color: rgba(212, 175, 55, 0.2);
          transform: translateY(-2px);
          box-shadow: 0 8px 24px rgba(0, 0, 0, 0.2);
        }

        .bc-stat-icon {
          width: 42px;
          height: 42px;
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: 12px;
          flex-shrink: 0;
        }

        .bc-stat-value {
          font-size: 1.4rem;
          font-weight: 800;
          color: var(--text-strong);
          font-family: 'Outfit', sans-serif;
          line-height: 1.1;
        }

        .bc-stat-label {
          font-size: 0.78rem;
          color: var(--text-muted);
          font-weight: 500;
          margin-top: 0.1rem;
        }

        /* ── Table Section ── */
        .bc-table-card {
          background: var(--surface-color);
          border-radius: 20px;
          border: 1px solid var(--border-color);
          box-shadow: 0 6px 32px rgba(0, 0, 0, 0.18);
          overflow: hidden;
        }

        .bc-table-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 1.25rem 1.75rem;
          border-bottom: 1px solid var(--border-color);
          background: rgba(255,255,255,0.015);
        }

        .bc-table-title {
          display: flex;
          align-items: center;
          gap: 0.6rem;
          font-size: 1rem;
          font-weight: 600;
          color: var(--text-strong);
        }

        .bc-table-badge {
          display: inline-flex;
          align-items: center;
          gap: 0.3rem;
          padding: 0.3rem 0.75rem;
          background: rgba(212, 175, 55, 0.1);
          color: var(--accent-color);
          border-radius: 20px;
          font-size: 0.78rem;
          font-weight: 600;
          border: 1px solid rgba(212, 175, 55, 0.15);
          font-family: 'Outfit', sans-serif;
        }

        .bc-table-scroll {
          overflow-x: auto;
        }

        .bc-table {
          width: 100%;
          border-collapse: separate;
          border-spacing: 0;
        }

        .bc-table thead th {
          padding: 1rem 1.25rem;
          font-size: 0.78rem;
          font-weight: 600;
          color: var(--text-muted);
          text-transform: uppercase;
          letter-spacing: 0.06em;
          border-bottom: 1px solid var(--border-color);
          background: rgba(255,255,255,0.02);
          white-space: nowrap;
          text-align: right;
        }

        .bc-table thead th:not(:first-child) {
          text-align: center;
        }

        .bc-table tbody td {
          padding: 1rem 1.25rem;
          border-bottom: 1px solid rgba(255,255,255,0.03);
          vertical-align: middle;
          text-align: right;
        }

        .bc-table tbody td:not(:first-child) {
          text-align: center;
        }

        .bc-table tbody tr {
          transition: background 0.2s ease;
        }

        .bc-table tbody tr:hover {
          background: rgba(212, 175, 55, 0.03);
        }

        .bc-table tbody tr:last-child td {
          border-bottom: none;
        }

        /* ── Table Cell Styles ── */
        .bc-cell-item {
          display: flex;
          flex-direction: column;
          gap: 0.2rem;
        }

        .bc-cell-serial {
          font-weight: 700;
          font-size: 0.95rem;
          color: var(--text-strong);
          font-family: 'Outfit', sans-serif;
          letter-spacing: 0.5px;
        }

        .bc-cell-name {
          font-size: 0.82rem;
          color: var(--text-muted);
          font-weight: 400;
        }

        .bc-cell-barcode {
          display: inline-flex;
          align-items: center;
          gap: 0.5rem;
          padding: 0.45rem 0.85rem;
          background: rgba(0, 0, 0, 0.25);
          border-radius: 10px;
          border: 1px solid rgba(212, 175, 55, 0.2);
          font-family: 'Courier New', Courier, monospace;
          font-weight: 700;
          font-size: 0.88rem;
          letter-spacing: 1.5px;
          color: var(--accent-color);
          direction: ltr;
        }

        .bc-cell-color-wrap {
          display: inline-flex;
          align-items: center;
          gap: 0.5rem;
          justify-content: center;
        }

        .bc-cell-color-dot {
          width: 18px;
          height: 18px;
          border-radius: 6px;
          border: 2px solid rgba(255,255,255,0.15);
          flex-shrink: 0;
        }

        .bc-cell-color-name {
          font-weight: 500;
          color: var(--text-main);
          font-size: 0.9rem;
        }

        .bc-cell-size {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          min-width: 44px;
          padding: 0.35rem 0.85rem;
          background: rgba(255,255,255,0.06);
          border-radius: 8px;
          border: 1px solid rgba(255,255,255,0.08);
          font-weight: 700;
          font-size: 0.95rem;
          color: var(--text-strong);
          font-family: 'Outfit', sans-serif;
        }

        .bc-cell-qty {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 0.3rem;
          padding: 0.4rem 1rem;
          background: rgba(16, 185, 129, 0.1);
          color: #34d399;
          border-radius: 10px;
          font-weight: 800;
          font-size: 1rem;
          border: 1px solid rgba(16, 185, 129, 0.15);
          font-family: 'Outfit', sans-serif;
        }

        /* ── Total Row ── */
        .bc-total-row {
          background: rgba(212, 175, 55, 0.04) !important;
        }

        .bc-total-row td {
          border-top: 2px solid rgba(212, 175, 55, 0.15) !important;
          border-bottom: none !important;
          padding: 1.15rem 1.25rem !important;
        }

        .bc-total-label {
          font-weight: 700;
          font-size: 1rem;
          color: var(--text-strong);
          display: flex;
          align-items: center;
          gap: 0.5rem;
        }

        .bc-total-value {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 0.35rem;
          padding: 0.5rem 1.5rem;
          background: linear-gradient(135deg, var(--accent-color), #b58d27);
          color: #000;
          border-radius: 12px;
          font-weight: 900;
          font-size: 1.15rem;
          font-family: 'Outfit', sans-serif;
          box-shadow: 0 4px 14px rgba(212, 175, 55, 0.3);
        }

        /* ── Empty State ── */
        .bc-empty-state {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          padding: 5rem 2rem;
          text-align: center;
        }

        .bc-empty-icon {
          width: 72px;
          height: 72px;
          display: flex;
          align-items: center;
          justify-content: center;
          background: rgba(212, 175, 55, 0.06);
          border-radius: 20px;
          border: 1px dashed rgba(212, 175, 55, 0.2);
          margin-bottom: 1rem;
        }

        .bc-empty-text {
          color: var(--text-muted);
          font-size: 1rem;
          max-width: 380px;
          line-height: 1.6;
        }

        /* ── Print stickers (hidden on screen) ── */
        .print-only-stickers {
           display: none;
        }

        .page-setup-modal-overlay { display: none; }

        @media print {
          @page {
            size: ${printSettings.paperWidth || 9.401}cm ${printSettings.paperHeight || 2.601}cm;
            margin: ${printSettings.marginTop || 0}cm ${printSettings.marginRight || 0}cm ${printSettings.marginBottom || 0}cm ${printSettings.marginLeft || 0}cm;
          }
          body { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; background: #fff !important; margin: 0 !important; padding: 0 !important; }
          .hide-on-print, .page-setup-modal-overlay { display: none !important; }
          .printable-section { display: none !important; }
          .bc-stats-row { display: none !important; }
          .bc-page-wrapper { max-width: 100% !important; padding: 0 !important; }

          .print-only-stickers {
             display: block !important;
             width: 100%;
             padding: 0;
             direction: ltr !important;
             text-align: left !important;
          }

          .sticker-page {
             display: grid !important;
             grid-template-columns: repeat(${printSettings.columns || 1}, ${printSettings.labelWidth || 3}cm) !important;
             grid-template-rows: ${printSettings.labelHeight || 2.499}cm !important;
             column-gap: ${printSettings.columnGap || 0}cm !important;
             width: fit-content !important;
             page-break-after: always;
             break-after: page;
             box-sizing: border-box;
             overflow: hidden;
             align-content: start;
             justify-content: start;
          }

          .sticker-page:last-child {
             page-break-after: auto;
             break-after: auto;
          }

          .sticker-label {
             width: 100% !important;
             height: 100% !important;
             border: none;
             padding: 0.1cm;
             background: transparent;
             box-sizing: border-box;
             page-break-inside: avoid;
             break-inside: avoid;
             display: flex;
             flex-direction: column;
             align-items: center;
             justify-content: space-between;
             direction: ltr !important;
             text-align: left !important;
          }

          /* Row 1: Model No */
          .sticker-row-model {
             display: flex;
             align-items: baseline;
             gap: 0.1cm;
             width: 100%;
             font-family: Arial, Helvetica, sans-serif;
             color: #000;
             margin-bottom: 0;
             line-height: 1.1;
             white-space: nowrap;
             overflow: hidden;
          }

          .sticker-row-model .sticker-lbl {
             font-size: 7.5pt;
             font-weight: 700;
          }

          .sticker-row-model .sticker-val {
             font-size: 9pt;
             font-weight: 900;
             letter-spacing: 0.3px;
          }

          /* Row 2: Size + Range */
          .sticker-row-size {
             display: flex;
             justify-content: space-between;
             align-items: baseline;
             width: 100%;
             font-family: Arial, Helvetica, sans-serif;
             color: #000;
             margin-bottom: 0;
             line-height: 1.1;
             white-space: nowrap;
             overflow: hidden;
          }

          .sticker-row-size .sticker-size-left {
             display: flex;
             align-items: baseline;
             gap: 0.1cm;
          }

          .sticker-row-size .sticker-lbl {
             font-size: 7.5pt;
             font-weight: 700;
          }

          .sticker-row-size .sticker-val {
             font-size: 8.5pt;
             font-weight: 900;
          }

          .sticker-row-size .sticker-range {
             font-size: 7.5pt;
             font-weight: 700;
          }

          /* Barcode */
          .sticker-barcode-wrap {
             width: 100%;
             display: flex;
             justify-content: center;
             align-items: center;
             margin: 0;
          }

          .sticker-barcode-wrap svg {
             max-width: 100% !important;
             height: 32px !important;
          }

          /* Product name at bottom */
          .sticker-product-name {
             font-family: Arial, Helvetica, sans-serif;
             font-size: 8pt;
             font-weight: 900;
             color: #000;
             text-align: center;
             margin-top: 0;
             letter-spacing: 0.2px;
             line-height: 1.1;
             white-space: nowrap;
             overflow: hidden;
          }

          .bc-table-card { box-shadow: none !important; border: none !important; border-radius: 0 !important; }
          .bc-table thead th { background: #f3f4f6 !important; color: #000 !important; border: 1px solid #d1d5db !important; }
          .bc-table tbody td { color: #000 !important; border: 1px solid #ddd !important; }
          .bc-cell-barcode { border: 2px solid #000 !important; border-radius: 0 !important; color: #000 !important; background: transparent !important; }
          .bc-cell-serial, .bc-cell-size, .bc-cell-qty { background: transparent !important; color: #000 !important; border: none !important; }
          .bc-cell-color-dot { border: 2px solid #000 !important; }
          .bc-stat-card, .bc-search-card, .bc-header, .bc-back-btn { display: none !important; }
        }
      `}</style>

      <div className="bc-page-wrapper">
        {/* ═══ Header ═══ */}
        <header className="bc-header hide-on-print">
          <div className="bc-header-title-group">
            <div className="bc-header-icon">
              <BarcodeIcon size={26} color="#000" />
            </div>
            <div>
              <h1>{t('print.title')}</h1>
              <p>{t('print.subtitle')}</p>
            </div>
          </div>
          <Link to="/" className="bc-back-btn">
            <ArrowRight size={18} /> {t('print.back_btn')}
          </Link>
        </header>

        {/* ═══ Search Section ═══ */}
        <div className="bc-search-card hide-on-print">
          <div className="bc-search-label">
            <Search size={14} />
            {t('print.search.label')}
          </div>
          <div className="bc-search-row">
            <div className="bc-search-input-wrap">
              <Hash size={20} className="search-icon" />
              <input
                type="text"
                id="fetchSerialInput"
                className="bc-search-input"
                placeholder={t('print.search.placeholder')}
                value={serialInput}
                onChange={(e) => setSerialInput(e.target.value)}
                onKeyDown={handleF9Press}
                autoComplete="off"
              />
              
              {showSerialsList && (
                <div style={{
                  position: 'absolute', top: '100%', right: 0, marginTop: '8px',
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
                            handleFetchOrder(filtered[0]);
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
                      <div style={{ padding: '1rem', textAlign: 'center', fontSize: '0.85rem', color: 'var(--text-muted)' }}>{t('print.search.loading')}</div>
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
                                        handleFetchOrder(serial);
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
            <button className="bc-generate-btn" onClick={() => handleFetchOrder()} disabled={loading}>
              <Sparkles size={18} />
              {loading ? t('print.search.loading') : t('print.search.generate_btn')}
            </button>

            {rows.length > 0 && (
              <>
                <button className="bc-print-btn" onClick={handleOpenSetup} style={{ background: 'linear-gradient(135deg, #6366f1, #4f46e5)', boxShadow: '0 4px 16px rgba(99,102,241,0.25)' }}>
                  <Settings size={18} />
                  {t('print.search.setup_btn')}
                </button>
                <button className="bc-print-btn" onClick={handlePrint}>
                  <Printer size={18} />
                  {t('print.search.print_btn')}
                </button>
              </>
            )}
          </div>
        </div>

        {/* ═══ Statistics Cards ═══ */}
        {rows.length > 0 && (
          <div className="bc-stats-row hide-on-print fade-in">
            <div className="bc-stat-card">
              <div className="bc-stat-icon" style={{ background: 'rgba(212, 175, 55, 0.1)', color: 'var(--accent-color)' }}>
                <Package size={20} />
              </div>
              <div>
                <div className="bc-stat-value">{totalQty}</div>
                <div className="bc-stat-label">{t('print.stats.total_pcs')}</div>
              </div>
            </div>
            <div className="bc-stat-card">
              <div className="bc-stat-icon" style={{ background: 'rgba(99, 102, 241, 0.1)', color: '#818cf8' }}>
                <Layers size={20} />
              </div>
              <div>
                <div className="bc-stat-value">{rows.length}</div>
                <div className="bc-stat-label">{t('print.stats.total_lines')}</div>
              </div>
            </div>
            <div className="bc-stat-card">
              <div className="bc-stat-icon" style={{ background: 'rgba(244, 114, 182, 0.1)', color: '#f472b6' }}>
                <Palette size={20} />
              </div>
              <div>
                <div className="bc-stat-value">{uniqueColors.length}</div>
                <div className="bc-stat-label">{t('print.stats.unique_colors')}</div>
              </div>
            </div>
            <div className="bc-stat-card">
              <div className="bc-stat-icon" style={{ background: 'rgba(16, 185, 129, 0.1)', color: '#34d399' }}>
                <Ruler size={20} />
              </div>
              <div>
                <div className="bc-stat-value">{uniqueSizes.length}</div>
                <div className="bc-stat-label">{t('print.stats.unique_sizes')}</div>
              </div>
            </div>
          </div>
        )}

        {/* ═══ Table Section ═══ */}
        {rows.length > 0 ? (
          <div className="bc-table-card printable-section fade-in">
            <div className="bc-table-header hide-on-print">
              <div className="bc-table-title">
                <BarChart3 size={18} color="var(--accent-color)" />
                {t('print.table.title')}
              </div>
              <span className="bc-table-badge">
                {rows.length} {t('print.table.rows')}
              </span>
            </div>
            <div className="bc-table-scroll">
              <table className="bc-table">
                <thead>
                  <tr>
                    <th>{t('print.table.cols.item')}</th>
                    <th>{t('print.table.cols.barcode')}</th>
                    <th>{t('print.table.cols.color')}</th>
                    <th>{t('print.table.cols.size')}</th>
                    <th>{t('print.table.cols.qty')}</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, idx) => (
                    <tr key={idx}>
                      <td>
                        <div className="bc-cell-item">
                          <span className="bc-cell-serial">{row.itemNumber}</span>
                          <span className="bc-cell-name">{row.itemName}</span>
                        </div>
                      </td>
                      <td>
                        <span className="bc-cell-barcode">
                          <BarcodeIcon size={14} />
                          <span style={{ direction: 'ltr', unicodeBidi: 'embed' }}>{row.batchBarcode}</span>
                        </span>
                      </td>
                      <td>
                        <div className="bc-cell-color-wrap">
                          <div className="bc-cell-color-dot" style={{ backgroundColor: row.colorHex, boxShadow: `0 2px 8px ${row.colorHex}44` }}></div>
                          <span className="bc-cell-color-name">{row.colorRef}</span>
                        </div>
                      </td>
                      <td>
                        <span className="bc-cell-size">{row.size}</span>
                      </td>
                      <td>
                        <span className="bc-cell-qty">{row.quantity} {t('print.table.pcs')}</span>
                      </td>
                    </tr>
                  ))}

                  {/* Total Row */}
                  <tr className="bc-total-row">
                    <td colSpan="4" style={{ textAlign: 'left' }}>
                      <span className="bc-total-label">
                        <Package size={18} color="var(--accent-color)" />
                        {t('print.table.total_exported')}
                      </span>
                    </td>
                    <td>
                      <span className="bc-total-value">
                        {totalQty} {t('print.table.pcs')}
                      </span>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        ) : !loading && (
          <div className="bc-table-card hide-on-print">
            <div className="bc-empty-state">
              <div className="bc-empty-icon">
                <BarcodeIcon size={32} color="rgba(212, 175, 55, 0.35)" />
              </div>
              <p className="bc-empty-text">
                {t('print.empty.title')}
              </p>
            </div>
          </div>
        )}

        {/* --- Print Only: Physical Barcode Stickers Loop (rendered only when printing) --- */}
        {showStickers && rows.length > 0 && (() => {
          const allStickers = [];
          rows.forEach((row, rIdx) => {
            for (let i = 0; i < row.quantity; i++) {
              allStickers.push({ row, key: `${rIdx}-${i}` });
            }
          });

          const cols = printSettings.columns || 1;
          
          // CRITICAL: For Zebra thermal printers, we MUST chunk the data exactly 1 row per page!
          // The printer gap sensor expects 1 row per physical 'page' signal from the browser.
          const itemsPerPage = cols;
          
          const pages = [];
          for (let i = 0; i < allStickers.length; i += itemsPerPage) {
            pages.push(allStickers.slice(i, i + itemsPerPage));
          }

          return (
            <div className="print-only-stickers">
              {pages.map((pageStickers, pIdx) => (
                <div key={`page-${pIdx}`} className="sticker-page">
                  {pageStickers.map((sticker) => {
                    const { row, key } = sticker;
                    return (
                      <div key={key} className="sticker-label">
                          {/* Row 1: Model No */}
                          <div className="sticker-row-model">
                             <span className="sticker-lbl">Model No:</span>
                             <span className="sticker-val">{row.itemNumber}</span>
                          </div>

                          {/* Row 2: Size + Size Range */}
                          <div className="sticker-row-size">
                             <div className="sticker-size-left">
                                <span className="sticker-lbl">Size:</span>
                                <span className="sticker-val">{row.size}</span>
                             </div>
                             {sizeRange && <span className="sticker-range">{sizeRange}</span>}
                          </div>

                          {/* Barcode */}
                          <div className="sticker-barcode-wrap">
                            <ReactBarcode 
                                value={row.batchBarcode} 
                                format="CODE128"
                                width={1.2} 
                                height={32} 
                                fontSize={9}
                                margin={3}
                                displayValue={true}
                                font="Arial"
                                fontOptions="bold"
                                textMargin={2}
                            />
                          </div>

                          {/* Product Name */}
                          <div className="sticker-product-name">{row.itemName}</div>
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          );
        })()}
      </div>

      {/* ═══════ PAGE SETUP MODAL ═══════ */}
      {showPageSetup && (
        <div className="page-setup-modal-overlay" onClick={() => setShowPageSetup(false)} style={{
          position: 'fixed', inset: 0, zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)', animation: 'fadeIn 0.25s ease'
        }}>
          <div onClick={e => e.stopPropagation()} style={{
            width: '680px', maxWidth: '95vw', maxHeight: '90vh', overflowY: 'auto',
            background: 'linear-gradient(180deg, #1a1f2e 0%, #0f1219 100%)',
            borderRadius: '20px', border: '1px solid rgba(212,175,55,0.2)',
            boxShadow: '0 24px 80px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.05) inset'
          }}>
            {/* Modal Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '1.25rem 1.75rem', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <div style={{ width: 42, height: 42, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(135deg, #6366f1, #4f46e5)', borderRadius: 12, boxShadow: '0 4px 14px rgba(99,102,241,0.35)' }}>
                  <Settings size={20} color="#fff" />
                </div>
                <div>
                  <h2 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 800, color: '#fff' }}>{t('print.setup.title')}</h2>
                  <p style={{ margin: 0, fontSize: '0.78rem', color: 'var(--text-muted)' }}>{t('print.setup.desc')}</p>
                </div>
              </div>
              <button onClick={() => setShowPageSetup(false)} style={{ background: 'rgba(255,255,255,0.06)', border: 'none', borderRadius: 10, width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#fff', transition: 'all 0.2s' }}>
                <X size={18} />
              </button>
            </div>

            {/* Live Preview */}
            <div style={{ padding: '1rem 1.75rem 0.5rem' }}>
              <div style={{ background: 'rgba(255,255,255,0.03)', borderRadius: 14, border: '1px solid rgba(255,255,255,0.06)', padding: '1rem', textAlign: 'center' }}>
                {(() => {
                  const s = tempSettings;
                  const scale = 28;
                  const pw = (s.paperWidth || 9.4) * scale;
                  const ph = (s.paperHeight || 2.6) * scale;
                  const mt = (s.marginTop || 0) * scale;
                  const ml = (s.marginLeft || 0) * scale;
                  const lw = (s.labelWidth || 3) * scale;
                  const lh = (s.labelHeight || 2.5) * scale;
                  const cols = s.columns || 3;
                  const rowsN = s.rows || 1;
                  const cg = (s.columnGap || 0) * scale;
                  const rg = (s.rowGap || 0) * scale;
                  const labels = [];
                  for (let r = 0; r < rowsN; r++) {
                    for (let c = 0; c < cols; c++) {
                      labels.push(
                        <rect key={`${r}-${c}`} x={ml + c * (lw + cg)} y={mt + r * (lh + rg)} width={lw} height={lh}
                          rx={4} fill="none" stroke="#d4af37" strokeWidth={1.5} strokeDasharray="4 2" />
                      );
                    }
                  }
                  return (
                    <svg width={Math.min(pw + 20, 600)} height={Math.min(ph + 20, 200)} viewBox={`-10 -10 ${pw + 20} ${ph + 20}`} style={{ maxWidth: '100%' }}>
                      <rect x={0} y={0} width={pw} height={ph} rx={4} fill="#1e2330" stroke="rgba(255,255,255,0.2)" strokeWidth={1} />
                      {labels}
                    </svg>
                  );
                })()}
                <div style={{ display: 'flex', justifyContent: 'center', gap: '2rem', marginTop: '0.5rem', fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                  <span>Paper: <strong style={{ color: '#fff' }}>{tempSettings.paperWidth} × {tempSettings.paperHeight} cm</strong></span>
                  <span>Label: <strong style={{ color: '#d4af37' }}>{tempSettings.labelWidth} × {tempSettings.labelHeight} cm</strong></span>
                </div>
              </div>
            </div>

            {/* Tabs */}
            <div style={{ padding: '0.75rem 1.75rem 0' }}>
              <div style={{ display: 'flex', gap: '0.25rem', background: 'rgba(255,255,255,0.03)', borderRadius: 12, padding: '0.3rem', border: '1px solid rgba(255,255,255,0.05)' }}>
                {[
                  { id: 'paper', label: `📄 ${t('print.setup.paper_label')}` },
                  { id: 'margins', label: `📐 ${t('print.setup.margins_label')}` },
                  { id: 'label', label: `🏷️ ${t('print.setup.label_label')}` },
                  { id: 'layout', label: `📊 ${t('print.setup.layout_label')}` },
                ].map(t => (
                  <button key={t.id} onClick={() => setSetupTab(t.id)} style={{
                    flex: 1, padding: '0.6rem 0.5rem', border: 'none', borderRadius: 10, cursor: 'pointer',
                    fontFamily: "'Tajawal', sans-serif", fontSize: '0.82rem', fontWeight: 600, transition: 'all 0.25s',
                    background: setupTab === t.id ? 'linear-gradient(135deg, rgba(212,175,55,0.2), rgba(212,175,55,0.08))' : 'transparent',
                    color: setupTab === t.id ? '#fff' : 'var(--text-muted)',
                    boxShadow: setupTab === t.id ? '0 2px 10px rgba(212,175,55,0.15)' : 'none'
                  }}>
                    {t.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Tab Content */}
            <div style={{ padding: '1.25rem 1.75rem' }}>
              {setupTab === 'paper' && (
                <div>
                  <FieldRow label={t('print.setup.width')} fieldKey="paperWidth" settings={tempSettings} onUpdate={updateTemp} />
                  <FieldRow label={t('print.setup.height')} fieldKey="paperHeight" settings={tempSettings} onUpdate={updateTemp} />
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.85rem 0' }}>
                    <label style={{ fontSize: '0.9rem', fontWeight: 500, color: 'var(--text-main)' }}>{t('print.setup.orientation')}</label>
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                      {['portrait', 'landscape'].map(o => (
                        <button key={o} onClick={() => updateTemp('orientation', o)} style={{
                          padding: '0.45rem 1rem', borderRadius: 10, border: '1px solid', cursor: 'pointer',
                          fontFamily: "'Tajawal', sans-serif", fontWeight: 600, fontSize: '0.85rem', transition: 'all 0.2s',
                          background: tempSettings.orientation === o ? 'rgba(212,175,55,0.15)' : 'transparent',
                          borderColor: tempSettings.orientation === o ? 'var(--accent-color)' : 'var(--border-color)',
                          color: tempSettings.orientation === o ? '#fff' : 'var(--text-muted)',
                        }}>
                          {o === 'portrait' ? `📄 ${t('print.setup.portrait')}` : `📃 ${t('print.setup.landscape')}`}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}
              {setupTab === 'margins' && (
                <div>
                  <FieldRow label={t('print.setup.top')} fieldKey="marginTop" settings={tempSettings} onUpdate={updateTemp} />
                  <FieldRow label={t('print.setup.bottom')} fieldKey="marginBottom" settings={tempSettings} onUpdate={updateTemp} />
                  <FieldRow label={t('print.setup.left')} fieldKey="marginLeft" settings={tempSettings} onUpdate={updateTemp} />
                  <FieldRow label={t('print.setup.right')} fieldKey="marginRight" settings={tempSettings} onUpdate={updateTemp} />
                </div>
              )}
              {setupTab === 'label' && (
                <div>
                  <FieldRow label={t('print.setup.label_width')} fieldKey="labelWidth" settings={tempSettings} onUpdate={updateTemp} />
                  <FieldRow label={t('print.setup.label_height')} fieldKey="labelHeight" settings={tempSettings} onUpdate={updateTemp} />
                </div>
              )}
              {setupTab === 'layout' && (
                <div>
                  <IntField label={t('print.setup.columns')} fieldKey="columns" unit={t('print.setup.across')} settings={tempSettings} onUpdate={updateTemp} />
                  <IntField label={t('print.setup.rows')} fieldKey="rows" unit={t('print.setup.down')} settings={tempSettings} onUpdate={updateTemp} />
                  <FieldRow label={t('print.setup.col_gap')} fieldKey="columnGap" settings={tempSettings} onUpdate={updateTemp} />
                  <FieldRow label={t('print.setup.row_gap')} fieldKey="rowGap" settings={tempSettings} onUpdate={updateTemp} />
                </div>
              )}
            </div>

            {/* Footer Buttons */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '1rem 1.75rem 1.25rem', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
              <button onClick={handleResetSettings} style={{
                display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.6rem 1.1rem',
                background: 'rgba(255,255,255,0.04)', border: '1px solid var(--border-color)', borderRadius: 12,
                color: 'var(--text-muted)', cursor: 'pointer', fontFamily: "'Tajawal', sans-serif", fontWeight: 600, fontSize: '0.85rem', transition: 'all 0.2s'
              }}>
                <RotateCcw size={15} /> {t('print.setup.reset')}
              </button>
              <div style={{ display: 'flex', gap: '0.6rem' }}>
                <button onClick={() => setShowPageSetup(false)} style={{
                  padding: '0.6rem 1.25rem', background: 'rgba(255,255,255,0.04)', border: '1px solid var(--border-color)',
                  borderRadius: 12, color: 'var(--text-muted)', cursor: 'pointer', fontFamily: "'Tajawal', sans-serif", fontWeight: 600, fontSize: '0.85rem', transition: 'all 0.2s'
                }}>
                  {t('print.setup.cancel')}
                </button>
                <button onClick={handleSaveSettings} style={{
                  display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.6rem 1.5rem',
                  background: 'linear-gradient(135deg, var(--accent-color), #b58d27)', border: 'none', borderRadius: 12,
                  color: '#000', cursor: 'pointer', fontFamily: "'Tajawal', sans-serif", fontWeight: 700, fontSize: '0.9rem',
                  boxShadow: '0 4px 16px rgba(212,175,55,0.3)', transition: 'all 0.2s'
                }}>
                  <Save size={16} /> {t('print.setup.save')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PrintBarcodes;
