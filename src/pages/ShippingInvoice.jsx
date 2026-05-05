import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import { useAppData } from '../context/AppDataContext';
import { Printer, Plus, Trash2, Search, FileText, Settings, LayoutGrid } from 'lucide-react';
import toast from 'react-hot-toast';

const toEnglishNumbers = (str) => {
  if (str === null || str === undefined) return '';
  return str.toString().replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d));
};

const ShippingInvoice = () => {
  const [headerInfo, setHeaderInfo] = useState({
    companyName: 'ARABIAN FRIENDSHIP TRADING CO.,LIMITED',
    tel: 'Tel:(8620)-83265754',
    fax: 'FAX:(8620)-83265204',
    buyer: '',
    invoiceNo: '',
    branch: '',
    date: new Date().toISOString().split('T')[0]
  });

  const [rows, setRows] = useState([
    { id: Date.now(), serial: '', desc: '', arabicName: '', qty: '', currency: '¥ RMB', unitPrice: '', totalAmount: 0, details: '', image: '' }
  ]);

  const [footerInfo, setFooterInfo] = useState({
    commissionPercent: '5',
    containerFee: '',
    insurance: '',
    internalShipping: '',
    containerNo: '',
    sealNo: ''
  });

  const [isExporting, setIsExporting] = useState(false);
  const [showFetchDialog, setShowFetchDialog] = useState(false);
  const [showImageColumn, setShowImageColumn] = useState(false);

  // Auto-calculate Total Amount for each row when Qty or Unit Price changes
  useEffect(() => {
    const updatedRows = rows.map(r => {
      const q = parseFloat(r.qty) || 0;
      const p = parseFloat(r.unitPrice) || 0;
      return { ...r, totalAmount: q * p };
    });
    
    // Only update if there's an actual change in totals to prevent infinite loops
    const hasChanges = updatedRows.some((r, i) => r.totalAmount !== rows[i].totalAmount);
    if (hasChanges) {
      setRows(updatedRows);
    }
  }, [rows]);

  const addRow = () => {
    setRows([...rows, { id: Date.now(), serial: '', desc: '', arabicName: '', qty: '', currency: '¥ RMB', unitPrice: '', totalAmount: 0, details: '', image: '' }]);
  };

  const removeRow = (id) => {
    if (rows.length === 1) return;
    setRows(rows.filter(r => r.id !== id));
  };

  const handleRowChange = (id, field, value) => {
    // Force English numbers for numeric fields
    let finalValue = value;
    if (['qty', 'unitPrice', 'serial'].includes(field)) {
        finalValue = toEnglishNumbers(value);
    }
    setRows(rows.map(r => r.id === id ? { ...r, [field]: finalValue } : r));
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

  const fetchAllData = async (withImage) => {
    setShowFetchDialog(false);
    setShowImageColumn(withImage);
    const toastId = toast.loading('جاري التحقق من الموديلات وجلب البيانات...');
    let successCount = 0;
    
    // Create a copy of rows
    let updatedRows = [...rows];
    let newBuyer = headerInfo.buyer;

    for (let i = 0; i < updatedRows.length; i++) {
        let r = updatedRows[i];
        if (r.serial.trim() && !r.desc) { // Only fetch if desc is empty to avoid overwriting manually edited
            try {
                const { data, error } = await supabase
                    .from('orders')
                    .select('order_data')
                    .eq('serial_number', r.serial.trim())
                    .single();

                if (!error && data) {
                    const d = data.order_data;
                    const totalPieces = calculateTotalPiecesCount(d) || parseInt(d.totalQuantity) || 0;
                    
                    let imageUrl = '';
                    if (withImage && d.productImages && Array.isArray(d.productImages) && d.productImages.length > 0) {
                        const firstImage = d.productImages[0];
                        imageUrl = typeof firstImage === 'object' ? firstImage.url : firstImage;
                    }

                    updatedRows[i] = {
                        ...r,
                        desc: d.productName || '',
                        arabicName: d.productName || '',
                        qty: totalPieces.toString(),
                        currency: d.currency || '¥ RMB',
                        unitPrice: d.productPrice || '',
                        image: imageUrl
                    };
                    successCount++;
                    
                    if (!newBuyer && d.buyerCompany) {
                        newBuyer = d.buyerCompany;
                    }
                }
            } catch (err) {
                // ignore
            }
        }
    }
    
    setRows(updatedRows);
    if (!headerInfo.buyer && newBuyer) {
        setHeaderInfo(prev => ({ ...prev, buyer: newBuyer }));
    }

    if (successCount > 0) {
        toast.success(`تم جلب بيانات ${successCount} موديل بنجاح!`, { id: toastId });
    } else {
        toast.error('لم يتم العثور على بيانات جديدة أو جميع الأصناف مجلوبة مسبقاً', { id: toastId });
    }
  };

  // Calculations
  const totalItemsCount = rows.filter(r => r.serial.trim() !== '').length;
  const totalPcs = rows.reduce((acc, r) => acc + (parseFloat(r.qty) || 0), 0);
  const subTotalAmount = rows.reduce((acc, r) => acc + (r.totalAmount || 0), 0);

  const commPercent = parseFloat(footerInfo.commissionPercent) || 0;
  const commissionAmount = subTotalAmount * (commPercent / 100);
  
  const contFee = parseFloat(footerInfo.containerFee) || 0;
  const ins = parseFloat(footerInfo.insurance) || 0;
  const intShip = parseFloat(footerInfo.internalShipping) || 0;

  const invoiceTotal = subTotalAmount + commissionAmount + contFee + ins + intShip;

  // Primary currency from first row
  const primaryCurrency = rows[0]?.currency || 'RMB ¥';

  const exportToPDF = () => {
    window.print();
  };

  return (
    <div className="fade-in" style={{ paddingBottom: '4rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
        <div>
          <h1 style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', fontSize: '2.2rem', margin: 0, color: 'var(--primary-color)' }}>
            <FileText size={40} color="var(--accent-color)" />
            فاتورة الشحن والتقارير المجمعة
          </h1>
          <p style={{ color: 'var(--text-muted)', margin: '0.5rem 0 0', paddingRight: '3.5rem' }}>
            إنشاء فواتير شحن مجمعة، إدخال الأرقام التسلسلية وجلب البيانات آلياً بضغطة زر.
          </p>
        </div>
        <button className="btn btn-primary no-print" onClick={exportToPDF} disabled={isExporting} style={{ padding: '12px 24px', fontSize: '1.1rem' }}>
          {isExporting ? <div className="spinner" style={{ width: '20px', height: '20px' }}/> : <><Printer size={20} /> طباعة الفاتورة (Print)</>}
        </button>
      </div>

      <div id="invoice-print-area" style={{ 
          background: 'var(--surface-color)', 
          border: '2px solid var(--accent-color)', 
          borderRadius: '16px', 
          overflow: 'hidden',
          boxShadow: '0 10px 30px rgba(0,0,0,0.5)',
          color: 'var(--text-main)'
      }}>
        
        {/* Print Styles */}
        <style>
          {`
            @media print {
              body, html {
                background: #fff !important;
                color: #000 !important;
                --surface-color: #fff !important;
                --bg-color: #fff !important;
                --text-main: #000 !important;
                --text-muted: #333 !important;
                --border-color: #000 !important;
                --surface-highlight: #f8f9fa !important;
                --primary-color: #000 !important;
                --accent-color: #000 !important;
              }
              #invoice-print-area {
                border: none !important;
                box-shadow: none !important;
                width: 100% !important;
              }
              .no-print {
                display: none !important;
              }
              input {
                color: #000 !important;
              }
              table th, table td {
                border: 1px solid #000 !important;
                color: #000 !important;
              }
            }
          `}
        </style>
        
        {/* ─── INVOICE HEADER ─── */}
        <div style={{ 
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
           <div style={{ display: 'flex', justifyContent: 'center', gap: '2rem' }}>
             <input type="text" value={headerInfo.tel} onChange={e => setHeaderInfo({...headerInfo, tel: e.target.value})} style={{ textAlign: 'center', background: 'transparent', border: 'none', color: 'var(--text-muted)', fontWeight: 'bold', direction: 'ltr' }} />
             <input type="text" value={headerInfo.fax} onChange={e => setHeaderInfo({...headerInfo, fax: e.target.value})} style={{ textAlign: 'center', background: 'transparent', border: 'none', color: 'var(--text-muted)', fontWeight: 'bold', direction: 'ltr' }} />
           </div>
        </div>

        <div style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
           
           <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1rem', background: 'rgba(212, 175, 55, 0.05)', padding: '1rem', borderRadius: '8px', border: '1px solid rgba(212, 175, 55, 0.2)' }}>
              <div>
                 <label style={{ fontSize: '0.85rem', color: 'var(--accent-color)', fontWeight: 'bold', display: 'block', marginBottom: '4px' }}>Buyer (المشتري):</label>
                 <input type="text" className="form-control" value={headerInfo.buyer} onChange={e => setHeaderInfo({...headerInfo, buyer: e.target.value})} style={{ background: 'var(--bg-color)' }} />
              </div>
              <div>
                 <label style={{ fontSize: '0.85rem', color: 'var(--accent-color)', fontWeight: 'bold', display: 'block', marginBottom: '4px' }}>Invoice No. (رقم الفاتورة):</label>
                 <input type="text" className="form-control" value={headerInfo.invoiceNo} onChange={e => setHeaderInfo({...headerInfo, invoiceNo: toEnglishNumbers(e.target.value)})} style={{ background: 'var(--bg-color)' }} />
              </div>
              <div>
                 <label style={{ fontSize: '0.85rem', color: 'var(--accent-color)', fontWeight: 'bold', display: 'block', marginBottom: '4px' }}>Branch (الفرع):</label>
                 <input type="text" className="form-control" value={headerInfo.branch} onChange={e => setHeaderInfo({...headerInfo, branch: e.target.value})} style={{ background: 'var(--bg-color)' }} />
              </div>
              <div>
                 <label style={{ fontSize: '0.85rem', color: 'var(--accent-color)', fontWeight: 'bold', display: 'block', marginBottom: '4px' }}>Date (التاريخ):</label>
                 <input type="date" className="form-control" value={headerInfo.date} onChange={e => setHeaderInfo({...headerInfo, date: e.target.value})} style={{ background: 'var(--bg-color)' }} />
              </div>
           </div>

           <h2 style={{ textAlign: 'center', margin: '1rem 0', fontSize: '1.8rem', color: 'var(--primary-color)' }}>Invoice List</h2>

           {/* ─── INVOICE TABLE ─── */}
           <div style={{ overflowX: 'auto' }}>
             <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'center', fontSize: '0.9rem' }}>
               <thead>
                 <tr style={{ background: 'var(--surface-highlight)', borderBottom: '2px solid var(--accent-color)' }}>
                   <th style={{ padding: '10px 5px', border: '1px solid var(--border-color)', width: '40px' }}>No</th>
                   <th style={{ padding: '10px 5px', border: '1px solid var(--border-color)', width: '140px' }}>Items No<br/><span style={{fontSize:'0.75rem', color:'var(--text-muted)'}}>رقم الصنف</span></th>
                   <th style={{ padding: '10px 5px', border: '1px solid var(--border-color)' }}>Items Description<br/><span style={{fontSize:'0.75rem', color:'var(--text-muted)'}}>الوصف بالانجليزي</span></th>
                   <th style={{ padding: '10px 5px', border: '1px solid var(--border-color)' }}>اسم الصنف<br/><span style={{fontSize:'0.75rem', color:'var(--text-muted)'}}>Arabic Name</span></th>
                   <th style={{ padding: '10px 5px', border: '1px solid var(--border-color)', width: '80px' }}>Total Qty<br/><span style={{fontSize:'0.75rem', color:'var(--text-muted)'}}>الكمية</span></th>
                   <th style={{ padding: '10px 5px', border: '1px solid var(--border-color)', width: '80px' }}>Price CCY<br/><span style={{fontSize:'0.75rem', color:'var(--text-muted)'}}>العملة</span></th>
                   <th style={{ padding: '10px 5px', border: '1px solid var(--border-color)', width: '90px' }}>UNIT PRICE<br/><span style={{fontSize:'0.75rem', color:'var(--text-muted)'}}>سعر الوحدة</span></th>
                   <th style={{ padding: '10px 5px', border: '1px solid var(--border-color)', width: '120px' }}>Total Amount<br/><span style={{fontSize:'0.75rem', color:'var(--text-muted)'}}>الإجمالي</span></th>
                   {showImageColumn ? (
                       <th style={{ padding: '10px 5px', border: '1px solid var(--border-color)', width: '90px' }}>Item Image<br/><span style={{fontSize:'0.75rem', color:'var(--text-muted)'}}>صورة الصنف</span></th>
                   ) : (
                       <th style={{ padding: '10px 5px', border: '1px solid var(--border-color)' }}>Other Details<br/><span style={{fontSize:'0.75rem', color:'var(--text-muted)'}}>تفاصيل أخرى</span></th>
                   )}
                   <th className="no-print" style={{ padding: '10px 5px', width: '40px', border: '1px solid var(--border-color)' }}></th>
                 </tr>
               </thead>
               <tbody>
                 {rows.map((row, index) => (
                   <tr key={row.id} style={{ background: index % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.02)', transition: 'background-color 0.2s' }}>
                     <td style={{ border: '1px solid var(--border-color)', padding: '5px', fontWeight: 'bold' }}>{index + 1}</td>
                     
                     <td style={{ border: '1px solid var(--border-color)', padding: '5px' }}>
                        <input 
                          type="text" 
                          value={row.serial} 
                          onChange={e => handleRowChange(row.id, 'serial', e.target.value)}
                          placeholder="الموديل"
                          style={{ width: '100%', background: 'transparent', border: 'none', color: 'var(--text-main)', textAlign: 'center', fontWeight: 'bold' }}
                        />
                     </td>
                     
                     <td style={{ border: '1px solid var(--border-color)', padding: '5px' }}>
                        <input type="text" value={row.desc} onChange={e => handleRowChange(row.id, 'desc', e.target.value)} style={{ width: '100%', background: 'transparent', border: 'none', color: 'var(--text-main)', textAlign: 'center' }} />
                     </td>
                     
                     <td style={{ border: '1px solid var(--border-color)', padding: '5px' }}>
                        <input type="text" value={row.arabicName} onChange={e => handleRowChange(row.id, 'arabicName', e.target.value)} style={{ width: '100%', background: 'transparent', border: 'none', color: 'var(--text-main)', textAlign: 'center', direction: 'rtl' }} />
                     </td>
                     
                     <td style={{ border: '1px solid var(--border-color)', padding: '5px' }}>
                        <input type="number" value={row.qty} onChange={e => handleRowChange(row.id, 'qty', e.target.value)} style={{ width: '100%', background: 'transparent', border: 'none', color: 'var(--text-main)', textAlign: 'center', fontWeight: 'bold' }} />
                     </td>
                     
                     <td style={{ border: '1px solid var(--border-color)', padding: '5px' }}>
                        <input type="text" value={row.currency} onChange={e => handleRowChange(row.id, 'currency', e.target.value)} style={{ width: '100%', background: 'transparent', border: 'none', color: 'var(--text-main)', textAlign: 'center' }} />
                     </td>
                     
                     <td style={{ border: '1px solid var(--border-color)', padding: '5px' }}>
                        <input type="number" value={row.unitPrice} onChange={e => handleRowChange(row.id, 'unitPrice', e.target.value)} style={{ width: '100%', background: 'transparent', border: 'none', color: 'var(--text-main)', textAlign: 'center' }} />
                     </td>
                     
                     <td style={{ border: '1px solid var(--border-color)', padding: '5px', fontWeight: 'bold', color: 'var(--accent-color)' }}>
                        {row.totalAmount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                     </td>
                     
                     {showImageColumn ? (
                        <td style={{ border: '1px solid var(--border-color)', padding: '5px', textAlign: 'center' }}>
                            {row.image ? (
                                <img src={row.image} alt="Product" style={{ width: '60px', height: '80px', objectFit: 'contain', borderRadius: '4px' }} />
                            ) : (
                                <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>لا توجد صورة</span>
                            )}
                        </td>
                     ) : (
                        <td style={{ border: '1px solid var(--border-color)', padding: '5px' }}>
                           <input type="text" value={row.details} onChange={e => handleRowChange(row.id, 'details', e.target.value)} style={{ width: '100%', background: 'transparent', border: 'none', color: 'var(--text-main)', textAlign: 'center' }} />
                        </td>
                     )}

                        <td className="no-print" style={{ border: '1px solid var(--border-color)', padding: '5px', textAlign: 'center' }}>
                            <div style={{ display: 'flex', gap: '4px', justifyContent: 'center' }}>
                                <button onClick={() => removeRow(row.id)} style={{ background: 'rgba(239, 68, 68, 0.1)', border: 'none', color: '#ef4444', padding: '4px', borderRadius: '4px', cursor: 'pointer' }}>
                                    <Trash2 size={14} />
                                </button>
                                <button className="no-print" onClick={() => fetchRowData(row.id, row.serial)} style={{ background: 'none', border: 'none', color: 'var(--accent-color)', cursor: 'pointer', padding: '2px' }}>
                                    <Search size={14} />
                                </button>
                            </div>
                        </td>
                   </tr>
                 ))}
               </tbody>
             </table>
           </div>


           {!isExporting && (
             <div className="no-print" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', marginTop: '1rem', gap: '1rem' }}>
                <button onClick={addRow} className="btn btn-outline" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--accent-color)', borderColor: 'var(--accent-color)' }}>
                   <Plus size={18} /> إضافة صف فارغ
                </button>
                <button onClick={() => setShowFetchDialog(true)} className="btn btn-primary" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: 'linear-gradient(to right, #10b981, #059669)', border: 'none', padding: '10px 24px' }}>
                   <Search size={18} /> جلب بيانات كل الأصناف المدخلة
                </button>
             </div>
           )}

           {/* ─── FOOTER CALCULATIONS (MATCHING IMAGE LAYOUT RTL) ─── */}
           <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '2rem' }}>
              <table style={{ width: '60%', minWidth: '600px', borderCollapse: 'collapse', textAlign: 'center', fontWeight: 'bold' }} dir="rtl">
                 <tbody>
                    {/* Row 1: Totals */}
                    <tr>
                       <td style={{ padding: '12px', background: 'rgba(212, 175, 55, 0.1)', border: '1px solid var(--border-color)', color: 'var(--primary-color)', fontSize: '1.2rem' }}>Total</td>
                       <td style={{ padding: '12px', border: '1px solid var(--border-color)' }}>Items {totalItemsCount}</td>
                       <td style={{ padding: '12px', border: '1px solid var(--border-color)' }}>PCS {totalPcs}</td>
                       <td style={{ padding: '12px', background: 'rgba(212, 175, 55, 0.1)', border: '1px solid var(--border-color)', fontSize: '1.2rem', color: 'var(--accent-color)', direction: 'ltr' }}>
                          {primaryCurrency} {subTotalAmount.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                       </td>
                    </tr>
                    
                    {/* Row 2: Commission */}
                    <tr>
                       <td colSpan={2} style={{ border: 'none' }}></td>
                       <td style={{ padding: '12px', background: 'rgba(212, 175, 55, 0.05)', border: '1px solid var(--border-color)' }}>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                             Commission <input type="number" value={footerInfo.commissionPercent} onChange={e => setFooterInfo({...footerInfo, commissionPercent: e.target.value})} style={{ width: '40px', background: 'var(--bg-color)', border: '1px solid var(--border-color)', color: 'var(--text-main)', textAlign: 'center', borderRadius: '4px' }} /> %
                          </div>
                       </td>
                       <td style={{ padding: '12px', border: '1px solid var(--border-color)', direction: 'ltr' }}>
                          {commissionAmount > 0 ? primaryCurrency + ' ' + commissionAmount.toLocaleString('en-US', { minimumFractionDigits: 2 }) : '0.00'}
                       </td>
                    </tr>

                    {/* Row 3: Container Fee */}
                    <tr>
                       <td colSpan={2} style={{ border: 'none' }}></td>
                       <td style={{ padding: '12px', background: 'rgba(212, 175, 55, 0.05)', border: '1px solid var(--border-color)' }}>Container Fee</td>
                       <td style={{ padding: '8px', border: '1px solid var(--border-color)' }}>
                          <input type="number" value={footerInfo.containerFee} onChange={e => setFooterInfo({...footerInfo, containerFee: e.target.value})} placeholder="0.00" style={{ width: '100%', background: 'transparent', border: 'none', color: 'var(--text-main)', textAlign: 'center', fontWeight: 'bold', fontSize: '1rem' }} />
                       </td>
                    </tr>

                    {/* Row 4: Insurance */}
                    <tr>
                       <td colSpan={2} style={{ border: 'none' }}></td>
                       <td style={{ padding: '12px', background: 'rgba(212, 175, 55, 0.05)', border: '1px solid var(--border-color)' }}>Insurance</td>
                       <td style={{ padding: '8px', border: '1px solid var(--border-color)' }}>
                          <input type="number" value={footerInfo.insurance} onChange={e => setFooterInfo({...footerInfo, insurance: e.target.value})} placeholder="0.00" style={{ width: '100%', background: 'transparent', border: 'none', color: 'var(--text-main)', textAlign: 'center', fontWeight: 'bold', fontSize: '1rem' }} />
                       </td>
                    </tr>

                    {/* Row 5: Internal Shipping */}
                    <tr>
                       <td colSpan={2} style={{ border: 'none' }}></td>
                       <td style={{ padding: '12px', background: 'rgba(212, 175, 55, 0.05)', border: '1px solid var(--border-color)' }}>Internal Shipping</td>
                       <td style={{ padding: '8px', border: '1px solid var(--border-color)' }}>
                          <input type="number" value={footerInfo.internalShipping} onChange={e => setFooterInfo({...footerInfo, internalShipping: e.target.value})} placeholder="0.00" style={{ width: '100%', background: 'transparent', border: 'none', color: 'var(--text-main)', textAlign: 'center', fontWeight: 'bold', fontSize: '1rem' }} />
                       </td>
                    </tr>

                    {/* Row 6: Final Total */}
                    <tr>
                       <td colSpan={2} style={{ border: 'none' }}></td>
                       <td style={{ padding: '12px', background: 'var(--accent-color)', color: '#000', border: '1px solid var(--border-color)' }}>Invoice Total</td>
                       <td style={{ padding: '12px', background: 'rgba(212, 175, 55, 0.5)', border: '1px solid var(--border-color)', color: 'var(--accent-color)', fontSize: '1.4rem', direction: 'ltr' }}>
                          {primaryCurrency} {invoiceTotal.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                       </td>
                    </tr>
                 </tbody>
              </table>
           </div>

           {/* ─── BOTTOM DETAILS ─── */}
           <div style={{ marginTop: '2rem', display: 'flex', flexDirection: 'column', gap: '0.5rem', fontWeight: 'bold', fontSize: '1.1rem' }} dir="ltr">
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', background: 'var(--surface-highlight)', padding: '10px 15px', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                 <span style={{ width: '200px' }}>SAY TOTAL AMOUNT IS</span>
                 <span style={{ color: 'var(--accent-color)' }}>{invoiceTotal.toLocaleString('en-US', { minimumFractionDigits: 2 })} {primaryCurrency}</span>
                 <span style={{ margin: '0 1rem' }}>&</span>
                 <span style={{ color: 'var(--accent-color)' }}>{totalPcs} PCS</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', background: 'var(--surface-highlight)', padding: '10px 15px', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                 <span style={{ width: '200px' }}>CONTAINER NO :</span>
                 <input type="text" value={footerInfo.containerNo} onChange={e => setFooterInfo({...footerInfo, containerNo: e.target.value})} style={{ flex: 1, background: 'transparent', border: 'none', borderBottom: '1px dashed var(--accent-color)', color: 'var(--text-main)', fontSize: '1.1rem', fontWeight: 'bold', padding: '0 10px' }} />
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', background: 'var(--surface-highlight)', padding: '10px 15px', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                 <span style={{ width: '200px' }}>SEAL NO :</span>
                 <input type="text" value={footerInfo.sealNo} onChange={e => setFooterInfo({...footerInfo, sealNo: e.target.value})} style={{ width: '300px', background: 'transparent', border: 'none', borderBottom: '1px dashed var(--accent-color)', color: 'var(--text-main)', fontSize: '1.1rem', fontWeight: 'bold', padding: '0 10px' }} />
              </div>
           </div>

        </div>
      </div>

      {/* ─── FETCH DIALOG ─── */}
      {showFetchDialog && (
         <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.8)', zIndex: 9999, display: 'flex', justifyContent: 'center', alignItems: 'center', backdropFilter: 'blur(5px)' }}>
            <div className="card fade-in" style={{ width: '450px', textAlign: 'center', border: '2px solid var(--accent-color)', boxShadow: '0 10px 40px rgba(212,175,55,0.2)' }}>
               <h3 style={{ marginBottom: '1rem', color: 'var(--accent-color)' }}>جلب بيانات المنتجات</h3>
               <p style={{ marginBottom: '2rem', fontSize: '1.2rem' }}>هل تريد جلب البيانات مع صور المنتجات؟</p>
               <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center' }}>
                  <button onClick={() => fetchAllData(true)} className="btn btn-primary" style={{ flex: 1, background: 'linear-gradient(135deg, var(--accent-color), #b58d27)', color: '#000', padding: '12px', fontSize: '1.1rem' }}>
                     مع الصور
                  </button>
                  <button onClick={() => fetchAllData(false)} className="btn btn-outline" style={{ flex: 1, padding: '12px', fontSize: '1.1rem', color: 'var(--text-main)', borderColor: 'var(--border-color)' }}>
                     بدون الصور
                  </button>
               </div>
               <button onClick={() => setShowFetchDialog(false)} style={{ marginTop: '1.5rem', background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', textDecoration: 'underline', fontSize: '1rem' }}>
                  إلغاء
               </button>
            </div>
         </div>
      )}
    </div>
  );
};

export default ShippingInvoice;
