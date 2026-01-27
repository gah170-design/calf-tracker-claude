'use client';

import React, { useState, useEffect } from 'react';
import { Plus, Settings, X, ChevronLeft, Activity, ShoppingCart, Ghost, ClipboardCheck, CheckCircle2, Trash2, ListChecks, Hash, BarChart3, Download } from 'lucide-react';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

const getETDate = () => {
  const now = new Date();
  const etString = now.toLocaleString("en-US", { timeZone: "America/New_York" });
  return new Date(etString);
};

const getETDateString = (date) => {
  const etDate = new Date(date.toLocaleString("en-US", { timeZone: "America/New_York" }));
  const year = etDate.getFullYear();
  const month = String(etDate.getMonth() + 1).padStart(2, '0');
  const day = String(etDate.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const utcToETDateString = (utcTimestamp) => {
  const utcDate = new Date(utcTimestamp);
  return getETDateString(utcDate);
};

const getETPeriod = () => {
  const etNow = getETDate();
  return etNow.getHours() < 12 ? 'AM' : 'PM';
};

const getCalfAgeDays = (birthDateString) => {
  const birthDate = new Date(birthDateString);
  const birthETString = getETDateString(birthDate);
  const todayETString = getETDateString(getETDate());
  const birthET = new Date(birthETString);
  const todayET = new Date(todayETString);
  const diffTime = todayET - birthET;
  const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
  return diffDays;
};

const DIAGNOSES = ['Scours', 'Respiratory/Pneumonia', 'High Fever', 'Unknown'];

export default function CalfTracker() {
  const [currentUser, setCurrentUser] = useState(null);
  const [currentPage, setCurrentPage] = useState('dashboard'); 
  const [calves, setCalves] = useState([]);
  const [feedings, setFeedings] = useState([]);
  const [users, setUsers] = useState([]);
  const [protocols, setProtocols] = useState([]);
  const [medicines, setMedicines] = useState([]);
  const [treatmentPlans, setTreatmentPlans] = useState([]);
  const [treatmentMedicines, setTreatmentMedicines] = useState([]);
  const [treatmentLogs, setTreatmentLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showSettings, setShowSettings] = useState(false);
  const [showAddCalf, setShowAddCalf] = useState(false);
  const [selectedCalfHistory, setSelectedCalfHistory] = useState(null);
  const [showPinEntry, setShowPinEntry] = useState(false);
  const [selectedUser, setSelectedUser] = useState(null);
  const [pinInput, setPinInput] = useState('');
  const [filterProtocol, setFilterProtocol] = useState('all');
  const [settings, setSettings] = useState({ nextCalfNumber: 1000, nextBullNumber: 1 });
  const [newCalf, setNewCalf] = useState({ 
    name: '', 
    birthDate: new Date(getETDate().getTime() - getETDate().getTimezoneOffset() * 60000).toISOString().slice(0, 16), 
    isBull: false 
  });
  
  const [noteBuffer, setNoteBuffer] = useState({});

  const [showNewDiagnosis, setShowNewDiagnosis] = useState(false);
  const [showTreatmentPlan, setShowTreatmentPlan] = useState(false);
  const [selectedCalfForTreatment, setSelectedCalfForTreatment] = useState(null);
  const [newDiagnosis, setNewDiagnosis] = useState('Scours');
  const [newTreatmentMedicines, setNewTreatmentMedicines] = useState([]);
  const [showMedicineForm, setShowMedicineForm] = useState(false);
  const [newMedicine, setNewMedicine] = useState({ name: '', dosage: '', hours: 24, totalTreatments: 5 });
  const [editingTreatmentId, setEditingTreatmentId] = useState(null);
  const [addExistingMedicine, setAddExistingMedicine] = useState({ name: '', dosage: '', hours: 24, totalTreatments: 5 });

  useEffect(() => {
    const init = async () => {
      await loadAllData();
      const savedUser = localStorage.getItem('calfTrackerUser');
      if (savedUser) {
        try {
          const user = JSON.parse(savedUser);
          setCurrentUser(user);
        } catch (err) {
          console.error('Error loading saved user:', err);
          localStorage.removeItem('calfTrackerUser');
        }
      }
      setLoading(false);
    };
    init();
  }, []);

  const loadAllData = async () => {
    try {
      const { data: c } = await supabase.from('calves').select('*').order('created_at', { ascending: false });
      if (c) setCalves(c);
      const { data: f } = await supabase.from('feedings').select('*').order('timestamp', { ascending: false });
      if (f) setFeedings(f);
      const { data: u } = await supabase.from('users').select('*').order('name', { ascending: true });
      if (u) setUsers(u);
      const { data: p } = await supabase.from('protocols').select('*').order('order', { ascending: true });
      if (p) setProtocols(p);
      const { data: m } = await supabase.from('medicines').select('*').order('name', { ascending: true });
      if (m) setMedicines(m);
      const { data: tp } = await supabase.from('treatment_plans').select('*').eq('completed', false);
      if (tp) setTreatmentPlans(tp);
      const { data: tm } = await supabase.from('treatment_medicines').select('*');
      if (tm) setTreatmentMedicines(tm);
      const { data: tl } = await supabase.from('treatment_logs').select('*').order('timestamp', { ascending: false });
      if (tl) setTreatmentLogs(tl);
      const { data: s } = await supabase.from('settings').select('*');
      if (s) {
        const ncn = s.find(item => item.setting_key === 'next_calf_number');
        const nbn = s.find(item => item.setting_key === 'next_bull_number');
        setSettings({ 
          nextCalfNumber: ncn ? parseInt(ncn.setting_value) : 1000,
          nextBullNumber: nbn ? parseInt(nbn.setting_value) : 1
        });
      }
    } catch (err) { console.error(err); }
  };

  const saveGlobalSetting = async (key, val) => {
    setSettings(prev => ({ ...prev, [key]: val }));
    const dbKey = key.replace(/[A-Z]/g, l => `_${l.toLowerCase()}`);
    await supabase.from('settings').update({ setting_value: val.toString() }).eq('setting_key', dbKey);
  };

  const addCalf = async () => {
    let bullNumber = null;
    let dbNumberValue;
    if (newCalf.isBull) {
      bullNumber = `M${settings.nextBullNumber}`;
      dbNumberValue = -settings.nextBullNumber; 
    } else {
      const autoNum = settings.nextCalfNumber;
      if (newCalf.name.trim() !== "") {
        const custom = prompt(`Enter number for ${newCalf.name}:`, autoNum);
        dbNumberValue = custom && !isNaN(custom) ? parseInt(custom) : autoNum;
      } else {
        dbNumberValue = autoNum;
      }
    }
    const { error } = await supabase.from('calves').insert([{
      number: dbNumberValue,
      bull_number: bullNumber,
      name: newCalf.name.trim() || null,
      birth_date: newCalf.birthDate,
      status: 'active',
      type: newCalf.isBull ? 'bull' : 'heifer'
    }]);
    if (!error) {
      if (newCalf.isBull) await saveGlobalSetting('nextBullNumber', settings.nextBullNumber + 1);
      else if (dbNumberValue === settings.nextCalfNumber) await saveGlobalSetting('nextCalfNumber', settings.nextCalfNumber + 1);
      setShowAddCalf(false);
      setNewCalf({ 
        name: '', 
        birthDate: new Date(getETDate().getTime() - getETDate().getTimezoneOffset() * 60000).toISOString().slice(0, 16), 
        isBull: false 
      });
      await loadAllData();
    }
  };

  const recordFeeding = async (calf, consumption) => {
    const etNow = getETDate();
    const period = getETPeriod();
    const todayET = getETDateString(etNow);
    const calfKey = calf.bull_number || calf.number;
    
    const existing = feedings.find(f => {
      const feedingETDate = utcToETDateString(f.timestamp);
      const matchesCalf = calf.type === 'bull' 
        ? f.bull_number === calf.bull_number 
        : f.calf_number === calf.number;
      const matchesDate = feedingETDate === todayET;
      const matchesPeriod = f.period === period;
      return matchesCalf && matchesDate && matchesPeriod;
    });

    const feedingData = {
      consumption,
      timestamp: new Date().toISOString(),
      notes: noteBuffer[calfKey] !== undefined ? noteBuffer[calfKey] : (existing ? existing.notes : null),
      treatment: false,
      user_name: currentUser.name,
      calf_number: calf.type !== 'bull' ? calf.number : null,
      bull_number: calf.type === 'bull' ? calf.bull_number : null,
      calf_name: calf.name || null,
      period,
    };

    try {
      if (existing) {
        await supabase.from('feedings').update(feedingData).eq('id', existing.id);
      } else {
        await supabase.from('feedings').insert([feedingData]);
      }
      setNoteBuffer(prev => { const n = {...prev}; delete n[calfKey]; return n; });
      await loadAllData();
    } catch (err) {
      console.error('recordFeeding error:', err);
    }
  };

  const getCalfFeedings = (calf) => feedings.filter(f => 
    calf.type === 'bull' ? f.bull_number === calf.bull_number : f.calf_number === calf.number
  ).sort((a,b) => new Date(b.timestamp) - new Date(a.timestamp));

  const getProtocolStatus = (calf) => {
    if (calf.type === 'bull') return 'Bull (Bottle)';
    const age = getCalfAgeDays(calf.birth_date);
    const count = getCalfFeedings(calf).length;
    const sortedProtocols = [...protocols].sort((a, b) => a.order - b.order);
    for (let p of sortedProtocols) {
      if (p.type === 'feedings' && count < p.value) return p.name;
      if (p.type === 'days' && age < p.value) return p.name;
    }
    const lastProtocol = sortedProtocols[sortedProtocols.length - 1];
    return lastProtocol ? lastProtocol.name : "Weaned";
  };

  const getCalfTreatmentPlans = (calf) => treatmentPlans.filter(tp => tp.calf_id === calf.id);
  const getTreatmentMedicinesForPlan = (planId) => treatmentMedicines.filter(tm => tm.treatment_plan_id === planId);

  const getTreatmentGivenToday = (calf) => {
    const todayET = getETDateString(getETDate());
    const plans = getCalfTreatmentPlans(calf);
    for (let plan of plans) {
      const log = treatmentLogs.find(tl => {
        const logDate = utcToETDateString(tl.timestamp);
        return tl.treatment_plan_id === plan.id && logDate === todayET;
      });
      if (log) return true;
    }
    return false;
  };

  const markTreatmentGiven = async (calf) => {
    const todayET = getETDateString(getETDate());
    const plans = getCalfTreatmentPlans(calf);
    for (let plan of plans) {
      const existing = treatmentLogs.find(tl => {
        const logDate = utcToETDateString(tl.timestamp);
        return tl.treatment_plan_id === plan.id && logDate === todayET;
      });
      if (!existing) {
        await supabase.from('treatment_logs').insert([{
          treatment_plan_id: plan.id,
          user_name: currentUser.name,
          timestamp: new Date().toISOString()
        }]);
      }
    }
    await loadAllData();
  };

  const addMedicineToNewDiagnosis = async () => {
    if (!newMedicine.name || !newMedicine.dosage) {
      alert('Fill in medicine name and dosage');
      return;
    }
    if (!medicines.find(m => m.name === newMedicine.name)) {
      await supabase.from('medicines').insert([{ name: newMedicine.name }]);
      await loadAllData();
    }
    setNewTreatmentMedicines([...newTreatmentMedicines, { ...newMedicine, id: Date.now() }]);
    setNewMedicine({ name: '', dosage: '', hours: 24, totalTreatments: 5 });
    setShowMedicineForm(false);
  };

  const saveDiagnosis = async () => {
    if (newTreatmentMedicines.length === 0) {
      alert('Add at least one medicine');
      return;
    }
    const { data: plan, error: planError } = await supabase.from('treatment_plans').insert([{
      calf_id: selectedCalfForTreatment.id,
      diagnosis: newDiagnosis,
      start_date: new Date().toISOString()
    }]).select();
    if (!planError && plan) {
      const planId = plan[0].id;
      for (let med of newTreatmentMedicines) {
        await supabase.from('treatment_medicines').insert([{
          treatment_plan_id: planId,
          medicine_name: med.name,
          dosage: med.dosage,
          frequency_hours: med.hours,
          total_treatments: med.totalTreatments,
          completed_treatments: 0
        }]);
      }
      setNewTreatmentMedicines([]);
      setNewDiagnosis('Scours');
      setShowNewDiagnosis(false);
      setSelectedCalfForTreatment(null);
      await loadAllData();
    }
  };

  const addMedicineToExisting = async (treatmentPlanId) => {
    if (!addExistingMedicine.name || !addExistingMedicine.dosage) {
      alert('Fill in all medicine fields');
      return;
    }
    if (!medicines.find(m => m.name === addExistingMedicine.name)) {
      await supabase.from('medicines').insert([{ name: addExistingMedicine.name }]);
    }
    await supabase.from('treatment_medicines').insert([{
      treatment_plan_id: treatmentPlanId,
      medicine_name: addExistingMedicine.name,
      dosage: addExistingMedicine.dosage,
      frequency_hours: addExistingMedicine.hours,
      total_treatments: addExistingMedicine.totalTreatments,
      completed_treatments: 0
    }]);
    setAddExistingMedicine({ name: '', dosage: '', hours: 24, totalTreatments: 5 });
    setEditingTreatmentId(null);
    await loadAllData();
  };

  const deleteTreatmentPlan = async (planId) => {
    if (confirm('Delete this treatment plan?')) {
      await supabase.from('treatment_plans').delete().eq('id', planId);
      await loadAllData();
    }
  };

  const completeTreatmentPlan = async (planId) => {
    if (confirm('Mark this treatment as complete?')) {
      await supabase.from('treatment_plans').update({ 
        completed: true, 
        completed_at: new Date().toISOString() 
      }).eq('id', planId);
      await loadAllData();
    }
  };

  const deleteTreatmentMedicine = async (medicineId) => {
    if (confirm('Remove this medicine?')) {
      await supabase.from('treatment_medicines').delete().eq('id', medicineId);
      await loadAllData();
    }
  };

  const getShiftSchedule = (hours) => {
    if (hours === 12) return 'AM & PM';
    if (hours === 24) return 'Once Daily';
    if (hours === 48) return 'Every Other Day';
    if (hours === 72) return 'Every 3 Days';
    return `Every ${hours}hrs`;
  };

  const calculateProgress = (planId) => {
    const planLogs = treatmentLogs.filter(tl => tl.treatment_plan_id === planId);
    const meds = getTreatmentMedicinesForPlan(planId);
    if (meds.length === 0) return 'Day 1';
    const maxTreatments = Math.max(...meds.map(m => m.total_treatments));
    return `Day ${planLogs.length + 1} of ${maxTreatments}`;
  };

  const exportToCSV = () => {
    const csvData = [];
    csvData.push(['Calf Number', 'Name', 'Type', 'Birth Date', 'Age (Days)', 'Protocol', 'Status', 'Date', 'Period', 'Consumption', 'Notes', 'User']);
    calves.forEach(calf => {
      const calfFeedings = getCalfFeedings(calf);
      const age = getCalfAgeDays(calf.birth_date);
      const protocol = getProtocolStatus(calf);
      if (calfFeedings.length === 0) {
        csvData.push([calf.bull_number || calf.number, calf.name || '', calf.type, calf.birth_date, age, protocol, calf.status, '', '', '', '', '']);
      } else {
        calfFeedings.forEach(f => {
          csvData.push([calf.bull_number || calf.number, calf.name || '', calf.type, calf.birth_date, age, protocol, calf.status, new Date(f.timestamp).toLocaleDateString(), f.period, f.consumption, f.notes || '', f.user_name]);
        });
      }
    });
    const csvContent = csvData.map(row => row.map(cell => `"${cell}"`).join(',')).join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `calf-data-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
  };

  if (loading) return <div className="h-screen flex items-center justify-center font-black uppercase italic text-blue-600">Syncing Farm Data...</div>;

  const activeHeifers = calves.filter(c => c.status === 'active' && c.type !== 'bull');
  const activeBulls = calves.filter(c => c.status === 'active' && c.type === 'bull');
  const heifersOnProtocol = activeHeifers.filter(c => getProtocolStatus(c) !== 'Weaned');
  const flaggedCalves = activeHeifers.filter(c => {
    const history = getCalfFeedings(c).slice(0, 2);
    return history.length >= 2 && history.every(f => f.consumption <= 50);
  });

  return (
    <div className="min-h-screen bg-slate-50 pb-28 font-sans">
      {!currentUser ? (
        <div className="h-screen bg-slate-900 flex items-center justify-center p-6 text-center">
          <div className="bg-white rounded-[3rem] p-10 w-full max-w-sm shadow-2xl">
            <h1 className="font-black text-3xl mb-8 italic tracking-tighter uppercase text-slate-900 leading-none">Operator Login</h1>
            <div className="space-y-4 text-left overflow-y-auto max-h-[60vh]">
              {users.map(u => (
                <button key={u.id} onClick={() => { setSelectedUser(u); setShowPinEntry(true); }} className="w-full p-6 bg-slate-100 rounded-3xl font-black transition-all uppercase flex justify-between items-center group text-slate-700 active:bg-blue-600 active:text-white">
                  {u.name} <Activity className="opacity-0 group-hover:opacity-100" />
                </button>
              ))}
            </div>
          </div>
          {showPinEntry && (
            <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-50 flex items-center justify-center p-4">
              <div className="bg-white rounded-[3rem] p-8 w-full max-w-xs space-y-4 shadow-2xl">
                <h2 className="font-black italic uppercase text-slate-800 text-center">Pin for {selectedUser.name}</h2>
                <input type="password" inputMode="numeric" maxLength="4" value={pinInput} onChange={(e) => setPinInput(e.target.value)} className="w-full p-5 bg-slate-50 rounded-2xl text-center text-3xl font-black tracking-widest outline-none border-2 border-transparent focus:border-blue-600 text-blue-600" autoFocus />
                <button onClick={() => { 
                  if(pinInput === selectedUser.pin) { 
                    setCurrentUser(selectedUser); 
                    localStorage.setItem('calfTrackerUser', JSON.stringify(selectedUser));
                    setShowPinEntry(false); 
                    setPinInput(''); 
                  } else { 
                    alert("Wrong Pin"); 
                    setPinInput(''); 
                  }
                }} className="w-full bg-blue-600 text-white py-5 rounded-3xl font-black text-lg uppercase">Unlock</button>
                <button onClick={() => { setShowPinEntry(false); setPinInput(''); }} className="w-full text-slate-400 font-black text-xs uppercase">Cancel</button>
              </div>
            </div>
          )}
        </div>
      ) : (
        <>
          <header className="bg-blue-700 text-white p-6 sticky top-0 z-40 shadow-lg flex justify-between items-center">
            <div>
              <h1 className="font-black text-2xl italic tracking-tighter uppercase">Calf Tracker</h1>
              <p className="text-[10px] font-bold opacity-70 uppercase tracking-widest">{currentUser.name} • {getETPeriod()} Shift</p>
            </div>
            <button onClick={() => setShowSettings(true)} className="p-3 bg-white/20 rounded-full active:scale-90 transition-transform"><Settings size={20}/></button>
          </header>

          <main className="p-4 max-w-2xl mx-auto space-y-4">
            {currentPage === 'dashboard' ? (
              <div className="space-y-4">
                {flaggedCalves.length > 0 && (
                  <button onClick={() => setCurrentPage('flagged')} className="w-full bg-red-500 text-white p-6 rounded-[2.5rem] flex justify-between items-center shadow-lg animate-pulse">
                    <div>
                      <div className="text-3xl font-black">{flaggedCalves.length}</div>
                      <div className="text-[10px] font-black uppercase tracking-widest text-left">Attention Required</div>
                    </div>
                    <Activity size={32} />
                  </button>
                )}

                <div className="grid grid-cols-2 gap-4">
                  <button onClick={() => { setFilterProtocol('all'); setCurrentPage('feed'); }} className="bg-white p-8 rounded-[3rem] shadow-sm border border-slate-200 text-left active:scale-95 transition-transform">
                    <div className="text-4xl font-black text-blue-600">{heifersOnProtocol.length}</div>
                    <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Heifers</div>
                  </button>
                  <button onClick={() => { setFilterProtocol('all'); setCurrentPage('bulls'); }} className="bg-white p-8 rounded-[3rem] shadow-sm border border-slate-200 text-left active:scale-95 transition-transform">
                    <div className="text-4xl font-black text-blue-800">{activeBulls.length}</div>
                    <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Bulls</div>
                  </button>
                </div>

                <div className="bg-white p-6 rounded-[3rem] shadow-sm border border-slate-200">
                  <h3 className="text-[10px] font-black text-slate-300 uppercase tracking-widest mb-4 px-2 italic text-center">Protocol Groups</h3>
                  <div className="grid grid-cols-2 gap-3">
                    {protocols.map(p => (
                      <button key={p.id} onClick={() => { setFilterProtocol(p.name); setCurrentPage('feed'); }} className="bg-slate-50 p-4 rounded-2xl text-left border border-slate-100 active:bg-blue-50">
                        <div className="font-black text-blue-600 text-xl">{activeHeifers.filter(c => getProtocolStatus(c) === p.name).length}</div>
                        <div className="text-[9px] font-black text-slate-500 uppercase">{p.name}</div>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex flex-col gap-4">
                    <button onClick={() => { setCurrentPage('dashboard'); setFilterProtocol('all'); }} className="flex items-center text-blue-600 font-black text-xs uppercase bg-blue-50 px-4 py-2 rounded-full w-fit"><ChevronLeft size={16}/> Back</button>
                    
                    {currentPage !== 'flagged' && currentPage !== 'bulls' && (
                        <div className="flex gap-2 overflow-x-auto pb-2">
                            <button onClick={() => setFilterProtocol('all')} className={`px-5 py-2 rounded-full font-black text-[10px] uppercase whitespace-nowrap transition-all ${filterProtocol === 'all' ? 'bg-blue-600 text-white' : 'bg-white text-slate-400 border border-slate-200'}`}>All Heifers</button>
                            {protocols.map(p => (
                                <button key={p.id} onClick={() => setFilterProtocol(p.name)} className={`px-5 py-2 rounded-full font-black text-[10px] uppercase whitespace-nowrap transition-all ${filterProtocol === p.name ? 'bg-blue-600 text-white' : 'bg-white text-slate-400 border border-slate-200'}`}>{p.name}</button>
                            ))}
                        </div>
                    )}
                </div>
                
                {(currentPage === 'bulls' ? activeBulls : 
                   currentPage === 'flagged' ? flaggedCalves : 
                   (filterProtocol === 'all' ? activeHeifers : activeHeifers.filter(c => getProtocolStatus(c) === filterProtocol))
                  )
                  .sort((a, b) => (b.bull_number ? parseInt(b.bull_number.replace(/\D/g,'')) : b.number) - (a.bull_number ? parseInt(a.bull_number.replace(/\D/g,'')) : a.number))
                  .map(calf => (
                    <CalfCard 
                      key={calf.id} 
                      calf={calf} 
                      age={getCalfAgeDays(calf.birth_date)}
                      protocol={getProtocolStatus(calf)}
                      history={getCalfFeedings(calf)}
                      currentPeriod={getETPeriod()}
                      onRecord={(pct) => recordFeeding(calf, pct)}
                      onStatus={(id, s) => { 
                        if(confirm(`Mark as ${s}?`)) {
                          if(calf.type === 'bull') {
                            supabase.from('feedings').delete().eq('bull_number', calf.bull_number).then(() => {
                              supabase.from('calves').delete().eq('id', id).then(loadAllData);
                            });
                          } else {
                            supabase.from('calves').update({status: s}).eq('id', id).then(loadAllData);
                          }
                        }
                      }}
                      onShowHistory={() => setSelectedCalfHistory(calf)}
                      noteValue={noteBuffer[calf.bull_number || calf.number]}
                      setNoteValue={(val
