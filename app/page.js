'use client';

import React, { useState, useEffect } from 'react';
import { Plus, Settings, X, ChevronLeft, Trash2, History, Activity, TrendingUp, TrendingDown, ShoppingCart, Ghost } from 'lucide-react';
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

  const addCalf = async () => {
    let bullNumber = null;
    let dbNumberValue;
    
    if (newCalf.isBull) {
      bullNumber = `M${settings.nextBullNumber}`;
      dbNumberValue = 0; // Bull indicator for the integer column
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
      if (newCalf.isBull) {
        await saveSettings('nextBullNumber', settings.nextBullNumber + 1);
      } else if (dbNumberValue === settings.nextCalfNumber) {
        await saveSettings('nextCalfNumber', settings.nextCalfNumber + 1);
      }
      setShowAddCalf(false);
      setNewCalf({ name: '', birthDate: getETDate().toISOString().slice(0, 16), isBull: false });
      await loadAllData();
    } else {
      alert("Error: " + error.message);
    }
  };

  const recordFeeding = async (calf, consumption) => {
    const etNow = getETDate();
    const period = etNow.getHours() < 12 ? 'AM' : 'PM';
    const today = etNow.toISOString().slice(0, 10);
    
    const existing = feedings.find(f => 
      (calf.type === 'bull' ? f.bull_number === calf.bull_number : f.calf_number === calf.number) && 
      f.timestamp.startsWith(today) && f.period === period
    );

    if (existing) {
      await supabase.from('feedings').update({ consumption, timestamp: etNow.toISOString() }).eq('id', existing.id);
    } else {
      await supabase.from('feedings').insert([{
        calf_number: calf.type !== 'bull' ? calf.number : null,
        bull_number: calf.type === 'bull' ? calf.bull_number : null,
        calf_name: calf.name || null,
        timestamp: etNow.toISOString(),
        period,
        consumption,
        user_name: currentUser.name
      }]);
    }
    await loadAllData();
  };

  const updateStatus = async (id, status) => {
    if (confirm(`Mark as ${status.toUpperCase()}?`)) {
      await supabase.from('calves').update({ status }).eq('id', id);
      await loadAllData();
    }
  };

  const getCalfAge = (date) => Math.floor((getETDate() - new Date(date)) / (1000 * 60 * 60 * 24));
  const getCalfFeedings = (calf) => feedings.filter(f => 
    calf.type === 'bull' ? f.bull_number === calf.bull_number : f.calf_number === calf.number
  ).sort((a,b) => new Date(b.timestamp) - new Date(a.timestamp));

  if (loading) return <div className="h-screen flex items-center justify-center font-black">LOADING...</div>;

  if (!currentUser) {
    return (
      <div className="h-screen bg-slate-900 flex items-center justify-center p-6">
        <div className="bg-white rounded-[3rem] p-10 w-full max-w-sm shadow-2xl text-center">
          <h1 className="font-black text-3xl mb-8 italic tracking-tighter">SELECT OPERATOR</h1>
          <div className="space-y-4">
            {users.map(u => (
              <button key={u.id} onClick={() => { setSelectedUser(u); setShowPinEntry(true); }} className="w-full p-6 bg-slate-100 rounded-3xl font-black transition-all uppercase flex justify-between items-center group">
                {u.name} <Activity className="opacity-0 group-hover:opacity-100" />
              </button>
            ))}
          </div>
        </div>
        {showPinEntry && (
          <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-50 flex items-center justify-center p-4 text-center">
            <div className="bg-white rounded-[3rem] p-8 w-full max-w-xs space-y-4">
              <h2 className="font-black italic uppercase">Pin for {selectedUser.name}</h2>
              <input type="password" inputMode="numeric" maxLength="4" value={pinInput} onChange={(e) => setPinInput(e.target.value)} className="w-full p-5 bg-slate-50 rounded-2xl text-center text-3xl font-black tracking-widest outline-none border-2 border-transparent focus:border-blue-600" autoFocus />
              <button onClick={() => { if(pinInput === selectedUser.pin) { setCurrentUser(selectedUser); setShowPinEntry(false); setPinInput(''); } else { alert("Wrong Pin"); setPinInput(''); }}} className="w-full bg-blue-600 text-white py-5 rounded-3xl font-black">UNLOCK</button>
            </div>
          </div>
        )}
      </div>
    );
  }

  const activeHeifers = calves.filter(c => c.status === 'active' && c.type !== 'bull');
  const activeBulls = calves.filter(c => c.status === 'active' && c.type === 'bull');

  return (
    <div className="min-h-screen bg-slate-50 pb-28">
      <header className="bg-blue-700 text-white p-6 sticky top-0 z-40 shadow-lg flex justify-between items-center">
        <div>
          <h1 className="font-black text-2xl italic tracking-tighter">CALF TRACKER</h1>
          <p className="text-[10px] font-bold opacity-70 uppercase tracking-widest">{currentUser.name}</p>
        </div>
        <button onClick={() => setShowSettings(true)} className="p-3 bg-white/20 rounded-full"><Settings size={20}/></button>
      </header>

      <main className="p-4 max-w-2xl mx-auto space-y-4">
        {currentPage === 'dashboard' ? (
          <div className="grid grid-cols-2 gap-4">
            <button onClick={() => setCurrentPage('feed')} className="bg-white aspect-square rounded-[3rem] shadow-sm border border-slate-200 flex flex-col items-center justify-center group">
              <div className="text-5xl font-black text-blue-600 group-hover:scale-110 transition-transform">{activeHeifers.length}</div>
              <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-2">Heifers</div>
            </button>
            <button onClick={() => setCurrentPage('bulls')} className="bg-white aspect-square rounded-[3rem] shadow-sm border border-slate-200 flex flex-col items-center justify-center group">
              <div className="text-5xl font-black text-blue-800 group-hover:scale-110 transition-transform">{activeBulls.length}</div>
              <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-2">Bulls</div>
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            <button onClick={() => setCurrentPage('dashboard')} className="flex items-center text-blue-600 font-black text-xs uppercase mb-2 bg-blue-50 px-4 py-2 rounded-full"><ChevronLeft size={16}/> Dashboard</button>
            {(currentPage === 'bulls' ? activeBulls : activeHeifers).map(calf => (
              <CalfCard 
                key={calf.id} 
                calf={calf} 
                age={getCalfAge(calf.birth_date)}
                history={getCalfFeedings(calf)}
                currentPeriod={getETDate().getHours() < 12 ? 'AM' : 'PM'}
                onRecord={(pct) => recordFeeding(calf, pct)}
                onStatus={updateStatus}
                onShowHistory={() => setSelectedCalfHistory(calf)}
              />
            ))}
          </div>
        )}
      </main>

      <div className="fixed bottom-0 left-0 right-0 p-6 flex justify-center z-30">
        <button onClick={() => setShowAddCalf(true)} className="bg-slate-900 text-white w-full max-w-xs py-5 rounded-[2.5rem] font-black shadow-2xl flex items-center justify-center gap-3">
          <Plus size={24}/> ADD NEW CALF
        </button>
      </div>

      {showAddCalf && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[60] flex items-center justify-center p-4">
          <div className="bg-white rounded-[3rem] p-8 w-full max-w-sm space-y-6 shadow-2xl">
            <h2 className="text-2xl font-black italic">NEW ENTRY</h2>
            <div className="flex gap-2 p-1.5 bg-slate-100 rounded-2xl">
               <button onClick={() => setNewCalf({...newCalf, isBull: false})} className={`flex-1 py-3 rounded-xl font-black text-xs ${!newCalf.isBull ? 'bg-white shadow-md text-blue-600' : 'text-slate-400'}`}>HEIFER</button>
               <button onClick={() => setNewCalf({...newCalf, isBull: true})} className={`flex-1 py-3 rounded-xl font-black text-xs ${newCalf.isBull ? 'bg-white shadow-md text-blue-800' : 'text-slate-400'}`}>BULL</button>
            </div>
            <input type="text" placeholder="Name (Optional)" value={newCalf.name} onChange={(e) => setNewCalf({...newCalf, name: e.target.value})} className="w-full p-5 bg-slate-50 rounded-2xl font-bold border-0" />
            <input type="datetime-local" value={newCalf.birthDate} onChange={(e) => setNewCalf({...newCalf, birthDate: e.target.value})} className="w-full p-5 bg-slate-50 rounded-2xl font-bold border-0" />
            <button onClick={addCalf} className="w-full bg-blue-600 text-white py-5 rounded-3xl font-black text-lg">CREATE {newCalf.isBull ? 'BULL M'+settings.nextBullNumber : 'HEIFER #'+settings.nextCalfNumber}</button>
            <button onClick={() => setShowAddCalf(false)} className="w-full py-2 text-slate-400 font-black text-xs">CANCEL</button>
          </div>
        </div>
      )}

      {selectedCalfHistory && (
        <div className="fixed inset-0 bg-white z-[100] flex flex-col">
          <div className="p-6 border-b flex justify-between items-center bg-slate-50">
            <h2 className="text-2xl font-black italic">#{selectedCalfHistory.bull_number || selectedCalfHistory.number}</h2>
            <button onClick={() => setSelectedCalfHistory(null)} className="p-3 bg-slate-100 rounded-full"><X/></button>
          </div>
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
             {getCalfFeedings(selectedCalfHistory).map((f, i) => (
               <div key={i} className="p-5 bg-slate-50 rounded-3xl border border-slate-100 shadow-sm">
                  <div className="flex justify-between items-center">
                     <span className={`px-4 py-1.5 rounded-full text-white font-black text-xs ${f.consumption >= 100 ? 'bg-green-500' : f.consumption >= 50 ? 'bg-yellow-500' : 'bg-red-500'}`}>{f.consumption}%</span>
                     <span className="text-[10px] font-black text-slate-400 uppercase">{new Date(f.timestamp).toLocaleDateString()} {f.period}</span>
                  </div>
               </div>
             ))}
          </div>
        </div>
      )}
    </div>
  );
}

function CalfCard({ calf, age, history, currentPeriod, onRecord, onStatus, onShowHistory }) {
  const latest = [...history].slice(0, 3).reverse();
  const todayStr = getETDate().toISOString().slice(0, 10);
  const todayFeeding = history.find(f => f.timestamp.startsWith(todayStr) && f.period === currentPeriod);

  return (
    <div className={`bg-white p-6 rounded-[2.5rem] shadow-sm border-2 ${calf.type === 'bull' ? 'border-blue-200' : 'border-slate-100'}`}>
      <div className="flex justify-between items-start mb-4">
        <div onClick={onShowHistory} className="cursor-pointer">
          <h3 className="text-4xl font-black italic tracking-tighter">#{calf.bull_number || calf.number}</h3>
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{age} Days {calf.name && `• ${calf.name}`}</p>
        </div>
        <div className="flex gap-2">
          {calf.type === 'bull' && <button onClick={() => onStatus(calf.id, 'sold')} className="p-3 bg-blue-50 text-blue-600 rounded-2xl"><ShoppingCart size={20}/></button>}
          <button onClick={() => onStatus(calf.id, 'died')} className="p-3 bg-red-50 text-red-400 rounded-2xl"><Ghost size={20}/></button>
        </div>
      </div>
      <div className="grid grid-cols-5 gap-2 mt-4">
        {[0, 25, 50, 75, 100].map(pct => (
          <button key={pct} onClick={() => onRecord(pct)} className={`py-5 rounded-2xl font-black text-sm ${todayFeeding?.consumption === pct ? 'bg-blue-600 text-white' : 'bg-slate-50 text-slate-300'}`}>
            {pct}%
          </button>
        ))}
      </div>
    </div>
  );
}
