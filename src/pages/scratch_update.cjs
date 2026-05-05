const fs = require('fs');

let content = fs.readFileSync("PackingList.jsx", "utf-8");

// 1. Update useState for rows
content = content.replace(
    "const [rows, setRows] = useState([\n    { id: Date.now(), cartonNo: '', serial: '', desc: '', cartonQty: '', packingKind: 'Pcs', qtyPerCarton: '', details: '', image: '' }\n  ]);",
    "const [rows, setRows] = useState([\n    { id: Date.now(), serial: '', desc: '', details: '', image: '', packages: [{ id: Date.now() + 1, cartonNo: '', cartonQty: '', packingKind: 'Pcs', qtyPerCarton: '' }] }\n  ]);"
);

// 2. Update addRow
content = content.replace(
    "const addRow = () => {\n    setRows([...rows, { id: Date.now(), cartonNo: '', serial: '', desc: '', cartonQty: '', packingKind: 'Pcs', qtyPerCarton: '', details: '', image: '' }]);\n  };",
    "const addRow = () => {\n    setRows([...rows, { id: Date.now(), serial: '', desc: '', details: '', image: '', packages: [{ id: Date.now() + 1, cartonNo: '', cartonQty: '', packingKind: 'Pcs', qtyPerCarton: '' }] }]);\n  };"
);

// 3. Update handleRowChange and add handlePackageChange
content = content.replace(
    "const handleRowChange = (id, field, value) => {\n    let finalValue = value;\n    if (['cartonQty', 'qtyPerCarton', 'serial'].includes(field)) {\n        finalValue = toEnglishNumbers(value);\n    }\n    setRows(rows.map(r => r.id === id ? { ...r, [field]: finalValue } : r));\n  };",
    "const handleRowChange = (id, field, value) => {\n    let finalValue = value;\n    if (field === 'serial') {\n        finalValue = toEnglishNumbers(value);\n    }\n    setRows(rows.map(r => r.id === id ? { ...r, [field]: finalValue } : r));\n  };\n\n  const handlePackageChange = (rowId, pkgId, field, value) => {\n    let finalValue = value;\n    if (['cartonQty', 'qtyPerCarton'].includes(field)) {\n        finalValue = toEnglishNumbers(value);\n    }\n    setRows(rows.map(r => {\n      if (r.id === rowId) {\n        return { ...r, packages: r.packages.map(p => p.id === pkgId ? { ...p, [field]: finalValue } : p) };\n      }\n      return r;\n    }));\n  };"
);

// 4. Fix fetchAllData pushing generatedPackages instead of generatedRows
const fetch_old = `            let generatedRows = [];
            if (recData && recData.receive_data && recData.receive_data.packages && Array.isArray(recData.receive_data.packages)) {
                const validPkgs = recData.receive_data.packages.filter(p => p.fromCtn && p.toCtn && p.pcsPerCtn);
                if (validPkgs.length > 0) {
                    validPkgs.forEach((pkg, index) => {
                        const from = parseInt(pkg.fromCtn) || 0;
                        const to = parseInt(pkg.toCtn) || 0;
                        const qty = from <= to ? (to - from + 1) : 0;
                        
                        generatedRows.push({
                            id: index === 0 ? row.id : Date.now() + Math.random(),
                            cartonNo: \`\${from}-\${to}\`,
                            serial: row.serial,
                            desc: desc,
                            cartonQty: qty > 0 ? qty.toString() : '',
                            packingKind: pkg.kind || 'Pcs',
                            qtyPerCarton: pkg.pcsPerCtn.toString(),
                            details: row.details,
                            image: imageUrl
                        });
                    });
                }
            }

            if (generatedRows.length > 0) {
                newRows.push(...generatedRows);
                successCount++;
            } else {
                newRows.push({
                    ...row,
                    desc: desc || row.desc,
                    image: imageUrl || row.image
                });
                if (orderData) successCount++;
            }`;

const fetch_new = `            let generatedPackages = [];
            if (recData && recData.receive_data && recData.receive_data.packages && Array.isArray(recData.receive_data.packages)) {
                const validPkgs = recData.receive_data.packages.filter(p => p.fromCtn && p.toCtn && p.pcsPerCtn);
                if (validPkgs.length > 0) {
                    validPkgs.forEach((pkg, index) => {
                        const from = parseInt(pkg.fromCtn) || 0;
                        const to = parseInt(pkg.toCtn) || 0;
                        const qty = from <= to ? (to - from + 1) : 0;
                        
                        generatedPackages.push({
                            id: Date.now() + Math.random() + index,
                            cartonNo: \`\${from}-\${to}\`,
                            cartonQty: qty > 0 ? qty.toString() : '',
                            packingKind: pkg.kind || 'Pcs',
                            qtyPerCarton: pkg.pcsPerCtn.toString()
                        });
                    });
                }
            }

            if (generatedPackages.length > 0) {
                newRows.push({
                    id: row.id,
                    serial: row.serial,
                    desc: desc,
                    details: row.details,
                    image: imageUrl,
                    packages: generatedPackages
                });
                successCount++;
            } else {
                newRows.push({
                    ...row,
                    desc: desc || row.desc,
                    image: imageUrl || row.image
                });
                if (orderData) successCount++;
            }`;

content = content.replace(fetch_old, fetch_new);

// 5. Fix Calculations
const calc_old = `  rows.forEach(r => {
      const c = parseFloat(r.cartonQty) || 0;
      const q = parseFloat(r.qtyPerCarton) || 0;
      const itemQty = c * q;
      totalCtn += c;
      totalPcs += itemQty;
      
      const s = r.serial.trim();
      if (s) {
          uniqueSerials.add(s);
          serialTotals[s] = (serialTotals[s] || 0) + itemQty;
      }
  });`;

const calc_new = `  rows.forEach(r => {
      const s = r.serial.trim();
      let rowQty = 0;
      r.packages = r.packages || [];
      r.packages.forEach(p => {
          const c = parseFloat(p.cartonQty) || 0;
          const q = parseFloat(p.qtyPerCarton) || 0;
          const itemQty = c * q;
          totalCtn += c;
          totalPcs += itemQty;
          rowQty += itemQty;
      });
      if (s) {
          uniqueSerials.add(s);
          serialTotals[s] = (serialTotals[s] || 0) + rowQty;
      }
  });`;

content = content.replace(calc_old, calc_new);

// 6. Fix Render rows loop
const render_old = `                 {rows.map((row, index) => {
                    const c = parseFloat(row.cartonQty) || 0;
                    const q = parseFloat(row.qtyPerCarton) || 0;
                    const itemQty = c * q;
                    const totalItemQty = serialTotals[row.serial.trim()] || 0;

                    return (
                        <tr key={row.id} style={{ background: index % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.02)', transition: 'background-color 0.2s' }}>
                            <td style={{ border: '1px solid var(--border-color)', padding: '5px', fontWeight: 'bold' }}>{index + 1}</td>
                            <td style={{ border: '1px solid var(--border-color)', padding: '5px' }}>
                                <input type="text" value={row.cartonNo} onChange={e => handleRowChange(row.id, 'cartonNo', e.target.value)} style={{ width: '100%', background: 'transparent', border: 'none', textAlign: 'center', fontWeight: 'bold', outline: 'none', color: 'var(--text-main)' }} />
                            </td>
                            <td style={{ border: '1px solid var(--border-color)', padding: '5px' }}>
                                <input type="text" value={row.serial} onChange={e => handleRowChange(row.id, 'serial', e.target.value)} style={{ width: '100%', background: 'transparent', border: 'none', textAlign: 'center', fontWeight: 'bold', outline: 'none', color: 'var(--text-main)' }} />
                            </td>
                            <td style={{ border: '1px solid var(--border-color)', padding: '5px' }}>
                                <input type="text" value={row.desc} onChange={e => handleRowChange(row.id, 'desc', e.target.value)} style={{ width: '100%', background: 'transparent', border: 'none', textAlign: 'center', fontWeight: 'bold', outline: 'none', color: 'var(--text-main)' }} />
                            </td>
                            <td style={{ border: '1px solid var(--border-color)', padding: '5px' }}>
                                <input type="number" value={row.cartonQty} onChange={e => handleRowChange(row.id, 'cartonQty', e.target.value)} style={{ width: '100%', background: 'transparent', border: 'none', textAlign: 'center', fontWeight: 'bold', outline: 'none', color: 'var(--text-main)' }} />
                            </td>
                            <td style={{ border: '1px solid var(--border-color)', padding: '5px' }}>
                                <input type="text" value={row.packingKind} onChange={e => handleRowChange(row.id, 'packingKind', e.target.value)} style={{ width: '100%', background: 'transparent', border: 'none', textAlign: 'center', outline: 'none', color: 'var(--text-main)' }} />
                            </td>
                            <td style={{ border: '1px solid var(--border-color)', padding: '5px' }}>
                                <input type="number" value={row.qtyPerCarton} onChange={e => handleRowChange(row.id, 'qtyPerCarton', e.target.value)} style={{ width: '100%', background: 'transparent', border: 'none', textAlign: 'center', outline: 'none', color: 'var(--text-main)' }} />
                            </td>
                            <td style={{ border: '1px solid var(--border-color)', padding: '5px', fontWeight: 'bold', color: 'var(--text-main)' }}>
                                {itemQty > 0 ? itemQty : ''}
                            </td>
                            <td style={{ border: '1px solid var(--border-color)', padding: '5px', fontWeight: 'bold', color: 'var(--accent-color)' }}>
                                {totalItemQty > 0 ? totalItemQty : ''}
                            </td>
                            
                            {showImageColumn ? (
                                <td style={{ border: '1px solid var(--border-color)', padding: '2px', textAlign: 'center' }}>
                                    {row.image && <img src={row.image} alt="Item" style={{ width: '50px', height: '60px', objectFit: 'contain' }} />}
                                </td>
                            ) : (
                                <td style={{ border: '1px solid var(--border-color)', padding: '5px' }}>
                                    <input type="text" value={row.details} onChange={e => handleRowChange(row.id, 'details', e.target.value)} style={{ width: '100%', background: 'transparent', border: 'none', textAlign: 'center', outline: 'none', color: 'var(--text-main)' }} />
                                </td>
                            )}

                            <td className="no-print" style={{ border: '1px solid var(--border-color)', padding: '5px', textAlign: 'center' }}>
                                <button onClick={() => removeRow(row.id)} style={{ background: 'rgba(239, 68, 68, 0.1)', border: 'none', color: '#ef4444', padding: '4px', borderRadius: '4px', cursor: 'pointer' }}>
                                    <Trash2 size={14} />
                                </button>
                            </td>
                        </tr>
                    );
                 })}`;

const render_new = `                 {rows.map((row, index) => {
                    const totalItemQty = serialTotals[row.serial.trim()] || 0;
                    if (!row.packages) row.packages = [{ id: Date.now() + Math.random(), cartonNo: '', cartonQty: '', packingKind: 'Pcs', qtyPerCarton: '' }];

                    return (
                        <React.Fragment key={row.id}>
                            {row.packages.map((pkg, pIndex) => {
                                const isFirst = pIndex === 0;
                                const c = parseFloat(pkg.cartonQty) || 0;
                                const q = parseFloat(pkg.qtyPerCarton) || 0;
                                const itemQty = c * q;

                                return (
                                    <tr key={pkg.id} style={{ background: index % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.02)', transition: 'background-color 0.2s' }}>
                                        {isFirst && (
                                            <td rowSpan={row.packages.length} style={{ border: '1px solid var(--border-color)', padding: '5px', fontWeight: 'bold' }}>{index + 1}</td>
                                        )}
                                        <td style={{ border: '1px solid var(--border-color)', padding: '5px' }}>
                                            <input type="text" value={pkg.cartonNo} onChange={e => handlePackageChange(row.id, pkg.id, 'cartonNo', e.target.value)} style={{ width: '100%', background: 'transparent', border: 'none', textAlign: 'center', fontWeight: 'bold', outline: 'none', color: 'var(--text-main)' }} />
                                        </td>
                                        {isFirst && (
                                            <td rowSpan={row.packages.length} style={{ border: '1px solid var(--border-color)', padding: '5px' }}>
                                                <input type="text" value={row.serial} onChange={e => handleRowChange(row.id, 'serial', e.target.value)} style={{ width: '100%', background: 'transparent', border: 'none', textAlign: 'center', fontWeight: 'bold', outline: 'none', color: 'var(--text-main)' }} />
                                            </td>
                                        )}
                                        {isFirst && (
                                            <td rowSpan={row.packages.length} style={{ border: '1px solid var(--border-color)', padding: '5px' }}>
                                                <input type="text" value={row.desc} onChange={e => handleRowChange(row.id, 'desc', e.target.value)} style={{ width: '100%', background: 'transparent', border: 'none', textAlign: 'center', fontWeight: 'bold', outline: 'none', color: 'var(--text-main)' }} />
                                            </td>
                                        )}
                                        <td style={{ border: '1px solid var(--border-color)', padding: '5px' }}>
                                            <input type="number" value={pkg.cartonQty} onChange={e => handlePackageChange(row.id, pkg.id, 'cartonQty', e.target.value)} style={{ width: '100%', background: 'transparent', border: 'none', textAlign: 'center', fontWeight: 'bold', outline: 'none', color: 'var(--text-main)' }} />
                                        </td>
                                        <td style={{ border: '1px solid var(--border-color)', padding: '5px' }}>
                                            <input type="text" value={pkg.packingKind} onChange={e => handlePackageChange(row.id, pkg.id, 'packingKind', e.target.value)} style={{ width: '100%', background: 'transparent', border: 'none', textAlign: 'center', outline: 'none', color: 'var(--text-main)' }} />
                                        </td>
                                        <td style={{ border: '1px solid var(--border-color)', padding: '5px' }}>
                                            <input type="number" value={pkg.qtyPerCarton} onChange={e => handlePackageChange(row.id, pkg.id, 'qtyPerCarton', e.target.value)} style={{ width: '100%', background: 'transparent', border: 'none', textAlign: 'center', outline: 'none', color: 'var(--text-main)' }} />
                                        </td>
                                        <td style={{ border: '1px solid var(--border-color)', padding: '5px', fontWeight: 'bold', color: 'var(--text-main)' }}>
                                            {itemQty > 0 ? itemQty : ''}
                                        </td>
                                        {isFirst && (
                                            <td rowSpan={row.packages.length} style={{ border: '1px solid var(--border-color)', padding: '5px', fontWeight: 'bold', color: 'var(--accent-color)' }}>
                                                {totalItemQty > 0 ? totalItemQty : ''}
                                            </td>
                                        )}
                                        {isFirst && (
                                            showImageColumn ? (
                                                <td rowSpan={row.packages.length} style={{ border: '1px solid var(--border-color)', padding: '2px', textAlign: 'center' }}>
                                                    {row.image && <img src={row.image} alt="Item" style={{ width: '50px', height: '60px', objectFit: 'contain' }} />}
                                                </td>
                                            ) : (
                                                <td rowSpan={row.packages.length} style={{ border: '1px solid var(--border-color)', padding: '5px' }}>
                                                    <input type="text" value={row.details} onChange={e => handleRowChange(row.id, 'details', e.target.value)} style={{ width: '100%', background: 'transparent', border: 'none', textAlign: 'center', outline: 'none', color: 'var(--text-main)' }} />
                                                </td>
                                            )
                                        )}
                                        {isFirst && (
                                            <td rowSpan={row.packages.length} className="no-print" style={{ border: '1px solid var(--border-color)', padding: '5px', textAlign: 'center' }}>
                                                <button onClick={() => removeRow(row.id)} style={{ background: 'rgba(239, 68, 68, 0.1)', border: 'none', color: '#ef4444', padding: '4px', borderRadius: '4px', cursor: 'pointer' }}>
                                                    <Trash2 size={14} />
                                                </button>
                                            </td>
                                        )}
                                    </tr>
                                );
                            })}
                        </React.Fragment>
                    );
                 })}`;

content = content.replace(render_old, render_new);

fs.writeFileSync("PackingList.jsx", content);
console.log("Update complete.");
