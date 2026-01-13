'use client';

import React, { useState, useEffect } from 'react';
import { Plus, Settings, X, ChevronLeft, Activity, ShoppingCart, Ghost, ClipboardCheck, CheckCircle2, LogOut, Save, Trash2, Users, ListChecks, Hash, Edit3, BarChart3 } from 'lucide-react';
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
      setNewCalf({ name: '', birthDate: getETDate().toISOString().slice(0, 16), isBull: false });
      await loadAllData();
    }
  };

  const recordFeeding = async (calf, consumption) => {
    const etNow = getETDate();
    const period = etNow.getHours() < 12 ? 'AM' : 'PM';
    const today = etNow.toISOString().slice(0, 10);
    const calfKey = calf.bull_number || calf.number;
    
    const existing = feedings.find(f => 
      (calf.type === 'bull' ? f.bull_number === calf.bull_number : f.calf_number === calf.number) && 
      f.timestamp.startsWith(today) && f.period === period
    );

    const feedingData = {
      consumption,
      timestamp: etNow.toISOString(),
      notes: noteBuffer[calfKey] !== undefined ? noteBuffer[calfKey] : (existing ? existing.notes : null),
      treatment: treatmentBuffer[calfKey] !== undefined ? treatmentBuffer[calfKey] : (existing ? existing.treatment : false),
      user_name: currentUser.name,
      calf_number: calf.type !== 'bull' ? calf.number : null,
      bull_number: calf.type === 'bull' ? calf.bull_number : null,
      calf_name: calf.name || null,
      period,
    };

    if (existing) await supabase.from('feedings').update(feedingData).eq('id', existing.id);
    else await supabase.from('feedings').insert([feedingData]);

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

  if (loading) return <div className="h-screen flex items-center justify-center font-black uppercase italic text-blue-600">Syncing Farm Data...</div>;

  const activeHeifers = calves.filter(c => c.status === 'active' && c.type !== 'bull');
  const activeBulls = calves.filter(c => c.status === 'active' && c.type === 'bull');
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
              <p className="text-[10px] font-bold opacity-70 uppercase tracking-widest">{currentUser.name} • {getETDate().getHours() < 12 ? 'AM' : 'PM'} Shift</p>
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
        </>
      )}

      {/* HISTORY MODAL WITH GRAPH FIX */}
      {selectedCalfHistory && (
        <div className="fixed inset-0 bg-white z-[100] flex flex-col">
          <div className="p-6 border-b flex justify-between items-center bg-slate-50 sticky top-0 z-10 shadow-sm">
            <div>
                <h2 className="text-3xl font-black italic text-slate-900 uppercase leading-none">#{selectedCalfHistory.bull_number || selectedCalfHistory.number}</h2>
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
                
                <div className="flex items-end justify-between h-32 gap-1 px-1 border-b-2 border-slate-50 pb-1">
                    {(() => {
                        // FIX: Get the latest 14 but sort them oldest-to-newest for the graph
                        const allFeedings = getCalfFeedings(selectedCalfHistory);
                        const latest14 = [...allFeedings]
                          .slice(0, 14) // Get the 14 most recent from the descending list
                          .reverse();   // Flip them so they draw chronologically (oldest on left)
                        
                        if(latest14.length === 0) return <div className="w-full h-full flex items-center justify-center text-[10px] font-black text-slate-200 uppercase tracking-widest italic">No Data Found</div>;
                        
                        return latest14.map((f, i) => (
                            <div key={i} className="flex-1 flex flex-col items-center group">
                                <div 
                                    className={`w-full rounded-t-sm transition-all duration-700 ${f.consumption >= 100 ? 'bg-green-400' : f.consumption >= 50 ? 'bg-yellow-400' : 'bg-red-400'}`}
                                    style={{ height: `${Math.max(f.consumption, 8)}%` }} 
                                />
                                <div className="text-[6px] font-black text-slate-300 mt-1 uppercase transform -rotate-45">{f.period}</div>
                            </div>
                        ));
                    })()}
                </div>
                <div className="flex justify-between mt-4 px-1">
                    <span className="text-[8px] font-black text-slate-300 uppercase tracking-tighter">Dec/Jan History</span>
                    <span className="text-[8px] font-black text-slate-300 uppercase tracking-tighter">Current</span>
                </div>
             </div>

             <div className="space-y-3 pb-10">
                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-4">Full Log</span>
                {getCalfFeedings(selectedCalfHistory).map((f, i) => (
                  <div key={i} className="p-5 bg-white rounded-3xl border border-slate-100 shadow-sm">
                      <div className="flex justify-between items-center mb-2">
                        <span className={`px-4 py-2 rounded-2xl text-white font-black text-xs ${f.consumption >= 100 ? 'bg-green-500' : f.consumption >= 50 ? 'bg-yellow-500' : 'bg-red-500'}`}>{f.consumption}%</span>
                        {f.treatment && <span className="flex items-center gap-1 text-red-600 font-black text-[10px] uppercase bg-red-50 px-3 py-1.5 rounded-full"><ClipboardCheck size={14}/> Treated</span>}
                      </div>
                      {f.notes && <p className="text-sm italic text-slate-600 bg-slate-50 p-3 rounded-xl border-l-4 border-blue-400 mb-2">"{f.notes}"</p>}
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{new Date(f.timestamp).toLocaleDateString()} • {f.period} by {f.user_name}</p>
                  </div>
                ))}
             </div>
          </div>
        </div>
      )}

      {/* FOOTER BUTTONS & SETTINGS (UNCHANGED) */}
      <div className="fixed bottom-0 left-0 right-0 p-6 flex justify-center z-30 pointer-events-none">
        <button onClick={() => setShowAddCalf(true)} className="bg-slate-900 text-white w-full max-w-xs py-5 rounded-[2.5rem] font-black shadow-2xl flex items-center justify-center gap-3 pointer-events-auto active:scale-95 transition-transform">
          <Plus size={24}/> ADD NEW CALF
        </button>
      </div>
      {/* ... Add Calf Modal and Settings Modal would go here (same as previous code) ... */}
    </div>
  );
}
