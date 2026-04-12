import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import { useAppData } from '../context/AppDataContext';
import { Filter, Download, FileText, ChevronDown, ChevronUp, Printer, Calendar, Factory } from 'lucide-react';
import toast from 'react-hot-toast';
import * as XLSX from 'xlsx';

const ReportsPortal = () => {
  const { lookups } = useAppData();
  const [orders, setOrders] = useState([]);
  const [filteredOrders, setFilteredOrders] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  
  // Filters state
  const [filters, setFilters] = useState({
    fromSerial: '',
    toSerial: '',
    fromDate: '',
    toDate: '',
    factory: '',
  });

  const updateFilter = (field, value) => {
    setFilters(prev => ({ ...prev, [field]: value }));
  };

  const [expandedRows, setExpandedRows] = useState([]);

  useEffect(() => {
    fetchOrders();
  }, []);

  const fetchOrders = async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('orders')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      
      const sortedData = (data || []).sort((a, b) => {
         return (parseInt(b.serial_number) || 0) - (parseInt(a.serial_number) || 0);
      });
      
      setOrders(sortedData);
      setFilteredOrders(sortedData);
    } catch (err) {
      console.error(err);
      toast.error('حدث خطأ أثناء جلب الطلبيات');
    } finally {
      setIsLoading(false);
    }
  };

  const applyFilters = () => {
    let result = [...orders];

    if (filters.fromSerial) {
      result = result.filter(o => parseInt(o.serial_number) >= parseInt(filters.fromSerial));
    }
    if (filters.toSerial) {
      result = result.filter(o => parseInt(o.serial_number) <= parseInt(filters.toSerial));
    }
    if (filters.fromDate) {
      result = result.filter(o => new Date(o.order_data.requestDate || o.created_at) >= new Date(filters.fromDate));
    }
    if (filters.toDate) {
      result = result.filter(o => new Date(o.order_data.requestDate || o.created_at) <= new Date(filters.toDate));
    }
    if (filters.factory) {
      result = result.filter(o => (o.order_data.factoryId || '').includes(filters.factory));
    }

    // Ensure it remains sorted descending by Serial Number (Large to Small)
    result.sort((a, b) => {
       return (parseInt(b.serial_number) || 0) - (parseInt(a.serial_number) || 0);
    });

    setFilteredOrders(result);
    setExpandedRows([]);
    toast.success(`تم العثور على ${result.length} طلبية`, { id: 'filter-toast' });
  };

  const clearFilters = () => {
    setFilters({
      fromSerial: '',
      toSerial: '',
      fromDate: '',
      toDate: '',
      factory: '',
    });
    setFilteredOrders(orders);
    setExpandedRows([]);
  };

  const toggleRow = (serial) => {
    setExpandedRows(prev => 
      prev.includes(serial) ? prev.filter(s => s !== serial) : [...prev, serial]
    );
  };

  // ─── Export Handlers ───
  const exportToExcel = () => {
    if (filteredOrders.length === 0) return toast.error('لا توجد بيانات لتصديرها');
    
    const excelData = filteredOrders.map(o => {
      const d = o.order_data || {};
      const computedTotal = calculateTotalPiecesCount(d);
      return {
        "رقم الموديل (Serial)": o.serial_number || '-',
        "العميل / المشتري": d.buyerCompany || '-',
        "المنتج": d.productName || '-',
        "المصنع": d.factoryId || '-',
        "العلامة التجارية": d.tradeMark || '-',
        "المقاسات": `${d.sizeFrom || '-'} ⟵ ${d.sizeTo || '-'}`,
        "الكمية الإجمالية": computedTotal > 0 ? computedTotal : (d.totalQuantity || 0),
        "سعر القطعة": d.productPrice || 0,
        "العملة": d.currency || '-',
        "إجمالي السعر": (parseFloat(d.productPrice || 0) * (computedTotal > 0 ? computedTotal : parseInt(d.totalQuantity || 0))) || 0,
        "الملاحظات": d.remarks || '-',
        "تاريخ الطلب": d.requestDate || o.created_at?.split('T')[0],
        "تاريخ التسليم": d.deliveryDate || '-',
        "تاريخ الإضافة بالنظام": new Date(o.created_at).toLocaleString('ar-EG'),
      };
    });

    const worksheet = XLSX.utils.json_to_sheet(excelData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "تقرير الطلبيات");
    XLSX.writeFile(workbook, `Report_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  const exportToPDF = async () => {
    if (filteredOrders.length === 0) return toast.error('لا توجد بيانات لتصديرها');
    
    const toastId = toast.loading('جاري تجهيز وتصدير التقرير الشامل...');
    const element = document.getElementById('report-print-area');
    
    // Backup UI states
    const originalShadow = element.style.boxShadow;
    element.style.boxShadow = 'none';

    // Expand all rows heavily in real DOM for canvas capture
    const expandableSections = document.querySelectorAll('.expandable-content');
    const originalDisplays = [];
    expandableSections.forEach(sec => {
        originalDisplays.push(sec.style.display);
        sec.style.display = 'table-row';
    });

    try {
       const { default: html2canvas } = await import('html2canvas');
       const { default: jsPDF } = await import('jspdf');

       const canvas = await html2canvas(element, {
         scale: 2,
         useCORS: true,
         logging: false,
         windowWidth: Math.max(element.scrollWidth, 1200) // Ensure wide view for tables
       });

       const imgData = canvas.toDataURL('image/jpeg', 1.0);
       const imgWidthPx = canvas.width;
       const imgHeightPx = canvas.height;

       // A3 landscape width = 420mm -> plenty of room for wide tables without shrinking too much
       const pdfWidthMM = 420;
       const margin = 10;
       const contentWidthMM = pdfWidthMM - margin * 2;
       
       // Calculate height dynamically so it NEVER breaks into pages
       const contentHeightMM = (imgHeightPx * contentWidthMM) / imgWidthPx;
       const pdfHeightMM = contentHeightMM + margin * 2;

       const pdf = new jsPDF({
         orientation: pdfWidthMM > pdfHeightMM ? 'landscape' : 'portrait',
         unit: 'mm',
         format: [pdfWidthMM, pdfHeightMM],
       });

       pdf.addImage(imgData, 'JPEG', margin, margin, contentWidthMM, contentHeightMM);
       pdf.save(`Report_${new Date().toISOString().split('T')[0]}.pdf`);
       
       toast.success('تم تحميل التقرير بصفحة واحدة بنجاح!', { id: toastId });
    } catch (err) {
       toast.error('حدث خطأ أثناء تحميل الـ PDF', { id: toastId });
       console.error(err);
    } finally {
       // Restore UI
       element.style.boxShadow = originalShadow;
       expandableSections.forEach((sec, idx) => {
           sec.style.display = originalDisplays[idx];
       });
    }
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

  return (
    <div className="fade-in" style={{ padding: '0 1rem' }}>
      
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
        <div>
          <h1 className="text-gradient" style={{ fontSize: '2.5rem', marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <FileText size={40} color="var(--accent-color)" /> بـوابـة التقاريـر الذكيـة
          </h1>
          <p style={{ color: 'var(--text-muted)' }}>استعلام ديناميكي واستخراج التقارير وتصديرها</p>
        </div>
        <div style={{ display: 'flex', gap: '1rem' }}>
          <button className="btn" onClick={exportToExcel} style={{ backgroundColor: '#10b981', color: 'white', boxShadow: '0 4px 15px rgba(16, 185, 129, 0.3)' }}>
            <Download size={20} /> تصدير Excel
          </button>
          <button className="btn" onClick={exportToPDF} style={{ backgroundColor: '#ef4444', color: 'white', boxShadow: '0 4px 15px rgba(239, 68, 68, 0.3)' }}>
            <Printer size={20} /> تصدير PDF
          </button>
        </div>
      </div>

      {/* Filter Card */}
      <div className="card glass-panel" style={{ marginBottom: '2rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1.5rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '1rem' }}>
          <Filter color="var(--accent-color)" />
          <h3 style={{ margin: 0 }}>محددات الاستعلام (Filters)</h3>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1.5rem' }}>
          
          <div className="form-group">
            <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}><FileText size={14}/> من رقم موديل (Serial)</label>
            <input type="number" className="form-control" placeholder="مثال: 1000" value={filters.fromSerial} onChange={(e) => updateFilter('fromSerial', e.target.value)} />
          </div>
          
          <div className="form-group">
            <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}><FileText size={14}/> إلى رقم موديل</label>
            <input type="number" className="form-control" placeholder="مثال: 1100" value={filters.toSerial} onChange={(e) => updateFilter('toSerial', e.target.value)} />
          </div>

          <div className="form-group">
            <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}><Calendar size={14}/> من تاريخ</label>
            <input type="date" className="form-control" value={filters.fromDate} onChange={(e) => updateFilter('fromDate', e.target.value)} />
          </div>

          <div className="form-group">
            <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}><Calendar size={14}/> إلى تاريخ</label>
            <input type="date" className="form-control" value={filters.toDate} onChange={(e) => updateFilter('toDate', e.target.value)} />
          </div>

          <div className="form-group">
            <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}><Factory size={14}/> تحديد المصنع</label>
            <select className="form-control" value={filters.factory} onChange={(e) => updateFilter('factory', e.target.value)}>
              <option value="">-- جميع المصانع --</option>
              {lookups.factories?.map((f, i) => {
                const factoryName = typeof f === 'object' ? f.name : f;
                return <option key={i} value={factoryName}>{factoryName}</option>;
              })}
            </select>
          </div>
          
        </div>
        
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '1rem', marginTop: '2rem' }}>
          <button className="btn btn-outline" onClick={clearFilters}>إفراغ الفلاتر</button>
          <button className="btn btn-primary" onClick={applyFilters} style={{ padding: '0.5rem 3rem' }}>بحث وعرض</button>
        </div>
      </div>

      {/* Results Section */}
      <div className="card" id="report-print-area">
        <div style={{ marginBottom: '1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={{ margin: 0, color: 'var(--primary-color)' }}>نتائج الاستعلام</h3>
          <span style={{ backgroundColor: 'var(--surface-highlight)', padding: '0.5rem 1rem', borderRadius: '50px', fontSize: '0.9rem', color: 'var(--accent-color)', fontWeight: 'bold' }}>
            {filteredOrders.length} طلبية مطابقة
          </span>
        </div>

        {isLoading ? (
          <div style={{ textAlign: 'center', padding: '4rem', color: 'var(--text-muted)' }}>جاري تحميل البيانات...</div>
        ) : filteredOrders.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '4rem', backgroundColor: 'var(--surface-highlight)', borderRadius: 'var(--radius-md)' }}>
            <p style={{ color: 'var(--text-muted)', fontSize: '1.1rem' }}>لا توجد طلبيات تطابق الفلاتر الحالية.</p>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'right' }}>
              <thead>
                <tr style={{ backgroundColor: 'rgba(212, 175, 55, 0.1)', borderBottom: '2px solid var(--accent-color)' }}>
                  <th style={{ padding: '1rem', color: 'var(--accent-color)' }}>رقم الموديل</th>
                  <th style={{ padding: '1rem' }}>المنتج</th>
                  <th style={{ padding: '1rem' }}>الشركة (المشتري)</th>
                  <th style={{ padding: '1rem' }}>المصنع المستلم</th>
                  <th style={{ padding: '1rem', textAlign: 'center' }}>المقاسات (الكمية الإجمالية)</th>
                  <th style={{ padding: '1rem', textAlign: 'center' }}>تاريخ الطلب</th>
                  <th style={{ padding: '1rem', textAlign: 'center' }}>تفاصيل</th>
                </tr>
              </thead>
              <tbody>
                {filteredOrders.map((order, idx) => {
                  const d = order.order_data || {};
                  const isExpanded = expandedRows.includes(order.serial_number);
                  const computedTotal = calculateTotalPiecesCount(d);

                  return (
                    <React.Fragment key={idx}>
                      <tr style={{ borderBottom: '1px solid var(--border-color)', backgroundColor: idx % 2 === 0 ? 'transparent' : 'var(--surface-highlight)', transition: 'background-color 0.2s' }}>
                        <td style={{ padding: '1rem', fontWeight: 'bold', color: 'var(--primary-color)', fontSize: '1.2rem' }}>{order.serial_number || '-'}</td>
                        <td style={{ padding: '1rem' }}>{d.productName || '-'}</td>
                        <td style={{ padding: '1rem' }}>{d.buyerCompany || '-'}</td>
                        <td style={{ padding: '1rem' }}>{d.factoryId || '-'}</td>
                        <td style={{ padding: '1rem', textAlign: 'center' }}>
                            <span style={{ backgroundColor: 'var(--accent-color)', color: '#fff', padding: '0.2rem 0.8rem', borderRadius: '50px', fontWeight: 'bold' }}>
                                {computedTotal > 0 ? computedTotal : (d.totalQuantity || '-')}
                            </span>
                        </td>
                        <td style={{ padding: '1rem', textAlign: 'center' }}>{d.requestDate || '-'}</td>
                        <td style={{ padding: '1rem', textAlign: 'center' }}>
                          <button 
                            className="btn btn-outline" 
                            style={{ padding: '0.4rem', border: 'none', background: isExpanded ? 'rgba(212, 175, 55, 0.2)' : 'rgba(255, 255, 255, 0.05)' }} 
                            onClick={() => toggleRow(order.serial_number)}
                          >
                            {isExpanded ? <ChevronUp size={20} color="var(--accent-color)" /> : <ChevronDown size={20} />}
                          </button>
                        </td>
                      </tr>
                      {/* Expanded Section for Details */}
                      <tr className="expandable-content" style={{ display: isExpanded ? 'table-row' : 'none', backgroundColor: 'rgba(0,0,0,0.2)' }}>
                          <td colSpan={7} style={{ padding: '1.5rem', borderBottom: '1px solid var(--border-color)' }}>
                             
                             <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', marginBottom: '1.5rem', padding: '1.5rem', background: 'rgba(255,255,255,0.03)', borderRadius: 'var(--radius-md)', border: '1px solid rgba(255,255,255,0.05)' }}>
                                <div>
                                   <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem', display: 'block', marginBottom: '0.4rem' }}>المقاسات المحددة:</span>
                                   <div style={{ fontWeight: 'bold', color: '#fff', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                      <span>{d.sizeFrom || '-'}</span>
                                      <span style={{ color: 'var(--accent-color)' }}>⟵</span>
                                      <span>{d.sizeTo || '-'}</span>
                                   </div>
                                </div>
                                <div>
                                   <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem', display: 'block', marginBottom: '0.2rem' }}>تاريخ الاستلام (التسليم):</span>
                                   <div style={{ fontWeight: 'bold', color: '#fff' }}>{d.deliveryDate || '-'}</div>
                                </div>
                                <div>
                                   <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem', display: 'block', marginBottom: '0.2rem' }}>سعر القطعة (الحبة):</span>
                                   <div style={{ fontWeight: 'bold', color: '#fff' }}>{d.productPrice || '0'} {d.currency || ''}</div>
                                </div>
                                <div>
                                   <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem', display: 'block', marginBottom: '0.2rem' }}>إجمالي السعر:</span>
                                   <div style={{ fontWeight: '900', color: 'var(--accent-color)', fontSize: '1.1rem' }}>
                                     {(parseFloat(d.productPrice || 0) * (computedTotal > 0 ? computedTotal : parseInt(d.totalQuantity || 0))).toLocaleString()} {d.currency || ''}
                                   </div>
                                </div>
                             </div>

                             {d.colorDistribution && Object.keys(d.colorDistribution).length > 0 && (
                               <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
                                 {Object.keys(d.colorDistribution).map((color, cIdx) => {
                                   if (!d.colorDistribution[color] || typeof d.colorDistribution[color] !== 'object') return null;
                                   return (
                                     <div key={cIdx} style={{ backgroundColor: 'var(--surface-color)', padding: '1rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)', minWidth: '150px' }}>
                                        <h4 style={{ margin: '0 0 0.8rem 0', color: 'var(--accent-color)', borderBottom: '1px dashed var(--border-color)', paddingBottom: '0.5rem' }}>{color}</h4>
                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', fontSize: '0.9rem' }}>
                                          {Object.entries(d.colorDistribution[color]).map(([size, qty]) => {
                                          if(!qty || parseInt(qty) <= 0) return null;
                                          return (
                                            <div key={size} style={{ display: 'flex', justifyContent: 'space-between' }}>
                                              <span style={{ color: 'var(--text-muted)' }}>{size}:</span>
                                              <span style={{ fontWeight: 'bold' }}>{qty}</span>
                                            </div>
                                          );
                                        })}
                                      </div>
                                   </div>
                                   );
                                 })}
                               </div>
                             )}

                             {d.remarks && (
                               <div style={{ marginTop: '1rem', padding: '1.2rem', backgroundColor: 'var(--surface-highlight)', borderRadius: 'var(--radius-md)', borderRight: '4px solid var(--accent-color)' }}>
                                 <strong style={{ color: 'var(--accent-color)', display: 'block', marginBottom: '0.5rem' }}>ملاحظات الطلبية: </strong> 
                                 <span style={{ lineHeight: '1.6' }}>{d.remarks}</span>
                               </div>
                             )}
                          </td>
                        </tr>
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default ReportsPortal;
