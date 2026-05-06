import React, { useState } from 'react';
import { supabase } from '../supabaseClient';
import toast from 'react-hot-toast';
import { Search, Printer, FileText, CheckCircle2, DownloadCloud, X } from 'lucide-react';
import { useAppData } from '../context/AppDataContext';
import { englishOnly } from '../utils/textUtils';

const ExportOrder = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const [order, setOrder] = useState(null);

  const { lookups } = useAppData();
  
  // F9 Search States
  const [showSerialsList, setShowSerialsList] = useState(false);
  const [availableSerials, setAvailableSerials] = useState([]);
  const [serialSearchQuery, setSerialSearchQuery] = useState('');
  const [fetchingSerials, setFetchingSerials] = useState(false);
  const serialSearchRef = React.useRef(null);
  
  const formatDate = (dateStr) => {
    if (!dateStr) return '-';
    // Native ISO date is YYYY-MM-DD
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
      toast.error('أدخل رقم الطلبية أو الموديل أولاً');
      return;
    }
    setSearchTerm(termToSearch);
    const toastId = toast.loading('جاري البحث في السحابة...');
    try {
      const { data, error } = await supabase
        .from('orders')
        .select('*')
        .eq('serial_number', termToSearch.trim())
        .single();

      if (error || !data) {
        toast.error('لم يتم العثور على الطلبية!', { id: toastId });
        setOrder(null);
      } else {
        toast.success('تم تجهيز الطلبية للطباعة', { id: toastId });
        setOrder({ serialNumber: data.serial_number, ...data.order_data });
      }
    } catch (err) {
      toast.error('خطأ في الاتصال!', { id: toastId });
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
    const toastId = toast.loading('يتم الآن تحضير الطلبية للتنزيل...');
    
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
       
       toast.success('تم تنزيل الطلبية كملف PDF بنجاح!', { id: toastId });
    } catch (err) {
       toast.error('حدث خطأ أثناء تحميل الـ PDF', { id: toastId });
       console.error(err);
    } finally {
       element.style.boxShadow = originalShadow;
    }
  };

  const getFactoryDetails = (factoryId) => {
    const factory = Array.isArray(lookups.factories) ? lookups.factories.find(f => (f.name === factoryId || f === factoryId)) : null;
    if (factory && typeof factory === 'object') {
      return { name: factory.name || '', mobile: factory.mobile || '', address: factory.address || '' };
    }
    return { name: factoryId || '', mobile: '', address: '' };
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
  const sizesToRender = Array.from(activeSizesSet).sort();

  return (
    <div className="fade-in">
      <style>{`
        @media print {
          @page { size: landscape; margin: 4mm; }
          body * { visibility: hidden; }
          .app-container, .main-content { margin:0!important; padding:0!important; background:white!important; }
          .print-doc, .print-doc * { visibility: visible; }
          .print-doc {
            position: absolute; left:0; top:0; width:100%;
            background:#fff!important; padding:3mm!important;
            box-shadow:none!important; border:none!important;
            max-width:none!important; border-radius:0!important;
          }
          .no-print { display:none!important; }
          th, .sec-hdr { background-color:#1a5276!important; color:#fff!important; -webkit-print-color-adjust:exact; print-color-adjust:exact; }
          .accent-bg { background-color:#eaf2f8!important; -webkit-print-color-adjust:exact; print-color-adjust:exact; }
        }

        .print-doc {
          background:#fff; color:#111; padding:10px 14px; border-radius:8px;
          max-width:1200px; margin:0 auto; box-shadow:0 8px 30px rgba(0,0,0,0.45);
          font-family:'Inter','Tajawal',sans-serif; font-size:9px; line-height:1.3;
          border:1px solid #ccc;
        }

        /* ---- Compact Invoice Table Cells ---- */
        .inv-table { width:100%; border-collapse:collapse; border:1.5px solid #333; }
        .inv-table th, .inv-table td { border:1px solid #999; padding:2px 4px; vertical-align:middle; }
        .inv-table th { font-size:8px; font-weight:700; }
        .inv-table td { font-size:8.5px; }

        .sec-hdr {
          background:#1a5276; color:#fff; font-weight:700; font-size:8.5px;
          padding:3px 6px; text-align:center; letter-spacing:0.5px;
        }
        .sec-hdr-green { background:#1e8449; color:#fff; font-weight:700; font-size:8.5px; padding:3px 6px; text-align:center; }

        .val-bold { font-weight:700; color:#111; }
        .val-lg { font-size:12px; font-weight:900; }
        .val-md { font-size:10px; font-weight:700; }
        .label-cn { font-size:7.5px; color:#555; display:block; }

        .kp-row-c { display:flex; justify-content:space-between; padding:1px 0; border-bottom:1px dotted #ddd; }
        .kp-row-c:last-child { border-bottom:none; }

        .sign-row { display:flex; justify-content:space-around; margin-top:4px; padding-top:3px; border-top:1.5px solid #333; }
        .sign-box-c { text-align:center; min-width:120px; }
        .sign-box-c .sign-line-c { border-top:1px solid #000; margin-top:20px; margin-bottom:2px; }
        .sign-box-c .sign-label-c { font-size:7.5px; font-weight:600; color:#555; text-transform:uppercase; }

        .color-dot-c { width:10px;height:10px;border-radius:50%;display:inline-block;margin-left:3px;border:1px solid #aaa;vertical-align:middle; }
        .material-pill-c { background:#eee;padding:1px 5px;border-radius:99px;font-size:7.5px;font-weight:600;display:inline-flex;align-items:center;gap:3px;margin:1px 2px; }
        .material-pct-c { background:#1a5276;color:#fff;padding:0 4px;border-radius:99px;font-size:7px; }

        .remarks-box { background:#fef9c3;border:1px solid #fde047;padding:3px 6px;border-radius:4px;font-size:8px;color:#713f12;margin-top:3px; }
        .cond-item { display:flex; gap:3px; align-items:flex-start; font-size:7.5px; color:#c0392b; font-weight:600; margin-bottom:1px; }

        .img-thumb { width:80px;height:90px;object-fit:cover;border:1px solid #ccc;border-radius:3px; }
        .barcode-box { border:1px solid #999; padding:3px; text-align:center; font-size:7px; background:#fafafa; border-radius:3px; }
      `}</style>

      {/* Control Navigation - No Print */}
      <div className="card no-print" style={{ marginBottom: '2rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'flex-end', flex: 1 }}>
          <div className="form-group" style={{ marginBottom: 0, flex: 1, maxWidth: '300px' }}>
            <label className="form-label">رقم الموديل للاسترداد والطباعة (Model No)</label>
            <div style={{ display: 'flex', gap: '0.5rem', position: 'relative' }}>
              <input 
                type="text" 
                id="fetchSerialInput"
                className="form-control" 
                placeholder="أدخل الرقم... (F9)" 
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                onKeyDown={handleF9Press}
                autoComplete="off"
              />
              <button className="btn btn-primary" onClick={() => handleFetch()}>
                <Search size={20} /> جلب
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
        {order && (
           <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'center' }}>
              <button className="btn btn-accent" style={{ padding: '0.8rem 2rem', fontSize: '1.15rem', gap: '0.75rem', borderRadius: '50px', background: 'linear-gradient(135deg, var(--accent-color), #b48c26)', color: '#000', fontWeight: 'bold', boxShadow: '0 4px 15px rgba(212, 175, 55, 0.4)' }} onClick={() => window.print()}>
               <Printer size={22} /> طباعة مباشرة (Ctrl+P)
              </button>
              <button className="btn btn-accent" style={{ padding: '0.8rem 2rem', fontSize: '1.15rem', gap: '0.75rem', borderRadius: '50px', background: 'linear-gradient(135deg, #1a5276, #2980b9)', color: '#fff', fontWeight: 'bold', boxShadow: '0 4px 15px rgba(26, 82, 118, 0.4)' }} onClick={handleDownloadPDF}>
               <DownloadCloud size={22} /> تحميل PDF
              </button>
           </div>
        )}
      </div>

      {!order && (
        <div className="card no-print" style={{ textAlign: 'center', padding: '6rem 2rem', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(to bottom, var(--surface-color), var(--bg-color))' }}>
          <div style={{ padding: '1.5rem', background: 'var(--surface-highlight)', borderRadius: '50%', marginBottom: '1.5rem' }}>
             <FileText size={48} color="var(--accent-color)" />
          </div>
          <h2 style={{ color: 'var(--text-main)', fontSize: '1.8rem', fontWeight: '800' }}>مستند الطباعة الفاخر (Luxury Print Export)</h2>
          <p style={{ color: 'var(--text-muted)', marginTop: '0.75rem', maxWidth: '500px', lineHeight: '1.6' }}>
            أدخل رقم الموديل في الأعلى لعرض مستند طلب الشراء الاحترافي، المصمم خصيصاً ليبرز هوية علامتك التجارية الراقية أمام المصانع.
          </p>
        </div>
      )}

      {order && (
        <div className="print-doc" id="export-doc">
          {/* ═══ ROW 1: HEADER ═══ */}
          <table className="inv-table" style={{ marginBottom: 4 }}>
            <tbody>
              <tr>
                <td colSpan={2} className="sec-hdr" style={{ fontSize: 9 }}>Order No. 订单号码</td>
                <td style={{ textAlign: 'center' }}><span className="val-md">{order.serialNumber || '-'}</span></td>
                <td className="sec-hdr">Request Date 订单日期</td>
                <td style={{ textAlign: 'center' }}><span className="val-bold">{formatDate(order.requestDate)}</span></td>
                <td className="sec-hdr">Delivery Date 交货日期</td>
                <td style={{ textAlign: 'center' }}><span className="val-bold">{formatDate(order.deliveryDate)}</span></td>
              </tr>
              <tr>
                <td rowSpan={3} colSpan={2} style={{ textAlign: 'center', padding: '4px 6px' }}>
                  <div style={{ fontSize: 14, fontWeight: 900, color: '#111', lineHeight: 1.1 }}>Product Order</div>
                  <div style={{ fontSize: 12, fontWeight: 800, color: '#1a5276' }}>产品订单</div>
                </td>
                <td style={{ fontSize: 7.5 }}>Buyer Co. Name <span className="label-cn">买方公司名称</span></td>
                <td colSpan={2} className="val-bold">{order.buyerCompany || '-'}</td>
                <td style={{ fontSize: 7.5 }}>Fact. Name <span className="label-cn">工厂 名字</span></td>
                <td className="val-bold">{factoryInfo.name || '-'}</td>
              </tr>
              <tr>
                <td style={{ fontSize: 7.5 }}>Buyer Co. Mobile <span className="label-cn">买方手机</span></td>
                <td colSpan={2} className="val-bold">{order.buyerMobile || '-'}</td>
                <td style={{ fontSize: 7.5 }}>Fact. Mobile <span className="label-cn">工厂 电话</span></td>
                <td className="val-bold">{factoryInfo.mobile || '-'}</td>
              </tr>
              <tr>
                <td style={{ fontSize: 7.5 }}>Customer ID <span className="label-cn">客户编号</span></td>
                <td colSpan={2} className="val-bold">{order.serialNumber || '-'}</td>
                <td style={{ fontSize: 7.5 }}>Fact. Address <span className="label-cn">工厂 地址</span></td>
                <td className="val-bold">{factoryInfo.address || '-'}</td>
              </tr>
            </tbody>
          </table>

          {/* ═══ ROW 2: PRODUCT + MEASUREMENTS + IMAGE ═══ */}
          <table className="inv-table" style={{ marginBottom: 4 }}>
            <thead>
              <tr>
                <th style={{ textAlign: 'right', width: '15%' }}>Product Name<br/><span className="label-cn">产品名称</span></th>
                <th style={{ textAlign: 'center', width: '8%' }}>Model No.<br/><span className="label-cn">款号</span></th>
                <th style={{ textAlign: 'center', width: '10%' }}>Barcode No.<br/><span className="label-cn">条形码</span></th>
                <th style={{ textAlign: 'center', width: '8%' }}>Prod Price<br/><span className="label-cn">产品价格</span></th>
                <th style={{ textAlign: 'center', width: '7%' }}>Prod Qty<br/><span className="label-cn">数量</span></th>
                <th style={{ textAlign: 'center', width: '7%' }}>Size Qty.<br/><span className="label-cn">码数</span></th>
                <th style={{ textAlign: 'center', width: '10%' }}>Prod Sizes<br/><span className="label-cn">码段</span></th>
                <th rowSpan={2 + sizesToRender.length + 1} style={{ width: '18%', textAlign: 'center', verticalAlign: 'top', padding: 4 }}>
                  {/* Product Images + Logo area */}
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                    {order.productImages && order.productImages.length > 0 ? (
                      order.productImages.slice(0, 2).map((img, idx) => (
                        <img key={idx} src={img.url} alt={img.name || `Product ${idx+1}`} className="img-thumb" crossOrigin="anonymous" />
                      ))
                    ) : (
                      <div style={{ width: 80, height: 90, border: '1px dashed #ccc', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 7, color: '#aaa', borderRadius: 3 }}>No Image</div>
                    )}
                    <div style={{ marginTop: 4, padding: '2px 6px', border: '1px solid #1e8449', borderRadius: 4, textAlign: 'center' }}>
                      <div style={{ fontSize: 10, fontWeight: 900, color: '#1e8449', letterSpacing: 2 }}>Green</div>
                      <div style={{ fontSize: 10, fontWeight: 900, color: '#1e8449', letterSpacing: 2 }}>Hand</div>
                      <div style={{ fontSize: 6, color: '#555', fontStyle: 'italic' }}>Where elegance begins</div>
                    </div>
                  </div>
                </th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="val-bold" style={{ fontSize: 10 }}>{englishOnly(order.productName) || '-'}
                  {order.tradeMark && <div style={{ fontSize: 7, color: '#555', fontWeight: 'normal' }}>TM: {order.tradeMark}</div>}
                </td>
                <td style={{ textAlign: 'center' }}><span className="val-lg">{order.barcode || '-'}</span></td>
                <td style={{ textAlign: 'center' }}><span className="val-md">{order.barcode ? `100${order.barcode}` : '-'}</span></td>
                <td style={{ textAlign: 'center' }}><span className="val-bold">¥ {order.productPrice || '-'}</span></td>
                <td style={{ textAlign: 'center' }}><span className="val-lg">{order.totalQuantity || '-'}</span></td>
                <td style={{ textAlign: 'center' }}><span className="val-bold">{sizesToRender.length || '-'}</span></td>
                <td style={{ textAlign: 'center' }}><span className="val-bold">From {order.sizeFrom} - To {order.sizeTo}</span></td>
              </tr>
              {/* SIZE ROW HEADER */}
              {sizesToRender.length > 0 && (
                <tr>
                  <td colSpan={1} style={{ fontWeight: 700, fontSize: 7.5, background: '#eaf2f8' }}>
                    {englishOnly(order.productName) || 'Product'}_Size<br/><span className="label-cn">连衣裙尺寸</span>
                  </td>
                  {sizesToRender.map((size, i) => (
                    <td key={size} colSpan={i === sizesToRender.length - 1 ? (7 - sizesToRender.length) || 1 : 1} style={{ textAlign: 'center', fontWeight: 700, background: '#eaf2f8' }}>{size}</td>
                  ))}
                  {sizesToRender.length < 6 && Array.from({ length: Math.max(0, 6 - sizesToRender.length) }).map((_, i) => (
                    <td key={`empty-${i}`} style={{ background: '#eaf2f8' }}></td>
                  ))}
                </tr>
              )}
              {/* MEASUREMENTS */}
              {(() => {
                const allMeasurements = [];
                if (order.groupedMeasurements) {
                  Object.keys(order.groupedMeasurements).forEach(part => {
                    Object.keys(order.groupedMeasurements[part]).forEach(mName => {
                      allMeasurements.push({ name: mName, data: order.groupedMeasurements[part][mName] });
                    });
                  });
                } else if (order.measurements) {
                  Object.keys(order.measurements).forEach(mName => {
                    allMeasurements.push({ name: mName, data: order.measurements[mName] });
                  });
                }
                return allMeasurements.map((m, idx) => (
                  <tr key={idx}>
                    <td style={{ fontWeight: 600, fontSize: 7.5 }}>{m.name}</td>
                    {sizesToRender.map((s, i) => (
                      <td key={s} colSpan={i === sizesToRender.length - 1 ? (7 - sizesToRender.length) || 1 : 1} style={{ textAlign: 'center', fontWeight: m.data?.[s] ? 600 : 400, color: m.data?.[s] ? '#111' : '#bbb' }}>
                        {m.data?.[s] || ''}
                      </td>
                    ))}
                    {sizesToRender.length < 6 && Array.from({ length: Math.max(0, 6 - sizesToRender.length) }).map((_, i) => (
                      <td key={`me-${i}`}></td>
                    ))}
                  </tr>
                ));
              })()}
            </tbody>
          </table>

          {/* ═══ ROW 3: FABRICS + COLORS + BARCODES + PACKAGING ═══ */}
          <table className="inv-table" style={{ marginBottom: 4 }}>
            <tbody>
              <tr>
                {/* LEFT: Fabric & Materials */}
                <td style={{ width: '30%', verticalAlign: 'top', padding: 0 }}>
                  <table className="inv-table" style={{ border: 'none', width: '100%' }}>
                    <tbody>
                      <tr><td colSpan={2} className="sec-hdr">Fabrics Kind & Material<br/><span style={{ fontSize: 7 }}>面料种类&材质</span></td></tr>
                      {order.productFabric && (
                        <tr><td style={{ fontWeight: 600, fontSize: 8 }}>{order.productFabric}</td><td></td></tr>
                      )}
                      {order.materials && order.materials.filter(m => m.name).map((mat, i) => (
                        <tr key={i}>
                          <td style={{ fontWeight: 600 }}>{mat.name}</td>
                          <td style={{ textAlign: 'center', fontWeight: 700 }}>{mat.percentage}%</td>
                        </tr>
                      ))}
                      {/* Barcode Label */}
                      <tr><td colSpan={2} className="sec-hdr" style={{ background: '#555' }}>Barcode Label 款号条形码</td></tr>
                      <tr>
                        <td colSpan={2} className="barcode-box">
                          <div style={{ fontWeight: 700, fontSize: 9 }}>Model: {order.barcode || '-'}</div>
                          <div style={{ fontSize: 7.5 }}>Size: {order.sizeFrom} - {order.sizeTo}</div>
                          <div style={{ fontFamily: 'monospace', fontSize: 10, letterSpacing: 2, margin: '2px 0' }}>|||||||||||||||||||</div>
                          <div style={{ fontSize: 7 }}>{order.barcode ? `100${order.barcode}` : '-'}</div>
                          <div style={{ fontSize: 7 }}>{englishOnly(order.productName)}</div>
                        </td>
                      </tr>
                      {/* CTN Packaging */}
                      <tr><td colSpan={2} className="sec-hdr-green">CTN Qty & Packaging<br/><span style={{ fontSize: 6.5 }}>纸箱数量&包装</span></td></tr>
                      <tr><td style={{ fontSize: 7.5 }}>Carton Details</td><td className="val-bold">{order.cartonQty || '-'} pcs / {order.cartonPackage || '-'}</td></tr>
                      <tr><td style={{ fontSize: 7.5 }}>Carton Size <span className="label-cn">纸箱尺寸</span></td><td className="val-bold">{order.cartonSize || '0'}</td></tr>
                      <tr><td style={{ fontSize: 7.5 }}>Plastic Bag Size <span className="label-cn">胶袋尺寸</span></td><td className="val-bold">{order.plasticBagSize || '0'}</td></tr>
                    </tbody>
                  </table>
                </td>

                {/* MIDDLE: Colors Distribution */}
                <td style={{ width: '42%', verticalAlign: 'top', padding: 0 }}>
                  <table className="inv-table" style={{ border: 'none', width: '100%' }}>
                    <tbody>
                      <tr>
                        <td className="sec-hdr" style={{ width: '18%' }}>Colors Qty<br/><span style={{ fontSize: 6.5 }}>颜色数量</span></td>
                        <td className="sec-hdr" style={{ textAlign: 'center' }}>Colors 颜色</td>
                        <td className="sec-hdr" style={{ textAlign: 'center' }}>Qty 数量</td>
                        <td className="sec-hdr" style={{ textAlign: 'center' }}>Color Barcodes 颜色条形码</td>
                      </tr>
                      {activeColors.length > 0 ? activeColors.map((colorName, idx) => {
                        const colorQuery = Array.isArray(lookups.colors) ? lookups.colors.find(c => c.name === colorName) : null;
                        const hex = colorQuery ? colorQuery.hex : '#ccc';
                        const rowSum = sizesToRender.reduce((sum, s) => sum + (parseInt(order.colorDistribution[colorName]?.[s]) || 0), 0);
                        const colorCode = colorName.substring(0, 3).toUpperCase();
                        return (
                          <tr key={idx}>
                            {idx === 0 && <td rowSpan={activeColors.length} style={{ textAlign: 'center', fontWeight: 900, fontSize: 14 }}>{activeColors.length}</td>}
                            <td><span className="color-dot-c" style={{ backgroundColor: hex }}></span> {colorName}</td>
                            <td style={{ textAlign: 'center', fontWeight: 700 }}>{rowSum}</td>
                            <td style={{ textAlign: 'center', fontFamily: 'monospace', fontSize: 8 }}>{order.barcode ? `100${order.barcode}-${colorCode}` : '-'}</td>
                          </tr>
                        );
                      }) : (
                        <tr><td colSpan={4} style={{ textAlign: 'center', color: '#aaa', padding: 6 }}>No colors specified</td></tr>
                      )}
                    </tbody>
                  </table>
                </td>

                {/* RIGHT: Conditions & Remarks */}
                <td style={{ width: '28%', verticalAlign: 'top', padding: 3 }}>
                  {/* Packaging Conditions */}
                  {order.packagingConditions && Object.keys(order.packagingConditions).length > 0 && (
                    <div>
                      {order.packagingConditions.cond1 && (
                        <div className="cond-item">✓ 件单色混码入中包胶袋 混色 _件装箱 ({order.packagingConditions.cond1_val1 || '-'}/{order.packagingConditions.cond1_val2 || '-'})</div>
                      )}
                      {order.packagingConditions.cond2 && (
                        <div className="cond-item">✓ 件混色混码入中包胶袋 ({order.packagingConditions.cond2_val1 || '-'}/{order.packagingConditions.cond2_val2 || '-'})</div>
                      )}
                      {lookups.packagingConditionsList?.filter(c => order.packagingConditions[c]).map((c, i) => (
                        <div key={i} className="cond-item">✓ {c}</div>
                      ))}
                    </div>
                  )}
                  {/* Fabric Samples Label */}
                  <div style={{ marginTop: 4, padding: '3px 6px', background: '#eaf2f8', border: '1px solid #1a5276', borderRadius: 3, textAlign: 'center', fontSize: 8, fontWeight: 700, color: '#1a5276' }}>
                    Fabrics Samples 样板面料
                  </div>
                  {/* Sale Type */}
                  {order.saleType && (
                    <div style={{ marginTop: 3, fontSize: 7.5, background: '#f3f4f6', padding: '2px 4px', borderRadius: 3, fontWeight: 600 }}>
                      Sale: {order.saleType}
                      {order.saleType === 'جملة وتجزئة' && ` (${order.wholesalePercentage}%/${order.retailPercentage}%)`}
                    </div>
                  )}
                </td>
              </tr>
            </tbody>
          </table>

          {/* ═══ ROW 4: REMARKS ═══ */}
          {order.remarks && (
            <div className="remarks-box">
              <strong>Order Remarks 订单备注:</strong> {order.remarks}
            </div>
          )}

          {/* ═══ SIGNATURES ═══ */}
          <div className="sign-row">
            <div className="sign-box-c">
              <div style={{ fontSize: 8, fontWeight: 600, marginBottom: 2 }}>Name 名字</div>
              <div className="sign-line-c"></div>
              <div className="sign-label-c">Buyer 买方授权</div>
            </div>
            <div className="sign-box-c">
              <div style={{ fontSize: 8, fontWeight: 600, marginBottom: 2 }}>Signature 签名</div>
              <div className="sign-line-c"></div>
              <div className="sign-label-c">Coordinator 协调员</div>
            </div>
            <div className="sign-box-c">
              <div style={{ fontSize: 8, fontWeight: 600, marginBottom: 2 }}>Signature 签名</div>
              <div className="sign-line-c"></div>
              <div className="sign-label-c">Factory 工厂签收</div>
            </div>
          </div>

          <div style={{ marginTop: 4, fontStyle: 'italic', color: '#aaa', fontSize: 7, textAlign: 'center' }}>
            System Generated • Green Hand Platform • Export ID: {order.serialNumber}-{Date.now().toString().slice(-4)}
          </div>
        </div>
      )}
    </div>
  );
};

export default ExportOrder;
