import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { supabase } from '../supabaseClient';
import { useAppData } from '../context/AppDataContext';
import { Filter, Download, FileText, Printer, Calendar, Factory, CheckCircle2, Box } from 'lucide-react';
import toast from 'react-hot-toast';
import { CustomDateInput } from '../components/CustomDateInput';
import { englishOnly } from '../utils/textUtils';
import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas';
import { useAuth } from '../context/AuthContext';
import { useFilteredLookups } from '../hooks/useFilteredLookups';

const WarehouseReceipt = () => {
  const { t, i18n } = useTranslation();
  const { lookups } = useAppData();
  const { user, hasPermission } = useAuth();
  const filteredLookups = useFilteredLookups();
  const [orders, setOrders] = useState([]);
  const [receivings, setReceivings] = useState([]);
  const [filteredData, setFilteredData] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [dataLoaded, setDataLoaded] = useState(false);

  const [filters, setFilters] = useState({
    fromDate: '',
    toDate: '',
    factory: '',
    status: 'received', // Default to received
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

  const formatReceivedAt = (dateStr) => {
    if (!dateStr) return '-';
    const date = new Date(dateStr);
    if (Number.isNaN(date.getTime())) return String(dateStr).split('T')[0] || '-';
    return date.toLocaleString('en-GB', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    });
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

      let validOrders = oData || [];
      if (user && user.role !== 'admin') {
        const allowedFactories = user.permissions?.allowed_factories || [];
        const allowedCompanies = user.permissions?.allowed_companies || [];
        
        if (allowedFactories.length > 0) {
          validOrders = validOrders.filter(o => allowedFactories.includes(o.order_data?.factoryId));
        }
        if (allowedCompanies.length > 0) {
          validOrders = validOrders.filter(o => allowedCompanies.includes(o.order_data?.buyerCompany));
        }
      }

      setOrders(validOrders);
      setReceivings(rData || []);
      setDataLoaded(true);
      
      applyFilters(validOrders, rData || []);
    } catch (err) {
      console.error(err);
      toast.error(t('warehouse.messages.fetch_error'));
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
      const isReceived = rData?.receive_data?.status && (
        rData.receive_data.status.includes('Received') ||
        rData.receive_data.status === 'مستلمة' ||
        rData.receive_data.status === '已收货' ||
        rData.receive_data.status === t('receiving.info.received')
      );
      const receivedAt = isReceived ? (rData?.receive_data?.receivedAt || rData?.created_at || '') : '';
      const rDate = (receivedAt || o.created_at).split('T')[0];
      
      // Determine base date for filtering
      const filterDate = new Date(rDate);

      let matchDate = true;
      if (filters.fromDate && filterDate < new Date(filters.fromDate)) matchDate = false;
      if (filters.toDate && filterDate > new Date(filters.toDate)) matchDate = false;

      let matchFactory = true;
      if (filters.factory && (oData.factoryId || '') !== filters.factory) matchFactory = false;

      let matchStatus = true;
      if (filters.status !== 'all') {
        if (filters.status === 'received' && !isReceived) matchStatus = false;
        if (filters.status === 'unreceived' && isReceived) matchStatus = false;
      }

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
            receivedAt,
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
    toast.success(t('warehouse.messages.results_found', { count: result.length }), { id: 'filter-toast' });
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

  // Export Handlers - تصدير نفس تصميم الطباعة بالكامل بدقة متناهية
  const exportToPDF = async () => {
    if (filteredData.length === 0) return toast.error(t('warehouse.messages.no_data_export'));
    const toastId = toast.loading(t('warehouse.messages.exporting_pdf'));
    try {
      const originalElement = document.getElementById('receipt-print-area');
      if (!originalElement) throw new Error('Receipt element not found');

      // 1. استنساخ عنصر الفاتورة المعروضة
      const clone = originalElement.cloneNode(true);

      // 2. إخفاء حقول الإدخال وإظهار النصوص كما في أمر الطباعة تماماً
      clone.querySelectorAll('.hide-on-print').forEach(el => el.remove());
      clone.querySelectorAll('.print-only-inline').forEach(el => {
        el.style.display = 'inline';
      });

      // 3. إزالة الثيم الداكن في المستنسخ لضمان طباعة نقية بخلفية بيضاء
      clone.classList.remove('dark-theme-receipt');

      // 4. ضبط أبعاد ومظهر المستنسخ ليتطابق بنسبة 100% مع ورقة الطباعة الأفقية
      clone.style.position = 'fixed';
      clone.style.left = '-9999px';
      clone.style.top = '0';
      clone.style.width = '1250px';
      clone.style.maxWidth = '1250px';
      clone.style.backgroundColor = '#ffffff';
      clone.style.color = '#0f172a';
      clone.style.boxShadow = 'none';
      clone.style.borderRadius = '0';
      clone.style.border = 'none';
      clone.style.padding = '15px 20px 25px 20px';
      clone.style.margin = '0';
      clone.style.display = 'flex';
      clone.style.flexDirection = 'column';
      clone.style.minHeight = '780px';
      clone.style.boxSizing = 'border-box';
      clone.style.direction = 'ltr';

      // معالجة الجدول داخل المستنسخ لضمان عدم تكسر خلايا rowspan في html2canvas
      clone.querySelectorAll('table.data-table').forEach(tbl => {
        tbl.style.borderCollapse = 'separate';
        tbl.style.borderSpacing = '0';
      });

      clone.querySelectorAll('tbody tr').forEach(tr => {
        tr.style.backgroundColor = 'transparent';
        tr.style.border = 'none';
      });

      const footerBlock = clone.querySelector('.receipt-footer-block');
      if (footerBlock) {
        footerBlock.style.marginTop = 'auto'; // ضمان دفع التذييل لأسفل الصفحة تماماً وعدم ارتباطه بالجدول
        footerBlock.style.paddingTop = '15px';
      }

      document.body.appendChild(clone);
      await document.fonts?.ready;

      // 5. التقاط نسخة عالية الدقة من المستند
      const canvas = await html2canvas(clone, {
        scale: 2.5,
        useCORS: true,
        logging: false,
        backgroundColor: '#ffffff'
      });

      document.body.removeChild(clone);

      const imgData = canvas.toDataURL('image/jpeg', 0.98);

      // 6. إنشاء ملف PDF قياسي ورقة واحدة A4 Landscape دائماً دون أي انقسام
      const pdfWidthMM = 297;
      const pdfHeightMM = 210;
      const margin = 4;
      const maxContentWidthMM = pdfWidthMM - (margin * 2); // 289mm
      const maxContentHeightMM = pdfHeightMM - (margin * 2); // 202mm

      const scaleRatio = Math.min(
        maxContentWidthMM / canvas.width,
        maxContentHeightMM / canvas.height
      );

      const renderWidthMM = canvas.width * scaleRatio;
      const renderHeightMM = canvas.height * scaleRatio;

      const posX = margin + (maxContentWidthMM - renderWidthMM) / 2;
      const posY = margin + (maxContentHeightMM - renderHeightMM) / 2;

      const pdf = new jsPDF({
        orientation: 'landscape',
        unit: 'mm',
        format: 'a4',
        compress: true
      });

      pdf.addImage(imgData, 'JPEG', posX, posY, renderWidthMM, renderHeightMM, undefined, 'FAST');

      const fileName = `Warehouse_Receipt_${headerInfo.orderNo || headerInfo.buyerNo || new Date().toISOString().split('T')[0]}.pdf`;
      pdf.save(fileName);

      toast.success(t('warehouse.messages.export_success', { defaultValue: 'تم تصدير ملف الـ PDF بنجاح!' }), { id: toastId });
    } catch (err) {
      console.error('PDF Export Error:', err);
      toast.error(t('warehouse.messages.export_failed', { defaultValue: 'حدث خطأ أثناء تحميل ملف الـ PDF' }), { id: toastId });
    }
  };

  // طباعة الورقة في صفحة A4 أفقية واحدة دائماً
  const handlePrint = () => {
    window.print();
  };



  return (
    <div className="fade-in" style={{ padding: '0 1rem', paddingBottom: '5rem' }}>
      
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h1 className="text-gradient" style={{ fontSize: '2.2rem', marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <FileText size={35} color="var(--accent-color)" /> {t('warehouse.title')}
          </h1>
          <p style={{ color: 'var(--text-muted)' }}>{t('warehouse.subtitle')}</p>
        </div>
      </div>

      {/* Filter Card */}
      <div className="card glass-panel" style={{ marginBottom: '2rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1.5rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '1rem' }}>
          <Filter color="var(--accent-color)" />
          <h3 style={{ margin: 0 }}>{t('warehouse.filters.title')}</h3>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1.5rem' }}>
          <CustomDateInput 
            label={<><Calendar size={14}/> {t('warehouse.filters.from_date')}</>}
            value={filters.fromDate}
            onChange={(val) => updateFilter('fromDate', val)}
          />

          <CustomDateInput 
            label={<><Calendar size={14}/> {t('warehouse.filters.to_date')}</>}
            value={filters.toDate}
            onChange={(val) => updateFilter('toDate', val)}
          />

          <div className="form-group">
            <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}><Factory size={14}/> {t('warehouse.filters.factory')}</label>
            <select className="form-control" value={filters.factory} onChange={(e) => updateFilter('factory', e.target.value)}>
              <option value="">{t('warehouse.filters.all_factories')}</option>
              {filteredLookups.factories?.map((f, i) => {
                const factoryName = typeof f === 'object' ? f.name : f;
                return <option key={i} value={factoryName}>{factoryName}</option>;
              })}
            </select>
          </div>

          <div className="form-group">
            <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}><Box size={14}/> {t('warehouse.filters.status')}</label>
            <select className="form-control" value={filters.status} onChange={(e) => updateFilter('status', e.target.value)}>
              <option value="all">{t('warehouse.filters.all')}</option>
              <option value="received">{t('warehouse.filters.received')}</option>
              <option value="unreceived">{t('warehouse.filters.unreceived')}</option>
            </select>
          </div>
        </div>
        
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '1rem', marginTop: '1.5rem' }}>
          <button className="btn btn-primary" onClick={handleSearch} disabled={isLoading} style={{ padding: '0.5rem 3rem' }}>
             {isLoading ? t('warehouse.filters.searching') : t('warehouse.filters.search_btn')}
          </button>
        </div>
      </div>

      {/* Results Controls */}
      {filteredData.length > 0 && (
        <div className="hide-on-print" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
           <h3 style={{ margin: 0, color: 'var(--text-strong)' }}>
            {t('warehouse.results.preview')} <span style={{ fontSize: '0.9rem', color: 'var(--text-muted)', fontWeight: 'normal' }}>({filteredData.length} {t('warehouse.results.models_count')})</span>
           </h3>
           <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
              {hasPermission('warehouse-receipt', 'export') && (<>
              <button className="btn btn-outline" onClick={handlePrint} style={{ color: 'var(--text-main)', borderColor: 'var(--border-color)' }}>
                  <Printer size={20} /> {t('warehouse.results.print_btn')}
              </button>
              <button className="btn" onClick={exportToPDF} style={{ backgroundColor: '#ef4444', color: 'white', boxShadow: '0 4px 15px rgba(239, 68, 68, 0.3)' }}>
                  <Download size={20} /> {t('warehouse.results.download_pdf')}
              </button>
              </>
              )}
           </div>
        </div>
      )}

      {/* RECEIPT PRINT AREA */}
      {filteredData.length > 0 && (
        <div id="receipt-print-area" className="warehouse-receipt-sheet" style={{ 
            backgroundColor: '#ffffff', 
            color: '#0f172a', 
            padding: '2rem', 
            borderRadius: '8px',
            boxShadow: '0 10px 40px rgba(0,0,0,0.28)',
            direction: 'ltr',
            fontFamily: 'Inter, Tajawal, sans-serif',
            display: 'flex',
            flexDirection: 'column',
            minHeight: '190mm',
            border: '2px solid #0f172a'
        }}>
            {/* Header Form Settings (Visible on screen, looks like text on print) */}
            <div className="hide-on-print" style={{ marginBottom: '1.5rem', padding: '1rem', background: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', direction: 'rtl' }}>
                <div className="form-group" style={{ marginBottom: 0 }}>
                    <label style={{ fontSize: '0.8rem', color: '#64748b' }}>{t('warehouse.header.buyer_no')}</label>
                    <input type="text" value={headerInfo.buyerNo} onChange={e => updateHeaderInfo('buyerNo', e.target.value)} style={{ width: '100%', padding: '0.4rem', border: '1px solid #cbd5e1', borderRadius: '4px' }} />
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                    <label style={{ fontSize: '0.8rem', color: '#64748b' }}>{t('warehouse.header.supplier')}</label>
                    <input type="text" value={headerInfo.supplier} onChange={e => updateHeaderInfo('supplier', e.target.value)} style={{ width: '100%', padding: '0.4rem', border: '1px solid #cbd5e1', borderRadius: '4px' }} />
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                    <label style={{ fontSize: '0.8rem', color: '#64748b' }}>{t('warehouse.header.consignee')}</label>
                    <input type="text" value={headerInfo.consignee} onChange={e => updateHeaderInfo('consignee', e.target.value)} style={{ width: '100%', padding: '0.4rem', border: '1px solid #cbd5e1', borderRadius: '4px' }} />
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                    <label style={{ fontSize: '0.8rem', color: '#64748b' }}>{t('warehouse.header.inspector')}</label>
                    <input type="text" value={headerInfo.inspector} onChange={e => updateHeaderInfo('inspector', e.target.value)} style={{ width: '100%', padding: '0.4rem', border: '1px solid #cbd5e1', borderRadius: '4px' }} />
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                    <label style={{ fontSize: '0.8rem', color: '#64748b' }}>{t('warehouse.header.order_no')}</label>
                    <input type="text" value={headerInfo.orderNo} onChange={e => updateHeaderInfo('orderNo', e.target.value)} style={{ width: '100%', padding: '0.4rem', border: '1px solid #cbd5e1', borderRadius: '4px' }} />
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                    <label style={{ fontSize: '0.8rem', color: '#64748b' }}>{t('warehouse.header.receipt_date')}</label>
                    <input type="date" value={headerInfo.receiptDate} onChange={e => updateHeaderInfo('receiptDate', e.target.value)} style={{ width: '100%', padding: '0.4rem', border: '1px solid #cbd5e1', borderRadius: '4px' }} />
                </div>
            </div>

            {/* Print Header */}
            <div className="print-header" style={{ textAlign: 'center', marginBottom: '1rem', paddingBottom: '0.6rem', borderBottom: '4px solid #0f172a' }}>
                <h1 style={{ fontSize: '2.35rem', margin: 0, color: '#0f172a', fontWeight: '900', letterSpacing: '0' }}>
                    {t('warehouse.title')}
                </h1>
                <h2 style={{ fontSize: '1.55rem', margin: '0.2rem 0 0', color: '#1e293b', fontWeight: 'bold' }}>
                    {t('warehouse.subtitle').split(' - ')[1]}
                </h2>
            </div>

            {/* Header Info Grid */}
            <div className="info-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1px', backgroundColor: '#475569', border: '2px solid #0f172a', marginBottom: '1rem' }}>
                <div style={{ display: 'flex', backgroundColor: '#fff' }}>
                    <div className="info-label" style={{ width: '40%', padding: '9px', backgroundColor: '#cbd5e1', fontWeight: 'bold', fontSize: '0.95rem', color: '#0f172a', borderRight: '1px solid #475569' }}>
                        <div>{t('warehouse.header.buyer_no').split(' (')[0]}</div>
                        <div style={{ color: '#ef4444', fontSize: '0.75rem' }}>{t('warehouse.header.buyer_no_zh')}:</div>
                    </div>
                    <div style={{ width: '60%', padding: '9px', fontSize: '0.95rem', fontWeight: 'bold', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{headerInfo.buyerNo || '-'}</div>
                </div>
                <div style={{ display: 'flex', backgroundColor: '#fff' }}>
                    <div className="info-label" style={{ width: '40%', padding: '9px', backgroundColor: '#cbd5e1', fontWeight: 'bold', fontSize: '0.95rem', color: '#0f172a', borderRight: '1px solid #475569' }}>
                        <div>{t('warehouse.header.supplier').split(' (')[0]}</div>
                        <div style={{ color: '#ef4444', fontSize: '0.75rem' }}>{t('warehouse.header.supplier_zh')}:</div>
                    </div>
                    <div style={{ width: '60%', padding: '9px', fontSize: '0.95rem', fontWeight: 'bold', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{headerInfo.supplier || '-'}</div>
                </div>
                <div style={{ display: 'flex', backgroundColor: '#fff' }}>
                    <div className="info-label" style={{ width: '40%', padding: '9px', backgroundColor: '#cbd5e1', fontWeight: 'bold', fontSize: '0.95rem', color: '#0f172a', borderRight: '1px solid #475569' }}>
                        <div>{t('warehouse.header.consignee').split(' (')[0]}</div>
                        <div style={{ color: '#ef4444', fontSize: '0.75rem' }}>{t('warehouse.header.consignee_zh')}:</div>
                    </div>
                    <div style={{ width: '60%', padding: '9px', fontSize: '0.95rem', fontWeight: 'bold', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{headerInfo.consignee || '-'}</div>
                </div>
                
                <div style={{ display: 'flex', backgroundColor: '#fff' }}>
                    <div className="info-label" style={{ width: '40%', padding: '9px', backgroundColor: '#cbd5e1', fontWeight: 'bold', fontSize: '0.95rem', color: '#0f172a', borderRight: '1px solid #475569' }}>
                        <div>{t('warehouse.header.receipt_date').split(' (')[0]}</div>
                        <div style={{ color: '#ef4444', fontSize: '0.75rem' }}>{t('warehouse.header.receipt_date_zh')}:</div>
                    </div>
                    <div style={{ width: '60%', padding: '9px', fontSize: '0.95rem', fontWeight: 'bold', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{headerInfo.receiptDate || '-'}</div>
                </div>
                <div style={{ display: 'flex', backgroundColor: '#fff' }}>
                    <div className="info-label" style={{ width: '40%', padding: '9px', backgroundColor: '#cbd5e1', fontWeight: 'bold', fontSize: '0.95rem', color: '#0f172a', borderRight: '1px solid #475569' }}>
                        <div>{t('warehouse.header.order_no').split(' (')[0]}</div>
                        <div style={{ color: '#ef4444', fontSize: '0.75rem' }}>{t('warehouse.header.order_no_zh')}:</div>
                    </div>
                    <div style={{ width: '60%', padding: '9px', fontSize: '0.95rem', fontWeight: 'bold', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{headerInfo.orderNo || '-'}</div>
                </div>
                <div style={{ display: 'flex', backgroundColor: '#fff' }}>
                    <div className="info-label" style={{ width: '40%', padding: '9px', backgroundColor: '#cbd5e1', fontWeight: 'bold', fontSize: '0.95rem', color: '#0f172a', borderRight: '1px solid #475569' }}>
                        <div>{t('warehouse.header.inspector').split(' (')[0]}</div>
                        <div style={{ color: '#ef4444', fontSize: '0.75rem' }}>{t('warehouse.header.inspector_zh')}:</div>
                    </div>
                    <div style={{ width: '60%', padding: '9px', fontSize: '0.95rem', fontWeight: 'bold', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{headerInfo.inspector || '-'}</div>
                </div>
            </div>

            {/* Data Table */}
            <table className="data-table" style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 0, border: '2px solid #0f172a', fontSize: '0.92rem', color: '#0f172a', tableLayout: 'fixed' }}>
                <thead>
                    <tr style={{ backgroundColor: '#cbd5e1', textAlign: 'center' }}>
                        <th style={{ padding: '8px 4px', borderRight: '1px solid #94a3b8', borderBottom: '2px solid #0f172a', width: '6%' }}>
                            <div style={{ color: '#ef4444', fontWeight: 'bold', fontSize: '0.9rem' }}>{t('warehouse.table.cols.carton_no_zh')}</div>
                            <div style={{ fontSize: '0.7rem' }}>{t('warehouse.table.cols.carton_no')}</div>
                        </th>
                        <th style={{ padding: '8px 4px', borderRight: '1px solid #94a3b8', borderBottom: '2px solid #0f172a', width: '8%' }}>
                            <div style={{ color: '#ef4444', fontWeight: 'bold', fontSize: '0.9rem' }}>{t('warehouse.table.cols.item_no_zh')}</div>
                            <div style={{ fontSize: '0.7rem' }}>{t('warehouse.table.cols.item_no')}</div>
                        </th>
                        <th style={{ padding: '8px 4px', borderRight: '1px solid #94a3b8', borderBottom: '2px solid #0f172a', width: '8%' }}>
                            <div style={{ color: '#ef4444', fontWeight: 'bold', fontSize: '0.9rem' }}>{t('warehouse.table.cols.received_at_zh')}</div>
                            <div style={{ fontSize: '0.7rem' }}>{t('warehouse.table.cols.received_at')}</div>
                        </th>
                        <th style={{ padding: '8px 4px', borderRight: '1px solid #94a3b8', borderBottom: '2px solid #0f172a', width: '8%' }}>
                            <div style={{ color: '#ef4444', fontWeight: 'bold', fontSize: '0.9rem' }}>{t('warehouse.table.cols.product_name_zh')}</div>
                            <div style={{ fontSize: '0.7rem' }}>{t('warehouse.table.cols.product_name')}</div>
                        </th>
                        <th style={{ padding: '8px 4px', borderRight: '1px solid #94a3b8', borderBottom: '2px solid #0f172a', width: '5%' }}>
                            <div style={{ color: '#ef4444', fontWeight: 'bold', fontSize: '0.9rem' }}>{t('warehouse.table.cols.ctns_qty_zh')}</div>
                            <div style={{ fontSize: '0.7rem' }}>{t('warehouse.table.cols.ctns_qty')}</div>
                        </th>
                        <th style={{ padding: '8px 4px', borderRight: '1px solid #94a3b8', borderBottom: '2px solid #0f172a', width: '6%' }}>
                            <div style={{ color: '#ef4444', fontWeight: 'bold', fontSize: '0.9rem' }}>{t('warehouse.table.cols.ctn_pcs_zh')}</div>
                            <div style={{ fontSize: '0.7rem' }}>{t('warehouse.table.cols.ctn_pcs')}</div>
                        </th>
                        <th style={{ padding: '8px 4px', borderRight: '1px solid #94a3b8', borderBottom: '2px solid #0f172a', width: '6%' }}>
                            <div style={{ color: '#ef4444', fontWeight: 'bold', fontSize: '0.9rem' }}>{t('warehouse.table.cols.item_qty_zh')}</div>
                            <div style={{ fontSize: '0.7rem' }}>{t('warehouse.table.cols.item_qty')}</div>
                        </th>
                        <th style={{ padding: '8px 4px', borderRight: '1px solid #94a3b8', borderBottom: '2px solid #0f172a', width: '6%' }}>
                            <div style={{ color: '#ef4444', fontWeight: 'bold', fontSize: '0.9rem' }}>{t('warehouse.table.cols.total_qty_zh')}</div>
                            <div style={{ fontSize: '0.7rem' }}>{t('warehouse.table.cols.total_qty')}</div>
                        </th>
                        <th style={{ padding: '8px 4px', borderRight: '1px solid #94a3b8', borderBottom: '2px solid #0f172a', width: '4%' }}>
                            <div style={{ color: '#ef4444', fontWeight: 'bold', fontSize: '0.9rem' }}>{t('warehouse.table.cols.ccy_zh')}</div>
                            <div style={{ fontSize: '0.7rem' }}>{t('warehouse.table.cols.ccy')}</div>
                        </th>
                        <th style={{ padding: '8px 4px', borderRight: '1px solid #94a3b8', borderBottom: '2px solid #0f172a', width: '7%' }}>
                            <div style={{ color: '#ef4444', fontWeight: 'bold', fontSize: '0.9rem' }}>{t('warehouse.table.cols.unit_price_zh')}</div>
                            <div style={{ fontSize: '0.7rem' }}>{t('warehouse.table.cols.unit_price')}</div>
                        </th>
                        <th style={{ padding: '8px 4px', borderRight: '1px solid #94a3b8', borderBottom: '2px solid #0f172a', width: '8%' }}>
                            <div style={{ color: '#ef4444', fontWeight: 'bold', fontSize: '0.9rem' }}>{t('warehouse.table.cols.total_price_zh')}</div>
                            <div style={{ fontSize: '0.7rem' }}>{t('warehouse.table.cols.total_price')}</div>
                        </th>
                        <th style={{ padding: '8px 4px', borderRight: '1px solid #94a3b8', borderBottom: '2px solid #0f172a', width: '8%' }}>
                            <div style={{ color: '#ef4444', fontWeight: 'bold', fontSize: '0.9rem' }}>{t('warehouse.table.cols.tot_amount_zh')}</div>
                            <div style={{ fontSize: '0.7rem' }}>{t('warehouse.table.cols.tot_amount')}</div>
                        </th>
                        <th style={{ padding: '8px 4px', borderRight: '1px solid #94a3b8', borderBottom: '2px solid #0f172a', width: '8%' }}>
                            <div style={{ color: '#ef4444', fontWeight: 'bold', fontSize: '0.9rem' }}>{t('warehouse.table.cols.carton_size_zh')}</div>
                            <div style={{ fontSize: '0.7rem' }}>{t('warehouse.table.cols.carton_size')}</div>
                        </th>
                        <th style={{ padding: '8px 4px', borderRight: '1px solid #94a3b8', borderBottom: '2px solid #0f172a', width: '5%' }}>
                            <div style={{ color: '#ef4444', fontWeight: 'bold', fontSize: '0.9rem' }}>{t('warehouse.table.cols.cbm_zh')}</div>
                            <div style={{ fontSize: '0.7rem' }}>{t('warehouse.table.cols.cbm')}</div>
                        </th>
                        <th style={{ padding: '8px 4px', borderBottom: '2px solid #0f172a', width: '5%' }}>
                            <div style={{ color: '#ef4444', fontWeight: 'bold', fontSize: '0.9rem' }}>{t('warehouse.table.cols.remarks_zh')}</div>
                            <div style={{ fontSize: '0.7rem' }}>{t('warehouse.table.cols.remarks')}</div>
                        </th>
                    </tr>
                </thead>
                <tbody>
                    {filteredData.map((order, oIdx) => {
                        const rowBg = oIdx % 2 === 0 ? '#ffffff' : '#f8fafc';
                        return order.packages.map((pkg, pIdx) => {
                            const isFirstPkg = pIdx === 0;
                            const isLastPkg = pIdx === order.packages.length - 1;
                            const rowSpan = order.packages.length;
                            const tBorderStyle = '1px solid #cbd5e1';
                            const bottomBorder = isLastPkg ? '1px solid #334155' : tBorderStyle;

                            return (
                                <tr key={`${oIdx}-${pIdx}`} style={{ textAlign: 'center', backgroundColor: 'transparent' }}>
                                    <td style={{ padding: '4px', borderRight: tBorderStyle, borderBottom: bottomBorder, backgroundColor: rowBg, verticalAlign: 'middle' }}>{pkg.cartonNo}</td>
                                    
                                    {isFirstPkg && (
                                        <>
                                            <td rowSpan={rowSpan} style={{ padding: '4px', borderRight: tBorderStyle, fontWeight: 'bold', borderBottom: '1px solid #334155', backgroundColor: rowBg, verticalAlign: 'middle', position: 'relative', zIndex: 2 }}>{order.serial}</td>
                                            <td rowSpan={rowSpan} style={{ padding: '4px', borderRight: tBorderStyle, fontSize: '0.72rem', fontWeight: 'bold', borderBottom: '1px solid #334155', backgroundColor: rowBg, verticalAlign: 'middle', position: 'relative', zIndex: 2 }}>{formatReceivedAt(order.receivedAt)}</td>
                                            <td rowSpan={rowSpan} style={{ padding: '4px', borderRight: tBorderStyle, borderBottom: '1px solid #334155', backgroundColor: rowBg, verticalAlign: 'middle', position: 'relative', zIndex: 2 }}>{englishOnly(order.productName)}</td>
                                        </>
                                    )}

                                    <td style={{ padding: '4px', borderRight: tBorderStyle, borderBottom: bottomBorder, backgroundColor: rowBg, verticalAlign: 'middle' }}>{pkg.ctnQty}</td>
                                    <td style={{ padding: '4px', borderRight: tBorderStyle, borderBottom: bottomBorder, backgroundColor: rowBg, verticalAlign: 'middle' }}>{pkg.ctnPcs}</td>
                                    <td style={{ padding: '4px', borderRight: tBorderStyle, borderBottom: bottomBorder, backgroundColor: rowBg, verticalAlign: 'middle' }}>{pkg.itemQty}</td>

                                    {isFirstPkg && (
                                        <>
                                            <td rowSpan={rowSpan} style={{ padding: '4px', borderRight: tBorderStyle, fontWeight: 'bold', borderBottom: '1px solid #334155', backgroundColor: rowBg, verticalAlign: 'middle', position: 'relative', zIndex: 2 }}>{order.totalProd}</td>
                                            <td rowSpan={rowSpan} style={{ padding: '4px', borderRight: tBorderStyle, fontSize: '0.7rem', borderBottom: '1px solid #334155', backgroundColor: rowBg, verticalAlign: 'middle', position: 'relative', zIndex: 2 }}>¥ {order.ccy}</td>
                                        </>
                                    )}

                                    <td style={{ padding: '4px', borderRight: tBorderStyle, borderBottom: bottomBorder, backgroundColor: rowBg, verticalAlign: 'middle' }}>{pkg.unitPrice.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                                    <td style={{ padding: '4px', borderRight: tBorderStyle, borderBottom: bottomBorder, backgroundColor: rowBg, verticalAlign: 'middle' }}>{pkg.totalPrice.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>

                                    {isFirstPkg && (
                                        <>
                                            <td rowSpan={rowSpan} style={{ padding: '4px', borderRight: tBorderStyle, fontWeight: 'bold', borderBottom: '1px solid #334155', backgroundColor: rowBg, verticalAlign: 'middle', position: 'relative', zIndex: 2 }}>{order.totalAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                                        </>
                                    )}

                                    <td style={{ padding: '4px', borderRight: tBorderStyle, fontSize: '0.75rem', borderBottom: bottomBorder, backgroundColor: rowBg, verticalAlign: 'middle' }}>{order.cartonSize}</td>
                                    
                                    {isFirstPkg && (
                                        <>
                                            <td rowSpan={rowSpan} style={{ padding: '4px', borderRight: tBorderStyle, borderBottom: '1px solid #334155', backgroundColor: rowBg, verticalAlign: 'middle', position: 'relative', zIndex: 2 }}>{pkg.cbm}</td>
                                            <td rowSpan={rowSpan} style={{ padding: '4px', fontSize: '0.75rem', borderBottom: '1px solid #334155', backgroundColor: rowBg, verticalAlign: 'middle', position: 'relative', zIndex: 2 }}>{order.remarks}</td>
                                        </>
                                    )}
                                </tr>
                            );
                        });
                    })}

                    {/* Totals Row */}
                    <tr className="totals-row" style={{ backgroundColor: '#cbd5e1', textAlign: 'center', fontWeight: 'bold' }}>
                        <td colSpan={3} style={{ padding: '10px 4px', borderRight: '1px solid #94a3b8', borderBottom: '2px solid #0f172a', borderTop: '2px solid #0f172a', fontSize: '1rem', backgroundColor: '#cbd5e1' }}>{t('packing.footer.total')}</td>
                        <td style={{ padding: '10px 4px', borderRight: '1px solid #94a3b8', borderBottom: '2px solid #0f172a', borderTop: '2px solid #0f172a', color: '#1e293b', backgroundColor: '#cbd5e1' }}>{grandTotalItems} {t('warehouse.results.models_count')}</td>
                        <td colSpan={2} style={{ padding: '10px 4px', borderRight: '1px solid #94a3b8', borderBottom: '2px solid #0f172a', borderTop: '2px solid #0f172a', color: '#1e293b', backgroundColor: '#cbd5e1' }}>{grandTotalCtn} {t('shipping.footer.ctn', { defaultValue: 'كرتون CTN' })}</td>
                        <td colSpan={2} style={{ padding: '10px 4px', borderRight: '1px solid #94a3b8', borderBottom: '2px solid #0f172a', borderTop: '2px solid #0f172a', color: '#1e293b', backgroundColor: '#cbd5e1' }}>{grandTotalPcs} {t('shipping.footer.pcs', { defaultValue: 'قطعة PCS' })}</td>
                        <td colSpan={7} style={{ padding: '10px 4px', borderBottom: '2px solid #0f172a', borderTop: '2px solid #0f172a', color: '#1e293b', fontSize: '1.1rem', backgroundColor: '#cbd5e1' }}>{grandTotalAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })} ¥ RMB</td>
                    </tr>
                </tbody>
            </table>

            {/* Footer Summary */}
            <div className="receipt-footer-block" style={{ marginTop: 'auto', paddingTop: '1.5rem' }}>
                <div className="footer-summary" style={{ display: 'flex', justifyContent: 'space-between', padding: '1rem', backgroundColor: '#e2e8f0', border: '2px solid #334155', borderRadius: '6px', fontSize: '1rem', fontWeight: 'bold', color: '#0f172a', flexWrap: 'wrap', gap: '1rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <span style={{ color: '#ef4444' }}>{t('warehouse.footer.shipping_date_zh')}</span>
                        <span>{t('warehouse.footer.shipping_date')}:</span>
                        <input className="hide-on-print" type="date" value={headerInfo.shippingDate} onChange={e => updateHeaderInfo('shippingDate', e.target.value)} style={{ padding: '0.2rem', border: '1px solid #cbd5e1', borderRadius: '4px' }} />
                        <span className="print-only-inline" style={{ display: 'none' }}>{headerInfo.shippingDate || '------------------'}</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <span style={{ color: '#ef4444' }}>{t('warehouse.footer.cabinet_no_zh')}</span>
                        <span>{t('warehouse.footer.cabinet_no')}:</span>
                        <input className="hide-on-print" type="text" value={headerInfo.cabinetNumber} onChange={e => updateHeaderInfo('cabinetNumber', e.target.value)} style={{ padding: '0.2rem', border: '1px solid #cbd5e1', borderRadius: '4px' }} />
                        <span className="print-only-inline" style={{ display: 'none' }}>{headerInfo.cabinetNumber || '------------------'}</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <span style={{ color: '#ef4444' }}>{t('warehouse.footer.shipper_zh')}</span>
                        <span>{t('warehouse.footer.shipper')}:</span>
                        <input className="hide-on-print" type="text" value={headerInfo.shipper} onChange={e => updateHeaderInfo('shipper', e.target.value)} style={{ padding: '0.2rem', border: '1px solid #cbd5e1', borderRadius: '4px' }} />
                        <span className="print-only-inline" style={{ display: 'none' }}>{headerInfo.shipper || '------------------'}</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <span style={{ color: '#ef4444' }}>{t('warehouse.header.inspector_zh')}:</span>
                        <span>{t('warehouse.header.inspector')}:</span>
                        <input className="hide-on-print" type="text" value={headerInfo.inspector} onChange={e => updateHeaderInfo('inspector', e.target.value)} style={{ padding: '0.2rem', border: '1px solid #cbd5e1', borderRadius: '4px' }} />
                        <span className="print-only-inline" style={{ display: 'none' }}>{headerInfo.inspector || '------------------'}</span>
                    </div>
                </div>

                <div style={{ marginTop: '1rem', display: 'flex', gap: '1.5rem', alignItems: 'center', color: '#0f172a', fontWeight: 'bold' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <span>{t('warehouse.header.company_phone')}</span>
                        <span style={{ color: '#ef4444' }}>{t('warehouse.header.company_phone_zh')}:</span>
                    </div>
                    <div style={{ display: 'flex', gap: '2rem', fontSize: '1.1rem' }}>
                        <input className="hide-on-print" type="text" value={headerInfo.companyPhone} onChange={e => updateHeaderInfo('companyPhone', e.target.value)} style={{ width: '300px', padding: '0.2rem', border: '1px solid #cbd5e1', borderRadius: '4px' }} />
                        <span className="print-only-inline" style={{ display: 'none' }}>{headerInfo.companyPhone}</span>
                    </div>
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
                .warehouse-receipt-sheet {
                    box-sizing: border-box;
                }
                .warehouse-receipt-sheet .info-grid,
                .warehouse-receipt-sheet .data-table,
                .warehouse-receipt-sheet .footer-summary {
                    box-shadow: 0 0 0 1px rgba(15, 23, 42, 0.08);
                }
                .warehouse-receipt-sheet .data-table th {
                    background-color: #cbd5e1 !important;
                    color: #0f172a !important;
                    border-color: #64748b !important;
                    font-weight: 900 !important;
                    line-height: 1.2;
                }
                .warehouse-receipt-sheet .data-table th div:first-child {
                    color: #dc2626 !important;
                    font-size: 0.98rem !important;
                }
                .warehouse-receipt-sheet .data-table th div:last-child {
                    color: #0f172a !important;
                    font-size: 0.76rem !important;
                    font-weight: 800 !important;
                }
                .warehouse-receipt-sheet .data-table td {
                    border-color: #94a3b8 !important;
                    color: #0f172a !important;
                    font-weight: 650;
                    line-height: 1.25;
                }
                .warehouse-receipt-sheet .data-table .totals-row td {
                    color: #0f172a !important;
                    font-weight: 900 !important;
                }

                @media print {
                    @page {
                        size: landscape;
                        margin: 4mm 5mm;
                    }
                    html, body {
                        width: 100% !important;
                        height: 100% !important;
                        margin: 0 !important;
                        padding: 0 !important;
                        background: #fff !important;
                        direction: ltr !important;
                        -webkit-print-color-adjust: exact !important;
                        print-color-adjust: exact !important;
                        overflow: hidden !important;
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
                        position: absolute !important;
                        left: 0 !important;
                        top: 0 !important;
                        width: 100% !important;
                        max-width: 100% !important;
                        margin: 0 !important;
                        padding: 0 !important;
                        border: none !important;
                        border-radius: 0 !important;
                        box-shadow: none !important;
                        background-color: #ffffff !important;
                        color: #000000 !important;
                        display: flex !important;
                        flex-direction: column !important;
                        height: calc(100vh - 8mm) !important;
                        max-height: calc(100vh - 8mm) !important;
                        box-sizing: border-box !important;
                        page-break-inside: avoid !important;
                        break-inside: avoid !important;
                        page-break-after: avoid !important;
                        break-after: avoid !important;
                        page-break-before: avoid !important;
                        break-before: avoid !important;
                    }
                    #receipt-print-area .receipt-footer-block {
                        margin-top: auto !important;
                        padding-top: 3mm !important;
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
                        break-inside: avoid !important;
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
                        font-size: 17pt !important;
                    }
                    #receipt-print-area .print-header h2 {
                        color: #334155 !important;
                        font-size: 11pt !important;
                        margin-top: 1mm !important;
                    }
                    #receipt-print-area .print-header {
                        border-bottom: 2px solid #0f172a !important;
                        margin-bottom: 2.5mm !important;
                        padding-bottom: 1.5mm !important;
                    }

                    /* Info grid print */
                    #receipt-print-area .info-grid {
                        background-color: #475569 !important;
                        border: 2px solid #0f172a !important;
                        margin-bottom: 2.5mm !important;
                    }
                    #receipt-print-area .info-grid > div {
                        background-color: #fff !important;
                    }
                    #receipt-print-area .info-grid .info-label {
                        background-color: #cbd5e1 !important;
                        color: #0f172a !important;
                        border-right: 1px solid #475569 !important;
                        font-size: 8pt !important;
                        padding: 3px 5px !important;
                    }
                    #receipt-print-area .info-grid > div > div:last-child {
                        padding: 3px 5px !important;
                        font-size: 8.5pt !important;
                    }

                    /* Data table print */
                    #receipt-print-area .data-table {
                        border: 2px solid #0f172a !important;
                        font-size: 7.8pt !important;
                        table-layout: fixed !important;
                        width: 100% !important;
                    }
                    #receipt-print-area .data-table th {
                        background-color: #cbd5e1 !important;
                        color: #0f172a !important;
                        border: 1px solid #64748b !important;
                        padding: 3px 1.5px !important;
                        font-size: 7pt !important;
                    }
                    #receipt-print-area .data-table td {
                        border: 1px solid #94a3b8 !important;
                        padding: 2.5px 1.5px !important;
                        color: #0f172a !important;
                        font-size: 7.5pt !important;
                        font-weight: 650 !important;
                        word-wrap: break-word !important;
                        overflow-wrap: break-word !important;
                    }
                    #receipt-print-area .data-table tr {
                        background-color: #fff !important;
                    }
                    #receipt-print-area .data-table .totals-row {
                        background-color: #cbd5e1 !important;
                        border: 2px solid #0f172a !important;
                    }
                    #receipt-print-area .data-table .totals-row td {
                        color: #0f172a !important;
                        font-weight: bold !important;
                        font-size: 8.5pt !important;
                        padding: 4px 1.5px !important;
                    }

                    /* Footer print */
                    #receipt-print-area .footer-summary {
                        background-color: #e2e8f0 !important;
                        border: 2px solid #334155 !important;
                        color: #0f172a !important;
                        font-size: 8pt !important;
                        padding: 5px 8px !important;
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
