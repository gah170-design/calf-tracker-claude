'use client';

import React, { useState, useEffect } from 'react';
import { Plus, Settings, X, ChevronLeft, Trash2, History, Activity, TrendingUp, TrendingDown, ShoppingCart, Ghost } from 'lucide-react';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

// --- TIMEZONE UTILITY (Eastern Time) ---
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
    let finalNumber;
    let bullNumber = null;
    
    if (newCalf.isBull) {
      bullNumber = `M${settings.nextBullNumber}`;
      finalNumber = bullNumber; // We store it in 'number' for general UI but bull_number for the DB column
    } else {
      const autoNum = settings.nextCalfNumber;
      if (newCalf.name.trim() !== "") {
        const custom = prompt(`Use next number (#${autoNum}) or enter custom number?`, autoNum);
        if (!custom) return;
        finalNumber = custom;
      } else {
        finalNumber = autoNum.toString();
      }
    }

    const { error } = await supabase.from('calves').insert([{
      number: finalNumber,
      bull_number: bullNumber,
      name: newCalf.name.trim() || null,
      birth_date: newCalf.birthDate,
      status: 'active',
      type: newCalf.isBull ? 'bull' : 'heifer'
    }]);

    if (!error) {
      if (newCalf.isBull) {
        await saveSettings('nextBullNumber', settings.nextBullNumber + 1);
      } else if (finalNumber === settings.nextCalfNumber.toString()) {
        await saveSettings('nextCalfNumber', settings.nextCalfNumber + 1);
      }
      setShowAddCalf(false);
      setNewCalf({ name: '', birthDate: getETDate().toISOString().slice(0, 16), isBull: false });
      await loadAllData();
    }
  };

  const recordFeeding = async (calf, consumption) => {
    const etNow = getETDate();
    const period = etNow.getHours() < 12 ? 'AM' : 'PM';
    const today = etNow.toISOString().slice(0, 10);
    
    // Check existing by calf number OR bull number
    const existing = feedings.find(f => 
      (f.calf_number === calf.number || (calf.bull_number && f.bull_number === calf.bull_number)) && 
      f.timestamp.startsWith(today) && 
      f.period === period
    );

    if (existing) {
      await supabase.from('feedings').update({ consumption, timestamp: etNow.toISOString() }).eq('id', existing.id);
    } else {
      await supabase.from('feedings').insert([{
        calf_number: calf.number,
        bull_number: calf.bull_number,
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
    if (confirm(`Mark this calf as ${status.toUpperCase()}?`)) {
      await supabase.from('calves').update({ status }).eq('id', id);
      await loadAllData();
    }
  };

  const getCalfAge = (date) => Math.floor((getETDate() - new Date(date)) / (1000 * 60 * 60 * 24));
  
  const getCalfFeedings = (calf) => {
    return feedings.filter(f => 
      f.calf_number === calf.number || (calf.bull_number && f.bull_number === calf.bull_number)
    ).sort((a,b) => new Date(b.timestamp) - new Date(a.timestamp));
  };

  const getProtocolStatus = (calf) => {
    if (calf.type === 'bull') return 'Bottle (Bull)';
    const age = getCalfAge(calf.birth_date);
    const count = getCalfFeedings(calf).length;
    for (let p of protocols) {
      if (p.type === 'feedings' && count < p.value) return p.name;
      if (p.type === 'days' && age < p.value) return p.name;
    }
    return protocols[protocols.length - 1]?.name || 'Finished';
  };

  const getCurrentPeriod = () => getETDate().getHours() < 12 ? 'AM' : 'PM';

  if (loading) return <div className="h-screen flex items-center justify-center font-black animate-pulse">SYNCING HERD...</div>;

  if (!currentUser) {
    return (
      <div className="h-screen bg-slate-900 flex items-center justify-center p-6">
        <div className="bg-white rounded-[3rem] p-10 w-full max-w-sm shadow-2xl text-center">
          <h1 className="font-black text-3xl mb-8 italic tracking-tighter">SELECT OPERATOR</h1>
          <div className="space-y-4">
            {users.map(u => (
              <button key={u.id} onClick={() => { setSelectedUser(u); setShowPinEntry(true); }} className="w-full p-6 bg-slate-100 hover:bg-blue-600 hover:text-white rounded-3xl font-black transition-all uppercase flex justify-between items-center group">
                {u.name} <Activity className="opacity-0 group-hover:opacity-100" />
              </button>
            ))}
          </div>
        </div>
        {showPinEntry && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-md z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-[3rem] p-8 w-full max-w-xs text-center space-y-4">
              <h2 className="font-black italic uppercase">Pin for {selectedUser.name}</h2>
              <input type="password" inputMode="numeric" maxLength="4" value={pinInput} onChange={(e) => setPinInput(e.target.value)} className="w-full p-5 bg-slate-50 rounded-2xl text-center text-2xl font-black tracking-[1em]" autoFocus />
              <button onClick={() => { if(pinInput === selectedUser.pin) { setCurrentUser(selectedUser); setShowPinEntry(false); setPinInput(''); } else { alert("Wrong Pin"); setPinInput(''); }}} className="w-full bg-blue-600 text-white py-4 rounded-2xl font-black">LOGIN</button>
            </div>
          </div>
        )}
      </div>
    );
  }

  const activeHeifers = calves.filter(c => c.status === 'active' && c.type !== 'bull');
  const activeBulls = calves.filter(c => c.status === 'active' && c.type === 'bull');
  const flaggedCalves = activeHeifers.filter(c => {
    const history = getCalfFeedings(c).slice(0, 2);
    return history.length >= 2 && history.every(f => f.consumption <= 50);
  });

  return (
    <div className="min-h-screen bg-slate-50 pb-24">
      <header className="bg-blue-700 text-white p-6 sticky top-0 z-40 shadow-lg flex justify-between items-center">
        <div>
          <h1 className="font-black text-2xl italic tracking-tighter">CALF TRACKER</h1>
          <p className="text-[10px] font-bold opacity-70 uppercase tracking-widest">{currentUser.name} • {getETDate().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})} ET</p>
        </div>
        <button onClick={() => setShowSettings(true)} className="p-3 bg-white/20 rounded-full"><Settings size={20}/></button>
      </header>

      <main className="p-4 max-w-2xl mx-auto">
        {currentPage === 'dashboard' ? (
          <div className="space-y-4">
            {flaggedCalves.length > 0 && (
              <div onClick={() => { setFilterProtocol('all'); setCurrentPage('flagged'); }} className="bg-red-500 text-white p-6 rounded-[2.5rem] flex justify-between items-center shadow-lg animate-pulse cursor-pointer">
                <div>
                  <div className="text-3xl font-black">{flaggedCalves.length}</div>
                  <div className="text-xs font-black uppercase">Attention Needed</div>
                </div>
                <Activity size={40} />
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <button onClick={() => { setFilterProtocol('all'); setCurrentPage('feed'); }} className="bg-white p-8 rounded-[3rem] shadow-sm border border-slate-100 text-left hover:shadow-md transition">
                <div className="text-4xl font-black text-blue-600">{activeHeifers.length}</div>
                <div className="text-xs font-black text-slate-400 uppercase">Heifers</div>
              </button>
              
              <button onClick={() => { setCurrentPage('bulls'); }} className="bg-white p-8 rounded-[3rem] shadow-sm border border-slate-100 text-left hover:shadow-md transition">
                <div className="text-4xl font-black text-blue-800">{activeBulls.length}</div>
                <div className="text-xs font-black text-slate-400 uppercase">Bull Calves</div>
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3">
              {protocols.map(p => (
                <button key={p.id} onClick={() => { setFilterProtocol(p.name); setCurrentPage('feed'); }} className="bg-slate-100/50 p-4 rounded-[2rem] text-left">
                  <div className="font-black text-blue-600">{activeHeifers.filter(c => getProtocolStatus(c) === p.name).length}</div>
                  <div className="text-[9px] font-black text-slate-500 uppercase">{p.name}</div>
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <button onClick={() => setCurrentPage('dashboard')} className="flex items-center text-blue-600 font-black text-xs uppercase mb-2"><ChevronLeft size={16}/> Back to Dashboard</button>
            
            {(currentPage === 'feed' || currentPage === 'bulls' || currentPage === 'flagged') && (
              (currentPage === 'bulls' ? activeBulls : 
               currentPage === 'flagged' ? flaggedCalves : 
               (filterProtocol === 'all' ? activeHeifers : activeHeifers.filter(c => getProtocolStatus(c) === filterProtocol))
              ).map(calf => (
                <CalfCard 
                  key={calf.id} 
                  calf={calf} 
                  age={getCalfAge(calf.birth_date)}
                  protocol={getProtocolStatus(calf)}
                  history={getCalfFeedings(calf)}
                  currentPeriod={getCurrentPeriod()}
                  onRecord={(pct) => recordFeeding(calf, pct)}
                  onStatus={updateStatus}
                  onShowHistory={() => setSelectedCalfHistory(calf)}
                  admin={currentUser.role === 'admin'}
                />
              ))
            )}
          </div>
        )}
      </main>

      {/* FOOTER ACTION */}
      <div className="fixed bottom-0 left-0 right-0 p-6 bg-gradient-to-t from-slate-50 via-slate-50 to-transparent flex justify-center">
        <button onClick={() => setShowAddCalf(true)} className="bg-slate-900 text-white w-full max-w-xs py-5 rounded-[2.5rem] font-black shadow-2xl flex items-center justify-center gap-2">
          <Plus /> ADD NEW CALF
        </button>
      </div>

      {/* ADD CALF MODAL */}
      {showAddCalf && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[60] flex items-center justify-center p-4">
          <div className="bg-white rounded-[3rem] p-8 w-full max-w-sm space-y-6 shadow-2xl">
            <h2 className="text-2xl font-black italic">NEW ENTRY</h2>
            <div className="flex gap-2 p-1 bg-slate-100 rounded-2xl">
               <button onClick={() => setNewCalf({...newCalf, isBull: false})} className={`flex-1 py-3 rounded-xl font-black text-xs ${!newCalf.isBull ? 'bg-white shadow-sm' : 'text-slate-400'}`}>HEIFER</button>
               <button onClick={() => setNewCalf({...newCalf, isBull: true})} className={`flex-1 py-3 rounded-xl font-black text-xs ${newCalf.isBull ? 'bg-white shadow-sm text-blue-600' : 'text-slate-400'}`}>BULL</button>
            </div>
            <input type="text" placeholder="Name (Optional)" value={newCalf.name} onChange={(e) => setNewCalf({...newCalf, name: e.target.value})} className="w-full p-5 bg-slate-50 rounded-2xl font-bold border-0 focus:ring-2 focus:ring-blue-500" />
            <input type="datetime-local" value={newCalf.birthDate} onChange={(e) => setNewCalf({...newCalf, birthDate: e.target.value})} className="w-full p-5 bg-slate-50 rounded-2xl font-bold border-0" />
            <div className="flex flex-col gap-2">
              <button onClick={addCalf} className="w-full bg-blue-600 text-white py-5 rounded-3xl font-black">CREATE #{newCalf.isBull ? 'M'+settings.nextBullNumber : settings.nextCalfNumber}</button>
              <button onClick={() => setShowAddCalf(false)} className="py-2 text-slate-400 font-black text-xs">CANCEL</button>
            </div>
          </div>
        </div>
      )}

      {/* HISTORY MODAL */}
      {selectedCalfHistory && (
        <div className="fixed inset-0 bg-white z-[100] flex flex-col">
          <div className="p-6 border-b flex justify-between items-center bg-slate-50">
            <h2 className="text-xl font-black">#{selectedCalfHistory.bull_number || selectedCalfHistory.number} HISTORY</h2>
            <button onClick={() => setSelectedCalfHistory(null)} className="p-2 bg-slate-200 rounded-full"><X/></button>
          </div>
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
             {getCalfFeedings(selectedCalfHistory).length === 0 ? (
               <p className="text-center py-20 font-bold text-slate-400 italic uppercase">No records found</p>
             ) : (
               getCalfFeedings(selectedCalfHistory).map((f, i) => (
                 <div key={i} className="p-5 bg-slate-50 rounded-[2rem] border border-slate-100">
                    <div className="flex justify-between items-center mb-2">
                       <span className={`px-3 py-1 rounded-lg text-white font-black text-xs ${f.consumption >= 100 ? 'bg-green-500' : f.consumption >= 50 ? 'bg-yellow-500' : 'bg-red-500'}`}>{f.consumption}%</span>
                       <span className="text-[10px] font-black text-slate-400 uppercase">{new Date(f.timestamp).toLocaleDateString()} {f.period}</span>
                    </div>
                    {f.notes && <p className="text-sm italic text-slate-600 mb-2">"{f.notes}"</p>}
                    <div className="text-[9px] font-bold text-slate-400 uppercase">Recorded by {f.user_name}</div>
                 </div>
               ))
             )}
          </div>
        </div>
      )}

      {/* SETTINGS MODAL */}
      {showSettings && (
        <div className="fixed inset-0 bg-white z-[100] flex flex-col">
          <div className="p-6 border-b flex justify-between items-center bg-slate-50">
            <h2 className="font-black italic text-xl">SYSTEM SETTINGS</h2>
            <button onClick={() => setShowSettings(false)} className="p-3 bg-slate-100 rounded-full"><X/></button>
          </div>
          <div className="p-6 space-y-8 overflow-y-auto">
            <section>
              <h3 className="text-xs font-black text-slate-400 uppercase mb-4">Numbering</h3>
              <div className="space-y-3">
                 <div className="flex justify-between items-center bg-slate-50 p-4 rounded-2xl">
                    <span className="font-bold">Next Heifer #</span>
                    <input type="number" value={settings.nextCalfNumber} onChange={(e) => saveSettings('nextCalfNumber', e.target.value)} className="w-20 p-2 text-right bg-white rounded-lg font-black text-blue-600 border" />
                 </div>
                 <div className="flex justify-between items-center bg-slate-50 p-4 rounded-2xl">
                    <span className="font-bold">Next Bull # (M-series)</span>
                    <input type="number" value={settings.nextBullNumber} onChange={(e) => saveSettings('nextBullNumber', e.target.value)} className="w-20 p-2 text-right bg-white rounded-lg font-black text-blue-600 border" />
                 </div>
              </div>
            </section>
          </div>
        </div>
      )}
    </div>
  );
}

function CalfCard({ calf, age, protocol, history, currentPeriod, onRecord, onStatus, onShowHistory }) {
  const latest = history.slice(0, 3).reverse();
  const trend = history.length > 1 ? (history[0].consumption > history[1].consumption ? 'up' : 'down') : null;
  const todayFeeding = history.find(f => f.timestamp.startsWith(getETDate().toISOString().slice(0, 10)) && f.period === currentPeriod);

  return (
    <div className={`bg-white p-6 rounded-[2.5rem] shadow-sm border-2 ${calf.type === 'bull' ? 'border-blue-200' : 'border-slate-100'}`}>
      <div className="flex justify-between items-start mb-4">
        <div onClick={onShowHistory} className="cursor-pointer">
          <div className="flex items-center gap-2">
            <h3 className="text-3xl font-black italic tracking-tighter">#{calf.bull_number || calf.number}</h3>
            {trend === 'up' && <TrendingUp className="text-green-500" size={20}/>}
            {trend === 'down' && <TrendingDown className="text-red-500" size={20}/>}
          </div>
          <p className="text-[10px] font-black text-slate-400 uppercase">{age} Days • {protocol} {calf.name && `• ${calf.name}`}</p>
        </div>
        
        <div className="flex gap-1">
          {calf.type === 'bull' && (
            <button onClick={() => onStatus(calf.id, 'sold')} className="p-3 bg-blue-50 text-blue-600 rounded-2xl"><ShoppingCart size={18}/></button>
          )}
          <button onClick={() => onStatus(calf.id, 'died')} className="p-3 bg-red-50 text-red-400 rounded-2xl"><Ghost size={18}/></button>
        </div>
      </div>

      <div className="flex gap-2 mb-4">
        {latest.length === 0 ? <div className="text-[9px] font-bold text-slate-300 uppercase">No recent feedings</div> : latest.map((f, i) => (
          <div key={i} className={`flex-1 py-2 rounded-xl text-center text-white text-[10px] font-black ${f.consumption >= 100 ? 'bg-green-500' : f.consumption >= 50 ? 'bg-yellow-500' : 'bg-red-500'}`}>
            {f.consumption}%
          </div>
        ))}
      </div>

      <div className="text-[10px] font-black text-slate-400 uppercase mb-2">Today {currentPeriod}</div>
      <div className="grid grid-cols-5 gap-2">
        {[0, 25, 50, 75, 100].map(pct => (
          <button key={pct} onClick={() => onRecord(pct)} className={`py-4 rounded-2xl font-black text-xs transition-all ${todayFeeding?.consumption === pct ? 'bg-blue-600 text-white shadow-lg' : 'bg-slate-50 text-slate-300'}`}>
            {pct}%
          </button>
        ))}
      </div>
    </div>
  );
}
