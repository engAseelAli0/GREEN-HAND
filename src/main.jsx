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
import AnalyticsDashboard from './pages/AnalyticsDashboard'
import OrderReports from './pages/OrderReports'
import Login from './pages/Login'
import Unauthorized from './pages/Unauthorized'
import { AuthProvider } from './context/AuthContext'
import ProtectedRoute from './components/ProtectedRoute'
import { AppDataProvider } from './context/AppDataContext'
import { ThemeProvider } from './context/ThemeContext'
import SecurityGuard from './components/SecurityGuard'
import './i18n'
import './index.css'

// Disable React Developer Tools globally before React rendering starts
if (typeof window.__REACT_DEVTOOLS_GLOBAL_HOOK__ === 'object') {
  for (const [key, value] of Object.entries(window.__REACT_DEVTOOLS_GLOBAL_HOOK__)) {
    if (key === 'renderers') {
      window.__REACT_DEVTOOLS_GLOBAL_HOOK__[key] = new Map();
    } else if (typeof value === 'function') {
      window.__REACT_DEVTOOLS_GLOBAL_HOOK__[key] = () => {};
    }
  }
}


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

// ═══════════════════════════════════════════════════════════════════
// Global Enter-key → Move to next field (Desktop Enter + Mobile "Next/Go")
// Works automatically on ALL input/select fields across the entire app.
// Skips: textareas, readonly, disabled, hidden, and fields with
// custom Enter handlers (like serial search inputs).
// Smart form-awareness: if it's the last field in a form, allows submit.
// ═══════════════════════════════════════════════════════════════════
document.addEventListener('keydown', function(e) {
  if (e.key !== 'Enter') return;

  const el = document.activeElement;
  if (!el) return;

  const tag = el.tagName.toLowerCase();

  // Only handle input and select elements
  if (tag !== 'input' && tag !== 'select') return;

  // Skip submit/button type inputs (let them submit the form)
  if (el.type === 'submit' || el.type === 'button' || el.type === 'reset') return;

  // Skip file inputs and color pickers
  if (el.type === 'file' || el.type === 'color') return;

  // Skip inputs with id="fetchSerialInput" — they have custom Enter handlers for search
  if (el.id === 'fetchSerialInput') return;

  // Skip inputs that have a specific data attribute to opt-out
  if (el.dataset.enterIgnore === 'true') return;

  // Don't interfere if Ctrl/Shift/Alt is pressed
  if (e.ctrlKey || e.shiftKey || e.altKey || e.metaKey) return;

  // Find the form this element belongs to (if any)
  const parentForm = el.closest('form');

  // Determine the scope: fields within the same form, or all visible fields on the page
  const scope = parentForm || document;

  // Collect all focusable fields in DOM order within the scope
  const allFields = Array.from(scope.querySelectorAll(
    'input:not([type="hidden"]):not([type="submit"]):not([type="button"]):not([type="reset"]):not([type="file"]):not([type="checkbox"]):not([type="radio"]):not([type="color"]), select'
  )).filter(function(field) {
    // Must be visible, enabled, and not readonly
    if (field.disabled || field.readOnly) return false;
    if (field.tabIndex === -1) return false;
    if (field.offsetParent === null) return false; // hidden by CSS
    // Check computed visibility
    const style = window.getComputedStyle(field);
    if (style.display === 'none' || style.visibility === 'hidden') return false;
    return true;
  });

  const currentIndex = allFields.indexOf(el);
  if (currentIndex === -1) return;

  // Find the next field (skipping textareas)
  let nextIndex = currentIndex + 1;

  if (nextIndex < allFields.length) {
    // There IS a next field — navigate to it
    e.preventDefault();
    const nextField = allFields[nextIndex];
    nextField.focus();

    // If it's a text/number input, select all text for easy overwrite
    if (nextField.tagName.toLowerCase() === 'input' && 
        (nextField.type === 'text' || nextField.type === 'number' || nextField.type === 'tel' || nextField.type === 'email' || nextField.type === 'url' || nextField.type === 'password')) {
      nextField.select();
    }
  }
  // If there's no next field and we're in a form: let Enter submit the form naturally (don't preventDefault)
  // If there's no next field and no form: do nothing (Enter has no effect)
});

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ThemeProvider>
      <AppDataProvider>
        <AuthProvider>
          <SecurityGuard>
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
                  <Route path="order-reports" element={<ProtectedRoute><OrderReports /></ProtectedRoute>} />
                  <Route path="shipping-invoice" element={<ProtectedRoute><ShippingInvoice /></ProtectedRoute>} />
                  <Route path="packing-list" element={<ProtectedRoute><PackingList /></ProtectedRoute>} />
                  <Route path="warehouse-receipt" element={<ProtectedRoute><WarehouseReceipt /></ProtectedRoute>} />
                  <Route path="analytics" element={<ProtectedRoute><AnalyticsDashboard /></ProtectedRoute>} />
                </Route>
              </Routes>
            </BrowserRouter>
          </SecurityGuard>
        </AuthProvider>
      </AppDataProvider>
    </ThemeProvider>
  </React.StrictMode>,
)
