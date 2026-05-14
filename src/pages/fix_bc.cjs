const fs = require('fs');
const path = 'd:/green hand/src/pages/PrintBarcodes.jsx';
let content = fs.readFileSync(path, 'utf8');

content = content.replace(
  "import { Link } from 'react-router-dom';",
  "import { Link } from 'react-router-dom';\nimport { useAuth } from '../context/AuthContext';"
);

content = content.replace(
  "const PrintBarcodes = () => {",
  "const PrintBarcodes = () => {\n  const { hasPermission } = useAuth();"
);

content = content.replace(
  "              <>\r\n                <button className=\"bc-print-btn\" onClick={handleOpenSetup}",
  "              <>\r\n                {hasPermission('barcodes', 'export') && (<>\r\n                <button className=\"bc-print-btn\" onClick={handleOpenSetup}"
);
content = content.replace(
  "              <>\n                <button className=\"bc-print-btn\" onClick={handleOpenSetup}",
  "              <>\n                {hasPermission('barcodes', 'export') && (<>\n                <button className=\"bc-print-btn\" onClick={handleOpenSetup}"
);

content = content.replace(
  "                  {t('print.search.print_btn')}\r\n                </button>\r\n              </>",
  "                  {t('print.search.print_btn')}\r\n                </button>\r\n                </>)}\r\n              </>"
);
content = content.replace(
  "                  {t('print.search.print_btn')}\n                </button>\n              </>",
  "                  {t('print.search.print_btn')}\n                </button>\n                </>)}\n              </>"
);

fs.writeFileSync(path, content);
console.log("Done");
