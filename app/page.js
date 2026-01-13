'use client';

import React, { useState, useEffect } from 'react';
import { Plus, Settings, X, ChevronLeft, Activity, ShoppingCart, Ghost, ClipboardCheck, CheckCircle2 } from 'lucide-react';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

const getETDate = () => {
  const now = new Date();
  return new Date(now.toLocaleString("en-US", { timeZone: "America/New_York" }));
};

export default function CalfTracker() {
  const [currentUser, setCurrentUser] = useState(null);
  const [currentPage, setCurrentPage] = useState('dashboard'); 
  const [calves, setCalves] = useState([]);
  const [feedings, setFeedings] = useState([]);
  const [users, setUsers] = useState([]);
  const [protocols, setProtocols] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showSettings, setShowSettings] = useState(false);
  const [showAddCalf, setShowAddCalf] = useState(false);
  const [selectedCalfHistory, setSelectedCalfHistory] = useState(null);
  const [showPinEntry, setShowPinEntry] = useState(false);
  const [selectedUser, setSelectedUser] = useState(null);
  const [pinInput, setPinInput] = useState('');
  const [filterProtocol, setFilterProtocol] = useState('all');
  const [settings, setSettings] = useState({ nextCalfNumber: 1000, nextBullNumber: 1 });
  const [newCalf, setNewCalf] = useState({ name: '', birthDate: getETDate().toISOString().slice(0, 16), isBull: false });
  
  const [noteBuffer, setNoteBuffer] = useState({});
  const [treatmentBuffer, setTreatmentBuffer] = useState({});

  useEffect(() => {
    const init = async () => {
      await loadAllData();
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

  const saveSettings = async (key, val) => {
    setSettings(prev => ({ ...prev, [key]: val }));
    const dbKey = key.replace(/[A-Z]/g, l => `_${l.toLowerCase()}`);
    await supabase.from('settings').update({ setting_value: val.toString() }).eq('setting_key', dbKey);
  };

  const recordFeeding = async (calf, consumption) => {
    const etNow = getETDate();
    const period = etNow.getHours() < 12 ? 'AM' : 'PM';
    const today = etNow.toISOString().slice(0, 10);
    const calfKey = calf.bull_number || calf.number;
    
    // FIND EXISTING FOR CURRENT SHIFT
    const existing = feedings.find(f => 
      (calf.type === 'bull' ? f.bull_number === calf.bull_number : f.calf_number === calf.number) && 
      f.timestamp.startsWith(today) && f.period === period
    );

    const feedingData = {
      consumption,
      timestamp: etNow.toISOString(),
      notes: noteBuffer[calfKey] || (existing ? existing.notes : null),
      treatment_given: treatmentBuffer[calfKey] !== undefined ? treatmentBuffer[calfKey] : (existing ? existing.treatment_given : false),
      user_name: currentUser.name
    };

    if (existing) {
      await supabase.from('feedings').update(feedingData).eq('id', existing.id);
    } else {
      await supabase.from('feedings').insert([{
        ...feedingData,
        calf_number: calf.type !== 'bull' ? calf.number : null,
        bull_number: calf.type === 'bull' ? calf.bull_number : null,
        calf_name: calf.name || null,
        period,
      }]);
    }

    setNoteBuffer(prev => { const n = {...prev}; delete n[calfKey]; return n; });
    setTreatmentBuffer(prev => { const n = {...prev}; delete n[calfKey]; return n; });
    await loadAllData();
  };

  const getCalfAge = (date) => Math.floor((getETDate() - new Date(date)) / (1000 * 60 * 60 * 24));
  const getCalfFeedings = (calf) => feedings.filter(f => 
    calf.type === 'bull' ? f.bull_number === calf.bull_number : f.calf_number === calf.number
  ).sort((a,b) => new Date(b.timestamp) - new Date(a.timestamp));

  const getProtocolStatus = (calf) => {
    if (calf.type === 'bull') return 'Bull (Bottle)';
    const age = getCalfAge(calf.birth_date);
    const count = getCalfFeedings(calf).length;
    for (let p of protocols) {
      if (p.type === 'feedings' && count < p.value) return p.name;
      if (p.type === 'days' && age < p.value) return p.name;
    }
    return "Finished";
  };

  if (!currentUser) { /* ... same login screen ... */ }

  const activeHeifers = calves.filter(c => c.status === 'active' && c.type !== 'bull');
  const activeBulls = calves.filter(c => c.status === 'active' && c.type === 'bull');
  const flaggedCalves = activeHeifers.filter(c => {
    const history = getCalfFeedings(c).slice(0, 2);
    return history.length >= 2 && history.every(f => f.consumption <= 50);
  });

  return (
    <div className="min-h-screen bg-slate-50 pb-28 font-sans">
      <header className="bg-blue-700 text-white p-6 sticky top-0 z-40 shadow-lg flex justify-between items-center">
        <div>
          <h1 className="font-black text-2xl italic tracking-tighter uppercase">Calf Tracker</h1>
          <p className="text-[10px] font-bold opacity-70 uppercase tracking-widest">{currentUser.name} • {getETDate().getHours() < 12 ? 'AM' : 'PM'} Shift</p>
        </div>
        <button onClick={() => setShowSettings(true)} className="p-3 bg-white/20 rounded-full"><Settings size={20}/></button>
      </header>

      <main className="p-4 max-w-2xl mx-auto space-y-4">
        {currentPage === 'dashboard' ? (
          <div className="space-y-4">
            {flaggedCalves.length > 0 && (
              <button onClick={() => { setFilterProtocol('all'); setCurrentPage('flagged'); }} className="w-full bg-red-500 text-white p-6 rounded-[2.5rem] flex justify-between items-center shadow-lg animate-pulse">
                <div>
                  <div className="text-3xl font-black">{flaggedCalves.length}</div>
                  <div className="text-[10px] font-black uppercase tracking-widest">Flagged for Health</div>
                </div>
                <Activity size={32} />
              </button>
            )}

            <div className="grid grid-cols-2 gap-4">
              <button onClick={() => { setFilterProtocol('all'); setCurrentPage('feed'); }} className="bg-white p-8 rounded-[3rem] shadow-sm border border-slate-200 text-left active:scale-95 transition-transform">
                <div className="text-4xl font-black text-blue-600">{activeHeifers.length}</div>
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
            <button onClick={() => setCurrentPage('dashboard')} className="flex items-center text-blue-600 font-black text-xs uppercase mb-2 bg-blue-50 px-4 py-2 rounded-full w-fit"><ChevronLeft size={16}/> Back</button>
            
            {(currentPage === 'bulls' ? activeBulls : 
               currentPage === 'flagged' ? flaggedCalves : 
               (filterProtocol === 'all' ? activeHeifers : activeHeifers.filter(c => getProtocolStatus(c) === filterProtocol))
              ).map(calf => (
                <CalfCard 
                  key={calf.id} 
                  calf={calf} 
                  age={getCalfAge(calf.birth_date)}
                  protocol={getProtocolStatus(calf)}
                  history={getCalfFeedings(calf)}
                  currentPeriod={getETDate().getHours() < 12 ? 'AM' : 'PM'}
                  onRecord={(pct) => recordFeeding(calf, pct)}
                  onStatus={(id, s) => { if(confirm(`Mark as ${s}?`)) supabase.from('calves').update({status: s}).eq('id', id).then(loadAllData); }}
                  onShowHistory={() => setSelectedCalfHistory(calf)}
                  noteValue={noteBuffer[calf.bull_number || calf.number]}
                  setNoteValue={(val) => setNoteBuffer(prev => ({...prev, [calf.bull_number || calf.number]: val}))}
                  treatmentValue={treatmentBuffer[calf.bull_number || calf.number]}
                  setTreatmentValue={(val) => setTreatmentBuffer(prev => ({...prev, [calf.bull_number || calf.number]: val}))}
                />
              ))
            }
          </div>
        )}
      </main>

      {/* Floating Add Button */}
      <div className="fixed bottom-0 left-0 right-0 p-6 flex justify-center z-30 pointer-events-none">
        <button onClick={() => setShowAddCalf(true)} className="bg-slate-900 text-white w-full max-w-xs py-5 rounded-[2.5rem] font-black shadow-2xl flex items-center justify-center gap-3 pointer-events-auto active:scale-95 transition-transform">
          <Plus size={24}/> ADD NEW CALF
        </button>
      </div>

      {/* ... Add Calf Modal & History Modal Code (omitted for brevity, remains unchanged) ... */}
    </div>
  );
}

function CalfCard({ calf, age, protocol, history, currentPeriod, onRecord, onStatus, onShowHistory, noteValue, setNoteValue, treatmentValue, setTreatmentValue }) {
  const latest = [...history].slice(0, 3).reverse();
  const todayStr = getETDate().toISOString().slice(0, 10);
  
  // LOGIC: Find if a feeding exists for THIS shift (AM/PM)
  const todayFeeding = history.find(f => f.timestamp.startsWith(todayStr) && f.period === currentPeriod);

  // Buffer Logic: If user hasn't typed anything yet, show the value from the DB (if it exists)
  const displayNote = noteValue !== undefined ? noteValue : (todayFeeding?.notes || '');
  const displayTreatment = treatmentValue !== undefined ? treatmentValue : (todayFeeding?.treatment_given || false);

  return (
    <div className={`bg-white p-6 rounded-[2.5rem] shadow-sm border-2 transition-all ${todayFeeding ? 'border-green-200 opacity-90' : (calf.type === 'bull' ? 'border-blue-200' : 'border-slate-100')}`}>
      <div className="flex justify-between items-start mb-4">
        <div onClick={onShowHistory} className="cursor-pointer">
          <div className="flex items-center gap-2">
            <h3 className="text-4xl font-black italic tracking-tighter text-slate-900">#{calf.bull_number || calf.number}</h3>
            {todayFeeding && <CheckCircle2 className="text-green-500" size={24} />}
          </div>
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{age} Days • {protocol} {calf.name && `• ${calf.name}`}</p>
        </div>
        <div className="flex gap-2">
          {calf.type === 'bull' && <button onClick={() => onStatus(calf.id, 'sold')} className="p-3 bg-blue-50 text-blue-600 rounded-2xl active:bg-blue-100 transition-colors"><ShoppingCart size={20}/></button>}
          <button onClick={() => onStatus(calf.id, 'died')} className="p-3 bg-red-50 text-red-400 rounded-2xl active:bg-red-100 transition-colors"><Ghost size={20}/></button>
        </div>
      </div>

      {/* History Strip */}
      <div className="flex gap-2 mb-4">
        {latest.length > 0 ? latest.map((f, i) => (
          <div key={i} className={`flex-1 py-2 rounded-xl text-center text-white text-[9px] font-black shadow-sm ${f.consumption >= 100 ? 'bg-green-500' : f.consumption >= 50 ? 'bg-yellow-500' : 'bg-red-500'}`}>
            {f.consumption}%
          </div>
        )) : <div className="w-full py-2 border-2 border-dashed border-slate-50 rounded-xl" />}
      </div>

      {/* Notes & Treatment */}
      <div className="flex gap-2 items-center mb-6">
        <input 
          type="text" 
          placeholder="Shift notes..." 
          value={displayNote} 
          onChange={(e) => setNoteValue(e.target.value)} 
          className="flex-1 p-3 bg-slate-50 border-0 rounded-xl text-xs font-bold focus:ring-2 focus:ring-blue-500 outline-none"
        />
        <button 
          onClick={() => setTreatmentValue(!displayTreatment)}
          className={`p-3 rounded-xl border-2 transition-all flex items-center gap-2 font-black text-[10px] uppercase ${displayTreatment ? 'bg-red-500 border-red-500 text-white' : 'bg-white border-slate-100 text-slate-400'}`}
        >
          <ClipboardCheck size={16}/> {displayTreatment ? 'Treated' : 'Treat?'}
        </button>
      </div>

      <div className="space-y-3">
        <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-2">{currentPeriod} Feeding</div>
        <div className="grid grid-cols-5 gap-2">
          {[0, 25, 50, 75, 100].map(pct => (
            <button 
              key={pct} 
              onClick={() => onRecord(pct)} 
              className={`py-5 rounded-2xl font-black text-sm transition-all shadow-sm ${todayFeeding?.consumption === pct ? 'bg-blue-600 text-white ring-4 ring-blue-100' : 'bg-slate-50 text-slate-300 hover:bg-slate-100'}`}
            >
              {pct}%
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
