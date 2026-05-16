import React, { useState, useEffect } from 'react';
import { supabase, supabaseUrl, supabaseKey } from '../supabaseClient';
import { createClient } from '@supabase/supabase-js';
import toast from 'react-hot-toast';
import { useTranslation } from 'react-i18next';
import { User, Shield, Lock, Trash2, Edit2, Plus, Save, X, AlertTriangle, Key, CheckCircle, Eye, Edit, Trash, Download, Settings, PauseCircle, PlayCircle, Fingerprint } from 'lucide-react';

// Secondary client for creating users without logging out the admin
const adminAuthClient = createClient(supabaseUrl, supabaseKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

const ALL_PAGES = [
  { id: 'entry', nameKey: 'nav.entry', icon: '📝' },
  { id: 'export', nameKey: 'nav.export', icon: '📤' },
  { id: 'receiving', nameKey: 'nav.receiving', icon: '📥' },
  { id: 'factory-portal', nameKey: 'nav.factory_portal', icon: '🏭' },
  { id: 'barcodes', nameKey: 'nav.barcodes', icon: '🏷️' },
  { id: 'reports', nameKey: 'nav.reports', icon: '📊' },
  { id: 'shipping-invoice', nameKey: 'nav.shipping_invoice', icon: '🧾' },
  { id: 'packing-list', nameKey: 'nav.packing_list', icon: '📦' },
  { id: 'warehouse-receipt', nameKey: 'nav.warehouse_receipt', icon: '🏢' },
  { id: 'admin', nameKey: 'nav.admin', icon: '👑' }
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
      toast.error(t('user_mgmt.messages.loading_users_error') || 'Failed to load users');
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
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleDelete = async (id) => {
    if (!window.confirm(t('auth.confirm_delete'))) return;
    try {
      const { error } = await supabase.from('system_users').delete().eq('id', id);
      if (error) throw error;
      toast.success(t('auth.user_deleted'));
      fetchUsers();
      if (editId === id) resetForm();
    } catch (error) {
      toast.error(t('auth.delete_error') || 'Error deleting user');
      console.error(error);
    }
  };

  const handleToggleSuspend = async (user) => {
    try {
      const isCurrentlySuspended = !!user.permissions?.__is_suspended;
      const newPermissions = { ...user.permissions, __is_suspended: !isCurrentlySuspended };
      const { error } = await supabase.from('system_users').update({ permissions: newPermissions }).eq('id', user.id);
      if (error) throw error;
      toast.success(!isCurrentlySuspended ? t('user_mgmt.messages.suspend_success') : t('user_mgmt.messages.activate_success'));
      fetchUsers();
    } catch (error) {
      toast.error(t('user_mgmt.messages.status_error'));
      console.error(error);
    }
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (!formData.username) {
      toast.error(t('user_mgmt.messages.username_required'));
      return;
    }

    try {
      const allowedPagesArray = Object.keys(formData.permissions).filter(pageId => formData.permissions[pageId]?.view);
      
      if (isEditing) {
        const oldUser = users.find(u => u.id === editId);
        let authEmailToUse = oldUser.permissions?.__auth_email || `${oldUser.username}@greenhand.local`;
        
        if (formData.username !== oldUser.username || formData.password !== oldUser.password) {
          authEmailToUse = `${formData.username}_${Date.now()}@greenhand.local`;
          const { error: authError } = await adminAuthClient.auth.signUp({
            email: authEmailToUse,
            password: formData.password || oldUser.password,
            options: {
              data: {
                username: formData.username,
                role: formData.role,
                allowed_pages: allowedPagesArray,
                permissions: formData.permissions
              }
            }
          });
          if (authError) throw new Error(`Supabase Auth Error: ${authError.message}`);
        }

        const updateData = {
          username: formData.username,
          role: formData.role,
          allowed_pages: allowedPagesArray,
          permissions: { ...formData.permissions, __auth_email: authEmailToUse }
        };
        const { error } = await supabase.from('system_users').update(updateData).eq('id', editId);
        if (error) throw error;
        toast.success(t('auth.user_saved'));
      } else {
        if (!formData.password) {
           toast.error(t('user_mgmt.messages.password_required'));
           return;
        }
        
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

        const { error: dbError } = await supabase.from('system_users').insert([{
          username: formData.username,
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
      toast.error(error.message || t('user_mgmt.messages.save_error'));
      console.error(error);
    }
  };

  const togglePermission = (pageId, action) => {
    setFormData(prev => {
      const pagePerms = prev.permissions[pageId] || { view: false, add: false, edit: false, delete: false, export: false };
      const newPerms = { ...pagePerms, [action]: !pagePerms[action] };
      
      if (action === 'view' && !newPerms.view) {
        newPerms.add = false;
        newPerms.edit = false;
        newPerms.delete = false;
        newPerms.export = false;
      }
      
      if ((action === 'add' || action === 'edit' || action === 'delete' || action === 'export') && newPerms[action]) {
        newPerms.view = true;
      }
      
      return {
        ...prev,
        permissions: { ...prev.permissions, [pageId]: newPerms }
      };
    });
  };

  const CustomCheckbox = ({ checked, onChange, color, icon: Icon, label }) => (
    <div 
      onClick={onChange}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '0.4rem',
        padding: '0.35rem 0.6rem',
        borderRadius: '6px',
        cursor: 'pointer',
        border: `1px solid ${checked ? color : 'var(--border-color)'}`,
        background: checked ? `${color}15` : 'transparent',
        color: checked ? color : 'var(--text-muted)',
        transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
        userSelect: 'none'
      }}
      onMouseEnter={e => { if(!checked) e.currentTarget.style.background = 'rgba(255,255,255,0.03)' }}
      onMouseLeave={e => { if(!checked) e.currentTarget.style.background = 'transparent' }}
    >
      {Icon && <Icon size={14} />}
      {label && <span style={{ fontSize: '0.75rem', fontWeight: checked ? 'bold' : 'normal' }}>{label}</span>}
    </div>
  );

  if (loading) return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '4rem', gap: '1rem' }}>
      <div style={{ width: '40px', height: '40px', borderRadius: '50%', border: '3px solid var(--border-color)', borderTopColor: 'var(--accent-color)', animation: 'spin 1s linear infinite' }} />
      <span style={{ color: 'var(--text-muted)' }}>{t('user_mgmt.loading_users')}</span>
    </div>
  );

  return (
    <div className="fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      
      {/* Header Section */}
      <div style={{ 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center',
        padding: '1.5rem 2rem',
        background: 'linear-gradient(135deg, var(--surface-color) 0%, rgba(212, 175, 55, 0.05) 100%)',
        borderRadius: 'var(--radius-lg)',
        border: '1px solid rgba(212, 175, 55, 0.2)',
        boxShadow: 'var(--shadow-md)'
      }}>
        <div>
          <h2 style={{ fontSize: '1.5rem', margin: '0 0 0.5rem 0', display: 'flex', alignItems: 'center', gap: '0.75rem', color: 'var(--text-strong)' }}>
            <div style={{ padding: '0.5rem', background: 'var(--accent-color)', borderRadius: '12px', color: '#000', display: 'flex' }}>
              <Shield size={24} />
            </div>
            {t('user_mgmt.title')}
          </h2>
          <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: '0.9rem' }}>
            {t('user_mgmt.subtitle')}
          </p>
        </div>
        <button 
          onClick={resetForm}
          className="btn btn-accent" 
          style={{ padding: '0.75rem 1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem', borderRadius: '12px' }}
        >
          <Plus size={18} />
          <span>{t('user_mgmt.new_user')}</span>
        </button>
      </div>

      <div style={{ display: 'flex', gap: '2rem', flexWrap: 'wrap', alignItems: 'flex-start' }}>
        
        {/* Form Section */}
        <div style={{ 
          flex: '1 1 450px', 
          position: 'sticky', 
          top: '1rem',
          background: 'var(--surface-color)',
          padding: '2rem',
          borderRadius: 'var(--radius-lg)',
          border: isEditing ? '1px solid var(--accent-color)' : '1px solid var(--border-color)',
          boxShadow: isEditing ? '0 0 24px rgba(212, 175, 55, 0.1)' : 'var(--shadow-md)',
          transition: 'all 0.3s ease'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '2rem', paddingBottom: '1rem', borderBottom: '1px solid var(--border-color)' }}>
            <div style={{ padding: '0.5rem', background: isEditing ? 'rgba(212, 175, 55, 0.1)' : 'rgba(255,255,255,0.05)', borderRadius: '10px', color: isEditing ? 'var(--accent-color)' : 'var(--text-main)' }}>
              {isEditing ? <Edit2 size={20} /> : <User size={20} />}
            </div>
            <h3 style={{ margin: 0, fontSize: '1.2rem', color: 'var(--text-strong)' }}>
              {isEditing ? t('user_mgmt.edit_user_title', { name: formData.username }) : t('user_mgmt.add_new_user')}
            </h3>
            {isEditing && (
              <span style={{ marginRight: 'auto', padding: '0.25rem 0.75rem', background: 'rgba(212, 175, 55, 0.1)', color: 'var(--accent-color)', borderRadius: '50px', fontSize: '0.8rem', fontWeight: 'bold' }}>
                {t('user_mgmt.edit_mode')}
              </span>
            )}
          </div>

          <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            
            {/* Credentials Row */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1.5rem' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                <label style={{ fontSize: '0.85rem', fontWeight: '600', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  <Fingerprint size={14} /> {t('user_mgmt.username_label')}
                </label>
                <div style={{ position: 'relative' }}>
                  <input
                    type="text"
                    className="form-control"
                    style={{ paddingRight: '2.5rem', background: 'var(--bg-color)', height: '45px', fontSize: '1rem' }}
                    value={formData.username}
                    onChange={e => setFormData({...formData, username: e.target.value})}
                    placeholder={t('user_mgmt.username_placeholder')}
                    required
                  />
                  <User size={18} style={{ position: 'absolute', right: '0.8rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                <label style={{ fontSize: '0.85rem', fontWeight: '600', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  <Key size={14} /> {t('user_mgmt.password_label')} {isEditing && <span style={{ fontSize: '0.7rem', color: 'var(--accent-color)', fontWeight: 'normal' }}>{t('user_mgmt.password_hint')}</span>}
                </label>
                <div style={{ position: 'relative' }}>
                  <input
                    type="text"
                    className="form-control"
                    style={{ paddingRight: '2.5rem', background: 'var(--bg-color)', height: '45px', fontSize: '1rem', fontFamily: 'monospace' }}
                    value={formData.password}
                    onChange={e => setFormData({...formData, password: e.target.value})}
                    placeholder={isEditing ? '••••••••' : t('user_mgmt.password_placeholder')}
                    required={!isEditing}
                  />
                  <Lock size={18} style={{ position: 'absolute', right: '0.8rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                </div>
              </div>
            </div>

            {/* Role Selection */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              <label style={{ fontSize: '0.85rem', fontWeight: '600', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <Shield size={14} /> {t('user_mgmt.role_label')}
              </label>
              <div style={{ position: 'relative' }}>
                <select 
                  className="form-control" 
                  style={{ background: 'var(--bg-color)', height: '45px', paddingRight: '2.5rem', appearance: 'none', cursor: 'pointer', fontSize: '0.95rem' }}
                  value={formData.role}
                  onChange={e => setFormData({...formData, role: e.target.value})}
                >
                  {ROLES.map(r => <option key={r} value={r}>{t(`auth.${r}`) || r}</option>)}
                </select>
                <Settings size={18} style={{ position: 'absolute', right: '0.8rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', pointerEvents: 'none' }} />
              </div>
            </div>

            {/* Permissions Panel */}
            <div style={{ 
              background: 'var(--bg-color)', 
              borderRadius: 'var(--radius-lg)', 
              border: '1px solid var(--border-color)',
              overflow: 'hidden',
              marginTop: '0.5rem'
            }}>
              <div style={{ padding: '1rem 1.25rem', background: 'rgba(255,255,255,0.02)', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <Shield size={16} color="var(--accent-color)" /> {t('user_mgmt.advanced_permissions')}
                </span>
              </div>

              {formData.role === 'admin' ? (
                <div style={{ padding: '3rem 2rem', textAlign: 'center', background: 'rgba(34, 197, 94, 0.05)' }}>
                  <Shield size={48} color="#22c55e" style={{ margin: '0 auto 1rem', opacity: 0.8 }} />
                  <h4 style={{ color: '#22c55e', marginBottom: '0.5rem' }}>{t('user_mgmt.admin_perms_title')}</h4>
                  <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', margin: 0 }}>
                    {t('user_mgmt.admin_perms_desc')}
                  </p>
                </div>
              ) : (
                <div style={{ maxHeight: '400px', overflowY: 'auto' }}>
                  {ALL_PAGES.map((page, index) => {
                    const perms = formData.permissions[page.id] || { view: false, add: false, edit: false, delete: false, export: false };
                    const isVisible = perms.view;
                    
                    return (
                      <div key={page.id} style={{
                        padding: '1rem 1.25rem',
                        borderBottom: index !== ALL_PAGES.length - 1 ? '1px solid var(--border-color)' : 'none',
                        background: isVisible ? 'rgba(212, 175, 55, 0.03)' : 'transparent',
                        transition: 'background 0.3s ease',
                        position: 'relative'
                      }}>
                        {isVisible && <div style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: '3px', background: 'var(--accent-color)' }} />}
                        
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                            <span style={{ fontSize: '1.2rem' }}>{page.icon}</span>
                            <span style={{ fontWeight: '600', color: isVisible ? 'var(--accent-color)' : 'var(--text-main)', fontSize: '0.95rem' }}>
                              {t(page.nameKey)}
                            </span>
                          </div>
                          
                          {/* Master View Toggle */}
                          <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer', gap: '0.5rem' }}>
                            <span style={{ fontSize: '0.8rem', fontWeight: 'bold', color: isVisible ? 'var(--accent-color)' : 'var(--text-muted)' }}>{isVisible ? t('user_mgmt.allow_screen') : t('user_mgmt.block_screen')}</span>
                            <div style={{ 
                              width: '40px', height: '22px', borderRadius: '20px', 
                              background: isVisible ? 'var(--accent-color)' : 'var(--border-color)',
                              position: 'relative', transition: 'all 0.3s'
                            }}>
                              <div style={{
                                width: '18px', height: '18px', borderRadius: '50%', background: '#fff',
                                position: 'absolute', top: '2px', left: isVisible ? '20px' : '2px',
                                transition: 'all 0.3s', boxShadow: '0 2px 4px rgba(0,0,0,0.2)'
                              }} />
                            </div>
                            <input type="checkbox" checked={isVisible} onChange={() => togglePermission(page.id, 'view')} style={{ display: 'none' }} />
                          </label>
                        </div>

                        {/* Detailed Permissions */}
                        <div style={{ 
                          display: 'flex', gap: '0.5rem', flexWrap: 'wrap',
                          opacity: isVisible ? 1 : 0.4,
                          pointerEvents: isVisible ? 'auto' : 'none',
                          transition: 'opacity 0.3s'
                        }}>
                          <CustomCheckbox checked={perms.view} onChange={() => togglePermission(page.id, 'view')} color="var(--accent-color)" icon={Eye} label={t('user_mgmt.view')} />
                          <CustomCheckbox checked={perms.add} onChange={() => togglePermission(page.id, 'add')} color="#10b981" icon={Plus} label={t('user_mgmt.add')} />
                          <CustomCheckbox checked={perms.edit} onChange={() => togglePermission(page.id, 'edit')} color="#f59e0b" icon={Edit} label={t('user_mgmt.edit')} />
                          <CustomCheckbox checked={perms.delete} onChange={() => togglePermission(page.id, 'delete')} color="#ef4444" icon={Trash} label={t('user_mgmt.delete')} />
                          <CustomCheckbox checked={perms.export} onChange={() => togglePermission(page.id, 'export')} color="#0ea5e9" icon={Download} label={t('user_mgmt.export')} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Action Buttons */}
            <div style={{ display: 'flex', gap: '1rem', marginTop: '0.5rem' }}>
              <button type="submit" className="btn btn-accent" style={{ flex: 2, height: '48px', fontSize: '1.05rem', fontWeight: 'bold' }}>
                {isEditing ? (
                  <><Save size={20} /> {t('user_mgmt.save_changes')}</>
                ) : (
                  <><CheckCircle size={20} /> {t('user_mgmt.create_account')}</>
                )}
              </button>
              
              {isEditing && (
                <button type="button" onClick={resetForm} className="btn btn-outline" style={{ flex: 1, height: '48px' }}>
                  <X size={20} /> {t('auth.cancel')}
                </button>
              )}
            </div>
          </form>
        </div>

        {/* Users List Section */}
        <div style={{ flex: '1 1 500px', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          
          {/* List Controls / Summary */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0 0.5rem' }}>
            <h3 style={{ margin: 0, fontSize: '1.1rem', color: 'var(--text-strong)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <User size={18} color="var(--text-muted)" />
              {t('user_mgmt.users_list')} ({users.length})
            </h3>
          </div>

          {users.length === 0 ? (
            <div style={{ padding: '4rem 2rem', textAlign: 'center', background: 'var(--surface-color)', borderRadius: 'var(--radius-lg)', border: '1px dashed var(--border-color)' }}>
              <AlertTriangle size={48} color="var(--text-muted)" style={{ margin: '0 auto 1rem', opacity: 0.5 }} />
              <h4 style={{ color: 'var(--text-main)', marginBottom: '0.5rem' }}>{t('user_mgmt.no_users')}</h4>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>{t('user_mgmt.no_users_desc')}</p>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '1rem' }}>
              {users.map(user => {
                const isSuspended = !!user.permissions?.__is_suspended;
                const isAdmin = user.username === 'admin' || user.role === 'admin';
                const isCurrentlyEditing = editId === user.id;

                return (
                  <div key={user.id} style={{
                    background: 'var(--surface-color)',
                    borderRadius: 'var(--radius-lg)',
                    border: isCurrentlyEditing 
                      ? '2px solid var(--accent-color)' 
                      : `1px solid ${isSuspended ? 'rgba(239, 68, 68, 0.3)' : 'var(--border-color)'}`,
                    boxShadow: isCurrentlyEditing ? '0 0 20px rgba(212, 175, 55, 0.15)' : 'var(--shadow-sm)',
                    overflow: 'hidden',
                    transition: 'all 0.3s ease',
                    position: 'relative',
                    opacity: isSuspended ? 0.75 : 1
                  }}>
                    {/* Status Bar */}
                    <div style={{ 
                      height: '4px', 
                      background: isAdmin 
                        ? 'linear-gradient(90deg, #d4af37, #b58d27)' 
                        : isSuspended 
                          ? '#ef4444' 
                          : 'var(--border-focus)',
                      width: '100%'
                    }} />

                    <div style={{ padding: '1.25rem' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                          <div style={{ 
                            width: '46px', height: '46px', borderRadius: '12px', 
                            background: isAdmin ? 'rgba(212, 175, 55, 0.1)' : 'var(--bg-color)', 
                            border: `1px solid ${isAdmin ? 'rgba(212, 175, 55, 0.3)' : 'var(--border-color)'}`,
                            display: 'flex', alignItems: 'center', justifyContent: 'center' 
                          }}>
                            {isAdmin ? <Shield size={24} color="var(--accent-color)" /> : <User size={24} color="var(--text-muted)" />}
                          </div>
                          <div>
                            <h3 style={{ margin: '0 0 0.25rem 0', fontSize: '1.1rem', color: isSuspended ? 'var(--text-muted)' : 'var(--text-strong)', textDecoration: isSuspended ? 'line-through' : 'none' }}>
                              {user.username}
                            </h3>
                            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                              <span style={{ 
                                fontSize: '0.75rem', padding: '0.15rem 0.6rem', borderRadius: '20px', 
                                background: isAdmin ? 'var(--accent-color)' : 'var(--bg-color)',
                                color: isAdmin ? '#000' : 'var(--text-main)',
                                border: isAdmin ? 'none' : '1px solid var(--border-color)',
                                fontWeight: 'bold'
                              }}>
                                {t(`auth.${user.role}`) || user.role}
                              </span>
                              {isSuspended && (
                                <span style={{ fontSize: '0.7rem', color: '#ef4444', background: 'rgba(239, 68, 68, 0.1)', padding: '0.15rem 0.5rem', borderRadius: '20px', fontWeight: 'bold' }}>
                                  {t('user_mgmt.suspended')}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>

                      <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1.25rem', paddingTop: '1rem', borderTop: '1px solid var(--border-color)' }}>
                        <button 
                          onClick={() => handleEdit(user)} 
                          className="btn" 
                          style={{ 
                            flex: 1, padding: '0.5rem', background: isCurrentlyEditing ? 'var(--accent-color)' : 'var(--bg-color)',
                            color: isCurrentlyEditing ? '#000' : 'var(--text-main)',
                            border: `1px solid ${isCurrentlyEditing ? 'var(--accent-color)' : 'var(--border-color)'}`,
                            display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '0.4rem',
                            fontSize: '0.85rem'
                          }}
                        >
                          <Edit2 size={16} /> {t('user_mgmt.edit')}
                        </button>
                        
                        {user.username !== 'admin' && (
                          <>
                            <button 
                              onClick={() => handleToggleSuspend(user)} 
                              className="btn" 
                              style={{ 
                                padding: '0.5rem', background: 'var(--bg-color)', border: '1px solid var(--border-color)',
                                color: isSuspended ? '#10b981' : '#f59e0b',
                                display: 'flex', justifyContent: 'center', alignItems: 'center'
                              }} 
                              title={isSuspended ? t('user_mgmt.activate_account') : t('user_mgmt.suspend_account')}
                            >
                              {isSuspended ? <PlayCircle size={18} /> : <PauseCircle size={18} />}
                            </button>
                            
                            <button 
                              onClick={() => handleDelete(user.id)} 
                              className="btn" 
                              style={{ 
                                padding: '0.5rem', background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.3)',
                                color: '#ef4444', display: 'flex', justifyContent: 'center', alignItems: 'center'
                              }} 
                              title={t('auth.delete_user')}
                            >
                              <Trash2 size={18} />
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
        
      </div>
    </div>
  );
};

export default UserManagement;
