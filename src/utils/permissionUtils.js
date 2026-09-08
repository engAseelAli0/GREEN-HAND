/**
 * Permission Utilities for Scoped Data Access (Factories & Companies)
 * Ensures strict and safe data isolation between factory users and internal staff.
 */

/**
 * Checks if a factory identifier (name or code) is allowed for a user.
 * 
 * @param {string} factoryIdentifier - Factory name or code from order data
 * @param {Array<string>} allowedFactories - Array of factory names/codes permitted for user
 * @param {Array<Object|string>} factoriesLookup - Global factories list from lookups
 * @returns {boolean}
 */
export const isFactoryAllowed = (factoryIdentifier, allowedFactories = [], factoriesLookup = []) => {
  // If user has no factory restrictions, allow access to all
  if (!allowedFactories || allowedFactories.length === 0) return true;
  
  // If user is restricted but order has no factory, deny
  if (!factoryIdentifier) return false;

  const target = String(factoryIdentifier).trim().toLowerCase();

  // 1. Direct match with allowedFactories array
  const directMatch = allowedFactories.some(af => {
    if (!af) return false;
    const afStr = String(af).trim().toLowerCase();
    return afStr === target;
  });
  if (directMatch) return true;

  // 2. Lookup-based matching (handles matching factory code <-> factory name)
  if (Array.isArray(factoriesLookup) && factoriesLookup.length > 0) {
    // Find the factory object in lookups that corresponds to target
    const factoryObj = factoriesLookup.find(f => {
      if (!f) return false;
      const fName = String(typeof f === 'object' ? (f.name || '') : f).trim().toLowerCase();
      const fCode = String(typeof f === 'object' ? (f.code || '') : '').trim().toLowerCase();
      const fId = String(typeof f === 'object' ? (f.id || '') : '').trim().toLowerCase();
      return fName === target || fCode === target || fId === target;
    });

    if (factoryObj) {
      const objName = String(typeof factoryObj === 'object' ? (factoryObj.name || '') : factoryObj).trim().toLowerCase();
      const objCode = String(typeof factoryObj === 'object' ? (factoryObj.code || '') : '').trim().toLowerCase();

      // Check if any allowedFactory matches the lookup factory's name or code
      const lookupMatch = allowedFactories.some(af => {
        if (!af) return false;
        const afStr = String(af).trim().toLowerCase();
        return (objName && afStr === objName) || (objCode && afStr === objCode);
      });
      if (lookupMatch) return true;
    }

    // Reverse check: find lookup entries for allowed factories and compare
    for (const af of allowedFactories) {
      if (!af) continue;
      const afStr = String(af).trim().toLowerCase();
      const afObj = factoriesLookup.find(f => {
        if (!f) return false;
        const fName = String(typeof f === 'object' ? (f.name || '') : f).trim().toLowerCase();
        const fCode = String(typeof f === 'object' ? (f.code || '') : '').trim().toLowerCase();
        return fName === afStr || fCode === afStr;
      });
      if (afObj) {
        const afObjName = String(typeof afObj === 'object' ? (afObj.name || '') : afObj).trim().toLowerCase();
        const afObjCode = String(typeof afObj === 'object' ? (afObj.code || '') : '').trim().toLowerCase();
        if (target === afObjName || (afObjCode && target === afObjCode)) {
          return true;
        }
      }
    }
  }

  return false;
};

/**
 * Checks if a company identifier is allowed for a user.
 * 
 * @param {string} companyIdentifier - Company name from order data
 * @param {Array<string>} allowedCompanies - Array of companies permitted for user
 * @returns {boolean}
 */
export const isCompanyAllowed = (companyIdentifier, allowedCompanies = []) => {
  // If user has no company restrictions, allow access to all
  if (!allowedCompanies || allowedCompanies.length === 0) return true;
  if (!companyIdentifier) return false;

  const target = String(companyIdentifier).trim().toLowerCase();
  return allowedCompanies.some(ac => {
    if (!ac) return false;
    return String(ac).trim().toLowerCase() === target;
  });
};

/**
 * Comprehensive check whether an order is accessible by a given user.
 * 
 * @param {Object} order - Order object containing serial_number and order_data
 * @param {Object} user - User object from AuthContext
 * @param {Array<Object|string>} factoriesLookup - Global factories list from lookups
 * @returns {boolean}
 */
export const isOrderAllowedForUser = (order, user, factoriesLookup = []) => {
  // Admins always have full access
  if (!user || user.role === 'admin') return true;

  const allowedFactories = user.permissions?.allowed_factories || [];
  const allowedCompanies = user.permissions?.allowed_companies || [];

  // If user has no scoped restrictions, allow access
  if (allowedFactories.length === 0 && allowedCompanies.length === 0) {
    return true;
  }

  const orderData = order?.order_data || order || {};
  const orderFactory = orderData.factoryId || orderData.factory;
  const orderCompany = orderData.buyerCompany || orderData.company;

  if (allowedFactories.length > 0) {
    if (!isFactoryAllowed(orderFactory, allowedFactories, factoriesLookup)) {
      return false;
    }
  }

  if (allowedCompanies.length > 0) {
    if (!isCompanyAllowed(orderCompany, allowedCompanies)) {
      return false;
    }
  }

  return true;
};

/**
 * Filter an array of orders based on user's factory and company permissions.
 * 
 * @param {Array<Object>} orders - List of order records
 * @param {Object} user - User object from AuthContext
 * @param {Array<Object|string>} factoriesLookup - Global factories list from lookups
 * @returns {Array<Object>}
 */
export const filterOrdersForUser = (orders, user, factoriesLookup = []) => {
  if (!Array.isArray(orders)) return [];
  if (!user || user.role === 'admin') return orders;
  return orders.filter(o => isOrderAllowedForUser(o, user, factoriesLookup));
};

/**
 * Fetches available serial numbers from Supabase filtered by user permissions.
 * Prevents unauthorized model numbers from appearing in F9 search dropdowns.
 * 
 * @param {Object} supabaseClient - The Supabase client instance
 * @param {Object} user - User object from AuthContext
 * @param {Array<Object|string>} factoriesLookup - Global factories list from lookups
 * @param {number} limit - Max orders to fetch (default 2000)
 * @returns {Promise<Array<string>>}
 */
export const fetchAllowedSerials = async (supabaseClient, user, factoriesLookup = [], limit = 2000) => {
  const allowedFactories = user?.permissions?.allowed_factories || [];
  const allowedCompanies = user?.permissions?.allowed_companies || [];
  const isRestricted = user && user.role !== 'admin' && (allowedFactories.length > 0 || allowedCompanies.length > 0);

  if (!isRestricted) {
    const { data, error } = await supabaseClient
      .from('orders')
      .select('serial_number')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error || !data) return [];
    return data.map(d => d.serial_number);
  }

  // If restricted, fetch order_data to accurately check permissions
  const { data, error } = await supabaseClient
    .from('orders')
    .select('serial_number, order_data')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error || !data) return [];

  const allowedOrders = data.filter(d => isOrderAllowedForUser(d, user, factoriesLookup));
  return allowedOrders.map(d => d.serial_number);
};

/**
 * Resolves a factory identifier into clean code, name, and display label.
 * Avoids dangling hyphens like "LING - ".
 * 
 * @param {string} factoryIdentifier - Factory code or name
 * @param {Array<Object|string>} factoriesLookup - Lookups factories array
 * @returns {{ code: string, name: string, label: string }}
 */
export const resolveFactoryDisplay = (factoryIdentifier, factoriesLookup = []) => {
  if (!factoryIdentifier) {
    return { code: '', name: '', label: '' };
  }

  const str = String(factoryIdentifier).trim();

  if (Array.isArray(factoriesLookup) && factoriesLookup.length > 0) {
    const target = str.toLowerCase();
    const match = factoriesLookup.find(f => {
      if (!f) return false;
      const fName = String(typeof f === 'object' ? (f.name || '') : f).trim().toLowerCase();
      const fCode = String(typeof f === 'object' ? (f.code || '') : '').trim().toLowerCase();
      return fName === target || fCode === target;
    });

    if (match && typeof match === 'object') {
      const code = match.code ? String(match.code).trim() : '';
      const name = match.name ? String(match.name).trim() : str;
      const label = code && name && code !== name ? `${code} - ${name}` : (name || code || str);
      return { code, name, label };
    }
  }

  return { code: '', name: str, label: str };
};
