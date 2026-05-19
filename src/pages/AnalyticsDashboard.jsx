import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '../supabaseClient';
import { useAppData } from '../context/AppDataContext';
import { useAuth } from '../context/AuthContext';
import { useTranslation } from 'react-i18next';
import { Trophy, Coins, Clock, Factory, TrendingUp, AlertTriangle, CheckCircle2, ShieldCheck, Activity, BarChart2, Calendar, FileText, ChevronLeft, ChevronRight, Filter, Brain, Zap, Sparkles } from 'lucide-react';
import { AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { buildOperationalIntelligence, analyzeOrder } from '../utils/orderIntelligence';
import { formatActivityTime } from '../utils/activityLog';
import { englishOnly } from '../utils/textUtils';
import toast from 'react-hot-toast';

const calculateTotalPiecesCount = (orderData) => {
  if (!orderData) return 0;
  const colorsDist = orderData.colorDistribution || {};
  let total = 0;
  Object.keys(colorsDist).forEach(color => {
    if (colorsDist[color] && typeof colorsDist[color] === 'object') {
      Object.values(colorsDist[color]).forEach(val => {
        total += (parseInt(val, 10) || 0);
      });
    }
  });
  return total;
};

const CircularProgress = ({ percent, color, size = 60, strokeWidth = 6, label }) => {
  const radius = (size - strokeWidth) / 2;
  const circumference = radius * 2 * Math.PI;
  const strokeDashoffset = circumference - (percent / 100) * circumference;

  return (
    <div style={{ position: 'relative', width: size, height: size, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke="rgba(255,255,255,0.06)"
          strokeWidth={strokeWidth}
          fill="transparent"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={color}
          strokeWidth={strokeWidth}
          fill="transparent"
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          strokeLinecap="round"
          style={{ transition: 'stroke-dashoffset 1s ease-in-out', filter: `drop-shadow(0 0 4px ${color}44)` }}
        />
      </svg>
      <div style={{ position: 'absolute', fontSize: '0.85rem', fontWeight: 'bold', color: 'var(--text-strong)' }}>
        {label !== undefined ? label : `${percent}%`}
      </div>
    </div>
  );
};

const CustomTooltip = ({ active, payload, label }) => {
  const { t } = useTranslation();
  if (active && payload && payload.length) {
    return (
      <div className="glass-panel" style={{ 
        backgroundColor: 'rgba(15, 23, 42, 0.95)', 
        backdropFilter: 'blur(12px)', 
        border: '1px solid rgba(255,255,255,0.15)', 
        borderRadius: '12px', 
        padding: '12px', 
        boxShadow: '0 10px 30px rgba(0,0,0,0.5)', 
        color: '#fff',
        zIndex: 9999
      }}>
        <div style={{ fontWeight: 'bold', fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '6px' }}>{label}</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <div>
            <span style={{ color: '#38bdf8', fontWeight: 'bold' }}>{t('analytics.total_value') || 'Value'}: </span>
            <span style={{ fontWeight: 'bold' }}>{parseFloat(payload[0].value).toLocaleString()} RMB</span>
          </div>
          {payload[0].payload.orders !== undefined && (
            <div style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.7)' }}>
              <span>{t('analytics.delayed_orders') || 'Orders'}: </span>
              <span>{payload[0].payload.orders}</span>
            </div>
          )}
        </div>
      </div>
    );
  }
  return null;
};

const FactoryTooltip = ({ active, payload, label }) => {
  const { t } = useTranslation();
  if (active && payload && payload.length) {
    const data = payload[0].payload;
    return (
      <div className="glass-panel" style={{ 
        backgroundColor: 'rgba(15, 23, 42, 0.95)', 
        backdropFilter: 'blur(12px)', 
        border: '1px solid rgba(255,255,255,0.15)', 
        borderRadius: '12px', 
        padding: '12px', 
        boxShadow: '0 10px 30px rgba(0,0,0,0.5)', 
        color: '#fff',
        zIndex: 9999
      }}>
        <div style={{ fontWeight: 'bold', fontSize: '0.9rem', color: 'var(--text-strong)', marginBottom: '8px' }}>{data.name}</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '0.85rem' }}>
          <div>
            <span style={{ color: '#34d399', fontWeight: 'bold' }}>{t('pcs') || 'Quantity'}: </span>
            <span style={{ fontWeight: 'bold' }}>{data.quantity.toLocaleString()}</span>
          </div>
          <div>
            <span style={{ color: 'var(--text-muted)' }}>{t('analytics.delayed_orders') || 'Orders'}: </span>
            <span>{data.orders} ({data.delayed} delayed)</span>
          </div>
        </div>
      </div>
    );
  }
  return null;
};

const COLORS = ['#d4af37', '#38bdf8', '#fb7185', '#34d399', '#a78bfa', '#fbbf24'];

const AnalyticsDashboard = () => {
  const { t } = useTranslation();
  const { lookups } = useAppData();
  const { user } = useAuth();
  const [orders, setOrders] = useState([]);
  const [receivings, setReceivings] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  // Pagination & Filter States
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedUser, setSelectedUser] = useState('all');
  const [activePredictiveTab, setActivePredictiveTab] = useState('delays');
  const rowsPerPage = 10;

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [{ data: oData }, { data: rData }] = await Promise.all([
          supabase.from('orders').select('*').order('created_at', { ascending: false }),
          supabase.from('receivings').select('*')
        ]);
        let validOrders = oData || [];
        
        if (user && user.role !== 'admin') {
          const allowedFactories = user.permissions?.allowed_factories || [];
          const allowedCompanies = user.permissions?.allowed_companies || [];
          
          if (allowedFactories.length > 0) {
            validOrders = validOrders.filter(o => allowedFactories.includes(o.order_data?.factoryId));
          }
          if (allowedCompanies.length > 0) {
            validOrders = validOrders.filter(o => allowedCompanies.includes(o.order_data?.buyerCompany));
          }
        }
        
        const validOrderSerials = new Set(validOrders.map(o => o.serial_number));
        const validReceivings = (rData || []).filter(r => validOrderSerials.has(r.serial_number));

        setOrders(validOrders);
        setReceivings(validReceivings);
      } catch (err) {
        console.error(err);
        toast.error(t('analytics.load_error'));
      } finally {
        setIsLoading(false);
      }
    };
    fetchData();
  }, []);

  const intelligence = useMemo(
    () => buildOperationalIntelligence(orders, receivings, lookups),
    [orders, receivings, lookups]
  );

  const { executiveDashboard, timelineData, chartData } = useMemo(() => {
    const receivingBySerial = new Map(receivings.map(item => [item.serial_number, item]));
    const factoryMap = new Map();
    const productMap = new Map();
    let totalValue = 0;
    let delayedOrders = 0;

    let allActivities = [];
    const monthlyDataMap = new Map();

    orders.forEach(order => {
      const data = order.order_data || {};
      const factoryName = data.factoryId || 'Unknown';
      const productName = englishOnly(data.productName) || data.productName || 'Unknown';
      const qty = calculateTotalPiecesCount(data) || parseInt(data.totalQuantity, 10) || 0;
      const value = qty * (parseFloat(data.productPrice) || 0);
      const insight = analyzeOrder(order, receivingBySerial.get(order.serial_number), lookups);
      const isDelayed = insight.stage === 'overdue';
      totalValue += value;
      if (isDelayed) delayedOrders += 1;

      // Factory Stats
      const factoryStats = factoryMap.get(factoryName) || {
        name: factoryName, orders: 0, quantity: 0, value: 0, delayed: 0, received: 0, health: 0,
      };
      factoryStats.orders += 1;
      factoryStats.quantity += qty;
      factoryStats.value += value;
      factoryStats.delayed += isDelayed ? 1 : 0;
      factoryStats.received += insight.stage === 'received' ? 1 : 0;
      factoryStats.health += insight.healthScore;
      factoryMap.set(factoryName, factoryStats);

      // Product Stats
      const productStats = productMap.get(productName) || { name: productName, orders: 0, quantity: 0, value: 0 };
      productStats.orders += 1;
      productStats.quantity += qty;
      productStats.value += value;
      productMap.set(productName, productStats);

      // Activities
      if (data.activityLog && Array.isArray(data.activityLog)) {
        data.activityLog.forEach(act => {
          allActivities.push({ ...act, serial: order.serial_number });
        });
      }

      // Chart Data
      const dateStr = data.requestDate || order.created_at?.split('T')[0];
      if (dateStr) {
        const day = dateStr.substring(0, 10);
        const curr = monthlyDataMap.get(day) || { name: day, orders: 0, value: 0, quantity: 0 };
        curr.orders += 1;
        curr.value += value;
        curr.quantity += qty;
        monthlyDataMap.set(day, curr);
      }
    });

    const factories = [...factoryMap.values()].map(item => ({
      ...item,
      avgHealth: item.orders ? Math.round(item.health / item.orders) : 0,
      delayRate: item.orders ? Math.round((item.delayed / item.orders) * 100) : 0,
      receiveRate: item.orders ? Math.round((item.received / item.orders) * 100) : 0,
    })).sort((a, b) => b.orders - a.orders);

    allActivities.sort((a, b) => new Date(b.at) - new Date(a.at));

    let sortedMonthly = [...monthlyDataMap.values()].sort((a, b) => a.name.localeCompare(b.name));

    // Robust padding for single-point charts
    if (sortedMonthly.length === 1) {
      const singleDay = sortedMonthly[0];
      const prevDate = new Date(singleDay.name);
      prevDate.setDate(prevDate.getDate() - 1);
      const prevStr = prevDate.toISOString().split('T')[0];

      const nextDate = new Date(singleDay.name);
      nextDate.setDate(nextDate.getDate() + 1);
      const nextStr = nextDate.toISOString().split('T')[0];

      sortedMonthly = [
        { name: prevStr, orders: 0, value: 0, quantity: 0 },
        singleDay,
        { name: nextStr, orders: 0, value: 0, quantity: 0 }
      ];
    } else if (sortedMonthly.length === 0) {
      const todayStr = new Date().toISOString().split('T')[0];
      sortedMonthly = [
        { name: todayStr, orders: 0, value: 0, quantity: 0 }
      ];
    }

    return {
      executiveDashboard: {
        totalValue,
        delayedOrders,
        factories,
        bestFactories: [...factories].sort((a, b) => b.avgHealth - a.avgHealth).slice(0, 5),
        delayedFactories: [...factories].filter(item => item.delayed > 0).sort((a, b) => b.delayed - a.delayed).slice(0, 5),
        topProducts: [...productMap.values()].sort((a, b) => b.quantity - a.quantity).slice(0, 6),
      },
      timelineData: allActivities, // Keep all activities for pagination
      chartData: sortedMonthly,
    };
  }, [orders, receivings, lookups]);

  const predictiveAnalysis = useMemo(() => {
    const recMap = new Map(receivings.map(r => [r.serial_number, r]));
    const factoryLeadTimes = {};

    // 1. Calculate historical baseline lead times
    orders.forEach(order => {
      const oData = order.order_data || {};
      const factory = oData.factoryId;
      if (!factory) return;

      const rec = recMap.get(order.serial_number);
      const isReceived = rec?.receive_data?.status === 'مستلمة' || rec?.receive_data?.status === 'Received' || rec?.receive_data?.status === 'تم الاستلام';
      if (isReceived) {
        const start = oData.requestDate ? new Date(oData.requestDate) : new Date(order.created_at);
        const receivedDateStr = rec.receive_data.receivedAt || order.created_at;
        const end = new Date(receivedDateStr);
        if (!isNaN(start.getTime()) && !isNaN(end.getTime())) {
          const leadDays = Math.ceil((end - start) / 86400000);
          if (leadDays > 0) {
            if (!factoryLeadTimes[factory]) {
              factoryLeadTimes[factory] = { totalDays: 0, count: 0 };
            }
            factoryLeadTimes[factory].totalDays += leadDays;
            factoryLeadTimes[factory].count += 1;
          }
        }
      }
    });

    Object.keys(factoryLeadTimes).forEach(fac => {
      const data = factoryLeadTimes[fac];
      data.avg = data.count > 0 ? Math.round(data.totalDays / data.count) : 15;
    });

    // 2. Perform delay forecasting & deviation analysis
    const delayPredictions = [];
    const wasteAlerts = [];

    orders.forEach(order => {
      const oData = order.order_data || {};
      const factory = oData.factoryId || 'undefined';
      const rec = recMap.get(order.serial_number);
      const isReceived = rec?.receive_data?.status === 'مستلمة' || rec?.receive_data?.status === 'Received' || rec?.receive_data?.status === 'تم الاستلام';

      if (!isReceived) {
        // Forecast delay probability
        const start = oData.requestDate ? new Date(oData.requestDate) : new Date(order.created_at);
        const delivery = oData.deliveryDate ? new Date(oData.deliveryDate) : null;
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const avgLead = factoryLeadTimes[factory]?.avg || 14;
        const elapsedDays = Math.ceil((today - start) / 86400000);
        const totalAllowedDays = delivery && !isNaN(delivery.getTime()) 
          ? Math.ceil((delivery - start) / 86400000) 
          : 20;
        const remainingDays = delivery && !isNaN(delivery.getTime())
          ? Math.ceil((delivery - today) / 86400000)
          : null;

        let delayProbability = 0;
        let reason = '';

        if (remainingDays !== null) {
          if (remainingDays < 0) {
            delayProbability = 99;
            reason = t('analytics.delay_reason_overdue', { days: Math.abs(remainingDays) });
          } else if (elapsedDays + avgLead > totalAllowedDays) {
            const overDays = (elapsedDays + avgLead) - totalAllowedDays;
            delayProbability = Math.min(95, Math.round(50 + (overDays * 12)));
            reason = t('analytics.delay_reason_standard_exceeded', { avgLead, overDays });
          } else {
            const safeMargin = totalAllowedDays - (elapsedDays + avgLead);
            delayProbability = Math.max(5, Math.round(30 - (safeMargin * 8)));
            reason = t('analytics.delay_reason_stable', { safeMargin });
          }
        } else {
          delayProbability = 25;
          reason = t('analytics.delay_reason_delivery_undefined', { avgLead });
        }

        delayPredictions.push({
          serial: order.serial_number,
          productName: oData.productName || 'unknown',
          factory,
          avgLead,
          elapsedDays,
          remainingDays,
          delayProbability,
          reason,
          qty: parseInt(oData.totalQuantity, 10) || 0
        });
      } else {
        // Calculate received shortage and waste deviation
        const expectedQty = parseInt(oData.totalQuantity, 10) || 0;
        let receivedQty = 0;
        
        if (rec.receive_data?.colors && Array.isArray(rec.receive_data.colors)) {
          receivedQty = rec.receive_data.colors.reduce((sum, col) => sum + (parseInt(col.quantity, 10) || 0), 0);
        }
        
        if (receivedQty === 0 && rec.receive_data?.packages && Array.isArray(rec.receive_data.packages)) {
          rec.receive_data.packages.forEach(p => {
            if (p.active) {
              const from = parseInt(p.fromCtn, 10) || 0;
              const to = parseInt(p.toCtn, 10) || 0;
              const units = parseInt(p.pcsPerCtn, 10) || 0;
              const mult = p.kind === 'Doz' ? 12 : 1;
              receivedQty += (to >= from && from > 0) ? ((to - from + 1) * units * mult) : 0;
            }
          });
        }

        if (expectedQty > 0 && receivedQty > 0) {
          const deviation = receivedQty - expectedQty;
          const deviationRate = parseFloat(((deviation / expectedQty) * 100).toFixed(1));
          
          if (deviation < 0) {
            const wastePercent = Math.abs(deviationRate);
            wasteAlerts.push({
              serial: order.serial_number,
              productName: oData.productName || 'unknown',
              factory,
              expectedQty,
              receivedQty,
              deviation,
              wastePercent,
              currency: oData.currency || 'RMB',
              price: parseFloat(oData.productPrice) || 0,
              financialLoss: parseFloat((Math.abs(deviation) * (parseFloat(oData.productPrice) || 0)).toFixed(2))
            });
          }
        }
      }
    });

    return {
      factoryLeadTimes,
      delayPredictions: delayPredictions.sort((a, b) => b.delayProbability - a.delayProbability),
      wasteAlerts: wasteAlerts.sort((a, b) => b.wastePercent - a.wastePercent)
    };
  }, [orders, receivings]);

  const allUsers = useMemo(() => {
    const users = new Set(timelineData.map(item => item.actor || 'system'));
    return ['all', ...users];
  }, [timelineData]);

  const filteredTimeline = useMemo(() => {
    return timelineData.filter(item => selectedUser === 'all' || (item.actor || 'system') === selectedUser);
  }, [timelineData, selectedUser]);

  const totalPages = Math.ceil(filteredTimeline.length / rowsPerPage);
  const currentTimelinePage = filteredTimeline.slice((currentPage - 1) * rowsPerPage, currentPage * rowsPerPage);

  useEffect(() => {
    setCurrentPage(1);
  }, [selectedUser]);


  if (isLoading) {
    return (
      <div style={{ padding: '2rem', display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '60vh' }}>
        <div style={{ color: 'var(--accent-color)', fontSize: '1.2rem' }}>{t('analytics.loading')}</div>
      </div>
    );
  }

  return (
    <div className="fade-in" style={{ padding: '0 1rem', paddingBottom: '3rem' }}>
      <div style={{ marginBottom: '2rem' }}>
        <h1 className="text-gradient" style={{ fontSize: '2.5rem', marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <TrendingUp size={40} color="var(--accent-color)" /> {t('analytics.title')}
        </h1>
        <p style={{ color: 'var(--text-muted)' }}>{t('analytics.subtitle')}</p>
      </div>

      {/* Top KPI Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1.5rem', marginBottom: '2rem' }}>
        
        {/* Card 1: Total Value with Sparkline */}
        <div className="glass-panel" style={{ 
          padding: '1.5rem', 
          borderRadius: '16px', 
          position: 'relative', 
          overflow: 'hidden', 
          display: 'flex', 
          flexDirection: 'column', 
          justifyContent: 'space-between', 
          minHeight: '140px', 
          border: '1px solid rgba(212,175,55,0.2)', 
          background: 'linear-gradient(135deg, rgba(212,175,55,0.03) 0%, rgba(255,255,255,0.02) 100%)',
          transition: 'all 0.3s ease-in-out' 
        }} onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-5px)'; e.currentTarget.style.boxShadow = '0 12px 30px rgba(212,175,55,0.1)'; }} onMouseLeave={e => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = 'none'; }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', zIndex: 2 }}>
            <div>
              <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>{t('analytics.total_value')}</div>
              <div style={{ color: 'var(--text-strong)', fontWeight: 900, fontSize: '1.8rem', marginTop: '0.3rem', fontFamily: 'Outfit, sans-serif', textShadow: '0 0 20px rgba(212,175,55,0.2)' }}>
                {executiveDashboard.totalValue.toLocaleString()}
              </div>
            </div>
            <div style={{ width: 42, height: 42, borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#d4af37', background: 'rgba(212,175,55,0.1)' }}>
              <Coins size={22} />
            </div>
          </div>
          <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: '50px', zIndex: 1, opacity: 0.7 }}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData}>
                <defs>
                  <linearGradient id="sparklineValue" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#d4af37" stopOpacity={0.4}/>
                    <stop offset="95%" stopColor="#d4af37" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <Area type="monotone" dataKey="value" stroke="#d4af37" strokeWidth={2} fillOpacity={1} fill="url(#sparklineValue)" isAnimationActive={true} animationDuration={1000} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Card 2: System Health with Circular Progress */}
        <div className="glass-panel" style={{ 
          padding: '1.5rem', 
          borderRadius: '16px', 
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'space-between', 
          minHeight: '140px', 
          border: '1px solid rgba(52,211,153,0.15)', 
          background: 'linear-gradient(135deg, rgba(52,211,153,0.03) 0%, rgba(255,255,255,0.02) 100%)',
          transition: 'all 0.3s ease' 
        }} onMouseEnter={e => e.currentTarget.style.transform = 'translateY(-5px)'} onMouseLeave={e => e.currentTarget.style.transform = 'none'}>
          <div>
            <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>{t('analytics.system_health')}</div>
            <div style={{ color: '#34d399', fontWeight: 800, fontSize: '1.3rem', marginTop: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <ShieldCheck size={18} /> {intelligence.avgHealth >= 90 ? t('analytics.status_excellent') : t('analytics.status_stable')}
            </div>
          </div>
          <CircularProgress percent={intelligence.avgHealth} color={intelligence.avgHealth >= 80 ? '#34d399' : '#fbbf24'} size={70} strokeWidth={6} />
        </div>

        {/* Card 3: Active Factories with Custom Indicator */}
        <div className="glass-panel" style={{ 
          padding: '1.5rem', 
          borderRadius: '16px', 
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'space-between', 
          minHeight: '140px', 
          border: '1px solid rgba(56,189,248,0.15)', 
          background: 'linear-gradient(135deg, rgba(56,189,248,0.03) 0%, rgba(255,255,255,0.02) 100%)',
          transition: 'all 0.3s ease' 
        }} onMouseEnter={e => e.currentTarget.style.transform = 'translateY(-5px)'} onMouseLeave={e => e.currentTarget.style.transform = 'none'}>
          <div>
            <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>{t('analytics.active_factories')}</div>
            <div style={{ color: '#38bdf8', fontWeight: 800, fontSize: '1.3rem', marginTop: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <Factory size={18} /> {t('analytics.status_operating')}
            </div>
          </div>
          <CircularProgress percent={100} color="#38bdf8" size={70} strokeWidth={6} label={executiveDashboard.factories.length.toString()} />
        </div>

        {/* Card 4: Delayed Orders with Circular Warn indicator */}
        <div className="glass-panel" style={{ 
          padding: '1.5rem', 
          borderRadius: '16px', 
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'space-between', 
          minHeight: '140px', 
          border: '1px solid rgba(251,113,133,0.15)', 
          background: 'linear-gradient(135deg, rgba(251,113,133,0.03) 0%, rgba(255,255,255,0.02) 100%)',
          transition: 'all 0.3s ease' 
        }} onMouseEnter={e => e.currentTarget.style.transform = 'translateY(-5px)'} onMouseLeave={e => e.currentTarget.style.transform = 'none'}>
          <div>
            <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>{t('analytics.delayed_orders')}</div>
            <div style={{ color: executiveDashboard.delayedOrders > 0 ? '#fb7185' : 'var(--text-strong)', fontWeight: 800, fontSize: '1.3rem', marginTop: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <Clock size={18} /> {executiveDashboard.delayedOrders > 0 ? t('analytics.status_action_required') : t('analytics.status_on_track')}
            </div>
          </div>
          <CircularProgress 
            percent={orders.length ? Math.round((executiveDashboard.delayedOrders / orders.length) * 100) : 0} 
            color="#fb7185" 
            size={70} 
            strokeWidth={6} 
            label={executiveDashboard.delayedOrders.toString()} 
          />
        </div>

      </div>

      {/* Charts Section */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))', gap: '1.5rem', marginBottom: '1.5rem' }}>
        
        {/* Area Chart: Orders Over Time */}
        <div className="glass-panel" style={{ padding: '1.5rem', borderRadius: '16px', border: '1px solid rgba(255,255,255,0.05)', position: 'relative' }}>
          <h3 style={{ margin: '0 0 0.5rem', color: 'var(--text-strong)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Calendar size={20} color="#38bdf8" /> {t('analytics.volume_trend')}
          </h3>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '1.5rem' }}>
            {t('analytics.volume_trend_desc')}
          </p>
          <div style={{ width: '100%', height: 300 }}>
            <ResponsiveContainer>
              <AreaChart key={chartData.length} data={chartData} margin={{ top: 20, right: 30, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorValue" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#38bdf8" stopOpacity={0.8}/>
                    <stop offset="95%" stopColor="#38bdf8" stopOpacity={0.05}/>
                  </linearGradient>
                  <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
                    <feDropShadow dx="0" dy="4" stdDeviation="6" floodColor="#38bdf8" floodOpacity="0.4"/>
                  </filter>
                </defs>
                <XAxis dataKey="name" stroke="var(--text-muted)" fontSize={12} tickMargin={10} axisLine={false} tickLine={false} />
                <YAxis stroke="var(--text-muted)" fontSize={12} axisLine={false} tickLine={false} />
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,0.05)" />
                <RechartsTooltip content={<CustomTooltip />} />
                <Area 
                  type="monotone" 
                  dataKey="value" 
                  stroke="#38bdf8" 
                  strokeWidth={4} 
                  fillOpacity={1} 
                  fill="url(#colorValue)" 
                  isAnimationActive={true}
                  animationDuration={1500} 
                  activeDot={{ r: 6, fill: '#fff', stroke: '#38bdf8', strokeWidth: 3, filter: 'url(#shadow)' }}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Bar Chart: Factory Performance */}
        <div className="glass-panel" style={{ padding: '1.5rem', borderRadius: '16px', border: '1px solid rgba(255,255,255,0.05)' }}>
          <h3 style={{ margin: '0 0 0.5rem', color: 'var(--text-strong)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <BarChart2 size={20} color="#34d399" /> {t('analytics.top_factories')}
          </h3>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '1.5rem' }}>
            {t('analytics.top_factories_desc')}
          </p>
          <div style={{ width: '100%', height: 300 }}>
            <ResponsiveContainer>
              <BarChart key={executiveDashboard.factories.length} data={executiveDashboard.factories.slice(0, 5)} margin={{ top: 20, right: 30, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="barGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#34d399" stopOpacity={1}/>
                    <stop offset="100%" stopColor="#10b981" stopOpacity={0.6}/>
                  </linearGradient>
                </defs>
                <XAxis dataKey="name" stroke="var(--text-muted)" fontSize={12} tickMargin={10} axisLine={false} tickLine={false} />
                <YAxis stroke="var(--text-muted)" fontSize={12} axisLine={false} tickLine={false} />
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,0.05)" />
                <RechartsTooltip content={<FactoryTooltip />} />
                <Bar 
                  dataKey="quantity" 
                  fill="url(#barGradient)" 
                  radius={[6, 6, 0, 0]} 
                  barSize={45} 
                  isAnimationActive={true}
                  animationDuration={1500} 
                  animationEasing="ease-out"
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

      </div>

      {/* 🧠 Predictive AI Operations Studio (Premium Upgrade) */}
      <div className="glass-panel" style={{ 
        padding: '1.75rem', 
        borderRadius: '16px', 
        border: '1px solid rgba(212,175,55,0.2)', 
        background: 'linear-gradient(135deg, rgba(20,20,20,0.85) 0%, rgba(30,30,30,0.8) 100%)', 
        boxShadow: '0 8px 32px rgba(0, 0, 0, 0.4)',
        backdropFilter: 'blur(12px)',
        marginBottom: '1.5rem',
        animation: 'fadeIn 0.5s ease-in-out'
      }}>
        {/* Header Block */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1.5rem', borderBottom: '1px solid rgba(255,255,255,0.08)', paddingBottom: '1.25rem', marginBottom: '1.5rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <div style={{ width: 44, height: 44, borderRadius: '12px', background: 'rgba(212,175,55,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#d4af37' }}>
              <Brain size={24} className="pulse-glow" />
            </div>
            <div>
              <h3 style={{ margin: 0, color: 'var(--text-strong)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                {t('analytics.predictive_title')} 
                <span style={{ fontSize: '0.75rem', color: '#d4af37', background: 'rgba(212,175,55,0.1)', padding: '2px 8px', borderRadius: '50px', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                  <Sparkles size={12} /> AI Predictive Engine
                </span>
              </h3>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', margin: '4px 0 0' }}>
                {t('analytics.predictive_subtitle')}
              </p>
            </div>
          </div>

          {/* Luxury Tab Switchers */}
          <div style={{ display: 'flex', background: 'rgba(255,255,255,0.04)', padding: '4px', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.06)' }}>
            <button 
              onClick={() => setActivePredictiveTab('delays')}
              style={{
                padding: '0.5rem 1.25rem',
                borderRadius: '8px',
                border: 'none',
                cursor: 'pointer',
                fontSize: '0.85rem',
                fontWeight: 'bold',
                transition: 'all 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
                background: activePredictiveTab === 'delays' ? '#d4af37' : 'transparent',
                color: activePredictiveTab === 'delays' ? '#000' : 'var(--text-muted)',
                boxShadow: activePredictiveTab === 'delays' ? '0 4px 12px rgba(212,175,55,0.2)' : 'none'
              }}
            >
              {t('analytics.tab_delays')} ({predictiveAnalysis.delayPredictions.length})
            </button>
            <button 
              onClick={() => setActivePredictiveTab('waste')}
              style={{
                padding: '0.5rem 1.25rem',
                borderRadius: '8px',
                border: 'none',
                cursor: 'pointer',
                fontSize: '0.85rem',
                fontWeight: 'bold',
                transition: 'all 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
                background: activePredictiveTab === 'waste' ? '#d4af37' : 'transparent',
                color: activePredictiveTab === 'waste' ? '#000' : 'var(--text-muted)',
                boxShadow: activePredictiveTab === 'waste' ? '0 4px 12px rgba(212,175,55,0.2)' : 'none'
              }}
            >
              {t('analytics.tab_waste')} ({predictiveAnalysis.wasteAlerts.length})
            </button>
          </div>
        </div>

        {/* Tab 1 Content: Delay Forecasts */}
        {activePredictiveTab === 'delays' && (
          <div className="fade-in">
            {predictiveAnalysis.delayPredictions.length === 0 ? (
              <div style={{ color: '#34d399', display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '1.5rem', background: 'rgba(52,211,153,0.06)', borderRadius: '12px', border: '1px solid rgba(52,211,153,0.1)' }}>
                <CheckCircle2 size={20} /> {t('analytics.no_delay_predictions')}
              </div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', minWidth: '900px', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.08)', color: 'var(--text-muted)', textAlign: 'start' }}>
                      <th style={{ padding: '0.85rem 1rem', fontWeight: 600 }}>{t('analytics.col_model_product')}</th>
                      <th style={{ padding: '0.85rem 1rem', fontWeight: 600 }}>{t('analytics.col_target_factory')}</th>
                      <th style={{ padding: '0.85rem 1rem', fontWeight: 600 }}>{t('analytics.col_actual_duration')}</th>
                      <th style={{ padding: '0.85rem 1rem', fontWeight: 600 }}>{t('analytics.col_remaining_days')}</th>
                      <th style={{ padding: '0.85rem 1rem', fontWeight: 600, width: '220px' }}>{t('analytics.col_delay_prob')}</th>
                      <th style={{ padding: '0.85rem 1rem', fontWeight: 600 }}>{t('analytics.col_recommendation')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {predictiveAnalysis.delayPredictions.map((pred, idx) => {
                      const isHigh = pred.delayProbability >= 70;
                      const isMed = pred.delayProbability >= 35 && pred.delayProbability < 70;
                      const riskColor = isHigh ? '#fb7185' : isMed ? '#fbbf24' : '#34d399';
                      
                      return (
                        <tr key={idx} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)', transition: 'background 0.2s' }} onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.02)'} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                          <td style={{ padding: '1rem' }}>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                              <span style={{ padding: '2px 8px', background: 'rgba(212,175,55,0.1)', color: 'var(--accent-color)', borderRadius: '6px', fontWeight: 'bold', width: 'fit-content', fontSize: '0.8rem' }}>
                                #{pred.serial}
                              </span>
                              <strong style={{ color: 'var(--text-strong)', marginTop: '4px', fontSize: '0.85rem' }}>
                                {pred.productName === 'unknown' ? t('analytics.unknown') : pred.productName}
                              </strong>
                            </div>
                          </td>
                          <td style={{ padding: '1rem', color: 'var(--text-main)', fontWeight: 600 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                              <Factory size={14} color="var(--text-muted)" />
                              {pred.factory === 'undefined' ? t('analytics.undefined') : pred.factory}
                            </div>
                          </td>
                          <td style={{ padding: '1rem', color: 'var(--text-main)' }}>
                            <strong style={{ color: '#38bdf8' }}>{pred.elapsedDays}</strong> {t('analytics.in_progress')}
                          </td>
                          <td style={{ padding: '1rem' }}>
                            {pred.remainingDays !== null ? (
                              pred.remainingDays < 0 ? (
                                <span style={{ color: '#fb7185', fontWeight: 'bold' }}>{t('analytics.overdue_by', { days: Math.abs(pred.remainingDays) })}</span>
                              ) : (
                                <span style={{ color: 'var(--text-strong)' }}>{t('analytics.remaining_days', { days: pred.remainingDays })}</span>
                              )
                            ) : (
                              <span style={{ color: 'var(--text-muted)' }}>{t('analytics.undefined')}</span>
                            )}
                          </td>
                          <td style={{ padding: '1rem' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                              {/* Custom horizontal progress meter */}
                              <div style={{ flex: 1, height: '6px', background: 'rgba(255,255,255,0.06)', borderRadius: '10px', overflow: 'hidden', position: 'relative' }}>
                                <div style={{ height: '100%', width: `${pred.delayProbability}%`, background: riskColor, borderRadius: '10px', transition: 'width 1s ease' }} />
                              </div>
                              <span style={{ color: riskColor, fontWeight: 'bold', minWidth: '40px', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                {isHigh && <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#fb7185', display: 'inline-block', transform: 'scale(1)', animation: 'ping 1s infinite' }} />}
                                {pred.delayProbability}%
                              </span>
                            </div>
                          </td>
                          <td style={{ padding: '1rem', color: 'var(--text-muted)', fontSize: '0.8rem', maxWidth: '300px', lineHeight: '1.4' }}>
                            <span style={{ display: 'block', color: isHigh ? '#ff8a9a' : isMed ? '#ffe08a' : '#a2ffd2', fontWeight: 500 }}>
                              {pred.reason}
                            </span>
                            {isHigh && (
                              <span style={{ display: 'block', marginTop: '4px', color: 'rgba(255,255,255,0.5)', fontSize: '0.75rem' }}>
                                {t('analytics.recommend_contact')}
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* Tab 2 Content: Waste & Material Shorts */}
        {activePredictiveTab === 'waste' && (
          <div className="fade-in">
            {predictiveAnalysis.wasteAlerts.length === 0 ? (
              <div style={{ color: '#34d399', display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '1.5rem', background: 'rgba(52,211,153,0.06)', borderRadius: '12px', border: '1px solid rgba(52,211,153,0.1)' }}>
                <CheckCircle2 size={20} /> {t('analytics.no_waste_alerts')}
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                {predictiveAnalysis.wasteAlerts.map((alert, idx) => (
                  <div key={idx} style={{ 
                    display: 'flex', 
                    flexDirection: 'column', 
                    gap: '1rem', 
                    padding: '1.25rem', 
                    borderRadius: '12px', 
                    background: 'rgba(251,113,133,0.04)', 
                    border: '1px solid rgba(251,113,133,0.15)',
                    transition: 'all 0.3s ease'
                  }} onMouseEnter={e => e.currentTarget.style.borderColor = 'rgba(251,113,133,0.3)'} onMouseLeave={e => e.currentTarget.style.borderColor = 'rgba(251,113,133,0.15)'}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem' }}>
                      <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-start' }}>
                        <div style={{ width: 36, height: 36, borderRadius: '10px', background: 'rgba(251,113,133,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fb7185', flexShrink: 0 }}>
                          <AlertTriangle size={18} />
                        </div>
                        <div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                            <span style={{ padding: '2px 8px', background: 'rgba(212,175,55,0.1)', color: 'var(--accent-color)', borderRadius: '6px', fontWeight: 'bold', fontSize: '0.8rem' }}>
                              #{alert.serial}
                            </span>
                            <strong style={{ color: 'var(--text-strong)', fontSize: '0.95rem' }}>
                              {alert.productName === 'unknown' ? t('analytics.unknown') : alert.productName}
                            </strong>
                            <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>{t('analytics.by_factory')}</span>
                            <strong style={{ color: 'var(--text-strong)', fontSize: '0.9rem' }}>
                              {alert.factory === 'undefined' ? t('analytics.undefined') : alert.factory}
                            </strong>
                          </div>
                          <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', margin: '4px 0 0' }}>
                            {t('analytics.waste_detected', { deviation: Math.abs(alert.deviation), expected: alert.expectedQty })}
                          </p>
                        </div>
                      </div>

                      {/* Waste Details Badge */}
                      <div style={{ display: 'flex', gap: '1rem', background: 'rgba(0,0,0,0.2)', padding: '0.75rem 1.25rem', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.05)', alignSelf: 'flex-start' }}>
                        <div style={{ textAlign: 'center' }}>
                          <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', display: 'block' }}>{t('analytics.waste_rate')}</span>
                          <strong style={{ fontSize: '1rem', color: '#fb7185' }}>{alert.wastePercent}%</strong>
                        </div>
                        <div style={{ width: '1px', background: 'rgba(255,255,255,0.1)' }}></div>
                        <div style={{ textAlign: 'center' }}>
                          <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', display: 'block' }}>{t('analytics.financial_loss')}</span>
                          <strong style={{ fontSize: '1rem', color: '#d4af37' }}>{alert.financialLoss.toLocaleString()} {alert.currency}</strong>
                        </div>
                      </div>
                    </div>

                    {/* Proactive Action Link */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(255,255,255,0.02)', padding: '0.6rem 1rem', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.04)', flexWrap: 'wrap', gap: '0.75rem' }}>
                      <span style={{ fontSize: '0.8rem', color: '#fb7185', display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <Zap size={14} />
                        {t('analytics.compensation_recommendation', { amount: alert.financialLoss.toLocaleString(), currency: alert.currency })}
                      </span>
                      <button 
                        className="btn btn-outline" 
                        onClick={() => {
                          const productName = alert.productName === 'unknown' ? t('analytics.unknown') : alert.productName;
                          navigator.clipboard.writeText(`${t('analytics.create_claim')} #${alert.serial} (${productName}): ${t('analytics.waste_detected', { deviation: Math.abs(alert.deviation), expected: alert.expectedQty })} - ${t('analytics.financial_loss')}: ${alert.financialLoss} ${alert.currency}`);
                          toast.success(t('analytics.copy_success'));
                        }}
                        style={{ 
                          padding: '0.4rem 1rem', 
                          fontSize: '0.75rem', 
                          borderColor: 'rgba(212,175,55,0.3)', 
                          color: 'var(--accent-color)',
                          cursor: 'pointer',
                          borderRadius: '6px',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '4px'
                        }}
                      >
                        <Sparkles size={12} /> {t('analytics.create_claim')}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))', gap: '1.5rem', marginBottom: '1.5rem' }}>
        
        {/* Smart Action Center */}
        <div className="glass-panel" style={{ padding: '1.5rem', borderRadius: '16px', border: '1px solid rgba(255,255,255,0.05)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1.5rem' }}>
            <ShieldCheck size={22} color="#fbbf24" />
            <h3 style={{ margin: 0, color: 'var(--text-strong)' }}>{t('analytics.smart_action')}</h3>
          </div>
          
          {intelligence.topIssues.length === 0 ? (
            <div style={{ color: '#34d399', display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '1rem', background: 'rgba(52,211,153,0.1)', borderRadius: '12px' }}>
              <CheckCircle2 size={20} /> {t('analytics.no_critical_issues')}
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
              {intelligence.topIssues.map((issue, idx) => (
                <div key={idx} style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', padding: '1rem', borderRadius: '12px', background: issue.severity === 'critical' ? 'rgba(244,63,94,0.08)' : 'rgba(245,158,11,0.08)', border: '1px solid rgba(255,255,255,0.05)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div style={{ display: 'flex', gap: '0.8rem', alignItems: 'flex-start' }}>
                      <AlertTriangle size={20} color={issue.severity === 'critical' ? '#fb7185' : '#fbbf24'} style={{ flexShrink: 0, marginTop: 2 }} />
                      <div>
                        <div style={{ color: 'var(--text-strong)', fontWeight: 700, fontSize: '0.95rem' }}>{issue.label}</div>
                        <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem', marginTop: 4 }}>{issue.fix}</div>
                      </div>
                    </div>
                    <strong style={{ color: 'var(--accent-color)', fontSize: '1.2rem', paddingLeft: '1rem' }}>{issue.count}</strong>
                  </div>
                  
                  {/* Affected Serials Tags */}
                  {issue.serials && issue.serials.length > 0 && (
                    <div style={{ marginTop: '0.5rem', display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', marginRight: '0.2rem' }}>
                        {t('analytics.affected_orders')}
                      </span>
                      {issue.serials.slice(0, 15).map(serial => (
                        <span key={serial} style={{ fontSize: '0.75rem', padding: '2px 8px', background: 'rgba(255,255,255,0.08)', borderRadius: '4px', color: 'var(--text-main)' }}>
                          #{serial}
                        </span>
                      ))}
                      {issue.serials.length > 15 && (
                        <span style={{ fontSize: '0.75rem', padding: '2px 8px', background: 'transparent', color: 'var(--text-muted)' }}>
                          +{issue.serials.length - 15} more
                        </span>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Top Products */}
        <div className="glass-panel" style={{ padding: '1.5rem', borderRadius: '16px', border: '1px solid rgba(255,255,255,0.05)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1.5rem' }}>
            <Trophy size={22} color="#d4af37" />
            <h3 style={{ margin: 0, color: 'var(--text-strong)' }}>{t('analytics.top_products')}</h3>
          </div>
          
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '1rem' }}>
            {executiveDashboard.topProducts.map((product, index) => (
              <div key={product.name} style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', padding: '1rem', borderRadius: '12px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.05)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ color: index === 0 ? '#d4af37' : 'var(--text-muted)', fontWeight: 900, fontSize: '1.1rem' }}>#{index + 1}</span>
                  <span style={{ color: 'var(--accent-color)', fontWeight: 900, fontSize: '1.1rem' }}>{product.quantity.toLocaleString()} {t('analytics.pcs')}</span>
                </div>
                <strong style={{ color: 'var(--text-strong)', fontSize: '0.9rem' }}>{product.name}</strong>
                <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>{t('analytics.ordered_times', { count: product.orders })}</div>
              </div>
            ))}
          </div>
        </div>

      </div>

      {/* Global Activity Log (Full Width) */}
      <div className="glass-panel" style={{ padding: '1.5rem', borderRadius: '16px', border: '1px solid rgba(255,255,255,0.05)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Activity size={22} color="#38bdf8" />
            <h3 style={{ margin: 0, color: 'var(--text-strong)' }}>{t('analytics.live_activity')}</h3>
          </div>
          
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.8rem' }}>
            <Filter size={16} color="var(--text-muted)" />
            <select
              value={selectedUser}
              onChange={(e) => setSelectedUser(e.target.value)}
              style={{ padding: '0.4rem 1rem', borderRadius: '8px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: 'var(--text-main)', outline: 'none', cursor: 'pointer' }}
            >
              <option value="all" style={{ color: '#000' }}>{t('groups.admin.title') || 'All Users'} (All)</option>
              {allUsers.filter(u => u !== 'all').map(u => (
                <option key={u} value={u} style={{ color: '#000' }}>{u}</option>
              ))}
            </select>
          </div>
        </div>
        
        {filteredTimeline.length === 0 ? (
          <div style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '3rem' }}>{t('analytics.no_activity')}</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', minWidth: '800px', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.08)', color: 'var(--text-muted)', textAlign: 'start' }}>
                  <th style={{ padding: '1rem', fontWeight: 600 }}>{t('analytics.system_status') || 'Status'}</th>
                  <th style={{ padding: '1rem', fontWeight: 600 }}>{t('analytics.table_action') || 'Action'}</th>
                  <th style={{ padding: '1rem', fontWeight: 600 }}>{t('analytics.order_number') || 'Order #'}</th>
                  <th style={{ padding: '1rem', fontWeight: 600 }}>{t('analytics.details') || 'Details'}</th>
                  <th style={{ padding: '1rem', fontWeight: 600 }}>{t('analytics.user') || 'User'}</th>
                  <th style={{ padding: '1rem', fontWeight: 600 }}>{t('analytics.date_time') || 'Date & Time'}</th>
                </tr>
              </thead>
              <tbody>
                {currentTimelinePage.map((item, idx) => (
                  <tr key={idx} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)', transition: 'background 0.2s' }} onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.02)'} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                    <td style={{ padding: '1rem' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                         <span style={{ width: 10, height: 10, borderRadius: '50%', background: item.color || '#94a3b8', boxShadow: `0 0 0 3px ${(item.color || '#94a3b8')}22` }} />
                      </div>
                    </td>
                    <td style={{ padding: '1rem', color: item.color || 'var(--text-strong)', fontWeight: 600 }}>
                      {t(item.actionLabel || item.action)}
                    </td>
                    <td style={{ padding: '1rem' }}>
                      <span style={{ padding: '4px 8px', background: 'rgba(212,175,55,0.1)', color: 'var(--accent-color)', borderRadius: '6px', fontWeight: 'bold' }}>
                        #{item.serial}
                      </span>
                    </td>
                    <td style={{ padding: '1rem', color: 'var(--text-main)', maxWidth: '300px' }}>
                      <div style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {t(item.note)}
                      </div>
                    </td>
                    <td style={{ padding: '1rem', color: 'var(--text-muted)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                         <div style={{ width: 24, height: 24, borderRadius: '50%', background: 'rgba(255,255,255,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.7rem' }}>
                           {item.actor ? item.actor.substring(0, 2).toUpperCase() : 'SY'}
                         </div>
                         {item.actor || 'system'}
                      </div>
                    </td>
                    <td style={{ padding: '1rem', color: 'var(--text-muted)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                        <Clock size={14} />
                        {formatActivityTime(item.at)}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {totalPages > 1 && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '1.5rem', paddingTop: '1rem', borderTop: '1px solid rgba(255,255,255,0.08)' }}>
            <div style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
              Page {currentPage} of {totalPages}
            </div>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button 
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                style={{ padding: '0.5rem', borderRadius: '8px', background: 'rgba(255,255,255,0.05)', border: 'none', color: currentPage === 1 ? 'rgba(255,255,255,0.2)' : 'var(--text-main)', cursor: currentPage === 1 ? 'not-allowed' : 'pointer' }}
              >
                <ChevronLeft size={18} />
              </button>
              <button 
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
                style={{ padding: '0.5rem', borderRadius: '8px', background: 'rgba(255,255,255,0.05)', border: 'none', color: currentPage === totalPages ? 'rgba(255,255,255,0.2)' : 'var(--text-main)', cursor: currentPage === totalPages ? 'not-allowed' : 'pointer' }}
              >
                <ChevronRight size={18} />
              </button>
            </div>
          </div>
        )}
      </div>

    </div>
  );
};

export default AnalyticsDashboard;
