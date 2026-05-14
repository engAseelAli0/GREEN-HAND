/* eslint-disable react-refresh/only-export-components */
import React, { createContext, useContext, useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import toast from 'react-hot-toast';
import { useTranslation } from 'react-i18next';

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  useTranslation();
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchUserPermissions = async (authSessionUser) => {
    try {
      if (!authSessionUser) {
        setUser(null);
        setLoading(false);
        return null; // Return value for sync usage
      }

      // Use user_metadata.username if available, otherwise fallback to parsing email
      const username = authSessionUser.user_metadata?.username || authSessionUser.email.replace('@greenhand.local', '');

      // Fetch role and pages from system_users
      const { data, error } = await supabase
        .from('system_users')
        .select('id, username, role, allowed_pages, permissions')
        .eq('username', username)
        .single();

      let userObj;
      if (error || !data) {
        console.warn('Could not fetch system_users record:', error);
        // If user is not in system_users and is not admin, they were probably deleted! Deny access.
        if (username !== 'admin' && authSessionUser.user_metadata?.role !== 'admin') {
          console.error('User was deleted from system_users. Denying access.');
          await supabase.auth.signOut();
          setUser(null);
          setLoading(false);
          return null;
        }
        
        // Fallback for Master Admin created from Supabase dashboard directly
        userObj = {
          id: authSessionUser.id,
          username: username,
          role: authSessionUser.user_metadata?.role || 'guest',
          allowed_pages: authSessionUser.user_metadata?.allowed_pages || [],
          permissions: authSessionUser.user_metadata?.permissions || {}
        };
      } else {
        userObj = {
          id: authSessionUser.id,
          username: data.username,
          role: data.role,
          allowed_pages: data.allowed_pages || [],
          permissions: data.permissions || {}
        };
      }
      
      setUser(userObj);
      return userObj;
    } catch (err) {
      console.error('Error fetching permissions:', err);
      return null;
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // 1. Initial Session Check
    setLoading(true);
    supabase.auth.getSession().then(({ data: { session } }) => {
      fetchUserPermissions(session?.user);
    });

    // 2. Listen for Auth Changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        fetchUserPermissions(session.user);
      } else {
        setUser(null);
        setLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const login = async (username, password) => {
    try {
      setLoading(true);
      
      // 1. First, check if the user exists in our system_users table
      // We skip this check for 'admin' because the master admin might not be in the table yet
      let email = `${username}@greenhand.local`;
      if (username !== 'admin') {
        const { data: userCheck, error: userCheckError } = await supabase
          .from('system_users')
          .select('id, permissions')
          .eq('username', username)
          .single();
          
        if (userCheckError || !userCheck) {
          toast.error("هذا اليوزر غير موجود");
          setLoading(false);
          return false;
        }
        
        if (userCheck.permissions && userCheck.permissions.__is_suspended) {
          toast.error("هذا الحساب موقوف يرجى التواصل بالادارة");
          setLoading(false);
          return false;
        }
        
        if (userCheck.permissions && userCheck.permissions.__auth_email) {
          email = userCheck.permissions.__auth_email;
        }
      }

      // 2. Try to authenticate with Supabase Auth
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        console.error('Supabase Auth error:', error);
        // Since we already know the user exists, an "Invalid login credentials" means the password is wrong
        if (error.message === 'Invalid login credentials') {
          toast.error("كلمة السر غير صحيحة");
        } else {
          toast.error(error.message);
        }
        setLoading(false);
        return false;
      }
      
      // Manually fetch permissions before resolving so routing works properly
      const userObj = await fetchUserPermissions(data.user);
      
      // If userObj is null, it means they were deleted/suspended (handled in fetchUserPermissions)
      if (!userObj) {
        toast.error("هذا الحساب محذوف أو موقف!");
        return false;
      }
      
      return true;
    } catch (err) {
      console.error('Login error:', err);
      toast.error("حدث خطأ أثناء محاولة تسجيل الدخول");
      setLoading(false);
      return false;
    }
  };

  const logout = async () => {
    try {
      await supabase.auth.signOut();
      setUser(null);
    } catch (err) {
      console.error('Logout error:', err);
    }
  };

  // Helper function to check if the user has access to a specific path
  const hasAccess = (path) => {
    if (!user) return false;
    // Admin has access to everything
    if (user.role === 'admin') return true;
    
    // Check if path matches exactly or is root
    if (path === '/') return true; // Home is accessible to all logged in
    
    // Trim starting slash for comparison if needed
    const normalizedPath = path.startsWith('/') ? path.substring(1) : path;
    
    // New permissions logic
    if (user.permissions && user.permissions[normalizedPath] && user.permissions[normalizedPath].view) {
      return true;
    }
    
    // Fallback to old allowed_pages logic
    return user.allowed_pages?.includes(normalizedPath);
  };

  // Helper function to check specific granular permissions
  const hasPermission = (page, action) => {
    if (!user) return false;
    if (user.role === 'admin') return true;
    
    if (user.permissions && user.permissions[page]) {
      return !!user.permissions[page][action];
    }
    
    // If no explicit permissions object exists yet, but they have page access via old method,
    // we assume they have view access, but block destructive actions (edit, delete, add)
    if (action === 'view' && user.allowed_pages?.includes(page)) {
      return true;
    }
    
    return false;
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, hasAccess, hasPermission }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
