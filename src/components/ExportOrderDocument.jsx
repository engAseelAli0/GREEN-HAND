import React from 'react';
import { englishOnly, chineseOnly } from '../utils/textUtils';
import { normalizeImageUrl } from '../utils/imageUtils';
import toast from 'react-hot-toast';

export const getSizeRange = (orderData) => {
  if (!orderData) return '-';
  if (orderData.manualSizes && Array.isArray(orderData.manualSizes) && orderData.manualSizes.length > 0) {
    const validSizes = orderData.manualSizes
      .map(s => s !== null && s !== undefined ? String(s).trim() : '')
      .filter(s => s !== '');
    if (validSizes.length > 0) {
      const sizeOrderArr = ['XXS', 'XS', 'S', 'M', 'L', 'XL', 'XXL', 'XXXL', '2XL', '3XL', '4XL', '5XL', 'F', 'FREE'];
      const sortedSizes = [...validSizes].sort((a, b) => {
        const ai = sizeOrderArr.indexOf(a.toUpperCase());
        const bi = sizeOrderArr.indexOf(b.toUpperCase());
        if (ai !== -1 && bi !== -1) return ai - bi;
        if (ai !== -1) return -1;
        if (bi !== -1) return 1;
        const numA = parseFloat(a);
        const numB = parseFloat(b);
        if (!isNaN(numA) && !isNaN(numB)) return numA - numB;
        return a.localeCompare(b);
      });
      const minSize = sortedSizes[0];
      const maxSize = sortedSizes[sortedSizes.length - 1];
      return minSize === maxSize ? minSize : `${minSize} - ${maxSize}`;
    }
  }
  if (orderData.sizeFrom && orderData.sizeTo) {
    return `${orderData.sizeFrom} - ${orderData.sizeTo}`;
  }
  if (orderData.sizeFrom) return orderData.sizeFrom;
  if (orderData.sizeTo) return orderData.sizeTo;
  return '-';
};

export const formatDate = (dateStr) => {
  if (!dateStr) return '-';
  const parts = dateStr.split('-');
  if (parts.length === 3) {
    const [year, month, day] = parts;
    return `${day}/${month}/${year}`;
  }
  return dateStr;
};

export const downloadOrderPDF = async ({ order, elementId = 'export-doc', t }) => {
  if (!order) return;
  const element = document.getElementById(elementId);
  if (!element) {
    toast.error(t ? t('export.messages.not_found', 'لم يتم العثور على مستند الطلبية') : 'Document element not found');
    return;
  }
  const toastId = toast.loading(t ? t('export.messages.preparing_pdf', 'جاري إعداد وتحميل ملف PDF...') : 'Preparing PDF...');
  const filename = `Order_${order.serialNumber || order.serial_number || 'Export'}.pdf`;

  try {
    const { default: html2canvas } = await import('html2canvas');
    const { default: jsPDF } = await import('jspdf');

    // Clone element to isolate in memory and render desktop-width canvas
    const clonedElement = element.cloneNode(true);
    clonedElement.style.cssText = `
      position: fixed;
      left: -9999px;
      top: 0;
      width: 1350px;
      max-width: none !important;
      background: #ffffff !important;
      box-shadow: none !important;
      padding: 15px !important;
      margin: 0 !important;
    `;

    document.body.appendChild(clonedElement);

    const canvas = await html2canvas(clonedElement, {
      scale: 2,
      useCORS: true,
      logging: false,
      backgroundColor: '#ffffff',
    });

    document.body.removeChild(clonedElement);

    const imgData = canvas.toDataURL('image/jpeg', 1.0);
    const imgWidthPx = canvas.width;
    const imgHeightPx = canvas.height;

    const pdfWidthMM = 297;
    const margin = 8;
    const contentWidthMM = pdfWidthMM - margin * 2;
    const contentHeightMM = (imgHeightPx * contentWidthMM) / imgWidthPx;
    const pdfHeightMM = contentHeightMM + margin * 2;

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

    toast.success(t ? t('export.messages.download_success', 'تم تحميل ملف PDF بنجاح!') : 'PDF downloaded successfully!', { id: toastId });
  } catch (err) {
    toast.error(t ? t('export.messages.download_error', 'حدث خطأ أثناء تحميل ملف PDF') : 'Error downloading PDF', { id: toastId });
    console.error(err);
  }
};

const ExportOrderDocument = ({ order, lookups = {}, t, id = "export-doc", className = "print-doc" }) => {
  if (!order) return null;

  const getFactoryDetails = (factoryId) => {
    const factory = Array.isArray(lookups.factories) ? lookups.factories.find(f => (f.name === factoryId || f === factoryId)) : null;
    if (factory && typeof factory === 'object') {
      return { name: factory.name || '', mobile: factory.mobile || '', address: factory.address || '', code: factory.code || '' };
    }
    return { name: factoryId || '', mobile: '', address: '', code: '' };
  };

  const factoryInfo = getFactoryDetails(order.factoryId);
  const activeColors = order.colorDistribution ? Object.keys(order.colorDistribution) : [];

  let activeSizesSet = new Set();
  if (order.colorDistribution) {
    activeColors.forEach(color => {
      Object.keys(order.colorDistribution[color] || {}).forEach(size => activeSizesSet.add(size));
    });
  }
  const sizeOrderArr = ['XXS', 'XS', 'S', 'M', 'L', 'XL', 'XXL', 'XXXL', '2XL', '3XL', '4XL', '5XL', 'F', 'FREE'];
  const sizesToRender = Array.from(activeSizesSet).sort((a, b) => {
    const ai = sizeOrderArr.indexOf(a.toUpperCase());
    const bi = sizeOrderArr.indexOf(b.toUpperCase());
    if (ai !== -1 && bi !== -1) return ai - bi;
    if (ai !== -1) return -1;
    if (bi !== -1) return 1;
    const numA = parseFloat(a);
    const numB = parseFloat(b);
    if (!isNaN(numA) && !isNaN(numB)) {
      return numA - numB;
    }
    return a.localeCompare(b);
  });

  const tmObj = lookups.tradeMarks?.find(tItem => (typeof tItem === 'object' ? tItem.name : tItem) === order.tradeMark);
  const tmImage = tmObj?.imageUrl || null;

  return (
    <div className={className} id={id} dir="ltr">
      <style>{`
        .inv-table-new {
          width: 100%;
          border-collapse: collapse;
          border: 3px solid #000;
          table-layout: auto;
          background: #fff;
        }
        .inv-table-new th, .inv-table-new td {
          border: 1px solid #000;
          padding: 6px 4px;
          word-wrap: break-word;
          white-space: normal;
          line-height: 1.3;
        }
        .hdr-blue {
          background-color: #1a5276 !important;
          color: #fff !important;
          font-weight: 800;
          text-align: center;
          font-size: 15px;
        }
        .hdr-grey {
          background-color: #d5dbdb !important;
          color: #000 !important;
          font-weight: 800;
          text-align: center;
          font-size: 15px;
        }
        .hdr-light {
          background-color: #f2f2f2 !important;
          color: #000 !important;
          font-weight: 800;
          text-align: center;
          font-size: 14px;
        }
        .title-cell {
          background-color: #1a5276 !important;
          color: #fff !important;
          text-align: center;
          vertical-align: middle;
        }
        .val-center {
          text-align: center;
          font-size: 15px;
          vertical-align: middle;
        }
        .val-left {
          text-align: left;
          font-size: 15px;
          vertical-align: middle;
        }
        .val-bold {
          font-weight: 800;
          color: #000;
        }
        .bg-cyan {
          background-color: #dcf4f5 !important;
        }
        .bg-light-blue {
          background-color: #eaf2f8 !important;
        }
      `}</style>

      <table className="inv-table-new">
        <tbody>
          {/* ═══ ROW 1: HEADER ═══ */}
          <tr>
            <th colSpan={1} className="hdr-blue">{t('export.doc.order_no', 'ORDER NO.')}</th>
            <td colSpan={2} className="val-center val-bold">{order.orderNumber || '-'}</td>
            <th colSpan={2} className="hdr-blue">{t('export.doc.request_date', 'Order Date')}</th>
            <td colSpan={2} className="val-center val-bold">{formatDate(order.requestDate)}</td>
            <th colSpan={2} className="hdr-blue">{t('export.doc.delivery_date', 'Delivery Date')}</th>
            <td colSpan={2} className="val-center val-bold">{formatDate(order.deliveryDate)}</td>
          </tr>

          {/* ═══ ROW 2-4: BUYER & FACTORY INFO ═══ */}
          <tr>
            <th colSpan={1} rowSpan={3} className="title-cell">
              <div style={{ fontSize: '20px', fontWeight: 900, marginBottom: '6px' }}>{t('export.doc.product_order_en', 'PRODUCT ORDER')}</div>
              <div style={{ fontSize: '20px', fontWeight: 900 }}>{t('export.doc.product_order_zh', '产品订购单')}</div>
            </th>
            <th colSpan={2} className="hdr-light">{t('export.doc.buyer_name', 'Buyer')}</th>
            <td colSpan={3} className="val-center val-bold">{order.buyerCompany || '-'}</td>
            <th colSpan={2} className="hdr-light">{t('export.doc.factory_name', 'Factory')}</th>
            <td colSpan={3} className="val-center val-bold">{factoryInfo.name || '-'}</td>
          </tr>
          <tr>
            <th colSpan={2} className="hdr-light">{t('export.doc.buyer_mobile', 'Buyer Mobile')}</th>
            <td colSpan={3} className="val-center val-bold">{order.buyerNumber || '-'}</td>
            <th colSpan={2} className="hdr-light">{t('export.doc.factory_mobile', 'Factory Mobile')}</th>
            <td colSpan={3} className="val-center val-bold">{factoryInfo.mobile || '-'}</td>
          </tr>
          <tr>
            <th colSpan={2} className="hdr-light">{t('export.doc.customer_id', 'Customer ID')}</th>
            <td colSpan={3} className="val-center val-bold">{order.buyerMobile || '-'}</td>
            <th colSpan={2} className="hdr-light">{t('export.doc.factory_address', 'Factory Address')}</th>
            <td colSpan={3} className="val-center val-bold">{factoryInfo.address || '-'}</td>
          </tr>

          {/* ═══ ROW 5: PRODUCT COLUMNS ═══ */}
          <tr>
            <th className="hdr-blue">{t('export.doc.product_name', 'Product')}</th>
            <th className="hdr-blue">{t('export.doc.model_no', 'Model NO.')}</th>
            <th className="hdr-blue">{t('export.doc.barcode', 'Barcode')}</th>
            <th className="hdr-blue">{t('export.doc.qty', 'Quantity')}</th>
            <th className="hdr-blue">{t('export.doc.price', 'Price')}</th>
            <th className="hdr-blue">{t('export.doc.total_price', 'Total Price')}</th>
            <th className="hdr-blue">{t('export.doc.size_qty', 'Sizes Qty')}</th>
            <th className="hdr-blue">{t('export.doc.size_range', 'Size Range')}</th>
            <th className="hdr-blue">{t('export.doc.carton_size', 'Carton Size')}</th>
            <th className="hdr-blue">{t('export.doc.plastic_bag', 'Plastic Bag')}</th>
            <th className="hdr-blue">{t('export.doc.ctn_packaging', 'CTN Packaging')}</th>
          </tr>

          {/* ═══ ROW 6: PRODUCT VALUES ═══ */}
          <tr>
            <td className="val-center val-bold hdr-grey">
              {englishOnly(order.productName)}
              {chineseOnly(order.productName) && (
                <span style={{ fontWeight: '800', marginLeft: '8px', color: '#333' }}>
                  - {chineseOnly(order.productName)}
                </span>
              )}
              {(!englishOnly(order.productName) && !chineseOnly(order.productName)) && '-'}
            </td>
            <td className="val-center val-bold bg-cyan">{order.serialNumber || order.serial_number || '-'}</td>
            <td className="val-center val-bold">{order.barcode ? `${order.barcode}` : '-'}</td>
            <td className="val-center val-bold">{order.totalQuantity || '-'}</td>
            <td className="val-center val-bold">¥ {order.productPrice || '-'}</td>
            <td className="val-center val-bold bg-light-blue">¥ {order.productPrice && order.totalQuantity ? (parseFloat(order.productPrice) * parseFloat(order.totalQuantity)).toFixed(2) : '-'}</td>
            <td className="val-center val-bold">{sizesToRender.length || '-'}</td>
            <td className="val-center val-bold">
              {(() => {
                const range = getSizeRange(order);
                if (range && range !== '-') {
                  const parts = range.split(' - ');
                  if (parts.length === 2) return `From ${parts[0]} - To ${parts[1]}`;
                  return range;
                }
                return '-';
              })()}
            </td>
            <td className="val-center val-bold">{order.cartonSize || '-'}</td>
            <td className="val-center val-bold">{order.plasticBagSize || '-'}</td>
            <td className="val-center val-bold">
              {(() => {
                const getFirstNum = (str) => {
                  if (!str) return null;
                  const match = String(str).match(/\d+(\.\d+)?/);
                  return match ? match[0] : null;
                };
                const qNum = getFirstNum(order.cartonQty);
                const pNum = getFirstNum(order.cartonPackage);
                if (!qNum && !pNum) return '-';
                if (qNum && pNum) return `${qNum} Carton × ${pNum} Pcs`;
                if (qNum) return `${qNum} Carton`;
                if (pNum) return `${pNum} Pcs`;
                return '-';
              })()}
            </td>
          </tr>

          {/* ═══ MEASUREMENTS BLOCK ═══ */}
          {(() => {
            let totalRows = 0;
            const parts = order.groupedMeasurements ? Object.keys(order.groupedMeasurements) : (order.measurements ? ['Product'] : []);

            parts.forEach(part => {
              totalRows += 1;
              if (order.groupedMeasurements) {
                totalRows += Object.keys(order.groupedMeasurements[part] || {}).length;
              } else {
                totalRows += Object.keys(order.measurements || {}).length;
              }
            });

            if (totalRows === 0) totalRows = 2;

            const rows = [];
            let isFirstRow = true;

            if (parts.length === 0) {
              rows.push(
                <tr key="empty-m1">
                  <th className="hdr-grey">{t('export.doc.size_header', 'Size')}</th>
                  <td colSpan={8} style={{ border: 'none', background: '#fff' }}></td>
                  <td colSpan={2} rowSpan={2} style={{ textAlign: 'center', verticalAlign: 'middle', padding: '4px', borderLeft: '3px solid #000' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', alignItems: 'center' }}>
                      {order.productImages?.slice(0, 2).map((img, idx) => (
                        <img
                          key={idx}
                          src={normalizeImageUrl(img)}
                          alt="product"
                          crossOrigin="anonymous"
                          onError={(e) => {
                            e.currentTarget.style.display = 'none';
                          }}
                          style={{ maxHeight: '130px', objectFit: 'contain' }}
                        />
                      ))}
                      {tmImage && (
                        <img
                          src={tmImage}
                          alt="trademark"
                          crossOrigin="anonymous"
                          onError={(e) => {
                            e.currentTarget.style.display = 'none';
                          }}
                          style={{ maxHeight: '60px', objectFit: 'contain', marginTop: order.productImages?.length > 0 ? '10px' : '0' }}
                        />
                      )}
                    </div>
                  </td>
                </tr>
              );
              rows.push(
                <tr key="empty-m2">
                  <td style={{ height: '40px' }}></td>
                  <td colSpan={8} style={{ border: 'none', background: '#fff' }}></td>
                </tr>
              );
              return rows;
            }

            parts.forEach(part => {
              const partSizes = sizesToRender.slice(0, 8);
              rows.push(
                <tr key={`part-hdr-${part}`}>
                  <th className="hdr-grey">{t('export.doc.part_size_header', { part, defaultValue: `${part} Size` })}</th>
                  {partSizes.map(s => <th key={s} className="hdr-grey">{s}</th>)}
                  {partSizes.length < 8 && (
                    <td colSpan={8 - partSizes.length} style={{ border: 'none', background: '#fff' }}></td>
                  )}

                  {isFirstRow && (
                    <td colSpan={2} rowSpan={totalRows} style={{ textAlign: 'center', verticalAlign: 'middle', padding: '4px', borderLeft: '3px solid #000' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', alignItems: 'center' }}>
                        {order.productImages?.slice(0, 2).map((img, idx) => (
                          <img
                            key={idx}
                            src={normalizeImageUrl(img)}
                            alt="product"
                            crossOrigin="anonymous"
                            onError={(e) => {
                              e.currentTarget.style.display = 'none';
                            }}
                            style={{ maxHeight: '130px', objectFit: 'contain' }}
                          />
                        ))}
                        {tmImage && (
                          <img
                            src={tmImage}
                            alt="trademark"
                            crossOrigin="anonymous"
                            onError={(e) => {
                              e.currentTarget.style.display = 'none';
                            }}
                            style={{ maxHeight: '60px', objectFit: 'contain', marginTop: order.productImages?.length > 0 ? '10px' : '0' }}
                          />
                        )}
                      </div>
                    </td>
                  )}
                </tr>
              );
              isFirstRow = false;

              const measurementsObj = order.groupedMeasurements ? order.groupedMeasurements[part] : order.measurements;
              Object.keys(measurementsObj || {}).forEach(mName => {
                rows.push(
                  <tr key={`m-${part}-${mName}`}>
                    <td className="val-bold val-left" style={{ paddingLeft: '6px' }}>{mName}</td>
                    {partSizes.map(s => (
                      <td key={s} className="val-center val-bold">{measurementsObj[mName]?.[s] || ''}</td>
                    ))}
                    {partSizes.length < 8 && (
                      <td colSpan={8 - partSizes.length} style={{ border: 'none', background: '#fff' }}></td>
                    )}
                  </tr>
                );
              });
            });
            return rows;
          })()}

          {/* ═══ FABRICS & CONDITIONS ═══ */}
          {(() => {
            const numMaterials = [0, 1, 2].filter(i => order.materials && order.materials[i] && order.materials[i].name).length;
            const actualMaterials = Math.max(1, numMaterials);
            const fabricColSpan = 2 + 2 + (actualMaterials - 1);
            const conditionsColSpan = 11 - 2 - fabricColSpan;

            return (
              <React.Fragment>
                <tr>
                  <th colSpan={fabricColSpan} className="hdr-blue">{t('export.doc.fabric_kind', 'Fabric Kind')}</th>
                  <th colSpan={conditionsColSpan} className="hdr-blue">{t('export.doc.conditions', 'Packaging Conditions')}</th>
                  <th colSpan={2} className="hdr-blue">{t('export.doc.remarks_header', 'Remarks')}</th>
                </tr>

                <tr>
                  <td colSpan={fabricColSpan} className="val-center val-bold bg-light-blue" style={{ fontSize: '14px' }}>
                    {order.productFabric || t('export.doc.default_fabric', 'Standard')}
                  </td>
                  <td colSpan={conditionsColSpan} rowSpan={3} style={{ verticalAlign: 'top', padding: '8px', fontSize: '12px', color: '#c0392b', fontWeight: 800 }}>
                    {order.packagingConditions?.cond1 && <div style={{ marginBottom: '4px' }}>* {t('export.doc.cond1_text', { val1: order.packagingConditions.cond1_val1 || '-', val2: order.packagingConditions.cond1_val2 || '-', defaultValue: 'Condition 1' })}</div>}
                    {order.packagingConditions?.cond2 && <div style={{ marginBottom: '4px' }}>* {t('export.doc.cond2_text', { val1: order.packagingConditions.cond2_val1 || '-', val2: order.packagingConditions.cond2_val2 || '-', defaultValue: 'Condition 2' })}</div>}
                    {lookups.packagingConditionsList?.filter(c => order.packagingConditions?.[c]).map((c, i) => <div key={i} style={{ marginBottom: '4px' }}>* {c}</div>)}
                  </td>
                  <td colSpan={2} rowSpan={3} style={{ verticalAlign: 'top', padding: '8px', fontSize: '12px', fontWeight: 800 }}>
                    {order.remarks || ''}
                  </td>
                </tr>

                <tr>
                  <th colSpan={2} className="hdr-light" style={{ backgroundColor: '#d0dbe5' }}>{t('export.doc.fabric_comp', 'Fabric Composition')}</th>
                  {[0, 1, 2].slice(0, actualMaterials).map(i => (
                    <td key={i} colSpan={i === 0 ? 2 : 1} className="val-center val-bold">
                      {order.materials?.[i]?.name || ''}
                    </td>
                  ))}
                </tr>
                <tr>
                  <th colSpan={2} className="hdr-light" style={{ backgroundColor: '#d0dbe5' }}>{t('export.doc.percentage', 'Percentage')}</th>
                  {[0, 1, 2].slice(0, actualMaterials).map(i => (
                    <td key={i} colSpan={i === 0 ? 2 : 1} className="val-center val-bold" style={{ color: order.materials?.[i] ? '#38761d' : 'inherit' }}>
                      {order.materials?.[i] ? `${order.materials[i].percentage}%` : ''}
                    </td>
                  ))}
                </tr>
              </React.Fragment>
            );
          })()}

          {/* ═══ COLORS QTY & BARCODES ═══ */}
          <tr>
            <th colSpan={1} className="hdr-blue">{t('export.doc.colors_qty', 'Colors Qty')}</th>
            <td colSpan={10} className="val-center val-bold bg-light-blue" style={{ fontSize: '16px' }}>
              {activeColors.length || '0'}
            </td>
          </tr>

          {(() => {
            if (activeColors.length === 0) return null;

            const CHUNK_SIZE = 9;
            const numChunks = Math.ceil(activeColors.length / CHUNK_SIZE);
            const chunks = [];
            for (let i = 0; i < numChunks; i++) {
              const chunkColors = [];
              for (let j = 0; j < CHUNK_SIZE; j++) {
                const colorIndex = i * CHUNK_SIZE + j;
                if (colorIndex < activeColors.length) {
                  chunkColors.push(activeColors[colorIndex]);
                } else {
                  chunkColors.push(null);
                }
              }
              chunks.push(chunkColors);
            }

            const getColSpans = (total, count) => {
              if (count === 0) return [];
              const base = Math.floor(total / count);
              const rem = total % count;
              return Array(count).fill(0).map((_, i) => base + (i < rem ? 1 : 0));
            };

            return chunks.map((chunk, chunkIndex) => {
              const spans = getColSpans(10, chunk.length);
              return (
                <React.Fragment key={`color-chunk-${chunkIndex}`}>
                  <tr>
                    <th colSpan={1} className="hdr-light" style={{ borderTop: chunkIndex > 0 ? '3px solid #000' : '1px solid #000' }}>{t('export.doc.colors_zh', '颜色 / Colors')}</th>
                    {chunk.map((c, i) => {
                      let hex = '';
                      if (c) {
                        const cInfo = lookups.colors?.find(color => typeof color === 'object' ? color.name === c : color === c);
                        if (cInfo && typeof cInfo === 'object' && cInfo.hex) hex = cInfo.hex;
                      }
                      return (
                        <td key={`c-${i}`} colSpan={spans[i]} className={c ? "val-center val-bold bg-light-blue" : ""} style={{ borderTop: chunkIndex > 0 ? '3px solid #000' : '1px solid #000' }}>
                          {c ? (
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
                              {hex && <div style={{ width: '14px', height: '14px', borderRadius: '50%', backgroundColor: hex, border: '1px solid #000', flexShrink: 0 }} />}
                              <span>{c}</span>
                            </div>
                          ) : ''}
                        </td>
                      );
                    })}
                  </tr>
                  <tr>
                    <th colSpan={1} className="hdr-light">{t('export.doc.qty_zh', '数量 / Qty')}</th>
                    {chunk.map((c, i) => {
                      if (!c) return <td key={`q-${i}`} colSpan={spans[i]}></td>;
                      const qty = sizesToRender.reduce((sum, s) => sum + (parseInt(order.colorDistribution[c]?.[s]) || 0), 0);
                      return <td key={`q-${i}`} colSpan={spans[i]} className="val-center val-bold bg-light-blue">{qty}</td>;
                    })}
                  </tr>
                  <tr>
                    <th colSpan={1} className="hdr-light">{t('export.doc.color_barcodes', 'Color Barcodes')}</th>
                    {chunk.map((c, i) => {
                      if (!c) return <td key={`b-${i}`} colSpan={spans[i]}></td>;
                      const cInfo = lookups.colors?.find(color => typeof color === 'object' ? color.name === c : color === c);
                      const code = (cInfo && typeof cInfo === 'object') ? (cInfo.abbr || cInfo.code || '') : '';
                      return <td key={`b-${i}`} colSpan={spans[i]} className="val-center val-bold" style={{ whiteSpace: 'nowrap' }}>
                        {order.barcode ? `${order.barcode}${code ? '-' + code : ''}` : '-'}
                      </td>;
                    })}
                  </tr>
                  <tr>
                    <th colSpan={1} className="hdr-light" style={{ height: '70px', verticalAlign: 'middle' }}>{t('export.doc.fabric_samples', 'Fabric Samples')}</th>
                    {chunk.map((_, i) => (
                      <td key={`s-${i}`} colSpan={spans[i]}></td>
                    ))}
                  </tr>
                </React.Fragment>
              );
            });
          })()}

          {/* ═══ SIGNATURES ═══ */}
          <tr>
            <td colSpan={11} style={{ borderTop: '3px solid #000', padding: '15px 30px', backgroundColor: '#fff' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', paddingTop: '10px' }}>
                <div>
                  <div style={{ marginBottom: '25px', fontSize: '14px', fontWeight: 800 }}>
                    {t('export.doc.name_zh', '客户名称')} <span style={{ color: '#c0392b', marginLeft: '40px' }}>{t('export.doc.buyer_sign', 'Buyer Sign')}</span>
                  </div>
                  <div style={{ fontSize: '14px', fontWeight: 800, display: 'flex', alignItems: 'flex-end' }}>
                    {t('export.doc.signature_zh', '客户签字')}
                    <div style={{ display: 'inline-block', width: '180px', borderBottom: '2px solid #000', marginLeft: '15px' }}></div>
                  </div>
                </div>

                <div style={{ textAlign: 'center' }}>
                  <div style={{ color: '#c0392b', fontWeight: 800, fontSize: '14px', marginBottom: '25px' }}>{t('export.doc.coordinator_sign', 'Coordinator Sign')}</div>
                  <div style={{ display: 'inline-block', width: '220px', borderBottom: '2px solid #000' }}></div>
                </div>

                <div style={{ textAlign: 'center' }}>
                  <div style={{ color: '#c0392b', fontWeight: 800, fontSize: '14px', marginBottom: '25px' }}>{t('export.doc.factory_sign', 'Factory Sign')}</div>
                  <div style={{ display: 'inline-block', width: '220px', borderBottom: '2px solid #000' }}></div>
                </div>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
};

export default ExportOrderDocument;
