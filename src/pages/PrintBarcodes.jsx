import React, { useState } from 'react';
import { useAppData } from '../context/AppDataContext';
import { supabase } from '../supabaseClient';
import toast from 'react-hot-toast';
import { Search, Printer, ArrowRight, Barcode as BarcodeIcon, Hash, Package, Layers, Palette, Ruler, BarChart3, Sparkles, X } from 'lucide-react';
import { englishOnly } from '../utils/textUtils';
import { Link } from 'react-router-dom';
import ReactBarcode from 'react-barcode';

const PrintBarcodes = () => {
  const { lookups } = useAppData();
  const [serialInput, setSerialInput] = useState('');
  const [order, setOrder] = useState(null);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  
  // F9 Search States
  const [showSerialsList, setShowSerialsList] = useState(false);
  const [availableSerials, setAvailableSerials] = useState([]);
  const [serialSearchQuery, setSerialSearchQuery] = useState('');
  const [fetchingSerials, setFetchingSerials] = useState(false);
  const serialSearchRef = React.useRef(null);
  
  const handleFetchOrder = async (overrideSerial) => {
    const termToSearch = typeof overrideSerial === 'string' ? overrideSerial : serialInput;
    if (!termToSearch.trim()) {
      toast.error('الرجاء إدخال رقم الموديل (Serial Number)');
      return;
    }
    setSerialInput(termToSearch);
    setLoading(true);
    const toastId = toast.loading('جاري استرداد الموديل...');
    try {
      const { data, error } = await supabase
        .from('orders')
        .select('order_data')
        .eq('serial_number', termToSearch.trim())
        .single();
        
      if (error || !data) {
        toast.error('لم يتم العثور على الطلبية!', { id: toastId });
        setOrder(null);
        setRows([]);
      } else {
        toast.success(`تم العثور على الموديل! جاري توليد الجدول...`, { id: toastId });
        generateRows(data.order_data, termToSearch.trim());
      }
    } catch (err) {
      toast.error('خطأ في الاتصال!', { id: toastId });
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

  const handlePrint = () => window.print();

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
      <style>{`
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
          background: linear-gradient(135deg, rgba(22, 27, 34, 0.97), rgba(13, 17, 23, 0.99));
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
          color: var(--primary-color);
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
          color: var(--primary-color);
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
          color: var(--primary-color);
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
          color: var(--primary-color);
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
          color: var(--primary-color);
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
          color: var(--primary-color);
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

        @media print {
          body { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; background: #fff !important; margin: 0 !important; padding: 0 !important; }
          .hide-on-print { display: none !important; }
          .printable-section { display: none !important; }
          .bc-stats-row { display: none !important; }
          .bc-page-wrapper { max-width: 100% !important; padding: 0 !important; }

          .print-only-stickers {
             display: grid !important;
             grid-template-columns: repeat(auto-fill, minmax(5.5cm, 1fr)) !important;
             gap: 0.4cm;
             width: 100%;
             padding: 0.3cm;
             direction: ltr !important;
             text-align: left !important;
          }

          .sticker-label {
             border: 1.5px solid #000;
             padding: 0.35cm 0.4cm;
             background: #fff;
             box-sizing: border-box;
             page-break-inside: avoid;
             display: flex;
             flex-direction: column;
             align-items: center;
             justify-content: flex-start;
             height: auto;
             gap: 1px;
             direction: ltr !important;
             text-align: left !important;
          }

          /* Row 1: Model No */
          .sticker-row-model {
             display: flex;
             align-items: baseline;
             gap: 6px;
             width: 100%;
             font-family: Arial, Helvetica, sans-serif;
             color: #000;
             margin-bottom: 2px;
          }

          .sticker-row-model .sticker-lbl {
             font-size: 11px;
             font-weight: 700;
          }

          .sticker-row-model .sticker-val {
             font-size: 14px;
             font-weight: 900;
             letter-spacing: 0.5px;
          }

          /* Row 2: Size + Range */
          .sticker-row-size {
             display: flex;
             justify-content: space-between;
             align-items: baseline;
             width: 100%;
             font-family: Arial, Helvetica, sans-serif;
             color: #000;
             margin-bottom: 3px;
          }

          .sticker-row-size .sticker-size-left {
             display: flex;
             align-items: baseline;
             gap: 5px;
          }

          .sticker-row-size .sticker-lbl {
             font-size: 11px;
             font-weight: 700;
          }

          .sticker-row-size .sticker-val {
             font-size: 13px;
             font-weight: 900;
          }

          .sticker-row-size .sticker-range {
             font-size: 12px;
             font-weight: 700;
          }

          /* Barcode */
          .sticker-barcode-wrap {
             width: 100%;
             display: flex;
             justify-content: center;
             margin: 2px 0;
          }

          .sticker-barcode-wrap svg {
             width: 100% !important;
             max-width: 100% !important;
          }

          /* Product name at bottom */
          .sticker-product-name {
             font-family: Arial, Helvetica, sans-serif;
             font-size: 13px;
             font-weight: 900;
             color: #000;
             text-align: center;
             margin-top: 3px;
             letter-spacing: 0.3px;
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
              <h1>نظام تخصيص الباركود</h1>
              <p>استعرض الدفعات وعند الطباعة سيقوم النظام بتوليد ملصقات باركود فعلية للمصنع</p>
            </div>
          </div>
          <Link to="/" className="bc-back-btn">
            <ArrowRight size={18} /> العودة للبوابة
          </Link>
        </header>

        {/* ═══ Search Section ═══ */}
        <div className="bc-search-card hide-on-print">
          <div className="bc-search-label">
            <Search size={14} />
            أدخل رقم الموديل لاستخراج بيانات الدفعات
          </div>
          <div className="bc-search-row">
            <div className="bc-search-input-wrap">
              <Hash size={20} className="search-icon" />
              <input
                type="text"
                id="fetchSerialInput"
                className="bc-search-input"
                placeholder="مثال: 22890 (F9)"
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
                      <span style={{ fontSize: '0.85rem', fontWeight: 'bold' }}>اختر موديلاً محفوظاً:</span>
                      <button onClick={() => { setShowSerialsList(false); setSerialSearchQuery(''); }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-color)', padding: 0, display: 'flex', alignItems: 'center' }}>
                         <X size={16} />
                      </button>
                  </div>
                  {/* Search Field */}
                  <div style={{ padding: '0.5rem', borderBottom: '1px solid var(--border-color)', backgroundColor: 'var(--bg-color)' }}>
                    <input
                      ref={serialSearchRef}
                      type="text"
                      placeholder="🔍 ابحث برقم الموديل..."
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
                      <div style={{ padding: '1rem', textAlign: 'center', fontSize: '0.85rem', color: 'var(--text-muted)' }}>جاري التحميل...</div>
                  ) : (
                     (() => {
                       const filteredSerials = serialSearchQuery.trim()
                         ? availableSerials.filter(s => s.toString().includes(serialSearchQuery.trim()))
                         : availableSerials;
                       return filteredSerials.length === 0 ? (
                         <div style={{ padding: '1rem', textAlign: 'center', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                           {availableSerials.length === 0 ? 'لا توجد موديلات محفوظة' : 'لا توجد نتائج مطابقة للبحث'}
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
              {loading ? 'جاري السحب...' : 'توليد الجدول'}
            </button>

            {rows.length > 0 && (
              <button className="bc-print-btn" onClick={handlePrint}>
                <Printer size={18} />
                التوجه للطباعة
              </button>
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
                <div className="bc-stat-label">إجمالي القطع</div>
              </div>
            </div>
            <div className="bc-stat-card">
              <div className="bc-stat-icon" style={{ background: 'rgba(99, 102, 241, 0.1)', color: '#818cf8' }}>
                <Layers size={20} />
              </div>
              <div>
                <div className="bc-stat-value">{rows.length}</div>
                <div className="bc-stat-label">عدد الأسطر</div>
              </div>
            </div>
            <div className="bc-stat-card">
              <div className="bc-stat-icon" style={{ background: 'rgba(244, 114, 182, 0.1)', color: '#f472b6' }}>
                <Palette size={20} />
              </div>
              <div>
                <div className="bc-stat-value">{uniqueColors.length}</div>
                <div className="bc-stat-label">ألوان مختلفة</div>
              </div>
            </div>
            <div className="bc-stat-card">
              <div className="bc-stat-icon" style={{ background: 'rgba(16, 185, 129, 0.1)', color: '#34d399' }}>
                <Ruler size={20} />
              </div>
              <div>
                <div className="bc-stat-value">{uniqueSizes.length}</div>
                <div className="bc-stat-label">مقاسات مختلفة</div>
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
                جدول دفعات الباركود
              </div>
              <span className="bc-table-badge">
                {rows.length} سطر
              </span>
            </div>
            <div className="bc-table-scroll">
              <table className="bc-table">
                <thead>
                  <tr>
                    <th>الصنف (Item)</th>
                    <th>الباركود (Batch Barcode)</th>
                    <th>اللون (Color)</th>
                    <th>المقاس (Size)</th>
                    <th>الكمية (Qty)</th>
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
                        <span className="bc-cell-qty">{row.quantity} قطعة</span>
                      </td>
                    </tr>
                  ))}

                  {/* Total Row */}
                  <tr className="bc-total-row">
                    <td colSpan="4" style={{ textAlign: 'left' }}>
                      <span className="bc-total-label">
                        <Package size={18} color="var(--accent-color)" />
                        إجمالي القطع المصدرة (Total Qty):
                      </span>
                    </td>
                    <td>
                      <span className="bc-total-value">
                        {totalQty} قطعة
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
                أدخل رقم الموديل في الأعلى واضغط "توليد الجدول" لاستعراض بيانات الدفعات والباركود
              </p>
            </div>
          </div>
        )}

        {/* --- Print Only: Physical Barcode Stickers Loop --- */}
        {rows.length > 0 && (
          <div className="print-only-stickers">
            {rows.map((row, rIdx) => (
              Array.from({ length: row.quantity }).map((_, i) => (
                <div key={`${rIdx}-${i}`} className="sticker-label">
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
                          height={45} 
                          fontSize={11}
                          margin={3}
                          displayValue={true}
                          font="Arial"
                          fontOptions="bold"
                          textMargin={3}
                      />
                    </div>

                    {/* Product Name */}
                    <div className="sticker-product-name">{row.itemName}</div>
                </div>
              ))
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default PrintBarcodes;
