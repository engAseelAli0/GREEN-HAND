import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import { useAppData } from '../context/AppDataContext';
import { Filter, Download, FileText, Printer, Calendar, Factory, CheckCircle2, Box } from 'lucide-react';
import toast from 'react-hot-toast';
import { CustomDateInput } from '../components/CustomDateInput';
import { englishOnly } from '../utils/textUtils';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

const WarehouseReceipt = () => {
  const { lookups } = useAppData();
  const [orders, setOrders] = useState([]);
  const [receivings, setReceivings] = useState([]);
  const [filteredData, setFilteredData] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [dataLoaded, setDataLoaded] = useState(false);

  // Filters state
  const [filters, setFilters] = useState({
    fromDate: '',
    toDate: '',
    factory: '',
    status: 'مستلمة', // Default to received
  });

  // Header Inputs State
  const [headerInfo, setHeaderInfo] = useState({
    buyerNo: '',
    supplier: '',
    consignee: '',
    inspector: '',
    receiptDate: new Date().toISOString().split('T')[0],
    orderNo: '',
    shippingDate: '',
    cabinetNumber: '',
    shipper: '',
    companyPhone: '020-83265754 / 83265146 / 83265442'
  });

  const updateFilter = (field, value) => {
    setFilters(prev => ({ ...prev, [field]: value }));
  };

  const updateHeaderInfo = (field, value) => {
    setHeaderInfo(prev => ({ ...prev, [field]: value }));
  };

  const fetchData = async () => {
    setIsLoading(true);
    try {
      // Fetch all orders
      const { data: oData, error: oError } = await supabase
        .from('orders')
        .select('*')
        .order('created_at', { ascending: false });

      if (oError) throw oError;

      // Fetch all receivings
      const { data: rData, error: rError } = await supabase
        .from('receivings')
        .select('*');

      if (rError) throw rError;

      setOrders(oData || []);
      setReceivings(rData || []);
      setDataLoaded(true);
      
      applyFilters(oData || [], rData || []);
    } catch (err) {
      console.error(err);
      toast.error('حدث خطأ أثناء جلب البيانات');
    } finally {
      setIsLoading(false);
    }
  };

  const applyFilters = (currentOrders = orders, currentReceivings = receivings) => {
    if (!currentOrders.length) return;

    // Create a map for fast receiving lookups
    const recMap = {};
    currentReceivings.forEach(r => {
      recMap[r.serial_number] = r;
    });

    let result = [];

    currentOrders.forEach(o => {
      const oData = o.order_data || {};
      const rData = recMap[o.serial_number];
      const rStatus = rData?.receive_data?.status || 'غير مستلمة';
      const rDate = rData?.receive_data?.receivedAt?.split('T')[0] || o.created_at.split('T')[0];
      
      // Determine base date for filtering
      const filterDate = new Date(rDate);

      let matchDate = true;
      if (filters.fromDate && filterDate < new Date(filters.fromDate)) matchDate = false;
      if (filters.toDate && filterDate > new Date(filters.toDate)) matchDate = false;

      let matchFactory = true;
      if (filters.factory && (oData.factoryId || '') !== filters.factory) matchFactory = false;

      let matchStatus = true;
      if (filters.status !== 'الكل' && rStatus !== filters.status) matchStatus = false;

      if (matchDate && matchFactory && matchStatus) {
        
        // Extract packages
        let pkgs = [];
        if (rData?.receive_data?.packages && rData.receive_data.packages.some(p => p.active && (p.fromCtn || p.toCtn))) {
            pkgs = rData.receive_data.packages.filter(p => p.active && (p.fromCtn || p.toCtn));
        } else if (oData.factoryPackages && oData.factoryPackages.some(p => p.active && (p.fromCtn || p.toCtn))) {
            pkgs = oData.factoryPackages.filter(p => p.active && (p.fromCtn || p.toCtn));
        } else {
            // Fallback to order carton info
            pkgs = [{
                fromCtn: '1',
                toCtn: oData.cartonQty || '1',
                pcsPerCtn: parseInt(oData.totalQuantity || 0) / parseInt(oData.cartonQty || 1) || oData.totalQuantity,
                kind: 'Pcs'
            }];
        }

        // Calculate totals for the entire serial
        let serialTotalCtn = 0;
        let serialTotalProd = 0;
        let serialTotalPrice = 0;

        const processedPkgs = pkgs.map(p => {
            const from = parseInt(p.fromCtn) || 0;
            const to = parseInt(p.toCtn) || 0;
            const units = parseInt(p.pcsPerCtn) || 0;
            const ctnQty = (to >= from && from > 0) ? (to - from + 1) : 0;
            const multiplier = p.kind === 'Doz' ? 12 : 1;
            const itemQty = ctnQty * units * multiplier;
            const unitPrice = parseFloat(oData.productPrice) || 0;
            const totalPrice = itemQty * unitPrice;

            serialTotalCtn += ctnQty;
            serialTotalProd += itemQty;
            serialTotalPrice += totalPrice;

            return {
                cartonNo: (to >= from && from > 0) ? (from === to ? `${from}` : `${from}-${to}`) : '-',
                ctnQty: ctnQty,
                ctnPcs: units,
                itemQty: itemQty,
                unitPrice: unitPrice,
                totalPrice: totalPrice,
                cbm: oData.cbm || '-'
            };
        });

        result.push({
            serial: o.serial_number,
            productName: oData.productName,
            ccy: oData.currency || 'RMB',
            cartonSize: oData.cartonSize || '-',
            remarks: oData.remarks || '',
            totalCtn: serialTotalCtn,
            totalProd: serialTotalProd,
            totalAmount: serialTotalPrice,
            packages: processedPkgs
        });
      }
    });

    setFilteredData(result);
    toast.success(`تم العثور على ${result.length} نتيجة`, { id: 'filter-toast' });
  };

  const handleSearch = async () => {
    if (!dataLoaded) {
      await fetchData();
    } else {
      applyFilters();
    }
  };


  // Grand Totals
  const grandTotalItems = filteredData.length;
  const grandTotalCtn = filteredData.reduce((acc, row) => acc + row.totalCtn, 0);
  const grandTotalPcs = filteredData.reduce((acc, row) => acc + row.totalProd, 0);
  const grandTotalAmount = filteredData.reduce((acc, row) => acc + row.totalAmount, 0);

  // Export Handlers
  const exportToPDF = async () => {
    if (filteredData.length === 0) return toast.error('No data to export');
    const toastId = toast.loading('Exporting PDF...');
    try {
       const tblHead = [['Carton No', 'Serial', 'Product', 'CTNs', 'Pcs/CTN', 'Item Qty', 'Total Qty', 'CCY', 'Unit Price', 'Total Price', 'Amount', 'Carton Size', 'CBM', 'Remarks']];
       const tblBody = [];
       filteredData.forEach((order) => {
         order.packages.forEach((pkg) => {
           tblBody.push([
             pkg.cartonNo || '-', order.serial || '-', englishOnly(order.productName) || '-',
             pkg.ctnQty || 0, pkg.ctnPcs || 0, pkg.itemQty || 0, order.totalProd || 0, order.ccy || '-',
             (pkg.unitPrice || 0).toLocaleString(undefined, { minimumFractionDigits: 2 }),
             (pkg.totalPrice || 0).toLocaleString(undefined, { minimumFractionDigits: 2 }),
             (order.totalAmount || 0).toLocaleString(undefined, { minimumFractionDigits: 2 }),
             order.cartonSize || '-', pkg.cbm || '-', order.remarks || '',
           ]);
         });
       });
       tblBody.push([
         { content: 'TOTAL', colSpan: 3, styles: { fontStyle: 'bold', fillColor: [220, 230, 241], fontSize: 8 } },
         { content: String(grandTotalCtn), styles: { fontStyle: 'bold', fillColor: [220, 230, 241] } },
         { content: '', styles: { fillColor: [220, 230, 241] } },
         { content: '', styles: { fillColor: [220, 230, 241] } },
         { content: String(grandTotalPcs), styles: { fontStyle: 'bold', fillColor: [220, 230, 241] } },
         { content: '', styles: { fillColor: [220, 230, 241] } },
         { content: '', styles: { fillColor: [220, 230, 241] } },
         { content: '', styles: { fillColor: [220, 230, 241] } },
         { content: grandTotalAmount.toLocaleString(undefined, { minimumFractionDigits: 2 }), styles: { fontStyle: 'bold', fillColor: [220, 230, 241], fontSize: 8 } },
         { content: '', styles: { fillColor: [220, 230, 241] } },
         { content: '', styles: { fillColor: [220, 230, 241] } },
         { content: grandTotalItems + ' Items', styles: { fontStyle: 'bold', fillColor: [220, 230, 241] } },
       ]);
       var contentH = 50 + (tblBody.length * 4.5) + 35;
       var pdfH = Math.max(210, contentH);
       var pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: [297, pdfH] });
       var pageW = pdf.internal.pageSize.getWidth();
       var mg = 8;
       pdf.setFontSize(16);
       pdf.setFont('helvetica', 'bold');
       pdf.text('Warehouse Receipt', pageW / 2, 12, { align: 'center' });
       pdf.setDrawColor(50, 50, 50);
       pdf.setLineWidth(0.6);
       pdf.line(mg, 15, pageW - mg, 15);
       autoTable(pdf, {
         startY: 17,
         body: [
           ['Buyer No:', headerInfo.buyerNo || '-', 'Supplier:', headerInfo.supplier || '-', 'Consignee:', headerInfo.consignee || '-'],
           ['Receipt Date:', headerInfo.receiptDate || '-', 'Order No:', headerInfo.orderNo || '-', 'Inspector:', headerInfo.inspector || '-'],
         ],
         theme: 'grid',
         styles: { fontSize: 7, cellPadding: 2, halign: 'center', font: 'helvetica' },
         columnStyles: {
           0: { fontStyle: 'bold', fillColor: [230, 236, 245], cellWidth: 28 },
           1: { cellWidth: 32 }, 2: { fontStyle: 'bold', fillColor: [230, 236, 245], cellWidth: 28 },
           3: { cellWidth: 32 }, 4: { fontStyle: 'bold', fillColor: [230, 236, 245], cellWidth: 28 },
           5: { cellWidth: 32 },
         },
         margin: { left: mg, right: mg }, tableWidth: 'wrap',
       });
       var tableY = (pdf.lastAutoTable ? pdf.lastAutoTable.finalY : 35) + 2;
       autoTable(pdf, {
         startY: tableY, head: tblHead, body: tblBody, theme: 'grid',
         headStyles: { fillColor: [50, 65, 85], textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 6, halign: 'center', cellPadding: 1.8 },
         styles: { fontSize: 6, cellPadding: 1.5, halign: 'center', font: 'helvetica', overflow: 'linebreak', lineWidth: 0.2, lineColor: [180, 180, 180] },
         alternateRowStyles: { fillColor: [248, 250, 252] },
         columnStyles: {
           0: { cellWidth: 15 }, 1: { cellWidth: 14 }, 2: { cellWidth: 35, halign: 'left' },
           3: { cellWidth: 12 }, 4: { cellWidth: 14 }, 5: { cellWidth: 16 }, 6: { cellWidth: 16 },
           7: { cellWidth: 12 }, 8: { cellWidth: 16 }, 9: { cellWidth: 20 }, 10: { cellWidth: 22 },
           11: { cellWidth: 26, fontSize: 5.5 }, 12: { cellWidth: 14 }, 13: { cellWidth: 22, halign: 'left', fontSize: 5.5 },
         },
         margin: { left: mg, right: mg },
       });
       var fY = (pdf.lastAutoTable ? pdf.lastAutoTable.finalY : 180) + 6;
       pdf.setFontSize(8);
       pdf.setFont('helvetica', 'bold');
       pdf.setDrawColor(50, 50, 50);
       pdf.setLineWidth(0.3);
       pdf.line(mg, fY - 2, pageW - mg, fY - 2);
       pdf.text('Shipping Date: ' + (headerInfo.shippingDate || '____________'), mg, fY + 2);
       pdf.text('Cabinet No: ' + (headerInfo.cabinetNumber || '____________'), mg + 90, fY + 2);
       pdf.text('Shipper: ' + (headerInfo.shipper || '____________'), mg + 180, fY + 2);
       pdf.setFontSize(7);
       pdf.setFont('helvetica', 'normal');
       pdf.text('Tel: ' + (headerInfo.companyPhone || '-'), mg, fY + 7);
       pdf.save('Warehouse_Receipt_' + new Date().toISOString().split('T')[0] + '.pdf');
       toast.success('Done!', { id: toastId });
    } catch (err) {
       toast.error('PDF export failed', { id: toastId });
       console.error('PDF Export Error:', err);
    }
  };



  return (
    <div className="fade-in" style={{ padding: '0 1rem', paddingBottom: '5rem' }}>
      
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
        <div>
          <h1 className="text-gradient" style={{ fontSize: '2.2rem', marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <FileText size={35} color="var(--accent-color)" /> تقرير البضائع المستلمة
          </h1>
          <p style={{ color: 'var(--text-muted)' }}>Warehouse Receipt - 仓库出入货清单</p>
        </div>
      </div>

      {/* Filter Card */}
      <div className="card glass-panel" style={{ marginBottom: '2rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1.5rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '1rem' }}>
          <Filter color="var(--accent-color)" />
          <h3 style={{ margin: 0 }}>محددات الاستعلام (Filters)</h3>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1.5rem' }}>
          <CustomDateInput 
            label={<><Calendar size={14}/> من تاريخ</>}
            value={filters.fromDate}
            onChange={(val) => updateFilter('fromDate', val)}
          />

          <CustomDateInput 
            label={<><Calendar size={14}/> إلى تاريخ</>}
            value={filters.toDate}
            onChange={(val) => updateFilter('toDate', val)}
          />

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

          <div className="form-group">
            <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}><Box size={14}/> حالة الاستلام</label>
            <select className="form-control" value={filters.status} onChange={(e) => updateFilter('status', e.target.value)}>
              <option value="الكل">الكل (All)</option>
              <option value="مستلمة">مستلمة (Received)</option>
              <option value="غير مستلمة">غير مستلمة (Unreceived)</option>
            </select>
          </div>
        </div>
        
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '1rem', marginTop: '1.5rem' }}>
          <button className="btn btn-primary" onClick={handleSearch} disabled={isLoading} style={{ padding: '0.5rem 3rem' }}>
             {isLoading ? 'جاري البحث...' : 'بحث وعرض'}
          </button>
        </div>
      </div>

      {/* Results Controls */}
      {filteredData.length > 0 && (
        <div className="hide-on-print" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
           <h3 style={{ margin: 0, color: 'var(--primary-color)' }}>
              معاينة الإيصال <span style={{ fontSize: '0.9rem', color: 'var(--text-muted)', fontWeight: 'normal' }}>({filteredData.length} موديلات)</span>
           </h3>
           <div style={{ display: 'flex', gap: '1rem' }}>
              <button className="btn btn-outline" onClick={() => window.print()} style={{ color: 'var(--text-main)', borderColor: 'var(--border-color)' }}>
                  <Printer size={20} /> طباعة (Print)
              </button>
              <button className="btn" onClick={exportToPDF} style={{ backgroundColor: '#ef4444', color: 'white', boxShadow: '0 4px 15px rgba(239, 68, 68, 0.3)' }}>
                  <Download size={20} /> تحميل PDF
              </button>
           </div>
        </div>
      )}

      {/* RECEIPT PRINT AREA */}
      {filteredData.length > 0 && (
        <div id="receipt-print-area" className="dark-theme-receipt" style={{ 
            backgroundColor: 'var(--surface-color)', 
            color: 'var(--text-main)', 
            padding: '2rem', 
            borderRadius: '12px',
            boxShadow: '0 10px 40px rgba(0,0,0,0.3)',
            direction: 'ltr',
            fontFamily: 'Inter, Tajawal, sans-serif'
        }}>
            {/* Header Form Settings (Visible on screen, looks like text on print) */}
            <div className="hide-on-print" style={{ marginBottom: '1.5rem', padding: '1rem', background: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', direction: 'rtl' }}>
                <div className="form-group" style={{ marginBottom: 0 }}>
                    <label style={{ fontSize: '0.8rem', color: '#64748b' }}>Buyer No (العميل)</label>
                    <input type="text" value={headerInfo.buyerNo} onChange={e => updateHeaderInfo('buyerNo', e.target.value)} style={{ width: '100%', padding: '0.4rem', border: '1px solid #cbd5e1', borderRadius: '4px' }} />
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                    <label style={{ fontSize: '0.8rem', color: '#64748b' }}>Supplier (المورد)</label>
                    <input type="text" value={headerInfo.supplier} onChange={e => updateHeaderInfo('supplier', e.target.value)} style={{ width: '100%', padding: '0.4rem', border: '1px solid #cbd5e1', borderRadius: '4px' }} />
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                    <label style={{ fontSize: '0.8rem', color: '#64748b' }}>Consignee (المستلم)</label>
                    <input type="text" value={headerInfo.consignee} onChange={e => updateHeaderInfo('consignee', e.target.value)} style={{ width: '100%', padding: '0.4rem', border: '1px solid #cbd5e1', borderRadius: '4px' }} />
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                    <label style={{ fontSize: '0.8rem', color: '#64748b' }}>Inspector (المفتش)</label>
                    <input type="text" value={headerInfo.inspector} onChange={e => updateHeaderInfo('inspector', e.target.value)} style={{ width: '100%', padding: '0.4rem', border: '1px solid #cbd5e1', borderRadius: '4px' }} />
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                    <label style={{ fontSize: '0.8rem', color: '#64748b' }}>Order No (رقم الطلبية)</label>
                    <input type="text" value={headerInfo.orderNo} onChange={e => updateHeaderInfo('orderNo', e.target.value)} style={{ width: '100%', padding: '0.4rem', border: '1px solid #cbd5e1', borderRadius: '4px' }} />
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                    <label style={{ fontSize: '0.8rem', color: '#64748b' }}>Receipt Date (تاريخ الاستلام)</label>
                    <input type="date" value={headerInfo.receiptDate} onChange={e => updateHeaderInfo('receiptDate', e.target.value)} style={{ width: '100%', padding: '0.4rem', border: '1px solid #cbd5e1', borderRadius: '4px' }} />
                </div>
            </div>

            {/* Print Header */}
            <div className="print-header" style={{ textAlign: 'center', marginBottom: '1rem', paddingBottom: '0.5rem', borderBottom: '3px solid #1e293b' }}>
                <h1 style={{ fontSize: '2.2rem', margin: 0, color: '#0f172a', fontWeight: '900', letterSpacing: '1px' }}>
                    Warehouse Receipt
                </h1>
                <h2 style={{ fontSize: '1.5rem', margin: '0.2rem 0 0', color: '#334155', fontWeight: 'bold' }}>
                    仓库出入货清单
                </h2>
            </div>

            {/* Header Info Grid */}
            <div className="info-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1px', backgroundColor: '#94a3b8', border: '2px solid #334155', marginBottom: '1rem' }}>
                <div style={{ display: 'flex', backgroundColor: '#fff' }}>
                    <div className="info-label" style={{ width: '40%', padding: '8px', backgroundColor: '#e2e8f0', fontWeight: 'bold', fontSize: '0.9rem', color: '#0f172a', borderRight: '1px solid #94a3b8' }}>
                        <div>Buyer No</div>
                        <div style={{ color: '#ef4444', fontSize: '0.75rem' }}>客户编号:</div>
                    </div>
                    <div style={{ width: '60%', padding: '8px', fontWeight: 'bold', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{headerInfo.buyerNo || '-'}</div>
                </div>
                <div style={{ display: 'flex', backgroundColor: '#fff' }}>
                    <div className="info-label" style={{ width: '40%', padding: '8px', backgroundColor: '#e2e8f0', fontWeight: 'bold', fontSize: '0.9rem', color: '#0f172a', borderRight: '1px solid #94a3b8' }}>
                        <div>Supplier</div>
                        <div style={{ color: '#ef4444', fontSize: '0.75rem' }}>供应商:</div>
                    </div>
                    <div style={{ width: '60%', padding: '8px', fontWeight: 'bold', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{headerInfo.supplier || '-'}</div>
                </div>
                <div style={{ display: 'flex', backgroundColor: '#fff' }}>
                    <div className="info-label" style={{ width: '40%', padding: '8px', backgroundColor: '#e2e8f0', fontWeight: 'bold', fontSize: '0.9rem', color: '#0f172a', borderRight: '1px solid #94a3b8' }}>
                        <div>Consignee</div>
                        <div style={{ color: '#ef4444', fontSize: '0.75rem' }}>收货人:</div>
                    </div>
                    <div style={{ width: '60%', padding: '8px', fontWeight: 'bold', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{headerInfo.consignee || '-'}</div>
                </div>
                
                <div style={{ display: 'flex', backgroundColor: '#fff' }}>
                    <div className="info-label" style={{ width: '40%', padding: '8px', backgroundColor: '#e2e8f0', fontWeight: 'bold', fontSize: '0.9rem', color: '#0f172a', borderRight: '1px solid #94a3b8' }}>
                        <div>Receipt Date</div>
                        <div style={{ color: '#ef4444', fontSize: '0.75rem' }}>收货日期:</div>
                    </div>
                    <div style={{ width: '60%', padding: '8px', fontWeight: 'bold', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{headerInfo.receiptDate || '-'}</div>
                </div>
                <div style={{ display: 'flex', backgroundColor: '#fff' }}>
                    <div className="info-label" style={{ width: '40%', padding: '8px', backgroundColor: '#e2e8f0', fontWeight: 'bold', fontSize: '0.9rem', color: '#0f172a', borderRight: '1px solid #94a3b8' }}>
                        <div>Order No.</div>
                        <div style={{ color: '#ef4444', fontSize: '0.75rem' }}>订单号:</div>
                    </div>
                    <div style={{ width: '60%', padding: '8px', fontWeight: 'bold', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{headerInfo.orderNo || '-'}</div>
                </div>
                <div style={{ display: 'flex', backgroundColor: '#fff' }}>
                    <div className="info-label" style={{ width: '40%', padding: '8px', backgroundColor: '#e2e8f0', fontWeight: 'bold', fontSize: '0.9rem', color: '#0f172a', borderRight: '1px solid #94a3b8' }}>
                        <div>Inspector</div>
                        <div style={{ color: '#ef4444', fontSize: '0.75rem' }}>验货人:</div>
                    </div>
                    <div style={{ width: '60%', padding: '8px', fontWeight: 'bold', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{headerInfo.inspector || '-'}</div>
                </div>
            </div>

            {/* Data Table */}
            <table className="data-table" style={{ width: '100%', borderCollapse: 'collapse', border: '2px solid #334155', fontSize: '0.85rem' }}>
                <thead>
                    <tr style={{ backgroundColor: '#e2e8f0', textAlign: 'center', borderBottom: '2px solid #334155' }}>
                        <th style={{ padding: '8px 4px', borderRight: '1px solid #94a3b8', width: '6%' }}>
                            <div style={{ color: '#ef4444', fontWeight: 'bold', fontSize: '0.9rem' }}>箱号</div>
                            <div style={{ fontSize: '0.7rem' }}>Carton No</div>
                        </th>
                        <th style={{ padding: '8px 4px', borderRight: '1px solid #94a3b8', width: '8%' }}>
                            <div style={{ color: '#ef4444', fontWeight: 'bold', fontSize: '0.9rem' }}>货号</div>
                            <div style={{ fontSize: '0.7rem' }}>Items No</div>
                        </th>
                        <th style={{ padding: '8px 4px', borderRight: '1px solid #94a3b8', width: '14%' }}>
                            <div style={{ color: '#ef4444', fontWeight: 'bold', fontSize: '0.9rem' }}>货名</div>
                            <div style={{ fontSize: '0.7rem' }}>Product Name</div>
                        </th>
                        <th style={{ padding: '8px 4px', borderRight: '1px solid #94a3b8', width: '5%' }}>
                            <div style={{ color: '#ef4444', fontWeight: 'bold', fontSize: '0.9rem' }}>箱数</div>
                            <div style={{ fontSize: '0.7rem' }}>CTNs Qty</div>
                        </th>
                        <th style={{ padding: '8px 4px', borderRight: '1px solid #94a3b8', width: '6%' }}>
                            <div style={{ color: '#ef4444', fontWeight: 'bold', fontSize: '0.9rem' }}>数量</div>
                            <div style={{ fontSize: '0.7rem' }}>CTN/Pcs</div>
                        </th>
                        <th style={{ padding: '8px 4px', borderRight: '1px solid #94a3b8', width: '6%' }}>
                            <div style={{ color: '#ef4444', fontWeight: 'bold', fontSize: '0.9rem' }}>产品数量</div>
                            <div style={{ fontSize: '0.7rem' }}>Item Qty</div>
                        </th>
                        <th style={{ padding: '8px 4px', borderRight: '1px solid #94a3b8', width: '6%' }}>
                            <div style={{ color: '#ef4444', fontWeight: 'bold', fontSize: '0.9rem' }}>总数量</div>
                            <div style={{ fontSize: '0.7rem' }}>Total Qty</div>
                        </th>
                        <th style={{ padding: '8px 4px', borderRight: '1px solid #94a3b8', width: '4%' }}>
                            <div style={{ color: '#ef4444', fontWeight: 'bold', fontSize: '0.9rem' }}>货币</div>
                            <div style={{ fontSize: '0.7rem' }}>CCY</div>
                        </th>
                        <th style={{ padding: '8px 4px', borderRight: '1px solid #94a3b8', width: '7%' }}>
                            <div style={{ color: '#ef4444', fontWeight: 'bold', fontSize: '0.9rem' }}>单价</div>
                            <div style={{ fontSize: '0.7rem' }}>UNIT PRICE</div>
                        </th>
                        <th style={{ padding: '8px 4px', borderRight: '1px solid #94a3b8', width: '9%' }}>
                            <div style={{ color: '#ef4444', fontWeight: 'bold', fontSize: '0.9rem' }}>总价</div>
                            <div style={{ fontSize: '0.7rem' }}>Total Price</div>
                        </th>
                        <th style={{ padding: '8px 4px', borderRight: '1px solid #94a3b8', width: '9%' }}>
                            <div style={{ color: '#ef4444', fontWeight: 'bold', fontSize: '0.9rem' }}>总金额</div>
                            <div style={{ fontSize: '0.7rem' }}>Tot. Amount</div>
                        </th>
                        <th style={{ padding: '8px 4px', borderRight: '1px solid #94a3b8', width: '10%' }}>
                            <div style={{ color: '#ef4444', fontWeight: 'bold', fontSize: '0.9rem' }}>外箱尺寸</div>
                            <div style={{ fontSize: '0.7rem' }}>Carton Size</div>
                        </th>
                        <th style={{ padding: '8px 4px', borderRight: '1px solid #94a3b8', width: '5%' }}>
                            <div style={{ color: '#ef4444', fontWeight: 'bold', fontSize: '0.9rem' }}>总体积</div>
                            <div style={{ fontSize: '0.7rem' }}>CBM</div>
                        </th>
                        <th style={{ padding: '8px 4px', width: '5%' }}>
                            <div style={{ color: '#ef4444', fontWeight: 'bold', fontSize: '0.9rem' }}>备注</div>
                            <div style={{ fontSize: '0.7rem' }}>Remarks</div>
                        </th>
                    </tr>
                </thead>
                <tbody>
                    {filteredData.map((order, oIdx) => {
                        return order.packages.map((pkg, pIdx) => {
                            const isFirstPkg = pIdx === 0;
                            const rowSpan = order.packages.length;
                            const tBorderStyle = '1px solid #cbd5e1';

                            return (
                                <tr key={`${oIdx}-${pIdx}`} style={{ textAlign: 'center', backgroundColor: '#fff', borderBottom: pIdx === rowSpan - 1 ? '1px solid #334155' : 'none' }}>
                                    <td style={{ padding: '4px', borderRight: tBorderStyle, borderBottom: tBorderStyle }}>{pkg.cartonNo}</td>
                                    
                                    {isFirstPkg && (
                                        <>
                                            <td rowSpan={rowSpan} style={{ padding: '4px', borderRight: tBorderStyle, fontWeight: 'bold', borderBottom: '1px solid #334155' }}>{order.serial}</td>
                                            <td rowSpan={rowSpan} style={{ padding: '4px', borderRight: tBorderStyle, borderBottom: '1px solid #334155' }}>{englishOnly(order.productName)}</td>
                                        </>
                                    )}

                                    <td style={{ padding: '4px', borderRight: tBorderStyle, borderBottom: tBorderStyle }}>{pkg.ctnQty}</td>
                                    <td style={{ padding: '4px', borderRight: tBorderStyle, borderBottom: tBorderStyle }}>{pkg.ctnPcs}</td>
                                    <td style={{ padding: '4px', borderRight: tBorderStyle, borderBottom: tBorderStyle }}>{pkg.itemQty}</td>

                                    {isFirstPkg && (
                                        <>
                                            <td rowSpan={rowSpan} style={{ padding: '4px', borderRight: tBorderStyle, fontWeight: 'bold', borderBottom: '1px solid #334155' }}>{order.totalProd}</td>
                                            <td rowSpan={rowSpan} style={{ padding: '4px', borderRight: tBorderStyle, fontSize: '0.7rem', borderBottom: '1px solid #334155' }}>¥ {order.ccy}</td>
                                        </>
                                    )}

                                    <td style={{ padding: '4px', borderRight: tBorderStyle, borderBottom: tBorderStyle }}>{pkg.unitPrice.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                                    <td style={{ padding: '4px', borderRight: tBorderStyle, borderBottom: tBorderStyle }}>{pkg.totalPrice.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>

                                    {isFirstPkg && (
                                        <>
                                            <td rowSpan={rowSpan} style={{ padding: '4px', borderRight: tBorderStyle, fontWeight: 'bold', borderBottom: '1px solid #334155' }}>{order.totalAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                                        </>
                                    )}

                                    <td style={{ padding: '4px', borderRight: tBorderStyle, fontSize: '0.75rem', borderBottom: tBorderStyle }}>{order.cartonSize}</td>
                                    
                                    {isFirstPkg && (
                                        <>
                                            <td rowSpan={rowSpan} style={{ padding: '4px', borderRight: tBorderStyle, borderBottom: '1px solid #334155' }}>{pkg.cbm}</td>
                                            <td rowSpan={rowSpan} style={{ padding: '4px', fontSize: '0.75rem', borderBottom: '1px solid #334155' }}>{order.remarks}</td>
                                        </>
                                    )}
                                </tr>
                            );
                        });
                    })}

                    {/* Totals Row */}
                    <tr className="totals-row" style={{ backgroundColor: '#e2e8f0', textAlign: 'center', fontWeight: 'bold', borderBottom: '2px solid #334155', borderTop: '2px solid #334155' }}>
                        <td colSpan={2} style={{ padding: '10px 4px', borderRight: '1px solid #94a3b8', fontSize: '1rem' }}>Total</td>
                        <td style={{ padding: '10px 4px', borderRight: '1px solid #94a3b8', color: '#1e293b' }}>{grandTotalItems} Items</td>
                        <td colSpan={2} style={{ padding: '10px 4px', borderRight: '1px solid #94a3b8', color: '#1e293b' }}>{grandTotalCtn} CTN</td>
                        <td colSpan={2} style={{ padding: '10px 4px', borderRight: '1px solid #94a3b8', color: '#1e293b' }}>{grandTotalPcs} PCS</td>
                        <td colSpan={7} style={{ padding: '10px 4px', color: '#1e293b', fontSize: '1.1rem' }}>{grandTotalAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })} ¥ RMB</td>
                    </tr>
                </tbody>
            </table>

            {/* Footer Summary */}
            <div className="footer-summary" style={{ display: 'flex', justifyContent: 'space-between', marginTop: '1.5rem', padding: '1rem', backgroundColor: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '0.9rem', fontWeight: 'bold', color: '#334155' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <span style={{ color: '#ef4444' }}>出货日期</span>
                    <span>Shipping Date:</span>
                    <input className="hide-on-print" type="date" value={headerInfo.shippingDate} onChange={e => updateHeaderInfo('shippingDate', e.target.value)} style={{ padding: '0.2rem', border: '1px solid #cbd5e1', borderRadius: '4px' }} />
                    <span className="print-only-inline" style={{ display: 'none' }}>{headerInfo.shippingDate || '------------------'}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <span style={{ color: '#ef4444' }}>柜号</span>
                    <span>Cabinet Number:</span>
                    <input className="hide-on-print" type="text" value={headerInfo.cabinetNumber} onChange={e => updateHeaderInfo('cabinetNumber', e.target.value)} style={{ padding: '0.2rem', border: '1px solid #cbd5e1', borderRadius: '4px' }} />
                    <span className="print-only-inline" style={{ display: 'none' }}>{headerInfo.cabinetNumber || '------------------'}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <span style={{ color: '#ef4444' }}>出货人</span>
                    <span>Shipper:</span>
                    <input className="hide-on-print" type="text" value={headerInfo.shipper} onChange={e => updateHeaderInfo('shipper', e.target.value)} style={{ padding: '0.2rem', border: '1px solid #cbd5e1', borderRadius: '4px' }} />
                    <span className="print-only-inline" style={{ display: 'none' }}>{headerInfo.shipper || '------------------'}</span>
                </div>
            </div>

            <div style={{ marginTop: '1.5rem', display: 'flex', gap: '1.5rem', alignItems: 'center', color: '#0f172a', fontWeight: 'bold' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <span>Company Phone No.</span>
                    <span style={{ color: '#ef4444' }}>公司电话:</span>
                </div>
                <div style={{ display: 'flex', gap: '2rem', fontSize: '1.1rem' }}>
                    <input className="hide-on-print" type="text" value={headerInfo.companyPhone} onChange={e => updateHeaderInfo('companyPhone', e.target.value)} style={{ width: '300px', padding: '0.2rem', border: '1px solid #cbd5e1', borderRadius: '4px' }} />
                    <span className="print-only-inline" style={{ display: 'none' }}>{headerInfo.companyPhone}</span>
                </div>
            </div>

            <style>
                {`
                .dark-theme-receipt {
                    border: 1px solid var(--border-color) !important;
                }
                .dark-theme-receipt .hide-on-print {
                    background: rgba(255,255,255,0.02) !important;
                    border-color: var(--border-color) !important;
                }
                .dark-theme-receipt .hide-on-print input {
                    background: var(--bg-color) !important;
                    color: var(--text-main) !important;
                    border-color: var(--border-color) !important;
                }
                .dark-theme-receipt .hide-on-print label {
                    color: var(--text-muted) !important;
                }
                .dark-theme-receipt .print-header h1, .dark-theme-receipt .print-header h2 {
                    color: var(--text-main) !important;
                }
                .dark-theme-receipt .print-header {
                    border-bottom-color: var(--accent-color) !important;
                }
                .dark-theme-receipt .info-grid {
                    background-color: var(--border-color) !important;
                    border-color: var(--accent-color) !important;
                }
                .dark-theme-receipt .info-grid > div {
                    background-color: var(--surface-color) !important;
                }
                .dark-theme-receipt .info-grid .info-label {
                    background-color: rgba(255,255,255,0.05) !important;
                    color: var(--text-main) !important;
                    border-right-color: var(--border-color) !important;
                }
                .dark-theme-receipt .data-table {
                    border-color: var(--accent-color) !important;
                }
                .dark-theme-receipt .data-table th {
                    background-color: rgba(255,255,255,0.05) !important;
                    border-color: var(--border-color) !important;
                }
                .dark-theme-receipt .data-table tr {
                    background-color: transparent !important;
                }
                .dark-theme-receipt .data-table td {
                    border-color: var(--border-color) !important;
                }
                .dark-theme-receipt .data-table .totals-row {
                    background-color: rgba(212, 175, 55, 0.1) !important;
                    border-color: var(--accent-color) !important;
                }
                .dark-theme-receipt .data-table .totals-row td {
                    color: var(--accent-color) !important;
                }
                .dark-theme-receipt .footer-summary {
                    background-color: rgba(255,255,255,0.02) !important;
                    border-color: var(--border-color) !important;
                    color: var(--text-main) !important;
                }

                @page {
                    size: A4 landscape;
                    margin: 5mm;
                }

                @media print {
                    html, body {
                        margin: 0 !important;
                        padding: 0 !important;
                        background: #fff !important;
                        direction: ltr !important;
                        -webkit-print-color-adjust: exact !important;
                        print-color-adjust: exact !important;
                        overflow: visible !important;
                    }
                    body * {
                        visibility: hidden;
                    }
                    .hide-on-print { display: none !important; }
                    .print-only-inline { display: inline !important; }

                    #receipt-print-area, #receipt-print-area * {
                        visibility: visible;
                    }
                    #receipt-print-area {
                        position: absolute;
                        left: 0;
                        top: 0;
                        width: 100%;
                        background-color: #ffffff !important;
                        color: #000000 !important;
                        box-shadow: none !important;
                        padding: 5mm !important;
                        border: none !important;
                        border-radius: 0 !important;
                        page-break-inside: avoid !important;
                        break-inside: avoid !important;
                    }

                    /* Force single page */
                    #receipt-print-area * {
                        page-break-inside: avoid !important;
                        break-inside: avoid !important;
                    }
                    #receipt-print-area .data-table {
                        page-break-inside: avoid !important;
                    }
                    #receipt-print-area .data-table tr {
                        page-break-inside: avoid !important;
                        break-inside: avoid !important;
                    }
                    #receipt-print-area.dark-theme-receipt {
                        border: none !important;
                    }
                    #receipt-print-area .print-header h1 {
                        color: #0f172a !important;
                        font-size: 22pt !important;
                    }
                    #receipt-print-area .print-header h2 {
                        color: #334155 !important;
                        font-size: 14pt !important;
                    }
                    #receipt-print-area .print-header {
                        border-bottom: 3px solid #0f172a !important;
                        margin-bottom: 8mm !important;
                    }

                    /* Info grid print */
                    #receipt-print-area .info-grid {
                        background-color: #94a3b8 !important;
                        border: 2px solid #334155 !important;
                    }
                    #receipt-print-area .info-grid > div {
                        background-color: #fff !important;
                    }
                    #receipt-print-area .info-grid .info-label {
                        background-color: #e2e8f0 !important;
                        color: #0f172a !important;
                        border-right: 1px solid #94a3b8 !important;
                    }

                    /* Data table print */
                    #receipt-print-area .data-table {
                        border: 2px solid #334155 !important;
                        font-size: 8pt !important;
                        table-layout: fixed !important;
                        width: 100% !important;
                    }
                    #receipt-print-area .data-table th {
                        background-color: #e2e8f0 !important;
                        color: #0f172a !important;
                        border: 1px solid #94a3b8 !important;
                        padding: 4px 2px !important;
                        font-size: 7pt !important;
                    }
                    #receipt-print-area .data-table td {
                        border: 1px solid #cbd5e1 !important;
                        padding: 3px 2px !important;
                        color: #0f172a !important;
                        font-size: 7.5pt !important;
                        word-wrap: break-word !important;
                        overflow-wrap: break-word !important;
                    }
                    #receipt-print-area .data-table tr {
                        background-color: #fff !important;
                    }
                    #receipt-print-area .data-table .totals-row {
                        background-color: #e2e8f0 !important;
                        border: 2px solid #334155 !important;
                    }
                    #receipt-print-area .data-table .totals-row td {
                        color: #0f172a !important;
                        font-weight: bold !important;
                        font-size: 9pt !important;
                    }

                    /* Footer print */
                    #receipt-print-area .footer-summary {
                        background-color: #f8fafc !important;
                        border: 1px solid #e2e8f0 !important;
                        color: #334155 !important;
                    }
                }
                `}
            </style>

        </div>
      )}
    </div>
  );
};

export default WarehouseReceipt;
