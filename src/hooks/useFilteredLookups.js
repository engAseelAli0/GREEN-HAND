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

  const filterList = (list, allowedList) => {
    // If no specific restrictions, return all
    if (!allowedList || allowedList.length === 0) return list;
    
    return list.filter(item => {
      const name = typeof item === 'object' ? item.name : item;
      return allowedList.includes(name);
    });
  };

  return {
    ...lookups,
    factories: filterList(lookups.factories || [], allowedFactories),
    companies: filterList(lookups.companies || [], allowedCompanies),
  };
};
