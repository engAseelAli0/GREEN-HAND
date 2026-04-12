import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import AppLayout from './AppLayout'
import HomePortal from './pages/HomePortal'
import DataEntryWizard from './pages/DataEntryWizard'
import AdminDashboard from './pages/AdminDashboard'
import ExportOrder from './pages/ExportOrder'
import FactoryReceiving from './pages/FactoryReceiving'
import PrintBarcodes from './pages/PrintBarcodes'
import ReportsPortal from './pages/ReportsPortal'
import { AppDataProvider } from './context/AppDataContext'
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
    <AppDataProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<AppLayout />}>
            <Route index element={<HomePortal />} />
            <Route path="entry" element={<DataEntryWizard />} />
            <Route path="admin" element={<AdminDashboard />} />
            <Route path="export" element={<ExportOrder />} />
            <Route path="receiving" element={<FactoryReceiving />} />
            <Route path="barcodes" element={<PrintBarcodes />} />
            <Route path="reports" element={<ReportsPortal />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </AppDataProvider>
  </React.StrictMode>,
)
