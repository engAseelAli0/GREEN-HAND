/* eslint-disable react-refresh/only-export-components */
import React, { createContext, useContext, useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import toast from 'react-hot-toast';
import { useTranslation } from 'react-i18next';

const AuthContext = createContext();

const deepEqual = (obj1, obj2) => {
  if (obj1 === obj2) return true;
  if (typeof obj1 !== 'object' || obj1 === null || typeof obj2 !== 'object' || obj2 === null) {
    return false;
  }
  if (Array.isArray(obj1) && Array.isArray(obj2)) {
    if (obj1.length !== obj2.length) return false;
    const sorted1 = [...obj1].sort();
    const sorted2 = [...obj2].sort();
    return sorted1.every((val, index) => val === sorted2[index]);
  }
  const keys1 = Object.keys(obj1);
  const keys2 = Object.keys(obj2);
  if (keys1.length !== keys2.length) return false;
  for (const key of keys1) {
    if (!keys2.includes(key) || !deepEqual(obj1[key], obj2[key])) return false;
  }
  return true;
};

export const AuthProvider = ({ children }) => {
  const { t } = useTranslation();
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [mfaPending, setMfaPending] = useState(false);
  const [mfaFactors, setMfaFactors] = useState([]);

  const checkMfaAssurance = async () => {
    try {
      const { data: aalData, error: aalError } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
      if (aalError) throw aalError;
      
      if (aalData.nextLevel === 'aal2' && aalData.currentLevel === 'aal1') {
        setMfaPending(true);
        // Fetch active factors that can be used for verification challenge
        const { data: factorsData, error: factorsError } = await supabase.auth.mfa.listFactors();
        if (!factorsError && factorsData?.all) {
          const verifiedFactors = factorsData.all.filter(f => f.status === 'verified');
          setMfaFactors(verifiedFactors);
        } else {
          setMfaFactors([]);
        }
      } else {
        setMfaPending(false);
        setMfaFactors([]);
      }
    } catch (err) {
      console.error('Error checking MFA level:', err);
    }
  };

  const fetchUserPermissions = async (authSessionUser) => {
    try {
      if (!authSessionUser) {
        setUser(null);
        setLoading(false);
        return null;
      }

      const username = authSessionUser.user_metadata?.username || authSessionUser.email.replace('@greenhand.local', '');

      const { data, error } = await supabase
        .from('system_users')
        .select('id, username, role, allowed_pages, permissions')
        .eq('username', username)
        .single();

      let userObj;
      if (error || !data) {
        console.warn('Could not fetch system_users record:', error);
        
        // PGRST116 is the PostgREST code for "The query returned 0 rows".
        // If the error is not PGRST116, it is likely a transient network error,
        // so we should not sign the user out. Instead, we allow them to fall back to session metadata.
        const isUserNotFound = error && error.code === 'PGRST116';

        if (isUserNotFound && username !== 'admin' && authSessionUser.user_metadata?.role !== 'admin') {
          console.error('User was deleted from system_users. Denying access.');
          await supabase.auth.signOut();
          setUser(null);
          setLoading(false);
          return null;
        }
        
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

        // Sync auth user_metadata if it is empty or out-of-sync
        const meta = authSessionUser.user_metadata || {};
        const needsSync = !meta.username || 
                          meta.role !== data.role || 
                          !deepEqual(meta.permissions, data.permissions) ||
                          !deepEqual(meta.allowed_pages, data.allowed_pages);
        
        if (needsSync) {
          console.log('Syncing user_metadata to Supabase Auth...');
          supabase.auth.updateUser({
            data: {
              username: data.username,
              role: data.role,
              allowed_pages: data.allowed_pages || [],
              permissions: data.permissions || {}
            }
          }).then(() => {
            console.log('User metadata synced successfully. Refreshing session...');
            supabase.auth.refreshSession();
          }).catch(err => {
            console.error('Failed to sync auth user_metadata:', err);
          });
        }
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
    setLoading(true);
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        fetchUserPermissions(session.user);
        checkMfaAssurance();
      } else {
        setLoading(false);
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        fetchUserPermissions(session.user);
        checkMfaAssurance();
      } else {
        setUser(null);
        setMfaPending(false);
        setMfaFactors([]);
        setLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const login = async (username, password) => {
    try {
      setLoading(true);
      
      let email = `${username}@greenhand.local`;
      if (username !== 'admin') {
        const { data: userCheck, error: userCheckError } = await supabase
          .rpc('get_user_prelogin_info', { lookup_username: username })
          .single();
          
        if (userCheckError || !userCheck) {
          toast.error(t('auth.messages.user_not_found'));
          setLoading(false);
          return false;
        }
        
        if (userCheck.permissions && userCheck.permissions.__is_suspended) {
          toast.error(t('auth.messages.account_suspended'));
          setLoading(false);
          return false;
        }
        
        if (userCheck.permissions && userCheck.permissions.__auth_email) {
          email = userCheck.permissions.__auth_email;
        }
      }

      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        console.error('Supabase Auth error:', error);
        if (error.message === 'Invalid login credentials') {
          toast.error(t('auth.messages.wrong_password'));
        } else {
          toast.error(error.message);
        }
        setLoading(false);
        return false;
      }
      
      const userObj = await fetchUserPermissions(data.user);
      if (!userObj) {
        toast.error(t('auth.messages.account_deleted_suspended'));
        return false;
      }

      // Explicitly check for MFA challenge right after signing in
      await checkMfaAssurance();
      
      return true;
    } catch (err) {
      console.error('Login error:', err);
      toast.error(t('auth.messages.login_error'));
      setLoading(false);
      return false;
    }
  };

  const logout = async () => {
    try {
      await supabase.auth.signOut();
      setUser(null);
      setMfaPending(false);
      setMfaFactors([]);
    } catch (err) {
      console.error('Logout error:', err);
    }
  };

  const enrollMfa = async () => {
    return await supabase.auth.mfa.enroll({
      factorType: 'totp',
      issuer: 'GreenHand'
    });
  };

  const verifyAndActivateMfa = async (factorId, code) => {
    const { data: challengeData, error: challengeError } = await supabase.auth.mfa.challenge({
      factorId
    });
    if (challengeError) throw challengeError;

    const { data, error } = await supabase.auth.mfa.verify({
      factorId,
      challengeId: challengeData.id,
      code
    });
    if (error) throw error;

    // Refresh session to transition the token to AAL2
    await supabase.auth.refreshSession();

    await checkMfaAssurance();
    return data;
  };

  const challengeAndVerifyMfa = async (factorId, code) => {
    const { data: challengeData, error: challengeError } = await supabase.auth.mfa.challenge({
      factorId
    });
    if (challengeError) throw challengeError;

    const { data, error } = await supabase.auth.mfa.verify({
      factorId,
      challengeId: challengeData.id,
      code
    });
    if (error) throw error;

    // Refresh session to load the updated JWT token with AAL2 claim
    await supabase.auth.refreshSession();

    // Explicitly clear pending state as the code verification was successful
    setMfaPending(false);

    // Synchronize authentication assurance levels and factors
    await checkMfaAssurance();
    
    return data;
  };

  const unenrollMfa = async (factorId) => {
    const { data, error } = await supabase.auth.mfa.unenroll({
      factorId
    });
    if (error) throw error;
    setMfaPending(false);
    setMfaFactors([]);
    return data;
  };

  const hasAccess = (path) => {
    if (!user) return false;
    if (user.role === 'admin') return true;
    if (path === '/') return true;
    
    const normalizedPath = path.startsWith('/') ? path.substring(1) : path;
    
    if (user.permissions && user.permissions[normalizedPath] && user.permissions[normalizedPath].view) {
      return true;
    }
    
    return user.allowed_pages?.includes(normalizedPath);
  };

  const hasPermission = (page, action) => {
    if (!user) return false;
    if (user.role === 'admin') return true;
    
    if (user.permissions && user.permissions[page]) {
      return !!user.permissions[page][action];
    }
    
    if (action === 'view' && user.allowed_pages?.includes(page)) {
      return true;
    }
    
    return false;
  };

  return (
    <AuthContext.Provider value={{
      user,
      loading,
      login,
      logout,
      hasAccess,
      hasPermission,
      mfaPending,
      mfaFactors,
      enrollMfa,
      verifyAndActivateMfa,
      challengeAndVerifyMfa,
      unenrollMfa
    }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
