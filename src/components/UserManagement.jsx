import React, { useState, useEffect } from 'react';
import { supabase, supabaseUrl, supabaseKey } from '../supabaseClient';
import { createClient } from '@supabase/supabase-js';
import toast from 'react-hot-toast';
import { useTranslation } from 'react-i18next';
import { User, Shield, Lock, Trash2, Edit2, Plus, Save, X, AlertTriangle } from 'lucide-react';

// Secondary client for creating users without logging out the admin
const adminAuthClient = createClient(supabaseUrl, supabaseKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

const ALL_PAGES = [
  { id: 'entry', nameKey: 'nav.entry' },
  { id: 'export', nameKey: 'nav.export' },
  { id: 'receiving', nameKey: 'nav.receiving' },
  { id: 'factory-portal', nameKey: 'nav.factory_portal' },
  { id: 'barcodes', nameKey: 'nav.barcodes' },
  { id: 'reports', nameKey: 'nav.reports' },
  { id: 'shipping-invoice', nameKey: 'nav.shipping_invoice' },
  { id: 'packing-list', nameKey: 'nav.packing_list' },
  { id: 'warehouse-receipt', nameKey: 'nav.warehouse_receipt' },
  { id: 'admin', nameKey: 'nav.admin' }
];

const ROLES = ['admin', 'data_entry', 'warehouse', 'factory', 'guest'];

const UserManagement = () => {
  const { t } = useTranslation();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  
  const [isEditing, setIsEditing] = useState(false);
  const [editId, setEditId] = useState(null);
  
  const [formData, setFormData] = useState({
    username: '',
    password: '',
    role: 'guest',
    allowed_pages: [],
    permissions: {}
  });

  useEffect(() => {
    fetchUsers();
  }, []);

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.from('system_users').select('*').order('created_at', { ascending: true });
      if (error) throw error;
      setUsers(data || []);
    } catch (error) {
      console.error('Error fetching users:', error);
      toast.error('Failed to load users');
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setFormData({ username: '', password: '', role: 'guest', allowed_pages: [], permissions: {} });
    setIsEditing(false);
    setEditId(null);
  };

  const handleEdit = (user) => {
    // If they have old allowed_pages but no permissions object, migrate it for the UI
    let initialPermissions = user.permissions || {};
    if (!user.permissions && user.allowed_pages) {
      user.allowed_pages.forEach(p => {
        initialPermissions[p] = { view: true, add: false, edit: false, delete: false };
      });
    }

    setFormData({
      username: user.username,
      password: user.password,
      role: user.role,
      allowed_pages: user.allowed_pages || [],
      permissions: initialPermissions
    });
    setEditId(user.id);
    setIsEditing(true);
  };

  const handleDelete = async (id) => {
    if (!window.confirm(t('auth.confirm_delete'))) return;
    try {
      const { error } = await supabase.from('system_users').delete().eq('id', id);
      if (error) throw error;
      toast.success(t('auth.user_deleted'));
      fetchUsers();
    } catch (error) {
      toast.error('Error deleting user');
      console.error(error);
    }
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (!formData.username) {
      toast.error('Username is required');
      return;
    }

    try {
      const allowedPagesArray = Object.keys(formData.permissions).filter(pageId => formData.permissions[pageId]?.view);
      
      if (isEditing) {
        // Update permissions in system_users table only
        const updateData = {
          username: formData.username,
          role: formData.role,
          allowed_pages: allowedPagesArray,
          permissions: formData.permissions
        };
        const { error } = await supabase.from('system_users').update(updateData).eq('id', editId);
        if (error) throw error;
        toast.success(t('auth.user_saved'));
      } else {
        if (!formData.password) {
           toast.error('Password is required for new users');
           return;
        }
        
        // 1. Create the user in Supabase Native Auth
        const email = `${formData.username}@greenhand.local`;
        const { error: authError } = await adminAuthClient.auth.signUp({
          email,
          password: formData.password,
          options: {
            data: {
              username: formData.username,
              role: formData.role,
              allowed_pages: allowedPagesArray,
              permissions: formData.permissions
            }
          }
        });

        if (authError) {
          throw new Error(`Supabase Auth Error: ${authError.message}`);
        }

        // 2. Insert into our system_users table for dashboard management
        const { error: dbError } = await supabase.from('system_users').insert([{
          username: formData.username,
          password: formData.password, // Storing temporarily for display/fallback if needed, though Auth uses hashed
          role: formData.role,
          allowed_pages: allowedPagesArray,
          permissions: formData.permissions
        }]);
        
        if (dbError) throw dbError;
        
        toast.success(t('auth.user_saved'));
      }
      
      resetForm();
      fetchUsers();
    } catch (error) {
      toast.error(error.message || 'Error saving user');
      console.error(error);
    }
  };

  const togglePermission = (pageId, action) => {
    setFormData(prev => {
      const pagePerms = prev.permissions[pageId] || { view: false, add: false, edit: false, delete: false };
      const newPerms = { ...pagePerms, [action]: !pagePerms[action] };
      
      // If unchecking 'view', uncheck everything else
      if (action === 'view' && !newPerms.view) {
        newPerms.add = false;
        newPerms.edit = false;
        newPerms.delete = false;
      }
      
      // If checking 'add', 'edit', or 'delete', automatically check 'view'
      if ((action === 'add' || action === 'edit' || action === 'delete') && newPerms[action]) {
        newPerms.view = true;
      }
      
      return {
        ...prev,
        permissions: { ...prev.permissions, [pageId]: newPerms }
      };
    });
  };

  if (loading) return <div style={{ padding: '2rem', textAlign: 'center' }}>Loading users...</div>;

  return (
    <div style={{ display: 'flex', gap: '2rem', flexWrap: 'wrap' }}>
      
      {/* Users List */}
      <div style={{ flex: '1 1 400px', minWidth: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
          <h2 style={{ fontSize: '1.2rem', display: 'flex', alignItems: 'center', gap: '0.5rem', margin: 0 }}>
            <Shield size={20} color="var(--accent-color)" />
            {t('auth.user_management')}
          </h2>
          <button 
            onClick={resetForm}
            className="btn btn-primary" 
            style={{ padding: '0.5rem 1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}
          >
            <Plus size={16} />
            {t('auth.add_user')}
          </button>
        </div>

        {users.length === 0 ? (
          <div style={{ padding: '3rem', textAlign: 'center', background: 'var(--surface-color)', borderRadius: 'var(--radius-lg)', border: '1px dashed var(--border-color)' }}>
            <AlertTriangle size={32} color="var(--text-muted)" style={{ margin: '0 auto 1rem' }} />
            <p style={{ color: 'var(--text-muted)' }}>{t('auth.no_users')}</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {users.map(user => (
              <div key={user.id} style={{
                background: 'var(--surface-color)',
                padding: '1rem 1.25rem',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--border-color)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                boxShadow: '0 2px 8px rgba(0,0,0,0.05)'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                  <div style={{ width: '40px', height: '40px', borderRadius: '50%', background: 'rgba(212, 175, 55, 0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <User size={20} color="var(--accent-color)" />
                  </div>
                  <div>
                    <h3 style={{ margin: '0 0 0.25rem 0', fontSize: '1rem' }}>{user.username}</h3>
                    <span style={{ 
                      fontSize: '0.75rem', 
                      padding: '0.15rem 0.5rem', 
                      borderRadius: '4px', 
                      background: 'rgba(255,255,255,0.05)',
                      border: '1px solid var(--border-color)',
                      color: 'var(--text-muted)'
                    }}>
                      {t(`auth.${user.role}`) || user.role}
                    </span>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <button onClick={() => handleEdit(user)} className="btn btn-outline" style={{ padding: '0.5rem' }} title={t('auth.edit_user')}>
                    <Edit2 size={16} />
                  </button>
                  <button onClick={() => handleDelete(user.id)} className="btn btn-outline" style={{ padding: '0.5rem', color: '#ef4444', borderColor: 'rgba(239, 68, 68, 0.3)' }} title={t('auth.delete_user')}>
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Form */}
      <div style={{ flex: '1 1 400px', minWidth: 0, position: 'sticky', top: '1rem', height: 'max-content' }}>
        <div style={{
          background: 'var(--surface-color)',
          padding: '2rem',
          borderRadius: 'var(--radius-lg)',
          border: '1px solid rgba(212, 175, 55, 0.2)',
          boxShadow: 'var(--shadow-lg)'
        }}>
          <h3 style={{ margin: '0 0 1.5rem 0', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            {isEditing ? <Edit2 size={18} /> : <Plus size={18} />}
            {isEditing ? t('auth.edit_user') : t('auth.add_user')}
          </h3>

          <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            
            <div style={{ display: 'flex', gap: '1rem' }}>
              <div style={{ flex: 1 }}>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.85rem' }}>
                  {t('auth.username')} {isEditing && <span style={{ color: 'var(--text-muted)', fontSize: '0.7rem' }}>(لا يمكن تعديله)</span>}
                </label>
                <div style={{ position: 'relative' }}>
                  <User size={16} style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', opacity: 0.5 }} />
                  <input
                    type="text"
                    className="form-control"
                    style={{ paddingLeft: '2.25rem', background: isEditing ? 'rgba(0,0,0,0.05)' : 'var(--bg-color)', cursor: isEditing ? 'not-allowed' : 'text' }}
                    value={formData.username}
                    onChange={e => { if(!isEditing) setFormData({...formData, username: e.target.value}) }}
                    required={!isEditing}
                    disabled={isEditing}
                  />
                </div>
              </div>

              <div style={{ flex: 1 }}>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.85rem' }}>
                  {t('auth.password')} {isEditing && <span style={{ color: 'var(--text-muted)', fontSize: '0.7rem' }}>(لا يمكن تعديل كلمة المرور)</span>}
                </label>
                <div style={{ position: 'relative' }}>
                  <Lock size={16} style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', opacity: 0.5 }} />
                  <input
                    type="text"
                    className="form-control"
                    style={{ paddingLeft: '2.25rem', background: isEditing ? 'rgba(0,0,0,0.05)' : 'var(--bg-color)', cursor: isEditing ? 'not-allowed' : 'text' }}
                    value={isEditing ? '••••••••' : formData.password}
                    onChange={e => { if(!isEditing) setFormData({...formData, password: e.target.value}) }}
                    required={!isEditing}
                    disabled={isEditing}
                  />
                </div>
              </div>
            </div>

            <div>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.85rem' }}>{t('auth.role')}</label>
              <select 
                className="form-control" 
                style={{ background: 'var(--bg-color)' }}
                value={formData.role}
                onChange={e => setFormData({...formData, role: e.target.value})}
              >
                {ROLES.map(r => <option key={r} value={r}>{t(`auth.${r}`) || r}</option>)}
              </select>
            </div>

            <div style={{ marginTop: '1rem' }}>
              <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem', fontSize: '0.9rem', fontWeight: 'bold' }}>
                <span>{t('auth.permissions')}</span>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{t('auth.select_pages')}</span>
              </label>

              {formData.role === 'admin' ? (
                <div style={{ padding: '1rem', background: 'rgba(34, 197, 94, 0.1)', color: '#22c55e', borderRadius: 'var(--radius-md)', border: '1px solid rgba(34, 197, 94, 0.2)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <Shield size={18} />
                  <span>Admins have full access to all pages automatically.</span>
                </div>
              ) : (
                <div style={{ 
                  display: 'flex', 
                  flexDirection: 'column',
                  gap: '0.75rem',
                  maxHeight: '350px',
                  overflowY: 'auto',
                  padding: '0.5rem',
                  background: 'var(--bg-color)',
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid var(--border-color)'
                }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr 1fr', padding: '0.5rem', borderBottom: '1px solid var(--border-color)', fontWeight: 'bold', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                    <div>الشاشة</div>
                    <div style={{ textAlign: 'center' }}>عرض 👁️</div>
                    <div style={{ textAlign: 'center' }}>إضافة ➕</div>
                    <div style={{ textAlign: 'center' }}>تعديل ✏️</div>
                    <div style={{ textAlign: 'center' }}>حذف 🗑️</div>
                  </div>
                  
                  {ALL_PAGES.map(page => {
                    const perms = formData.permissions[page.id] || { view: false, add: false, edit: false, delete: false };
                    
                    return (
                      <div key={page.id} style={{
                        display: 'grid',
                        gridTemplateColumns: '2fr 1fr 1fr 1fr 1fr',
                        alignItems: 'center',
                        padding: '0.5rem',
                        borderRadius: '6px',
                        background: perms.view ? 'rgba(212, 175, 55, 0.05)' : 'transparent',
                        border: perms.view ? '1px solid rgba(212, 175, 55, 0.2)' : '1px solid transparent',
                        transition: 'all 0.2s',
                        fontSize: '0.85rem'
                      }}>
                        <div style={{ fontWeight: '500' }}>{t(page.nameKey)}</div>
                        
                        <div style={{ display: 'flex', justifyContent: 'center' }}>
                          <input type="checkbox" checked={perms.view} onChange={() => togglePermission(page.id, 'view')} style={{ accentColor: 'var(--accent-color)', width: '16px', height: '16px', cursor: 'pointer' }} />
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'center' }}>
                          <input type="checkbox" checked={perms.add} onChange={() => togglePermission(page.id, 'add')} style={{ accentColor: 'var(--accent-color)', width: '16px', height: '16px', cursor: 'pointer' }} />
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'center' }}>
                          <input type="checkbox" checked={perms.edit} onChange={() => togglePermission(page.id, 'edit')} style={{ accentColor: 'var(--accent-color)', width: '16px', height: '16px', cursor: 'pointer' }} />
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'center' }}>
                          <input type="checkbox" checked={perms.delete} onChange={() => togglePermission(page.id, 'delete')} style={{ accentColor: '#ef4444', width: '16px', height: '16px', cursor: 'pointer' }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div style={{ display: 'flex', gap: '1rem', marginTop: '1rem' }}>
              <button type="submit" className="btn btn-primary" style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}>
                <Save size={18} />
                {t('auth.save_user')}
              </button>
              {isEditing && (
                <button type="button" onClick={resetForm} className="btn btn-outline" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}>
                  <X size={18} />
                  {t('auth.cancel')}
                </button>
              )}
            </div>
          </form>

        </div>
      </div>

    </div>
  );
};

export default UserManagement;
