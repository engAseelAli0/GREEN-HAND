/* eslint-disable react-refresh/only-export-components */
import React, { createContext, useContext, useState, useEffect } from 'react';
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
  buyerMobile: '',
  buyerId: '',
  buyerCompany: '',
  productNumber: '',
  productName: '',
  productPrice: '',
  currency: '',
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

  useEffect(() => {
    const fetchLookups = async () => {
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
    fetchLookups();
  }, []);

  const [currentOrder, setCurrentOrder] = useState(defaultOrderState);

  const updateLookup = async (category, newData) => {
    const newLookupsObj = { ...lookups, [category]: newData };
    setLookups(newLookupsObj);
    
    try {
       await supabase
        .from('lookup_settings')
        .upsert({ id: 1, config: newLookupsObj });
    } catch (err) {
       console.error("Error saving lookups to supabase:", err);
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
