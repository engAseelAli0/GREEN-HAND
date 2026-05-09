import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import AppLayout from './AppLayout'
import HomePortal from './pages/HomePortal'
import DataEntryWizard from './pages/DataEntryWizard'
import AdminDashboard from './pages/AdminDashboard'
import ExportOrder from './pages/ExportOrder'
import FactoryReceiving from './pages/FactoryReceiving'
import FactoryOwnerPortal from './pages/FactoryOwnerPortal'
import PrintBarcodes from './pages/PrintBarcodes'
import ReportsPortal from './pages/ReportsPortal'
import ShippingInvoice from './pages/ShippingInvoice'
import PackingList from './pages/PackingList'
import WarehouseReceipt from './pages/WarehouseReceipt'
import { AppDataProvider } from './context/AppDataContext'
import { ThemeProvider } from './context/ThemeContext'
import './i18n'
import './index.css'

// Global fix to prevent mouse wheel and arrow keys from altering number inputs everywhere
document.addEventListener('wheel', function(e) {
  if (document.activeElement && document.activeElement.type === 'number') {
    document.activeElement.blur();
  }
}, { passive: true });

document.addEventListener('keydown', function(e) {
  if (document.activeElement && document.activeElement.type === 'number') {
    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      e.preventDefault();
    }
  }
});

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ThemeProvider>
      <AppDataProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<AppLayout />}>
              <Route index element={<HomePortal />} />
              <Route path="entry" element={<DataEntryWizard />} />
              <Route path="admin" element={<AdminDashboard />} />
              <Route path="export" element={<ExportOrder />} />
              <Route path="receiving" element={<FactoryReceiving />} />
              <Route path="factory-portal" element={<FactoryOwnerPortal />} />
              <Route path="barcodes" element={<PrintBarcodes />} />
              <Route path="reports" element={<ReportsPortal />} />
              <Route path="shipping-invoice" element={<ShippingInvoice />} />
              <Route path="packing-list" element={<PackingList />} />
              <Route path="warehouse-receipt" element={<WarehouseReceipt />} />
            </Route>
          </Routes>
        </BrowserRouter>
      </AppDataProvider>
    </ThemeProvider>
  </React.StrictMode>,
)
