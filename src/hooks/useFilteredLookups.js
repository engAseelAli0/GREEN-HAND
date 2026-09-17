import { useAppData } from '../context/AppDataContext';
import { useAuth } from '../context/AuthContext';

export const useFilteredLookups = () => {
  const { lookups } = useAppData();
  const { user } = useAuth();

  // Admin or user not loaded: return full lookups
  if (!user || user.role === 'admin') {
    return lookups;
  }

  const allowedFactories = user.permissions?.allowed_factories || [];
  const allowedCompanies = user.permissions?.allowed_companies || [];

  const filterCompanies = (list, allowedList) => {
    if (!allowedList || allowedList.length === 0) return list || [];
    const normAllowed = allowedList.map(c => String(c).trim().toLowerCase());
    return (list || []).filter(item => {
      const name = typeof item === 'object' ? (item.name || '') : String(item || '');
      return normAllowed.includes(name.trim().toLowerCase());
    });
  };

  const filterFactories = (list, allowedFact, allowedComp) => {
    const hasAllowedFactories = Array.isArray(allowedFact) && allowedFact.length > 0;
    const hasAllowedCompanies = Array.isArray(allowedComp) && allowedComp.length > 0;

    // If no restrictions, return all
    if (!hasAllowedFactories && !hasAllowedCompanies) return list || [];

    const normAllowedFactories = hasAllowedFactories ? allowedFact.map(f => String(f).trim().toLowerCase()) : [];
    const normAllowedCompanies = hasAllowedCompanies ? allowedComp.map(c => String(c).trim().toLowerCase()) : [];

    return (list || []).filter(item => {
      const name = typeof item === 'object' ? (item.name || '') : String(item || '');
      const normName = name.trim().toLowerCase();
      const company = typeof item === 'object' ? (item.company || '') : '';
      const normCompany = company.trim().toLowerCase();

      // 1. Explicitly allowed in user's allowed_factories
      if (hasAllowedFactories && normAllowedFactories.includes(normName)) {
        return true;
      }

      // 2. Inherited automatically from user's allowed_companies
      if (hasAllowedCompanies && normCompany && normAllowedCompanies.includes(normCompany)) {
        return true;
      }

      return false;
    });
  };

  return {
    ...lookups,
    factories: filterFactories(lookups.factories || [], allowedFactories, allowedCompanies),
    companies: filterCompanies(lookups.companies || [], allowedCompanies),
  };
};

