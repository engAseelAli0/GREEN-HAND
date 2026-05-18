import React, { useState, useEffect, useMemo } from 'react';
import { supabase, supabaseUrl, supabaseKey } from '../supabaseClient';
import { createClient } from '@supabase/supabase-js';
import toast from 'react-hot-toast';
import { useTranslation } from 'react-i18next';
import { 
  User, Shield, Lock, Trash2, Edit2, Plus, Save, X, AlertTriangle, 
  Key, CheckCircle, Eye, Edit, Trash, Download, Settings, PauseCircle, 
  PlayCircle, Fingerprint, Search, Filter, ShieldAlert, UserPlus, Users
} from 'lucide-react';

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
  { id: 'analytics', nameKey: 'nav.analytics', icon: '📈' },
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
  
  // Search & Filter
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
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
    setIsModalOpen(false);
  };

  const handleOpenNewUser = () => {
    resetForm();
    setIsModalOpen(true);
  };

  const handleEdit = (user) => {
    let initialPermissions = user.permissions || {};
    if (!user.permissions && user.allowed_pages) {
      user.allowed_pages.forEach(p => {
        initialPermissions[p] = { view: true, add: false, edit: false, delete: false, export: false };
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
    setIsModalOpen(true);
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

  const filteredUsers = useMemo(() => {
    return users.filter(user => {
      const matchesSearch = user.username.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesRole = roleFilter === 'all' || user.role === roleFilter;
      return matchesSearch && matchesRole;
    });
  }, [users, searchQuery, roleFilter]);

  const CustomCheckbox = ({ checked, onChange, color, icon: Icon, label }) => (
    <div 
      onClick={onChange}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '0.4rem',
        padding: '0.5rem',
        borderRadius: '8px',
        cursor: 'pointer',
        border: `1px solid ${checked ? color : 'var(--border-color)'}`,
        background: checked ? `${color}15` : 'rgba(255,255,255,0.02)',
        color: checked ? color : 'var(--text-muted)',
        transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
        userSelect: 'none',
        flex: 1,
        minWidth: '80px'
      }}
      onMouseEnter={e => { if(!checked) e.currentTarget.style.background = 'rgba(255,255,255,0.05)' }}
      onMouseLeave={e => { if(!checked) e.currentTarget.style.background = 'rgba(255,255,255,0.02)' }}
    >
      {Icon && <Icon size={14} />}
      {label && <span style={{ fontSize: '0.75rem', fontWeight: checked ? 'bold' : 'normal' }}>{label}</span>}
    </div>
  );

  if (loading) return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '6rem', gap: '1.5rem' }}>
      <div style={{ width: '50px', height: '50px', borderRadius: '50%', border: '4px solid rgba(212, 175, 55, 0.2)', borderTopColor: 'var(--accent-color)', animation: 'spin 1s linear infinite' }} />
      <span style={{ color: 'var(--text-muted)', fontSize: '1.1rem', fontWeight: '500' }}>{t('user_mgmt.loading_users')}</span>
    </div>
  );

  return (
    <div className="fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '2rem', maxWidth: '1600px', margin: '0 auto', width: '100%' }}>
      
      {/* ─── HEADER & ACTIONS ─── */}
      <div style={{ 
        display: 'flex', 
        flexDirection: 'column',
        gap: '1.5rem',
        padding: '2rem',
        background: 'var(--glass-bg)',
        backdropFilter: 'blur(16px)',
        borderRadius: 'var(--radius-lg)',
        border: '1px solid rgba(212, 175, 55, 0.15)',
        boxShadow: 'var(--shadow-lg)',
        position: 'relative',
        overflow: 'hidden'
      }}>
        {/* Background Glow */}
        <div style={{ position: 'absolute', top: '-50%', right: '-10%', width: '300px', height: '300px', background: 'radial-gradient(circle, rgba(212,175,55,0.15) 0%, transparent 70%)', pointerEvents: 'none' }} />

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem', position: 'relative', zIndex: 1 }}>
          <div>
            <h2 style={{ fontSize: '2rem', margin: '0 0 0.5rem 0', display: 'flex', alignItems: 'center', gap: '1rem', color: 'var(--text-strong)' }}>
              <div style={{ padding: '0.75rem', background: 'linear-gradient(135deg, var(--accent-color), var(--accent-hover))', borderRadius: '16px', color: '#000', display: 'flex', boxShadow: '0 8px 16px rgba(212,175,55,0.2)' }}>
                <Users size={28} />
              </div>
              {t('user_mgmt.title')}
            </h2>
            <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: '1rem', maxWidth: '600px' }}>
              {t('user_mgmt.subtitle')}
            </p>
          </div>
          
          <button 
            onClick={handleOpenNewUser}
            className="btn btn-accent" 
            style={{ padding: '0.85rem 1.75rem', display: 'flex', alignItems: 'center', gap: '0.75rem', borderRadius: '14px', fontSize: '1.05rem', fontWeight: 'bold' }}
          >
            <UserPlus size={20} />
            <span>{t('user_mgmt.new_user')}</span>
          </button>
        </div>

        {/* Filter Bar */}
        <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', marginTop: '0.5rem', position: 'relative', zIndex: 1 }}>
          <div style={{ flex: '1 1 300px', position: 'relative' }}>
            <Search size={20} style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
            <input
              type="text"
              placeholder={t('user_mgmt.search_users') || 'Search users...'}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="form-control"
              style={{ paddingLeft: '3rem', height: '50px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.1)', fontSize: '1rem', borderRadius: '12px' }}
            />
          </div>
          <div style={{ flex: '0 0 250px', position: 'relative' }}>
            <Filter size={18} style={{ position: 'absolute', right: '1rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', pointerEvents: 'none' }} />
            <select
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value)}
              className="form-control"
              style={{ paddingRight: '2.5rem', height: '50px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.1)', fontSize: '1rem', borderRadius: '12px', appearance: 'none', cursor: 'pointer' }}
            >
              <option value="all">{t('user_mgmt.all_roles') || 'All Roles'}</option>
              {ROLES.map(r => <option key={r} value={r}>{t(`auth.${r}`) || r}</option>)}
            </select>
          </div>
        </div>
      </div>

      {/* ─── USERS GALLERY ─── */}
      {filteredUsers.length === 0 ? (
        <div style={{ padding: '6rem 2rem', textAlign: 'center', background: 'var(--glass-bg)', borderRadius: 'var(--radius-lg)', border: '1px dashed rgba(255,255,255,0.1)' }}>
          <AlertTriangle size={64} color="var(--text-muted)" style={{ margin: '0 auto 1.5rem', opacity: 0.5 }} />
          <h3 style={{ color: 'var(--text-strong)', marginBottom: '0.75rem', fontSize: '1.5rem' }}>{t('user_mgmt.no_users')}</h3>
          <p style={{ color: 'var(--text-muted)', fontSize: '1rem', maxWidth: '400px', margin: '0 auto' }}>{t('user_mgmt.no_users_desc')}</p>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))', gap: '1.5rem' }}>
          {filteredUsers.map(user => {
            const isSuspended = !!user.permissions?.__is_suspended;
            const isAdmin = user.username === 'admin' || user.role === 'admin';

            return (
              <div key={user.id} className="card fade-in" style={{
                background: 'var(--glass-bg)',
                backdropFilter: 'blur(12px)',
                borderRadius: 'var(--radius-lg)',
                border: `1px solid ${isSuspended ? 'rgba(239, 68, 68, 0.3)' : isAdmin ? 'rgba(212, 175, 55, 0.3)' : 'rgba(255,255,255,0.05)'}`,
                boxShadow: isAdmin ? '0 8px 32px rgba(212,175,55,0.08)' : 'var(--shadow-md)',
                overflow: 'hidden',
                transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                position: 'relative',
                opacity: isSuspended ? 0.6 : 1,
                padding: 0,
                display: 'flex',
                flexDirection: 'column'
              }}
              onMouseEnter={(e) => {
                if(!isSuspended) e.currentTarget.style.transform = 'translateY(-4px)';
                if(!isSuspended) e.currentTarget.style.boxShadow = isAdmin ? '0 12px 40px rgba(212,175,55,0.15)' : '0 12px 30px rgba(0,0,0,0.2)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'none';
                e.currentTarget.style.boxShadow = isAdmin ? '0 8px 32px rgba(212,175,55,0.08)' : 'var(--shadow-md)';
              }}
              >
                {/* Luxury Status Bar */}
                <div style={{ 
                  height: '5px', 
                  background: isAdmin 
                    ? 'linear-gradient(90deg, var(--accent-color), #fff)' 
                    : isSuspended 
                      ? '#ef4444' 
                      : 'var(--text-muted)',
                  width: '100%'
                }} />

                <div style={{ padding: '1.5rem', flex: 1, display: 'flex', flexDirection: 'column' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.5rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '1.25rem' }}>
                      <div style={{ 
                        width: '56px', height: '56px', borderRadius: '16px', 
                        background: isAdmin ? 'linear-gradient(135deg, rgba(212, 175, 55, 0.2), rgba(212, 175, 55, 0.05))' : 'rgba(255,255,255,0.05)', 
                        border: `1px solid ${isAdmin ? 'rgba(212, 175, 55, 0.5)' : 'rgba(255,255,255,0.1)'}`,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        boxShadow: isAdmin ? 'inset 0 0 20px rgba(212,175,55,0.1)' : 'none'
                      }}>
                        {isAdmin ? <Shield size={28} color="var(--accent-color)" /> : <User size={28} color="var(--text-main)" />}
                      </div>
                      <div>
                        <h3 style={{ margin: '0 0 0.35rem 0', fontSize: '1.25rem', color: isSuspended ? 'var(--text-muted)' : 'var(--text-strong)', textDecoration: isSuspended ? 'line-through' : 'none', fontWeight: '700' }}>
                          {user.username}
                        </h3>
                        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
                          <span style={{ 
                            fontSize: '0.8rem', padding: '0.2rem 0.75rem', borderRadius: '50px', 
                            background: isAdmin ? 'var(--accent-color)' : 'rgba(255,255,255,0.05)',
                            color: isAdmin ? '#000' : 'var(--text-muted)',
                            border: isAdmin ? 'none' : '1px solid rgba(255,255,255,0.1)',
                            fontWeight: '600',
                            display: 'inline-flex', alignItems: 'center', gap: '0.25rem'
                          }}>
                            {isAdmin && <Shield size={12} />}
                            {t(`auth.${user.role}`) || user.role}
                          </span>
                          {isSuspended && (
                            <span style={{ fontSize: '0.75rem', color: '#ef4444', background: 'rgba(239, 68, 68, 0.1)', padding: '0.2rem 0.75rem', borderRadius: '50px', fontWeight: 'bold', border: '1px solid rgba(239,68,68,0.2)' }}>
                              {t('user_mgmt.suspended')}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>

                  <div style={{ marginTop: 'auto', paddingTop: '1.25rem', borderTop: '1px solid rgba(255,255,255,0.05)', display: 'flex', gap: '0.75rem' }}>
                    <button 
                      onClick={() => handleEdit(user)} 
                      className="btn" 
                      style={{ 
                        flex: 1, padding: '0.6rem', background: 'rgba(255,255,255,0.05)',
                        color: 'var(--text-main)', border: '1px solid rgba(255,255,255,0.1)',
                        display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '0.5rem',
                        fontSize: '0.9rem', borderRadius: '10px'
                      }}
                      onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.1)'}
                      onMouseLeave={e => e.currentTarget.style.background = 'rgba(255,255,255,0.05)'}
                    >
                      <Edit2 size={16} /> {t('user_mgmt.edit')}
                    </button>
                    
                    {user.username !== 'admin' && (
                      <>
                        <button 
                          onClick={() => handleToggleSuspend(user)} 
                          className="btn" 
                          style={{ 
                            padding: '0.6rem', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
                            color: isSuspended ? '#10b981' : '#f59e0b', borderRadius: '10px',
                            display: 'flex', justifyContent: 'center', alignItems: 'center'
                          }} 
                          title={isSuspended ? t('user_mgmt.activate_account') : t('user_mgmt.suspend_account')}
                          onMouseEnter={e => e.currentTarget.style.background = isSuspended ? 'rgba(16, 185, 129, 0.1)' : 'rgba(245, 158, 11, 0.1)'}
                          onMouseLeave={e => e.currentTarget.style.background = 'rgba(255,255,255,0.05)'}
                        >
                          {isSuspended ? <PlayCircle size={20} /> : <PauseCircle size={20} />}
                        </button>
                        
                        <button 
                          onClick={() => handleDelete(user.id)} 
                          className="btn" 
                          style={{ 
                            padding: '0.6rem', background: 'rgba(239, 68, 68, 0.05)', border: '1px solid rgba(239, 68, 68, 0.2)',
                            color: '#ef4444', borderRadius: '10px', display: 'flex', justifyContent: 'center', alignItems: 'center'
                          }} 
                          title={t('auth.delete_user')}
                          onMouseEnter={e => e.currentTarget.style.background = 'rgba(239, 68, 68, 0.15)'}
                          onMouseLeave={e => e.currentTarget.style.background = 'rgba(239, 68, 68, 0.05)'}
                        >
                          <Trash2 size={20} />
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

      {/* ─── MODAL OVERLAY (ADD/EDIT FORM) ─── */}
      {isModalOpen && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 100,
          background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(8px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: '1rem', animation: 'fadeIn 0.3s ease-out', overflowY: 'auto'
        }}>
          <div style={{
            background: 'var(--surface-color)', width: '100%', maxWidth: '850px',
            borderRadius: 'var(--radius-lg)', border: '1px solid rgba(255,255,255,0.1)',
            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
            display: 'flex', flexDirection: 'column', position: 'relative',
            maxHeight: '90vh'
          }}>
            
            {/* Modal Header */}
            <div style={{ 
              padding: '1.5rem 2rem', 
              borderBottom: '1px solid rgba(255,255,255,0.05)', 
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              background: 'rgba(255,255,255,0.02)'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                <div style={{ padding: '0.6rem', background: isEditing ? 'rgba(212, 175, 55, 0.1)' : 'rgba(255,255,255,0.05)', borderRadius: '12px', color: isEditing ? 'var(--accent-color)' : 'var(--text-main)' }}>
                  {isEditing ? <Edit2 size={24} /> : <UserPlus size={24} />}
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: '1.4rem', color: 'var(--text-strong)', fontWeight: '700' }}>
                    {isEditing ? t('user_mgmt.edit_user_title', { name: formData.username }) : t('user_mgmt.add_new_user')}
                  </h3>
                  <p style={{ margin: '0.2rem 0 0 0', fontSize: '0.9rem', color: 'var(--text-muted)' }}>
                    {isEditing ? t('user_mgmt.edit_mode_desc') : t('user_mgmt.add_new_user_desc')}
                  </p>
                </div>
              </div>
              <button onClick={() => setIsModalOpen(false)} style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '0.5rem', borderRadius: '50%', display: 'flex' }} onMouseEnter={e => e.currentTarget.style.background='rgba(255,255,255,0.05)'} onMouseLeave={e => e.currentTarget.style.background='transparent'}>
                <X size={24} />
              </button>
            </div>

            {/* Modal Body */}
            <div style={{ padding: '2rem', overflowY: 'auto', flex: 1 }}>
              <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
                
                {/* Basic Info Grid */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1.5rem' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    <label style={{ fontSize: '0.9rem', fontWeight: '600', color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <Fingerprint size={16} color="var(--accent-color)" /> {t('user_mgmt.username_label')}
                    </label>
                    <div style={{ position: 'relative' }}>
                      <input
                        type="text"
                        className="form-control"
                        style={{ paddingRight: '2.5rem', background: 'rgba(0,0,0,0.2)', height: '50px', fontSize: '1.05rem', border: '1px solid rgba(255,255,255,0.1)' }}
                        value={formData.username}
                        onChange={e => setFormData({...formData, username: e.target.value})}
                        placeholder={t('user_mgmt.username_placeholder')}
                        required
                      />
                      <User size={20} style={{ position: 'absolute', right: '1rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                    </div>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    <label style={{ fontSize: '0.9rem', fontWeight: '600', color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <Key size={16} color="var(--accent-color)" /> {t('user_mgmt.password_label')} {isEditing && <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 'normal' }}>{t('user_mgmt.password_hint')}</span>}
                    </label>
                    <div style={{ position: 'relative' }}>
                      <input
                        type="text"
                        className="form-control"
                        style={{ paddingRight: '2.5rem', background: 'rgba(0,0,0,0.2)', height: '50px', fontSize: '1.05rem', fontFamily: 'monospace', border: '1px solid rgba(255,255,255,0.1)' }}
                        value={formData.password}
                        onChange={e => setFormData({...formData, password: e.target.value})}
                        placeholder={isEditing ? '••••••••' : t('user_mgmt.password_placeholder')}
                        required={!isEditing}
                      />
                      <Lock size={20} style={{ position: 'absolute', right: '1rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                    </div>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    <label style={{ fontSize: '0.9rem', fontWeight: '600', color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <Shield size={16} color="var(--accent-color)" /> {t('user_mgmt.role_label')}
                    </label>
                    <div style={{ position: 'relative' }}>
                      <select 
                        className="form-control" 
                        style={{ background: 'rgba(0,0,0,0.2)', height: '50px', paddingRight: '2.5rem', appearance: 'none', cursor: 'pointer', fontSize: '1.05rem', border: '1px solid rgba(255,255,255,0.1)' }}
                        value={formData.role}
                        onChange={e => setFormData({...formData, role: e.target.value})}
                      >
                        {ROLES.map(r => <option key={r} value={r}>{t(`auth.${r}`) || r}</option>)}
                      </select>
                      <Settings size={20} style={{ position: 'absolute', right: '1rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', pointerEvents: 'none' }} />
                    </div>
                  </div>
                </div>

                {/* Permissions Area */}
                <div style={{ 
                  background: 'rgba(0,0,0,0.15)', 
                  borderRadius: 'var(--radius-lg)', 
                  border: '1px solid rgba(255,255,255,0.05)',
                  overflow: 'hidden'
                }}>
                  <div style={{ padding: '1.25rem 1.5rem', background: 'rgba(255,255,255,0.02)', borderBottom: '1px solid rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <ShieldAlert size={20} color="var(--accent-color)" />
                    <span style={{ fontWeight: '700', fontSize: '1.1rem', color: 'var(--text-strong)' }}>{t('user_mgmt.advanced_permissions')}</span>
                  </div>

                  {formData.role === 'admin' ? (
                    <div style={{ padding: '4rem 2rem', textAlign: 'center' }}>
                      <Shield size={64} color="var(--accent-color)" style={{ margin: '0 auto 1.5rem', opacity: 0.8, filter: 'drop-shadow(0 0 20px rgba(212,175,55,0.4))' }} />
                      <h4 style={{ color: 'var(--accent-color)', marginBottom: '0.5rem', fontSize: '1.4rem' }}>{t('user_mgmt.admin_perms_title')}</h4>
                      <p style={{ color: 'var(--text-muted)', fontSize: '1rem', maxWidth: '400px', margin: '0 auto' }}>
                        {t('user_mgmt.admin_perms_desc')}
                      </p>
                    </div>
                  ) : (
                    <div style={{ padding: '1rem', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(350px, 1fr))', gap: '1rem' }}>
                      {ALL_PAGES.map((page) => {
                        const perms = formData.permissions[page.id] || { view: false, add: false, edit: false, delete: false, export: false };
                        const isVisible = perms.view;
                        
                        return (
                          <div key={page.id} style={{
                            padding: '1.25rem',
                            borderRadius: '12px',
                            border: `1px solid ${isVisible ? 'rgba(212,175,55,0.3)' : 'rgba(255,255,255,0.05)'}`,
                            background: isVisible ? 'rgba(212,175,55,0.03)' : 'rgba(255,255,255,0.01)',
                            transition: 'all 0.3s ease',
                            position: 'relative'
                          }}>
                            {isVisible && <div style={{ position: 'absolute', right: 0, top: '15%', bottom: '15%', width: '4px', background: 'var(--accent-color)', borderRadius: '4px 0 0 4px' }} />}
                            
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                <span style={{ fontSize: '1.4rem', filter: isVisible ? 'none' : 'grayscale(1)' }}>{page.icon}</span>
                                <span style={{ fontWeight: '700', color: isVisible ? 'var(--text-strong)' : 'var(--text-muted)', fontSize: '1.05rem' }}>
                                  {t(page.nameKey)}
                                </span>
                              </div>
                              
                              <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer', gap: '0.5rem' }}>
                                <div style={{ 
                                  width: '46px', height: '24px', borderRadius: '24px', 
                                  background: isVisible ? 'var(--accent-color)' : 'rgba(255,255,255,0.1)',
                                  position: 'relative', transition: 'all 0.3s',
                                  boxShadow: isVisible ? '0 0 10px rgba(212,175,55,0.3)' : 'inset 0 2px 4px rgba(0,0,0,0.2)'
                                }}>
                                  <div style={{
                                    width: '20px', height: '20px', borderRadius: '50%', background: '#fff',
                                    position: 'absolute', top: '2px', left: isVisible ? '24px' : '2px',
                                    transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)', boxShadow: '0 2px 4px rgba(0,0,0,0.2)'
                                  }} />
                                </div>
                                <input type="checkbox" checked={isVisible} onChange={() => togglePermission(page.id, 'view')} style={{ display: 'none' }} />
                              </label>
                            </div>

                            <div style={{ 
                              display: 'flex', gap: '0.5rem', flexWrap: 'wrap',
                              opacity: isVisible ? 1 : 0.3,
                              pointerEvents: isVisible ? 'auto' : 'none',
                              transition: 'opacity 0.3s',
                              background: 'rgba(0,0,0,0.2)', padding: '0.75rem', borderRadius: '10px'
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

              </form>
            </div>

            {/* Modal Footer */}
            <div style={{ 
              padding: '1.5rem 2rem', 
              borderTop: '1px solid rgba(255,255,255,0.05)', 
              display: 'flex', gap: '1rem', justifyContent: 'flex-end',
              background: 'rgba(255,255,255,0.02)'
            }}>
              <button type="button" onClick={() => setIsModalOpen(false)} className="btn btn-outline" style={{ height: '50px', padding: '0 2rem', fontSize: '1.05rem', borderRadius: '12px' }}>
                {t('auth.cancel')}
              </button>
              <button onClick={handleSave} type="submit" className="btn btn-accent" style={{ height: '50px', padding: '0 2rem', fontSize: '1.05rem', fontWeight: 'bold', borderRadius: '12px', minWidth: '180px' }}>
                {isEditing ? (
                  <><Save size={20} /> {t('user_mgmt.save_changes')}</>
                ) : (
                  <><CheckCircle size={20} /> {t('user_mgmt.create_account')}</>
                )}
              </button>
            </div>

          </div>
        </div>
      )}

    </div>
  );
};

export default UserManagement;