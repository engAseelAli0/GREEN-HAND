/* eslint-disable react-refresh/only-export-components */
import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import { supabase } from '../supabaseClient';

const AppDataContext = createContext();

// Empty initial data to rely completely on Supabase configuration
const initialLookups = {
  products: [],
  currencies: [],
  fabrics: [],
  materials: [],
  factories: [],
  colors: [],
  sizes: [],
  tradeMarks: [],
  cartonPackages: [],
  cartonSizes: [],
  plasticBagSizes: [],
  measurements: [],
  packagingConditionsList: [],
  componentParts: [],
  buyerCodes: [],
  companies: []
};

export const defaultOrderState = {
  serialNumber: '',
  barcode: '',
  buyerMobile: '82',
  buyerId: '',
  buyerCompany: '',
  productNumber: '',
  productName: '',
  productPrice: '',
  currency: '¥ RMB',
  totalQuantity: '',
  requestDate: new Date().toISOString().split('T')[0],
  deliveryDate: '',
  sizeFrom: '',
  sizeTo: '',
  productFabric: '',
  tradeMark: '',
  materials: [{ name: '', percentage: '' }],
  factoryId: '',
  cartonPackage: '',
  cartonQty: '',
  cartonSize: '',
  plasticBagSize: '',
  remarks: '',
  colorDistribution: {},
  groupedMeasurements: {},
  manualSizes: []
};

export const AppDataProvider = ({ children }) => {
  const [lookups, setLookups] = useState(initialLookups);
  const [, setIsLookupsLoading] = useState(true);
  const lastFetchedUserIdRef = useRef(null);

  useEffect(() => {
    const fetchLookups = async (userId) => {
      if (lastFetchedUserIdRef.current === userId && userId !== null) {
        return; // Already fetched for this user
      }
      lastFetchedUserIdRef.current = userId;

      try {
        const { data, error } = await supabase
          .from('lookup_settings')
          .select('config')
          .eq('id', 1)
          .single();

        if (error && error.code !== 'PGRST116') {
          console.error("Error fetching lookups:", error);
        }
        
        if (data && data.config) {
           const parsed = data.config;
           if (parsed.colors && typeof parsed.colors[0] === 'string') {
             parsed.colors = initialLookups.colors;
           }
           setLookups({ ...initialLookups, ...parsed });
        }
      } catch (err) {
        console.error("Fetch Exception:", err);
      } finally {
        setIsLookupsLoading(false);
      }
    };

    // Try to get initial session and fetch lookups if authenticated
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        fetchLookups(session.user.id);
      } else {
        setIsLookupsLoading(false);
      }
    });

    // Listen to authentication changes to load/clear data
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        fetchLookups(session.user.id);
      } else {
        lastFetchedUserIdRef.current = null;
        setLookups(initialLookups);
        setIsLookupsLoading(false);
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  const [currentOrder, setCurrentOrder] = useState(defaultOrderState);

  const updateLookup = async (category, newData) => {
    const previousLookups = lookups;
    const newLookupsObj = { ...lookups, [category]: newData };
    setLookups(newLookupsObj);
    
    try {
       const { error } = await supabase
        .from('lookup_settings')
        .upsert({ id: 1, config: newLookupsObj });
       if (error) {
         console.error("Error saving lookups to supabase:", error);
         setLookups(previousLookups);
         return { error };
       }
       return { error: null };
     } catch (err) {
       console.error("Error saving lookups to supabase:", err);
       setLookups(previousLookups);
       return { error: err };
     }
  };

  const updateOrder = (field, value) => {
    setCurrentOrder(prev => ({ ...prev, [field]: value }));
  };

  return (
    <AppDataContext.Provider value={{ lookups, updateLookup, currentOrder, updateOrder, setCurrentOrder }}>
      {children}
    </AppDataContext.Provider>
  );
};

export const useAppData = () => useContext(AppDataContext);
