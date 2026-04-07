import React, { useState } from 'react';
import { supabase } from '../supabaseClient';
import toast from 'react-hot-toast';
import { Search, Printer, FileText, CheckCircle2, DownloadCloud } from 'lucide-react';
import { useAppData } from '../context/AppDataContext';

const ExportOrder = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const [order, setOrder] = useState(null);
  const { lookups } = useAppData();

  const handleFetch = async () => {
    if (!searchTerm.trim()) {
      toast.error('أدخل رقم الطلبية أو الموديل أولاً');
      return;
    }
    const toastId = toast.loading('جاري البحث في السحابة...');
    try {
      const { data, error } = await supabase
        .from('orders')
        .select('*')
        .eq('serial_number', searchTerm.trim())
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

       // A4 width in mm = 210, use with small margin
       const pdfWidthMM = 210;
       const margin = 8; // mm margin on each side
       const contentWidthMM = pdfWidthMM - margin * 2;
       // Calculate height proportionally to fit all content on one page
       const contentHeightMM = (imgHeightPx * contentWidthMM) / imgWidthPx;
       const pdfHeightMM = contentHeightMM + margin * 2;

       // Create PDF with custom page size that fits all content
       const pdf = new jsPDF({
         orientation: pdfWidthMM > pdfHeightMM ? 'landscape' : 'portrait',
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
          body * {
            visibility: hidden;
            background: transparent !important;
          }
          .app-container, .main-content {
             margin: 0 !important;
             padding: 0 !important;
             background: white !important;
          }
          .print-doc, .print-doc * {
            visibility: visible;
          }
          .print-doc {
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
            background-color: white !important;
            padding: 20px;
            color: #111827 !important;
          }
          .no-print {
            display: none !important;
          }
          /* Print optimizations */
          h1, h2, h3, h4, th {
            color: #000 !important;
            print-color-adjust: exact;
          }
          .doc-card {
            border: 1px solid #e5e7eb !important;
            box-shadow: none !important;
          }
          .accent-bg {
             background-color: #f3f4f6 !important;
             -webkit-print-color-adjust: exact;
             print-color-adjust: exact;
          }
        }
        
        .print-doc {
            background: #ffffff;
            color: #111827;
            padding: 3rem;
            border-radius: 12px;
            max-width: 1100px;
            margin: 0 auto;
            box-shadow: 0 10px 40px rgba(0,0,0,0.5);
            font-family: 'Inter', 'Tajawal', sans-serif;
            text-align: right;
            border: 1px solid #e5e7eb;
        }

        .doc-header {
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
            border-bottom: 2px solid #000;
            padding-bottom: 2rem;
            margin-bottom: 2rem;
        }

        .doc-title {
            font-size: 2.5rem;
            font-weight: 900;
            color: #000;
            margin: 0;
            letter-spacing: -1px;
            text-transform: uppercase;
        }
        
        .doc-subtitle {
             font-size: 1.2rem;
             color: #6b7280;
             margin-top: 0.25rem;
             font-weight: 500;
        }

        .info-grid {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 2rem;
            margin-bottom: 2.5rem;
        }

        .doc-card {
            background: #fafafa;
            border: 1px solid #f3f4f6;
            padding: 1.5rem;
            border-radius: 8px;
        }

        .doc-card h4 {
            font-size: 0.85rem;
            text-transform: uppercase;
            color: #6b7280;
            margin-bottom: 1rem;
            letter-spacing: 1px;
            font-weight: 600;
        }

        .kp-row {
            display: flex;
            margin-bottom: 0.75rem;
            border-bottom: 1px dashed #e5e7eb;
            padding-bottom: 0.5rem;
        }
        
        .kp-row:last-child {
            border-bottom: none;
            margin-bottom: 0;
            padding-bottom: 0;
        }

        .kp-label {
            width: 120px;
            font-weight: 600;
            color: #4b5563;
        }

        .kp-value {
            flex: 1;
            font-weight: 700;
            color: #111827;
        }

        /* Modern Table alternative */
        .section-title {
            font-size: 1.25rem;
            font-weight: 800;
            color: #000;
            margin-bottom: 1.5rem;
            display: flex;
            align-items: center;
            gap: 0.5rem;
        }

        .section-title span {
            font-weight: 400;
            color: #9ca3af;
            font-size: 1rem;
        }

        .elegant-grid {
            width: 100%;
            border-collapse: separate;
            border-spacing: 0;
            margin-bottom: 2.5rem;
            border-radius: 8px;
            overflow: hidden;
            border: 1px solid #e5e7eb;
        }

        .elegant-grid th {
            background-color: #f9fafb;
            padding: 1rem;
            text-align: right;
            font-size: 0.85rem;
            color: #4b5563;
            font-weight: 600;
            text-transform: uppercase;
            border-bottom: 1px solid #e5e7eb;
        }

        .elegant-grid td {
            padding: 1rem;
            border-bottom: 1px solid #f3f4f6;
            color: #111827;
        }

        .elegant-grid tr:last-child td {
            border-bottom: none;
        }

        /* Color Circle */
        .color-dot {
            width: 14px;
            height: 14px;
            border-radius: 50%;
            display: inline-block;
            margin-left: 0.5rem;
            border: 1px solid #d1d5db;
        }

        .material-pill {
            background: #f3f4f6;
            padding: 0.5rem 1rem;
            border-radius: 999px;
            font-size: 0.9rem;
            font-weight: 600;
            display: inline-flex;
            align-items: center;
            gap: 0.5rem;
        }

        .material-pct {
            background: #111827;
            color: white;
            padding: 2px 8px;
            border-radius: 999px;
            font-size: 0.75rem;
        }

        .signatures {
            display: grid;
            grid-template-columns: repeat(3, 1fr);
            gap: 3rem;
            margin-top: 4rem;
            padding-top: 2rem;
            border-top: 1px solid #e5e7eb;
        }

        .sign-box {
            display: flex;
            flex-direction: column;
            align-items: center;
        }

        .sign-line {
            width: 100%;
            height: 1px;
            background: #000;
            margin-bottom: 0.5rem;
            margin-top: 4rem;
        }

        .sign-label {
            font-weight: 600;
            color: #6b7280;
            text-transform: uppercase;
            font-size: 0.9rem;
            letter-spacing: 1px;
        }
      `}</style>

      {/* Control Navigation - No Print */}
      <div className="card no-print" style={{ marginBottom: '2rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'flex-end', flex: 1 }}>
          <div className="form-group" style={{ marginBottom: 0, flex: 1, maxWidth: '300px' }}>
            <label className="form-label">رقم الموديل للاسترداد والطباعة (Model No)</label>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <input 
                type="text" 
                className="form-control" 
                placeholder="أدخل الرقم..." 
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleFetch()}
              />
              <button className="btn btn-primary" onClick={handleFetch}>
                <Search size={20} /> جلب
              </button>
            </div>
          </div>
        </div>
        {order && (
          <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
             <button className="btn btn-accent" style={{ padding: '0.8rem 2rem', fontSize: '1.15rem', gap: '0.75rem', borderRadius: '50px', background: 'linear-gradient(135deg, var(--accent-color), #b48c26)', color: '#000', fontWeight: 'bold', boxShadow: '0 4px 15px rgba(212, 175, 55, 0.4)' }} onClick={handleDownloadPDF}>
               <DownloadCloud size={22} /> تحميل كملف PDF مباشرة
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
          
          {/* Header Area */}
          <div className="doc-header">
            <div>
              <h1 className="doc-title">PURCHASE ORDER</h1>
              <div className="doc-subtitle">产品订单 (Product Order Document)</div>
            </div>
            <div style={{ textAlign: 'left' }}>
              <div style={{ fontSize: '2.5rem', fontWeight: '900', color: '#111827', lineHeight: '1' }}>#{order.serialNumber}</div>
              <div style={{ color: '#6b7280', fontSize: '0.9rem', marginTop: '0.5rem', fontWeight: '600' }}>ORDER / MODEL NO 款号</div>
            </div>
          </div>

          {/* Metadata Cards */}
          <div className="info-grid">
            <div className="doc-card">
              <h4>Purchasing Party 买方公司信息</h4>
              <div className="kp-row">
                 <span className="kp-label">Company:</span>
                 <span className="kp-value">{order.buyerCompany || '-'}</span>
              </div>
              <div className="kp-row">
                 <span className="kp-label">Contact/ID:</span>
                 <span className="kp-value">{order.buyerMobile || '-'}</span>
              </div>
            </div>

            <div className="doc-card">
              <h4>Manufacturing Facility 工厂细节</h4>
              <div className="kp-row">
                 <span className="kp-label">Factory Name:</span>
                 <span className="kp-value">{factoryInfo.name || '-'}</span>
              </div>
              <div className="kp-row">
                 <span className="kp-label">Contact:</span>
                 <span className="kp-value">{factoryInfo.mobile || '-'}</span>
              </div>
              <div className="kp-row">
                 <span className="kp-label">Address:</span>
                 <span className="kp-value">{factoryInfo.address || '-'}</span>
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '2rem', marginBottom: '2.5rem' }}>
             <div style={{ flex: 1, borderLeft: '4px solid #111827', paddingLeft: '1rem' }}>
                <div style={{ fontSize: '0.85rem', color: '#6b7280', fontWeight: '600', textTransform: 'uppercase' }}>Request Date 订单日期</div>
                <div style={{ fontSize: '1.25rem', fontWeight: '800' }}>{order.requestDate}</div>
             </div>
             <div style={{ flex: 1, borderLeft: '4px solid #b48c26', paddingLeft: '1rem' }}>
                <div style={{ fontSize: '0.85rem', color: '#6b7280', fontWeight: '600', textTransform: 'uppercase' }}>Delivery Date 交货日期</div>
                <div style={{ fontSize: '1.25rem', fontWeight: '800' }}>{order.deliveryDate || 'TBD'}</div>
             </div>
          </div>

          {/* Product Overview */}
          <h3 className="section-title">Product Details <span>(产品详情)</span></h3>
          <table className="elegant-grid">
            <thead>
              <tr>
                <th style={{ textAlign: 'right' }}>Product Name 产品名称</th>
                <th>Price 产品价格</th>
                <th>Quantity 数量</th>
                <th>Sizes 码段</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td style={{ fontWeight: '700', fontSize: '1.1rem' }}>
                  {order.productName || '-'}
                  <div style={{ fontSize: '0.8rem', color: '#6b7280', marginTop: '0.25rem', fontWeight: 'normal', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    Trade Mark: {order.tradeMark || '-'}
                    {(() => {
                      const tmObj = lookups.tradeMarks?.find(t => (typeof t === 'object' ? t.name : t) === order.tradeMark);
                      const tmImage = tmObj && typeof tmObj === 'object' ? tmObj.imageUrl : null;
                      if (tmImage) {
                        return <img src={tmImage} alt={order.tradeMark} style={{ width: '60px', height: '60px', objectFit: 'contain', borderRadius: '6px', border: '1px solid #e5e7eb', background: '#fff', boxShadow: '0 1px 4px rgba(0,0,0,0.1)' }} crossOrigin="anonymous" />;
                      }
                      return null;
                    })()}
                  </div>
                </td>
                <td style={{ textAlign: 'center', fontWeight: 'bold' }}>{order.productPrice || '-'} {order.currency || ''}</td>
                <td style={{ textAlign: 'center', fontWeight: 'bold', fontSize: '1.1rem' }}>{order.totalQuantity} Units</td>
                <td style={{ textAlign: 'center' }}>{order.sizeFrom} ➔ {order.sizeTo}</td>
              </tr>
            </tbody>
          </table>
          
          {order.productFabric && (
             <div style={{ marginBottom: '2.5rem', background: '#f9fafb', padding: '1rem', borderRadius: '8px', border: '1px solid #e5e7eb' }}>
               <span style={{ fontWeight: '600', color: '#4b5563', marginRight: '0.5rem' }}>Main Fabric 核心面料:</span>
               <span style={{ fontWeight: '700', color: '#111827' }}>{order.productFabric}</span>
             </div>
          )}

          {/* Product Images */}
          {order.productImages && order.productImages.length > 0 && (
            <>
              <h3 className="section-title">Product Images <span>(产品图片)</span></h3>
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 200px))',
                gap: '1rem',
                marginBottom: '2.5rem',
                padding: '1rem',
                background: '#f9fafb',
                borderRadius: '8px',
                border: '1px solid #e5e7eb'
              }}>
                {order.productImages.map((img, idx) => (
                  <div key={idx} style={{
                    borderRadius: '8px',
                    overflow: 'hidden',
                    border: '1px solid #e5e7eb',
                    background: '#fff'
                  }}>
                    <img
                      src={img.url}
                      alt={img.name || `Product ${idx + 1}`}
                      style={{ width: '100%', height: '220px', objectFit: 'cover', display: 'block' }}
                      crossOrigin="anonymous"
                    />
                    <div style={{
                      padding: '0.4rem',
                      fontSize: '0.7rem',
                      color: '#6b7280',
                      textAlign: 'center',
                      fontWeight: '600',
                      background: '#f3f4f6'
                    }}>
                      {img.name}
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}

          {/* Materials & Fabrics */}
          {(order.materials && order.materials.some(m => m.name)) && (
             <>
               <h3 className="section-title">Fabrics & Materials <span>(面料种类&材质)</span></h3>
               <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem', marginBottom: '2.5rem' }}>
                 {order.materials.filter(m => m.name).map((mat, idx) => (
                   <div key={idx} className="material-pill">
                     {mat.name}
                     <span className="material-pct">{mat.percentage}%</span>
                   </div>
                 ))}
               </div>
             </>
          )}

          {/* Colors Matrix */}
          <h3 className="section-title">Colors & Sizing Distribution <span>(颜色数量 & 码数)</span></h3>
          {activeColors.length > 0 ? (
            <table className="elegant-grid">
              <thead>
                <tr>
                  <th style={{ width: '25%' }}>Color 颜色</th>
                  {sizesToRender.map(size => (
                    <th key={size} style={{ textAlign: 'center' }}>{size}</th>
                  ))}
                  <th style={{ textAlign: 'center', borderRight: '1px solid #e5e7eb' }}>Total 总计</th>
                </tr>
              </thead>
              <tbody>
                {activeColors.map((colorName, idx) => {
                  const colorQuery = Array.isArray(lookups.colors) ? lookups.colors.find(c => c.name === colorName) : null;
                  const hex = colorQuery ? colorQuery.hex : '#ccc';
                  const rowSum = sizesToRender.reduce((sum, s) => sum + (parseInt(order.colorDistribution[colorName]?.[s]) || 0), 0);
                  
                  return (
                    <tr key={idx}>
                      <td style={{ fontWeight: '600', display: 'flex', alignItems: 'center' }}>
                        <span className="color-dot" style={{ backgroundColor: hex }}></span>
                        {colorName}
                      </td>
                      {sizesToRender.map(s => {
                         const val = order.colorDistribution[colorName]?.[s];
                         return <td key={s} style={{ textAlign: 'center', color: val ? '#000' : '#9ca3af', fontWeight: val ? '600' : 'normal' }}>{val || '-'}</td>
                      })}
                      <td style={{ textAlign: 'center', fontWeight: '800', backgroundColor: '#f9fafb', borderRight: '1px solid #e5e7eb' }}>
                        {rowSum}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          ) : (
             <div style={{ padding: '2rem', background: '#f9fafb', borderRadius: '8px', textAlign: 'center', color: '#6b7280', marginBottom: '2.5rem', border: '1px dashed #d1d5db' }}>
               No specific colors or sizes allocated yet. (没有特别指定的颜色/尺寸)
             </div>
          )}

          {/* Measurements Details */}
          {order.measurements && Object.keys(order.measurements).length > 0 && (
             <>
               <h3 className="section-title">Measurements Details <span>(尺寸细节)</span></h3>
               <table className="elegant-grid">
                 <thead>
                   <tr>
                     <th style={{ width: '25%', left: 0 }}>Measurement 测量部位</th>
                     {sizesToRender.map(size => (
                       <th key={size} style={{ textAlign: 'center' }}>{size}</th>
                     ))}
                   </tr>
                 </thead>
                 <tbody>
                   {Object.keys(order.measurements).map((mName, idx) => (
                     <tr key={idx}>
                       <td style={{ fontWeight: '600', color: '#111827' }}>{mName}</td>
                       {sizesToRender.map(s => (
                          <td key={s} style={{ textAlign: 'center', color: order.measurements[mName]?.[s] ? '#111827' : '#9ca3af', fontWeight: order.measurements[mName]?.[s] ? 'bold' : 'normal' }}>
                            {order.measurements[mName]?.[s] || '-'}
                          </td>
                       ))}
                     </tr>
                   ))}
                 </tbody>
               </table>
             </>
          )}

          {/* Remarks */}
          {order.remarks && (
             <div style={{ marginBottom: '2.5rem', background: '#fefcbf', padding: '1.5rem', borderRadius: '8px', border: '1px solid #fef08a' }}>
               <h4 style={{ margin: '0 0 0.5rem 0', color: '#854d0e', fontSize: '0.95rem', textTransform: 'uppercase', letterSpacing: '1px', fontWeight: '800' }}>Order Remarks 订单备注</h4>
               <p style={{ margin: 0, color: '#422006', lineHeight: '1.6', whiteSpace: 'pre-wrap', fontSize: '1.05rem', fontWeight: '500' }}>{order.remarks}</p>
             </div>
          )}

          {/* Packaging Logistics */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem', marginBottom: '1rem' }}>
             <div>
               <h3 className="section-title">Packaging Logistics <span>(纸箱数量&包装)</span></h3>
               <div className="doc-card">
                 <div className="kp-row">
                    <span className="kp-label">Carton Details:</span>
                    <span className="kp-value">{order.cartonQty || '-'} Pieces / {order.cartonPackage || '-'}</span>
                 </div>
                 <div className="kp-row">
                    <span className="kp-label">Carton Size:</span>
                    <span className="kp-value">{order.cartonSize || '-'}</span>
                 </div>
                 <div className="kp-row">
                    <span className="kp-label">P-Bag Size:</span>
                    <span className="kp-value">{order.plasticBagSize || '-'}</span>
                 </div>
               </div>
             </div>

             <div>
               <h3 className="section-title">Specific Conditions <span>(包装条款)</span></h3>
               <div className="doc-card" style={{ height: 'calc(100% - 3.5rem)' }}>
                 {order.packagingConditions && Object.keys(order.packagingConditions).length > 0 ? (
                    <ul style={{ margin: 0, paddingLeft: '1.2rem', color: '#374151', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                      {order.packagingConditions.cond1 && (
                         <li style={{ listStyleType: 'none', display: 'flex', gap: '0.5rem', alignItems: 'flex-start' }}>
                           <CheckCircle2 size={16} color="#111827" style={{ marginTop: '0.2rem', flexShrink: 0 }} />
                           <span>قطعة لون واحد مقاسات مختلطة في كيس متوسط، ألوان مختلطة ({order.packagingConditions.cond1_val1 || '-'}) قطعة بالكرتون ({order.packagingConditions.cond1_val2 || '-'})</span>
                         </li>
                      )}
                      {order.packagingConditions.cond2 && (
                         <li style={{ listStyleType: 'none', display: 'flex', gap: '0.5rem', alignItems: 'flex-start' }}>
                           <CheckCircle2 size={16} color="#111827" style={{ marginTop: '0.2rem', flexShrink: 0 }} />
                           <span>قطعة ألوان ومقاسات مختلطة في كيس، ({order.packagingConditions.cond2_val1 || '-'}) قطعة بالكرتون ({order.packagingConditions.cond2_val2 || '-'})</span>
                         </li>
                      )}
                      {lookups.packagingConditionsList?.filter(c => order.packagingConditions[c]).map((c, i) => (
                         <li key={i} style={{ listStyleType: 'none', display: 'flex', gap: '0.5rem', alignItems: 'flex-start' }}>
                           <CheckCircle2 size={16} color="#111827" style={{ marginTop: '0.2rem', flexShrink: 0 }} />
                           <span>{c}</span>
                         </li>
                      ))}
                    </ul>
                 ) : (
                    <span style={{ color: '#9ca3af' }}>Standard packaging. 没有附加条件</span>
                 )}
               </div>
             </div>
          </div>

          {/* Signatures */}
          <div className="signatures">
            <div className="sign-box">
               <div className="sign-line"></div>
               <div className="sign-label">Buyer Authorized 买方授权</div>
            </div>
            <div className="sign-box">
               <div className="sign-line"></div>
               <div className="sign-label">Coordinator 协调员</div>
            </div>
            <div className="sign-box">
               <div className="sign-line" style={{ borderTopStyle: 'dashed' }}></div>
               <div className="sign-label">Factory Acceptance 工厂签收</div>
            </div>
          </div>
          
          <div style={{ marginTop: '3rem', fontStyle: 'italic', color: '#9ca3af', fontSize: '11px', textAlign: 'center', fontWeight: '500' }}>
            System Generated Secured Document • Platform Export ID: {order.serialNumber}-{Date.now().toString().slice(-4)}
          </div>
        </div>
      )}
    </div>
  );
};

export default ExportOrder;
