import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import AppLayout from './AppLayout'
import HomePortal from './pages/HomePortal'
import DataEntryWizard from './pages/DataEntryWizard'
import AdminDashboard from './pages/AdminDashboard'
import ExportOrder from './pages/ExportOrder'
import { AppDataProvider } from './context/AppDataContext'
import './index.css'

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
          </Route>
        </Routes>
      </BrowserRouter>
    </AppDataProvider>
  </React.StrictMode>,
)
