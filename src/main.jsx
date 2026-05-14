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
import Login from './pages/Login'
import Unauthorized from './pages/Unauthorized'
import { AuthProvider } from './context/AuthContext'
import ProtectedRoute from './components/ProtectedRoute'
import { AppDataProvider } from './context/AppDataContext'
import { ThemeProvider } from './context/ThemeContext'
import './i18n'
import './index.css'

// Global fix to prevent mouse wheel and arrow keys from altering number inputs everywhere
document.addEventListener('wheel', function() {
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
        <AuthProvider>
          <BrowserRouter>
            <Routes>
              <Route path="/login" element={<Login />} />
              <Route path="/unauthorized" element={<Unauthorized />} />
              
              <Route path="/" element={<ProtectedRoute><AppLayout /></ProtectedRoute>}>
                <Route index element={<HomePortal />} />
                <Route path="entry" element={<ProtectedRoute><DataEntryWizard /></ProtectedRoute>} />
                <Route path="admin" element={<ProtectedRoute><AdminDashboard /></ProtectedRoute>} />
                <Route path="export" element={<ProtectedRoute><ExportOrder /></ProtectedRoute>} />
                <Route path="receiving" element={<ProtectedRoute><FactoryReceiving /></ProtectedRoute>} />
                <Route path="factory-portal" element={<ProtectedRoute><FactoryOwnerPortal /></ProtectedRoute>} />
                <Route path="barcodes" element={<ProtectedRoute><PrintBarcodes /></ProtectedRoute>} />
                <Route path="reports" element={<ProtectedRoute><ReportsPortal /></ProtectedRoute>} />
                <Route path="shipping-invoice" element={<ProtectedRoute><ShippingInvoice /></ProtectedRoute>} />
                <Route path="packing-list" element={<ProtectedRoute><PackingList /></ProtectedRoute>} />
                <Route path="warehouse-receipt" element={<ProtectedRoute><WarehouseReceipt /></ProtectedRoute>} />
              </Route>
            </Routes>
          </BrowserRouter>
        </AuthProvider>
      </AppDataProvider>
    </ThemeProvider>
  </React.StrictMode>,
)
