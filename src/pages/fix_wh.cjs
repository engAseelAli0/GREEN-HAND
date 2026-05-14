const fs = require('fs');
const path = 'd:/green hand/src/pages/WarehouseReceipt.jsx';
let content = fs.readFileSync(path, 'utf8');

content = content.replace(
  "import autoTable from 'jspdf-autotable';",
  "import autoTable from 'jspdf-autotable';\nimport { useAuth } from '../context/AuthContext';"
);

content = content.replace(
  "const { lookups } = useAppData();",
  "const { lookups } = useAppData();\n  const { hasPermission } = useAuth();"
);

content = content.replace(
  "<button className=\"btn btn-outline\" onClick={() => window.print()}",
  "{hasPermission('warehouse', 'export') && (<>\n              <button className=\"btn btn-outline\" onClick={() => window.print()}"
);

content = content.replace(
  "<Download size={20} /> {t('warehouse.results.download_pdf')}\n              </button>\n           </div>",
  "<Download size={20} /> {t('warehouse.results.download_pdf')}\n              </button>\n              </>\n              )}\n           </div>"
);

content = content.replace(
  "<Download size={20} /> {t('warehouse.results.download_pdf')}\r\n              </button>\r\n           </div>",
  "<Download size={20} /> {t('warehouse.results.download_pdf')}\r\n              </button>\r\n              </>\n              )}\r\n           </div>"
);

fs.writeFileSync(path, content);
console.log("Done");
