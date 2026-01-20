'use client';

import React, { useState, useEffect } from 'react';
import { Plus, Settings, X, ChevronLeft, Activity, ShoppingCart, Ghost, ClipboardCheck, CheckCircle2, LogOut, Save, Trash2, Users, ListChecks, Hash, Edit3, BarChart3 } from 'lucide-react';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

// Helper to get current ET date/time
const getETDate = () => {
  const now = new Date();
  const etString = now.toLocaleString("en-US", { timeZone: "America/New_York" });
  return new Date(etString);
};

// Helper to get ET date string (YYYY-MM-DD) from any date
const getETDateString = (date) => {
  const etDate = new Date(date.toLocaleString("en-US", { timeZone: "America/New_York" }));
  const year = etDate.getFullYear();
  const month = String(etDate.getMonth() + 1).padStart(2, '0');
  const day = String(etDate.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

// Helper to convert UTC timestamp to ET date string
const utcToETDateString = (utcTimestamp) => {
  const utcDate = new Date(utcTimestamp);
  return getETDateString(utcDate);
};

// Helper to get current ET period (AM/PM)
const getETPeriod = () => {
  const etNow = getETDate();
  return etNow.getHours() < 12 ? 'AM' : 'PM';
};

// Calculate calf age in days (updates at midnight ET)
const getCalfAgeDays = (birthDateString) => {
  // Parse birth date as ET
  const birthDate = new Date(birthDateString);
  const birthETString = getETDateString(birthDate);
  
  // Get today's ET date string
  const todayETString = getETDateString(getETDate());
  
  // Calculate difference in days
  const birthET = new Date(birthETString);
  const todayET = new Date(todayETString);
  const diffTime = todayET - birthET;
  const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
  
  return diffDays;
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
  const [newCalf, setNewCalf] = useState({ 
    name: '', 
    birthDate: new Date(getETDate().getTime() - getETDate().getTimezoneOffset() * 60000).toISOString().slice(0, 16), 
    isBull: false 
  });
  
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
    
    // Find existing feeding for this calf, today (ET), and current period
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
      timestamp: new Date().toISOString(), // Store as UTC
      notes: noteBuffer[calfKey] !== undefined ? noteBuffer[calfKey] : (existing ? existing.notes : null),
      treatment: treatmentBuffer[calfKey] !== undefined ? treatmentBuffer[calfKey] : (existing ? existing.treatment : false),
      user_name: currentUser.name,
      calf_number: calf.type !== 'bull' ? calf.number : null,
      bull_number: calf.type === 'bull' ? calf.bull_number : null,
      calf_name: calf.name || null,
      period,
    };

    if (existing) {
      await supabase.from('feedings').update(feedingData).eq('id', existing.id);
    } else {
      await supabase.from('feedings').insert([feedingData]);
    }

    setNoteBuffer(prev => { const n = {...prev}; delete n[calfKey]; return n; });
    setTreatmentBuffer(prev => { const n = {...prev}; delete n[calfKey]; return n; });
    await loadAllData();
  };

  const getCalfFeedings = (calf) => feedings.filter(f => 
    calf.type === 'bull' ? f.bull_number === calf.bull_number : f.calf_number === calf.number
  ).sort((a,b) => new Date(b.timestamp) - new Date(a.timestamp));

  const getProtocolStatus = (calf) => {
    if (calf.type === 'bull') return 'Bull (Bottle)';
    const age = getCalfAgeDays(calf.birth_date);
    const count = getCalfFeedings(calf).length;
    for (let p of protocols) {
      if (p.type === 'feedings' && count < p.value) return p.name;
      if (p.type === 'days' && age < p.value) return p.name;
    }
    return "Finished";
  };

  if (loading) return <div className="h-screen flex items-center justify-center font-black uppercase italic text-blue-600">Syncing Farm Data...</div>;

  const activeHeifers = calves.filter(c => c.status === 'active' && c.type !== 'bull');
  const activeBulls = calves.filter(c => c.status === 'active' && c.type === 'bull');
  
  // Only count heifers that are NOT weaned yet
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
            <div className="space-y-4 text-left overflow-y-auto max-h-[60vh] no-scrollbar">
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
                <button onClick={() => { if(pinInput === selectedUser.pin) { setCurrentUser(selectedUser); setShowPinEntry(false); setPinInput(''); } else { alert("Wrong Pin"); setPinInput(''); }}} className="w-full bg-blue-600 text-white py-5 rounded-3xl font-black text-lg uppercase">Unlock</button>
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
                        <div className="flex gap-2 overflow-x-auto pb-2 no-scrollbar">
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
        </>
      )}

      {/* SETTINGS MODAL */}
      {showSettings && (
        <div className="fixed inset-0 bg-white z-[100] flex flex-col overflow-y-auto pb-10">
          <div className="p-6 border-b flex justify-between items-center bg-slate-50 sticky top-0 z-10">
            <h2 className="text-3xl font-black italic uppercase tracking-tighter">Farm Settings</h2>
            <button onClick={() => { setShowSettings(false); loadAllData(); }} className="p-3 bg-slate-200 rounded-full"><X size={24}/></button>
          </div>
          <div className="p-6 space-y-10">
            <section className="space-y-4">
                <div className="flex items-center gap-2 text-blue-600 font-black uppercase text-xs tracking-widest"><Hash size={16}/> Counter Control</div>
                <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1">
                        <label className="text-[10px] font-black text-slate-400 uppercase">Next Heifer #</label>
                        <input type="number" value={settings.nextCalfNumber} onChange={(e) => saveGlobalSetting('nextCalfNumber', e.target.value)} className="w-full p-4 bg-slate-100 rounded-2xl font-black text-xl border-0" />
                    </div>
                    <div className="space-y-1">
                        <label className="text-[10px] font-black text-slate-400 uppercase">Next Bull #</label>
                        <input type="number" value={settings.nextBullNumber} onChange={(e) => saveGlobalSetting('nextBullNumber', e.target.value)} className="w-full p-4 bg-slate-100 rounded-2xl font-black text-xl border-0" />
                    </div>
                </div>
            </section>
            <section className="space-y-4">
              <div className="flex items-center justify-between text-blue-600 font-black uppercase text-xs">
                 <div className="flex items-center gap-2"><ListChecks size={16}/> Protocols</div>
                 <button onClick={() => {
                    const name = prompt("Protocol Name");
                    if(name) supabase.from('protocols').insert([{name, type:'feedings', value: 4, order: protocols.length}]).then(() => loadAllData());
                 }} className="p-2 bg-blue-50 rounded-xl"><Plus size={18}/></button>
              </div>
              <div className="space-y-3">
                {protocols.map(p => (
                   <div key={p.id} className="p-4 bg-slate-50 rounded-2xl border flex items-center gap-4">
                      <div className="flex-1">
                         <input defaultValue={p.name} onBlur={(e) => supabase.from('protocols').update({name: e.target.value}).eq('id', p.id)} className="font-black uppercase bg-transparent text-sm w-full outline-none" />
                      </div>
                      <button onClick={() => {if(confirm("Delete?")) supabase.from('protocols').delete().eq('id', p.id).then(() => loadAllData())}} className="text-red-300"><Trash2 size={18}/></button>
                   </div>
                ))}
              </div>
            </section>
            <button onClick={() => { setCurrentUser(null); setShowSettings(false); }} className="w-full p-6 bg-red-50 text-red-600 rounded-[2rem] font-black uppercase">Logout</button>
          </div>
        </div>
      )}

      {/* HISTORY MODAL WITH GRAPH */}
      {selectedCalfHistory && (
        <div className="fixed inset-0 bg-white z-[100] flex flex-col">
          <div className="p-6 border-b flex justify-between items-center bg-slate-50 sticky top-0 z-10">
            <div>
                <h2 className="text-3xl font-black italic text-slate-900 uppercase">#{selectedCalfHistory.bull_number || selectedCalfHistory.number}</h2>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-1">Timeline (Past 14 Shifts)</p>
            </div>
            <button onClick={() => setSelectedCalfHistory(null)} className="p-3 bg-slate-100 rounded-full"><X size={24}/></button>
          </div>
          <div className="flex-1 overflow-y-auto p-4 space-y-6 bg-slate-50">
             <div className="bg-white p-6 rounded-[2.5rem] shadow-sm border border-slate-100">
                <div className="flex items-center gap-2 mb-6 text-blue-600">
                    <BarChart3 size={18}/>
                    <span className="text-xs font-black uppercase tracking-widest">Growth Curve</span>
                </div>
                <div className="relative h-40 bg-slate-50 rounded-xl p-4">
                    <div className="flex items-end justify-between h-full gap-1">
                        {(() => {
                            const allFeedings = getCalfFeedings(selectedCalfHistory);
                            const latest14 = allFeedings.slice(0, 14).reverse();
                            
                            if(latest14.length === 0) {
                              return <div className="w-full h-full flex items-center justify-center text-[10px] font-black text-slate-300 uppercase italic">No Data Yet</div>;
                            }
                            
                            return latest14.map((f, i) => {
                              const heightPercent = Math.max(f.consumption, 5);
                              return (
                                <div key={i} className="flex-1 flex flex-col items-center justify-end h-full">
                                    <div 
                                        className={`w-full rounded-t transition-all ${f.consumption >= 100 ? 'bg-green-500' : f.consumption >= 50 ? 'bg-yellow-500' : 'bg-red-500'}`}
                                        style={{ height: `${heightPercent}%` }} 
                                    />
                                    <div className="text-[7px] font-black text-slate-400 mt-1 uppercase">{f.period}</div>
                                </div>
                              );
                            });
                        })()}
                    </div>
                </div>
             </div>
             <div className="space-y-3 pb-10">
                {getCalfFeedings(selectedCalfHistory).map((f, i) => (
                  <div key={i} className="p-5 bg-white rounded-3xl border border-slate-100 shadow-sm">
                      <div className="flex justify-between items-center mb-2">
                        <span className={`px-4 py-2 rounded-2xl text-white font-black text-xs ${f.consumption >= 100 ? 'bg-green-500' : f.consumption >= 50 ? 'bg-yellow-500' : 'bg-red-500'}`}>{f.consumption}%</span>
                        {f.treatment && <span className="text-red-600 font-black text-[10px] uppercase bg-red-50 px-3 py-1.5 rounded-full">Treated</span>}
                      </div>
                      {f.notes && <p className="text-sm italic text-slate-600 bg-slate-50 p-3 rounded-xl mb-2">"{f.notes}"</p>}
                      <p className="text-[10px] font-black text-slate-400 uppercase">{new Date(f.timestamp).toLocaleDateString()} • {f.period}</p>
                  </div>
                ))}
             </div>
          </div>
        </div>
      )}

      {/* FOOTER BUTTON */}
      <div className="fixed bottom-0 left-0 right-0 p-6 flex justify-center z-30 pointer-events-none">
        <button onClick={() => setShowAddCalf(true)} className="bg-slate-900 text-white w-full max-w-xs py-5 rounded-[2.5rem] font-black shadow-2xl flex items-center justify-center gap-3 pointer-events-auto active:scale-95 transition-transform">
          <Plus size={24}/> ADD NEW CALF
        </button>
      </div>

      {showAddCalf && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[60] flex items-center justify-center p-4">
          <div className="bg-white rounded-[3rem] p-8 w-full max-w-sm space-y-6 shadow-2xl">
            <h2 className="text-2xl font-black italic text-slate-800 uppercase">New Entry</h2>
            <div className="flex gap-2 p-1.5 bg-slate-100 rounded-2xl">
               <button onClick={() => setNewCalf({...newCalf, isBull: false})} className={`flex-1 py-3 rounded-xl font-black text-xs transition-all ${!newCalf.isBull ? 'bg-white shadow-md text-blue-600' : 'text-slate-400'}`}>HEIFER</button>
               <button onClick={() => setNewCalf({...newCalf, isBull: true})} className={`flex-1 py-3 rounded-xl font-black text-xs transition-all ${newCalf.isBull ? 'bg-white shadow-md text-blue-800' : 'text-slate-400'}`}>BULL</button>
            </div>
            <div className="space-y-4 text-left">
              <input type="text" placeholder="Name (Optional)" value={newCalf.name} onChange={(e) => setNewCalf({...newCalf, name: e.target.value})} className="w-full p-5 bg-slate-50 rounded-2xl font-bold border-0 outline-none text-slate-800" />
              <div>
                <label className="text-[10px] font-black text-slate-400 uppercase ml-2 tracking-widest">Birth Date</label>
                <input type="datetime-local" value={newCalf.birthDate} onChange={(e) => setNewCalf({...newCalf, birthDate: e.target.value})} className="w-full p-5 bg-slate-50 rounded-2xl font-bold border-0 mt-1 outline-none text-slate-800" />
              </div>
            </div>
            <button onClick={addCalf} className="w-full bg-blue-600 text-white py-5 rounded-3xl font-black text-lg shadow-lg uppercase">Create</button>
            <button onClick={() => setShowAddCalf(false)} className="w-full text-slate-400 font-black text-xs uppercase text-center">Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}

// CalfCard Component
function CalfCard({ calf, age, protocol, history, currentPeriod, onRecord, onStatus, onShowHistory, noteValue, setNoteValue, treatmentValue, setTreatmentValue }) {
  const latest = [...history].slice(0, 3).reverse();
  const todayET = getETDateString(getETDate());
  const todayFeeding = history.find(f => {
    const feedingET = utcToETDateString(f.timestamp);
    return feedingET === todayET && f.period === currentPeriod;
  });

  const displayNote = noteValue !== undefined ? noteValue : (todayFeeding?.notes || '');
  const displayTreatment = treatmentValue !== undefined ? treatmentValue : (todayFeeding?.treatment || false);

  return (
    <div className={`bg-white p-6 rounded-[2.5rem] shadow-sm border-2 transition-all ${todayFeeding ? 'border-green-200 opacity-90' : (calf.type === 'bull' ? 'border-blue-200' : 'border-slate-100')}`}>
      <div className="flex justify-between items-start mb-4">
        <div onClick={onShowHistory} className="cursor-pointer">
          <div className="flex items-center gap-2">
            <h3 className="text-4xl font-black italic tracking-tighter text-slate-900 leading-none">#{calf.bull_number || calf.number}</h3>
            {todayFeeding && <CheckCircle2 className="text-green-500" size={24} />}
          </div>
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-1 leading-none">{age} Days • {protocol}</p>
        </div>
        <div className="flex gap-2">
          {calf.type === 'bull' && <button onClick={() => onStatus(calf.id, 'sold')} className="p-3 bg-blue-50 text-blue-600 rounded-2xl transition-colors"><ShoppingCart size={20}/></button>}
          <button onClick={() => onStatus(calf.id, 'died')} className="p-3 bg-red-50 text-red-400 rounded-2xl transition-colors"><Ghost size={20}/></button>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2 mb-4" onClick={onShowHistory}>
        {latest.length > 0 ? latest.map((f, i) => (
          <div key={i} className="flex flex-col items-center">
            <div className={`w-full py-2 rounded-xl text-center text-white text-[9px] font-black shadow-sm ${f.consumption >= 100 ? 'bg-green-500' : f.consumption >= 50 ? 'bg-yellow-500' : 'bg-red-500'}`}>
              {f.consumption}%
            </div>
            <div className="text-[11px] font-black text-slate-600 uppercase mt-1 tracking-tight text-center leading-tight">
              <div>{new Date(f.timestamp).toLocaleDateString(undefined, {month:'numeric', day:'numeric'})}</div>
              <div className="text-blue-600">{f.period}</div>
            </div>
          </div>
        )) : <div className="col-span-3 py-2 border-2 border-dashed border-slate-50 rounded-xl text-center text-[8px] font-black text-slate-200 uppercase tracking-widest flex items-center justify-center italic">No Feedings</div>}
      </div>

      <div className="flex gap-2 items-center mb-6">
        <input 
          type="text" 
          placeholder="Shift notes..." 
          value={displayNote} 
          onChange={(e) => setNoteValue(e.target.value)} 
          className="flex-1 p-3 bg-slate-50 border-0 rounded-xl text-xs font-bold outline-none text-slate-800"
        />
        <button 
          onClick={() => setTreatmentValue(!displayTreatment)}
          className={`p-3 rounded-xl border-2 transition-all flex items-center gap-2 font-black text-[10px] uppercase ${displayTreatment ? 'bg-red-500 border-red-500 text-white shadow-md' : 'bg-white border-slate-100 text-slate-400'}`}
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
              className={`py-5 rounded-2xl font-black text-sm transition-all shadow-sm ${todayFeeding?.consumption === pct ? 'bg-blue-600 text-white ring-4 ring-blue-100 scale-95' : 'bg-slate-50 text-slate-300 active:bg-slate-100'}`}
            >
              {pct}%
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
