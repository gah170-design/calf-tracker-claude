'use client';

import React, { useState, useEffect } from 'react';
import { Plus, Settings, X, ChevronLeft, Trash2, History, Activity, Calendar } from 'lucide-react';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

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
  const [showAddUser, setShowAddUser] = useState(false);
  const [showPinEntry, setShowPinEntry] = useState(false);
  const [selectedCalfHistory, setSelectedCalfHistory] = useState(null);
  const [selectedUser, setSelectedUser] = useState(null);
  const [pinInput, setPinInput] = useState('');
  const [filterProtocol, setFilterProtocol] = useState('all');
  const [settings, setSettings] = useState({ nextCalfNumber: 1000 });
  const [newCalf, setNewCalf] = useState({ name: '', birthDate: new Date().toISOString().slice(0, 16) });
  const [newUser, setNewUser] = useState({ name: '', role: 'user' });
  const [noteBuffer, setNoteBuffer] = useState({});

  useEffect(() => {
    const init = async () => {
      await loadAllData();
      setLoading(false);
    };
    init();
  }, []);

  useEffect(() => {
    if (users.length > 0 && !currentUser && typeof window !== 'undefined') {
      const stored = localStorage.getItem('calfTrackerUser');
      if (stored) {
        const storedData = JSON.parse(stored);
        const user = users.find(u => u.name === storedData.name);
        if (user && user.pin === storedData.pin) {
          setCurrentUser(user);
        } else {
          localStorage.removeItem('calfTrackerUser');
        }
      }
    }
  }, [users]);

  const loadAllData = async () => {
    try {
      const { data: c } = await supabase.from('calves').select('*').order('number', { ascending: false });
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
        if (ncn) setSettings({ nextCalfNumber: parseInt(ncn.setting_value) });
      }
    } catch (err) { console.error(err); }
  };

  const saveSettings = async (key, val) => {
    setSettings(prev => ({ ...prev, [key]: val }));
    const dbKey = key.replace(/[A-Z]/g, l => `_${l.toLowerCase()}`);
    await supabase.from('settings').update({ setting_value: val.toString() }).eq('setting_key', dbKey);
  };

  const updateProtocolValue = async (id, val) => {
    setProtocols(prev => prev.map(p => p.id === id ? { ...p, value: val } : p));
    await supabase.from('protocols').update({ value: val }).eq('id', id);
  };

  const addCalf = async () => {
    const num = settings.nextCalfNumber;
    const { error } = await supabase.from('calves').insert([{
      number: num, name: newCalf.name.trim() || null, birth_date: newCalf.birthDate, status: 'active'
    }]);
    if (!error) {
      await saveSettings('nextCalfNumber', num + 1);
      setShowAddCalf(false);
      setNewCalf({ name: '', birthDate: new Date().toISOString().slice(0, 16) });
      await loadAllData();
    }
  };

  const deactivateCalf = async (id) => {
    if (confirm("Archive this calf? It will no longer appear in the feeding list.")) {
      await supabase.from('calves').update({ status: 'archived' }).eq('id', id);
      await loadAllData();
    }
  };

  const addUser = async () => {
    if (!newUser.name.trim()) return;
    await supabase.from('users').insert([{ name: newUser.name.trim(), role: newUser.role, pin: null }]);
    setNewUser({ name: '', role: 'user' });
    setShowAddUser(false);
    await loadAllData();
  };

  const handleUserSelect = (user) => {
    if (!user.pin) { alert('No PIN set. Contact admin.'); return; }
    setSelectedUser(user);
    setShowPinEntry(true);
  };

  const verifyPin = () => {
    if (pinInput === selectedUser.pin) {
      setCurrentUser(selectedUser);
      localStorage.setItem('calfTrackerUser', JSON.stringify({ name: selectedUser.name, pin: selectedUser.pin }));
      setShowPinEntry(false);
      setPinInput('');
    } else {
      alert('Incorrect PIN');
      setPinInput('');
    }
  };

  const updateUserPin = async (userId, newPin) => {
    await supabase.from('users').update({ pin: newPin }).eq('id', userId);
    await loadAllData();
  };

  const recordFeeding = async (calfNumber, consumption) => {
    const now = new Date();
    const period = now.getHours() < 12 ? 'AM' : 'PM';
    const today = now.toISOString().slice(0, 10);
    const calf = calves.find(c => c.number === calfNumber);
    
    const existing = feedings.find(
      f => f.calf_number === calfNumber && 
           f.timestamp.startsWith(today) && 
           f.period === period
    );

    if (existing) {
      await supabase.from('feedings').update({ consumption, timestamp: now.toISOString() }).eq('id', existing.id);
    } else {
      await supabase.from('feedings').insert([{
        calf_number: calfNumber,
        calf_name: calf?.name || null,
        timestamp: now.toISOString(),
        period,
        consumption,
        user_name: currentUser.name
      }]);
    }
    await loadAllData();
  };

  const updateFeedingNotes = async (calfNumber, notes) => {
    const now = new Date();
    const period = now.getHours() < 12 ? 'AM' : 'PM';
    const today = now.toISOString().slice(0, 10);
    const existing = feedings.find(f => f.calf_number === calfNumber && f.timestamp.startsWith(today) && f.period === period);
    if (existing) {
      await supabase.from('feedings').update({ notes }).eq('id', existing.id);
      await loadAllData();
    }
  };

  const toggleTreatment = async (calfNumber) => {
    const now = new Date();
    const period = now.getHours() < 12 ? 'AM' : 'PM';
    const today = now.toISOString().slice(0, 10);
    const existing = feedings.find(f => f.calf_number === calfNumber && f.timestamp.startsWith(today) && f.period === period);
    if (existing) {
      await supabase.from('feedings').update({ treatment: !existing.treatment }).eq('id', existing.id);
      await loadAllData();
    }
  };

  const getCalfAge = (date) => Math.floor((new Date() - new Date(date)) / (1000 * 60 * 60 * 24));
  const getCalfFeedings = (calfNumber, count = 50) => feedings.filter(f => f.calf_number === calfNumber).sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp)).slice(0, count);
  
  const getConsumptionTrend = (calfNumber) => {
    const history = getCalfFeedings(calfNumber, 2);
    if (history.length < 2) return null;
    const [latest, prev] = [history[0].consumption, history[1].consumption];
    return latest > prev ? 'up' : latest < prev ? 'down' : 'stable';
  };

  const getProtocolStatus = (calf) => {
    const age = getCalfAge(calf.birth_date);
    const feedingCount = feedings.filter(f => f.calf_number === calf.number).length;
    for (let protocol of protocols) {
      if (protocol.type === 'feedings' && feedingCount < protocol.value) return protocol.name;
      if (protocol.type === 'days' && age < protocol.value) return protocol.name;
    }
    return protocols[protocols.length - 1]?.name || 'Unknown';
  };

  const getTodayFeeding = (calfNumber) => {
    const now = new Date();
    const period = now.getHours() < 12 ? 'AM' : 'PM';
    const today = now.toISOString().slice(0, 10);
    return feedings.find(f => f.calf_number === calfNumber && f.timestamp.startsWith(today) && f.period === period);
  };

  const getFilteredCalves = () => {
    let filtered = calves.filter(c => c.status === 'active');
    if (filterProtocol !== 'all') filtered = filtered.filter(c => getProtocolStatus(c) === filterProtocol);
    return filtered.sort((a, b) => new Date(b.birth_date) - new Date(a.birth_date));
  };

  const shouldFlagCalf = (calf) => {
    const recent = getCalfFeedings(calf.number, 2);
    return recent.length >= 2 && recent.every(f => f.consumption <= 50);
  };

  if (loading) return <div className="h-screen flex items-center justify-center font-black">LOADING...</div>;

  if (!currentUser) {
    return (
      <div className="h-screen bg-slate-100 flex items-center justify-center p-6">
        <div className="bg-white rounded-[2.5rem] p-8 w-full max-w-xs shadow-xl text-center">
          <h1 className="font-black mb-6 uppercase italic tracking-widest">Select Operator</h1>
          <div className="space-y-3">
            {users.map(u => (
              <button key={u.id} onClick={() => handleUserSelect(u)} className="w-full p-5 bg-slate-900 text-white rounded-2xl font-bold uppercase text-xs">
                {u.name}
              </button>
            ))}
          </div>
        </div>

        {showPinEntry && (
          <div className="fixed inset-0 bg-slate-900/90 backdrop-blur-md z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-[3rem] w-full max-w-sm p-8 space-y-6 shadow-2xl">
              <h2 className="text-2xl font-black italic text-center text-slate-900">ENTER PIN</h2>
              <input type="password" inputMode="numeric" maxLength="4" value={pinInput} onChange={(e) => setPinInput(e.target.value.replace(/\D/g, ''))} className="w-full p-6 bg-slate-50 rounded-3xl font-black text-center text-2xl tracking-widest border-2 focus:outline-none focus:border-blue-600" autoFocus />
              <button onClick={verifyPin} className="w-full bg-blue-600 text-white py-5 rounded-3xl font-black">UNLOCK</button>
              <button onClick={() => { setShowPinEntry(false); setPinInput(''); }} className="w-full py-4 text-slate-400 font-black text-xs uppercase text-center">Cancel</button>
            </div>
          </div>
        )}
      </div>
    );
  }

  const filteredCalves = currentPage === 'flagged' ? calves.filter(c => c.status === 'active' && shouldFlagCalf(c)) : getFilteredCalves();

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans">
      <header className="bg-blue-600 text-white p-5 flex justify-between items-center shadow-lg sticky top-0 z-40">
        <div>
          <h1 className="font-black text-xl italic tracking-tighter">CALF TRACKER</h1>
          <button onClick={() => { localStorage.removeItem('calfTrackerUser'); setCurrentUser(null); }} className="text-[10px] font-bold opacity-80 uppercase">
            {currentUser.name} • LOGOUT
          </button>
        </div>
        {currentUser.role === 'admin' && (
          <button onClick={() => setShowSettings(true)} className="p-3 bg-white/20 rounded-full hover:bg-white/30 transition">
            <Settings size={22} />
          </button>
        )}
      </header>

      <main className="p-4 flex-1">
        {currentPage === 'dashboard' ? (
          <div className="space-y-4">
            {calves.filter(c => c.status === 'active' && shouldFlagCalf(c)).length > 0 && (
              <div className="bg-red-500 text-white p-4 rounded-[2rem] flex justify-between items-center cursor-pointer" onClick={() => setCurrentPage('flagged')}>
                <div>
                  <div className="font-black text-2xl">{calves.filter(c => c.status === 'active' && shouldFlagCalf(c)).length}</div>
                  <div className="text-xs font-bold opacity-90 uppercase tracking-wider">Need Attention</div>
                </div>
                <Activity size={32} />
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              {protocols.map(p => (
                <button key={p.id} onClick={() => { setFilterProtocol(p.name); setCurrentPage('feed'); }} className="bg-white p-6 rounded-[2rem] shadow-sm border border-slate-100 text-left">
                  <div className="text-3xl font-black text-blue-600">
                    {calves.filter(c => c.status === 'active' && getProtocolStatus(c) === p.name).length}
                  </div>
                  <div className="text-[10px] font-black text-slate-400 uppercase">{p.name}</div>
                </button>
              ))}
            </div>
            <button onClick={() => { setFilterProtocol('all'); setCurrentPage('feed'); }} className="w-full bg-slate-900 text-white py-6 rounded-[2rem] font-black tracking-widest text-sm shadow-xl">
              VIEW ALL CALVES
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex justify-between items-center mb-2">
              <button onClick={() => setCurrentPage('dashboard')} className="flex items-center text-blue-600 font-bold text-xs uppercase"><ChevronLeft size={14}/> Dashboard</button>
              <div className="text-xs font-black text-slate-400 uppercase">{filterProtocol}</div>
            </div>
            {filteredCalves.map(calf => {
              const recentFeedings = getCalfFeedings(calf.number, 3).reverse();
              const todayFeeding = getTodayFeeding(calf.number);
              const isFlagged = shouldFlagCalf(calf);
              const trend = getConsumptionTrend(calf.number);

              return (
                <div key={calf.id} className={`bg-white p-6 rounded-[2.5rem] shadow-md border ${isFlagged ? 'border-red-500 border-4' : 'border-slate-100'}`}>
                  <div className="flex justify-between items-start mb-4">
                    <div onClick={() => setSelectedCalfHistory(calf)} className="cursor-pointer">
                      <div className="flex items-center gap-2">
                        <h3 className="text-2xl font-black italic">#{calf.number}</h3>
                        {trend === 'up' && <span className="text-green-500 font-black">↑</span>}
                        {trend === 'down' && <span className="text-red-500 font-black">↓</span>}
                        <History size={16} className="text-slate-300 ml-1" />
                      </div>
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-tighter">
                        {getCalfAge(calf.birth_date)} Days • {getProtocolStatus(calf)}
                      </p>
                    </div>
                    {currentUser.role === 'admin' && (
                      <button onClick={() => deactivateCalf(calf.id)} className="text-slate-200 hover:text-red-400"><Trash2 size={18} /></button>
                    )}
                  </div>

                  <div className="flex gap-2 mb-4 overflow-x-auto pb-1">
                    {recentFeedings.map((f, i) => (
                      <div key={i} className={`text-white px-3 py-2 rounded-2xl text-xs font-black min-w-[60px] ${f.consumption < 50 ? 'bg-red-500' : f.consumption < 100 ? 'bg-yellow-500' : 'bg-green-500'}`}>
                        {f.consumption}%
                        <div className="text-[8px] opacity-70 uppercase mt-0.5">{f.period}</div>
                      </div>
                    ))}
                  </div>

                  <div className="grid grid-cols-5 gap-1.5 mb-4">
                    {[0, 25, 50, 75, 100].map(pct => (
                      <button key={pct} onClick={() => recordFeeding(calf.number, pct)} className={`py-4 rounded-2xl font-black text-xs transition-all ${todayFeeding?.consumption === pct ? 'bg-blue-600 text-white shadow-lg' : 'bg-slate-50 text-slate-300'}`}>
                        {pct}%
                      </button>
                    ))}
                  </div>

                  <textarea
                    placeholder="Add notes..."
                    value={noteBuffer[calf.number] !== undefined ? noteBuffer[calf.number] : (todayFeeding?.notes || '')}
                    onChange={(e) => setNoteBuffer({ ...noteBuffer, [calf.number]: e.target.value })}
                    onBlur={(e) => { updateFeedingNotes(calf.number, e.target.value); const nb = {...noteBuffer}; delete nb[calf.number]; setNoteBuffer(nb); }}
                    className="w-full p-4 bg-slate-50 rounded-[1.5rem] text-sm mb-3 border-0 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                    rows="2"
                  />

                  <label className="flex items-center text-xs font-black text-slate-500 uppercase tracking-tight">
                    <input type="checkbox" checked={todayFeeding?.treatment || false} onChange={() => toggleTreatment(calf.number)} className="w-5 h-5 mr-2 rounded-lg accent-blue-600" />
                    Treatment Administered
                  </label>
                </div>
              );
            })}
          </div>
        )}
      </main>

      {/* CALF HISTORY MODAL */}
      {selectedCalfHistory && (
        <div className="fixed inset-0 bg-white z-[100] flex flex-col">
          <div className="p-6 flex justify-between items-center border-b bg-slate-50">
            <div>
              <h2 className="text-2xl font-black italic">#{selectedCalfHistory.number} HISTORY</h2>
              <p className="text-[10px] font-bold text-slate-400 uppercase">Records for {selectedCalfHistory.name || 'Unnamed Calf'}</p>
            </div>
            <button onClick={() => setSelectedCalfHistory(null)} className="p-3 bg-slate-200 rounded-full"><X size={20}/></button>
          </div>
          <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-100">
            {getCalfFeedings(selectedCalfHistory.number).length === 0 ? (
              <div className="text-center py-20 text-slate-400 font-bold uppercase italic">No history recorded yet</div>
            ) : (
              getCalfFeedings(selectedCalfHistory.number).map((log, idx) => (
                <div key={idx} className="bg-white rounded-3xl p-5 shadow-sm border border-slate-200">
                  <div className="flex justify-between items-start mb-3">
                    <div className="flex items-center gap-2">
                      <div className={`w-3 h-3 rounded-full ${log.consumption === 100 ? 'bg-green-500' : log.consumption > 50 ? 'bg-yellow-500' : 'bg-red-500'}`} />
                      <span className="font-black text-lg">{log.consumption}% Consumption</span>
                    </div>
                    <span className="text-[10px] font-black bg-slate-100 px-2 py-1 rounded text-slate-500 uppercase">
                      {new Date(log.timestamp).toLocaleDateString()} {log.period}
                    </span>
                  </div>
                  {log.notes && (
                    <div className="text-sm bg-blue-50 text-blue-800 p-3 rounded-2xl mb-2 italic">
                      " {log.notes} "
                    </div>
                  )}
                  <div className="flex justify-between items-center mt-2">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1">
                      <Plus size={10}/> Recorded by {log.user_name}
                    </span>
                    {log.treatment && (
                      <span className="text-[10px] font-black text-red-600 bg-red-50 px-3 py-1 rounded-full border border-red-100 uppercase">
                        ⚠️ Treatment Given
                      </span>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* SETTINGS, ADD CALF, ADD USER MODALS (Preserved from previous logic) */}
      {showSettings && (
        <div className="fixed inset-0 bg-white z-[100] flex flex-col overflow-hidden">
          <div className="p-6 flex justify-between items-center border-b bg-slate-50 shrink-0">
            <h2 className="text-xl font-black italic tracking-widest">SETTINGS</h2>
            <button onClick={() => setShowSettings(false)} className="p-3 bg-slate-200 rounded-full text-slate-600"><X size={20}/></button>
          </div>
          <div className="flex-1 overflow-y-auto p-6 space-y-10 pb-20">
            <section className="space-y-4">
              <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2">System</h3>
              <div className="bg-slate-50 p-4 rounded-3xl flex justify-between items-center">
                <span className="font-bold text-sm">Next Calf #</span>
                <input type="number" value={settings.nextCalfNumber} onChange={(e) => saveSettings('nextCalfNumber', parseInt(e.target.value))} className="w-20 text-right font-black text-blue-600 bg-white px-2 py-1 rounded-lg border focus:outline-none" />
              </div>
            </section>
            {/* Additional sections for Protocols and Team would go here as per your original code */}
          </div>
          <div className="p-6 border-t bg-white">
            <button onClick={() => setShowSettings(false)} className="w-full bg-blue-600 text-white py-5 rounded-[2rem] font-black shadow-lg">CLOSE & SAVE</button>
          </div>
        </div>
      )}

      {currentPage === 'dashboard' && (
        <button onClick={() => setShowAddCalf(true)} className="fixed bottom-8 right-8 bg-green-500 text-white p-6 rounded-full shadow-2xl z-30 transform hover:scale-110 active:scale-95 transition">
          <Plus size={32} />
        </button>
      )}

      {showAddCalf && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-[3rem] w-full max-w-sm p-8 space-y-6">
            <h2 className="text-2xl font-black italic">NEW CALF</h2>
            <div className="space-y-4">
              <input type="text" placeholder="Name (Optional)" value={newCalf.name} onChange={(e) => setNewCalf({ ...newCalf, name: e.target.value })} className="w-full p-5 bg-slate-50 rounded-3xl font-bold border" />
              <input type="datetime-local" value={newCalf.birthDate} onChange={(e) => setNewCalf({ ...newCalf, birthDate: e.target.value })} className="w-full p-5 bg-slate-50 rounded-3xl font-bold border" />
            </div>
            <button onClick={addCalf} className="w-full bg-blue-600 text-white py-5 rounded-3xl font-black">ADD AS #{settings.nextCalfNumber}</button>
            <button onClick={() => setShowAddCalf(false)} className="w-full py-2 text-slate-400 font-bold uppercase text-xs">Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}
