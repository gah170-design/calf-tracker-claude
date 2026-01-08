'use client';

import React, { useState, useEffect } from 'react';
import { Plus, Settings, X, ChevronLeft, Trash2 } from 'lucide-react';
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
      
      if (typeof window !== 'undefined') {
        const stored = localStorage.getItem('calfTrackerUser');
        if (stored) {
          const storedData = JSON.parse(stored);
          // Auto-login with stored PIN
          const user = users.find(u => u.name === storedData.name);
          if (user && user.pin === storedData.pin) {
            setCurrentUser(user);
          } else {
            // PIN mismatch - clear storage and require re-login
            localStorage.removeItem('calfTrackerUser');
            alert('Access revoked. Please contact administrator.');
          }
        }
      }
      
      setLoading(false);
    };
    init();
  }, []);

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

  const addUser = async () => {
    if (!newUser.name.trim()) return;
    await supabase.from('users').insert([{ name: newUser.name.trim(), role: newUser.role, pin: null }]);
    setNewUser({ name: '', role: 'user' });
    setShowAddUser(false);
    await loadAllData();
  };

  const handleUserSelect = (user) => {
    if (!user.pin) {
      alert('No PIN set for this user. Contact administrator.');
      return;
    }
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
      await supabase.from('feedings')
        .update({ consumption, timestamp: now.toISOString() })
        .eq('id', existing.id);
    } else {
      await supabase.from('feedings').insert([{
        calf_number: calfNumber,
        calf_name: calf?.name || null,
        timestamp: now.toISOString(),
        period,
        consumption,
        notes: null,
        treatment: false,
        user_name: currentUser.name
      }]);
    }
    await loadAllData();
  };

  const updateFeedingNotes = async (calfNumber, notes) => {
    const now = new Date();
    const period = now.getHours() < 12 ? 'AM' : 'PM';
    const today = now.toISOString().slice(0, 10);
    
    const existing = feedings.find(
      f => f.calf_number === calfNumber && 
           f.timestamp.startsWith(today) && 
           f.period === period
    );

    if (existing) {
      await supabase.from('feedings').update({ notes }).eq('id', existing.id);
      await loadAllData();
    }
  };

  const toggleTreatment = async (calfNumber) => {
    const now = new Date();
    const period = now.getHours() < 12 ? 'AM' : 'PM';
    const today = now.toISOString().slice(0, 10);
    
    const existing = feedings.find(
      f => f.calf_number === calfNumber && 
           f.timestamp.startsWith(today) && 
           f.period === period
    );

    if (existing) {
      await supabase.from('feedings')
        .update({ treatment: !existing.treatment })
        .eq('id', existing.id);
      await loadAllData();
    }
  };

  const getCalfAge = (date) => Math.floor((new Date() - new Date(date)) / (1000 * 60 * 60 * 24));

  const getCalfFeedingCount = (calfNumber) => {
    return feedings.filter(f => f.calf_number === calfNumber).length;
  };

  const getProtocolStatus = (calf) => {
    const age = getCalfAge(calf.birth_date);
    const feedingCount = getCalfFeedingCount(calf.number);
    
    for (let protocol of protocols) {
      if (protocol.type === 'feedings' && feedingCount < protocol.value) {
        return protocol.name;
      }
      if (protocol.type === 'days' && age < protocol.value) {
        return protocol.name;
      }
    }
    return protocols[protocols.length - 1]?.name || 'Unknown';
  };

  const getCalfFeedings = (calfNumber, count = 3) => {
    return feedings
      .filter(f => f.calf_number === calfNumber)
      .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp))
      .slice(-count);
  };

  const getTodayFeeding = (calfNumber) => {
    const now = new Date();
    const period = now.getHours() < 12 ? 'AM' : 'PM';
    const today = now.toISOString().slice(0, 10);
    
    return feedings.find(
      f => f.calf_number === calfNumber && 
           f.timestamp.startsWith(today) && 
           f.period === period
    );
  };

  const getProtocolCounts = () => {
    const counts = {};
    protocols.forEach(p => counts[p.name] = 0);
    
    calves.filter(c => c.status === 'active').forEach(calf => {
      const protocol = getProtocolStatus(calf);
      counts[protocol] = (counts[protocol] || 0) + 1;
    });
    
    return counts;
  };

  const getFilteredCalves = () => {
    let filtered = calves.filter(c => c.status === 'active');
    
    if (filterProtocol !== 'all') {
      filtered = filtered.filter(c => getProtocolStatus(c) === filterProtocol);
    }
    
    return filtered.sort((a, b) => new Date(b.birth_date) - new Date(a.birth_date)); // Newest first
  };

  const shouldFlagCalf = (calf) => {
    const recentFeedings = getCalfFeedings(calf.number, 2);
    if (recentFeedings.length < 2) return false;
    
    // Flag if last 2 feedings are 50% or below
    return recentFeedings.every(f => f.consumption <= 50);
  };

  const getFlaggedCalves = () => {
    return calves.filter(c => c.status === 'active' && shouldFlagCalf(c))
      .sort((a, b) => new Date(b.birth_date) - new Date(a.birth_date));
  };

  if (loading) return <div className="h-screen flex items-center justify-center font-black">LOADING...</div>;

  if (!currentUser) {
    return (
      <div className="h-screen bg-slate-100 flex items-center justify-center p-6">
        <div className="bg-white rounded-[2.5rem] p-8 w-full max-w-xs shadow-xl text-center">
          <h1 className="font-black mb-6 uppercase italic tracking-widest">Select Operator</h1>
          <div className="space-y-3">
            {users.map(u => (
              <button key={u.id} onClick={() => handleUserSelect(u)}
                className="w-full p-5 bg-slate-900 text-white rounded-2xl font-bold uppercase text-xs">
                {u.name}
              </button>
            ))}
          </div>
        </div>

        {/* PIN Entry Modal */}
        {showPinEntry && (
          <div className="fixed inset-0 bg-slate-900/90 backdrop-blur-md z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-[3rem] w-full max-w-sm p-8 space-y-6 shadow-2xl">
              <h2 className="text-2xl font-black italic text-center">ENTER PIN</h2>
              <p className="text-center text-sm font-bold text-slate-600">{selectedUser?.name}</p>
              <input
                type="password"
                inputMode="numeric"
                maxLength="4"
                value={pinInput}
                onChange={(e) => setPinInput(e.target.value.replace(/\D/g, ''))}
                onKeyPress={(e) => e.key === 'Enter' && verifyPin()}
                placeholder="••••"
                className="w-full p-6 bg-slate-50 rounded-3xl font-black text-center text-2xl tracking-widest border-2 focus:outline-none focus:border-blue-600"
                autoFocus
              />
              <div className="flex flex-col gap-2">
                <button onClick={verifyPin} className="w-full bg-blue-600 text-white py-5 rounded-3xl font-black">
                  UNLOCK
                </button>
                <button onClick={() => { setShowPinEntry(false); setSelectedUser(null); setPinInput(''); }}
                  className="w-full py-4 text-slate-400 font-black text-xs uppercase">
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  const protocolCounts = getProtocolCounts();
  const filteredCalves = currentPage === 'flagged' ? getFlaggedCalves() : getFilteredCalves();
  const flaggedCount = getFlaggedCalves().length;

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      {/* HEADER */}
      <header className="bg-blue-600 text-white p-5 flex justify-between items-center shadow-lg sticky top-0 z-40">
        <div>
          <h1 className="font-black text-xl italic tracking-tighter">CALF TRACKER</h1>
          <button onClick={() => { localStorage.removeItem('calfTrackerUser'); setCurrentUser(null); }} className="text-[10px] font-bold opacity-80 uppercase">
            {currentUser.name} • LOGOUT
          </button>
        </div>
        {currentUser.role === 'admin' && (
          <button onClick={() => setShowSettings(true)} className="p-3 bg-white/20 rounded-full">
            <Settings size={22} />
          </button>
        )}
      </header>

      {/* MAIN */}
      <main className="p-4 flex-1">
        {currentPage === 'dashboard' ? (
          <div className="space-y-4">
            {flaggedCount > 0 && (
              <div className="bg-red-500 text-white p-4 rounded-[2rem] flex justify-between items-center cursor-pointer"
                onClick={() => setCurrentPage('flagged')}>
                <div>
                  <div className="font-black text-2xl">{flaggedCount}</div>
                  <div className="text-xs font-bold opacity-90 uppercase">Calves Need Attention</div>
                </div>
                <div className="text-3xl">⚠️</div>
              </div>
            )}
            
            <div className="grid grid-cols-2 gap-3">
              {protocols.map(p => (
                <button key={p.id} onClick={() => { setFilterProtocol(p.name); setCurrentPage('feed'); }}
                  className="bg-white p-6 rounded-[2rem] shadow-sm border border-slate-100">
                  <div className="text-3xl font-black text-blue-600">
                    {protocolCounts[p.name] || 0}
                  </div>
                  <div className="text-[10px] font-black text-slate-400 uppercase">{p.name}</div>
                </button>
              ))}
            </div>
            <button onClick={() => { setFilterProtocol('all'); setCurrentPage('feed'); }} className="w-full bg-slate-900 text-white py-6 rounded-[2rem] font-black tracking-widest text-sm">
              VIEW ALL CALVES
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex justify-between items-center mb-4">
              <button onClick={() => setCurrentPage('dashboard')} className="flex items-center text-blue-600 font-bold text-xs uppercase"><ChevronLeft size={14}/> Back</button>
              {currentPage === 'feed' && (
                <div className="flex gap-2 overflow-x-auto">
                  <button onClick={() => setFilterProtocol('all')} className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase ${filterProtocol === 'all' ? 'bg-blue-600 text-white' : 'bg-slate-100'}`}>All</button>
                  {protocols.map(p => (
                    <button key={p.id} onClick={() => setFilterProtocol(p.name)} className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase whitespace-nowrap ${filterProtocol === p.name ? 'bg-blue-600 text-white' : 'bg-slate-100'}`}>
                      {p.name}
                    </button>
                  ))}
                </div>
              )}
              {currentPage === 'flagged' && (
                <div className="text-xs font-black text-red-500 uppercase">⚠️ Flagged Calves</div>
              )}
            </div>
            {filteredCalves.map(calf => {
              const recentFeedings = getCalfFeedings(calf.number, 3);
              const todayFeeding = getTodayFeeding(calf.number);
              const protocol = getProtocolStatus(calf);
              const isFlagged = shouldFlagCalf(calf);
              const now = new Date();

              return (
                <div key={calf.id} className={`bg-white p-6 rounded-[2.5rem] shadow-sm ${isFlagged ? 'border-4 border-red-500' : 'border border-slate-100'}`}>
                  <div className="flex justify-between items-start mb-2">
                    <div>
                      <h3 className="text-2xl font-black italic">#{calf.number}{calf.name && ` (${calf.name})`}</h3>
                      <p className="text-[10px] font-bold text-slate-400 uppercase">{getCalfAge(calf.birth_date)} Days • {protocol}</p>
                    </div>
                  </div>

                  {/* Last 3 Feedings */}
                  <div className="flex gap-2 mb-4">
                    {recentFeedings.map((f, i) => {
                      let color = 'bg-green-500';
                      if (f.consumption < 50) color = 'bg-red-500';
                      else if (f.consumption < 75) color = 'bg-yellow-500';
                      
                      const feedDate = new Date(f.timestamp);
                      const dateStr = feedDate.toLocaleDateString('en-US', { month: 'numeric', day: 'numeric' });
                      
                      return (
                        <div key={i} className={`${color} text-white px-2 py-1 rounded-lg text-xs font-bold`}>
                          <div>{f.consumption}%</div>
                          <div className="text-[8px] opacity-80">{dateStr} {f.period}</div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Last feeding notes */}
                  {recentFeedings.length > 0 && recentFeedings[recentFeedings.length - 1]?.notes && (
                    <div className="bg-yellow-50 p-3 rounded-2xl mb-4 text-xs">
                      📝 {recentFeedings[recentFeedings.length - 1].notes}
                    </div>
                  )}

                  {/* Today's Feeding Buttons */}
                  <div className="mb-3">
                    <div className="text-[10px] font-bold text-slate-400 uppercase mb-2">
                      {now.getHours() < 12 ? 'AM' : 'PM'} Feeding:
                    </div>
                    <div className="grid grid-cols-5 gap-2">
                      {[0, 25, 50, 75, 100].map(pct => (
                        <button 
                          key={pct}
                          onClick={() => recordFeeding(calf.number, pct)}
                          className={`py-5 rounded-2xl font-black transition-all ${
                            todayFeeding?.consumption === pct 
                              ? 'bg-blue-600 text-white' 
                              : 'bg-slate-50 text-slate-300 active:bg-blue-600 active:text-white'
                          }`}>
                          {pct}%
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Notes */}
                  <textarea
                    placeholder="Notes..."
                    value={noteBuffer[calf.number] !== undefined ? noteBuffer[calf.number] : (todayFeeding?.notes || '')}
                    onChange={(e) => setNoteBuffer({ ...noteBuffer, [calf.number]: e.target.value })}
                    onBlur={(e) => {
                      updateFeedingNotes(calf.number, e.target.value);
                      const newBuffer = { ...noteBuffer };
                      delete newBuffer[calf.number];
                      setNoteBuffer(newBuffer);
                    }}
                    className="w-full p-3 bg-slate-50 rounded-2xl text-sm mb-2 border-0 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    rows="2"
                  />

                  {/* Treatment Checkbox */}
                  <label className="flex items-center text-xs font-bold">
                    <input
                      type="checkbox"
                      checked={todayFeeding?.treatment || false}
                      onChange={() => toggleTreatment(calf.number)}
                      className="mr-2"
                    />
                    Treatment Given
                  </label>
                </div>
              );
            })}
          </div>
        )}
      </main>

      {/* SETTINGS MODAL */}
      {showSettings && (
        <div className="fixed inset-0 bg-white z-[100] flex flex-col overflow-hidden">
          <div className="p-6 flex justify-between items-center border-b bg-slate-50 shrink-0">
            <h2 className="text-xl font-black italic tracking-widest">SETTINGS</h2>
            <button onClick={() => setShowSettings(false)} className="p-3 bg-slate-200 rounded-full text-slate-600"><X size={20}/></button>
          </div>
          
          <div className="flex-1 overflow-y-auto p-6 space-y-10 pb-20">
            {/* CONFIG */}
            <section className="space-y-4">
              <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2">System</h3>
              <div className="bg-slate-50 p-4 rounded-3xl flex justify-between items-center">
                <span className="font-bold text-sm">Next Calf #</span>
                <input type="number" value={settings.nextCalfNumber} 
                  onChange={(e) => saveSettings('nextCalfNumber', parseInt(e.target.value))}
                  className="w-20 text-right font-black text-blue-600 bg-white px-2 py-1 rounded-lg border focus:outline-none" />
              </div>
            </section>

            {/* PROTOCOLS */}
            <section className="space-y-4">
              <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2">Protocols</h3>
              <div className="bg-slate-50 p-2 rounded-3xl space-y-1">
                {protocols.map(p => (
                  <div key={p.id} className="bg-white p-4 rounded-2xl flex justify-between items-center shadow-sm">
                    <span className="font-bold text-sm">{p.name}</span>
                    <div className="flex items-center gap-2">
                      <input type="number" value={p.value} 
                        onChange={(e) => updateProtocolValue(p.id, parseInt(e.target.value))}
                        className="w-12 text-center font-black bg-blue-50 text-blue-600 rounded-lg py-1 focus:outline-none" />
                      <span className="text-[10px] font-black text-slate-400 uppercase">{p.type}</span>
                    </div>
                  </div>
                ))}
              </div>
            </section>

            {/* TEAM */}
            <section className="space-y-4">
              <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2">Team Access</h3>
              <div className="bg-slate-50 p-2 rounded-3xl space-y-1">
                {users.map(u => (
                  <div key={u.id} className="bg-white p-4 rounded-2xl shadow-sm">
                    <div className="flex justify-between items-center mb-2">
                      <div className="font-bold text-sm">{u.name} <span className="text-[10px] opacity-40 uppercase ml-1">({u.role})</span></div>
                      {u.id !== currentUser.id && (
                        <button onClick={async () => { if(confirm(`Delete ${u.name}?`)) { await supabase.from('users').delete().eq('id', u.id); loadAllData(); } }}
                          className="p-2 text-slate-300 hover:text-red-500 transition-colors"><Trash2 size={18}/></button>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        inputMode="numeric"
                        maxLength="4"
                        placeholder={u.pin ? '••••' : 'No PIN'}
                        onChange={(e) => {
                          const val = e.target.value.replace(/\D/g, '');
                          if (val.length === 4) {
                            updateUserPin(u.id, val);
                            e.target.value = '';
                            e.target.placeholder = '••••';
                          }
                        }}
                        className="flex-1 p-2 bg-slate-50 rounded-xl text-sm font-bold text-center focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                      <span className="text-[10px] text-slate-400">Set 4-digit PIN</span>
                    </div>
                  </div>
                ))}
                <button onClick={() => setShowAddUser(true)} className="w-full p-4 bg-slate-900 text-white rounded-2xl font-bold text-xs uppercase">
                  + Add Team Member
                </button>
              </div>
            </section>
          </div>
          
          <div className="p-6 border-t bg-white">
            <button onClick={() => setShowSettings(false)} className="w-full bg-blue-600 text-white py-5 rounded-[2rem] font-black shadow-lg">CLOSE & SAVE</button>
          </div>
        </div>
      )}

      {/* ADD USER MODAL */}
      {showAddUser && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-md z-[110] flex items-end sm:items-center justify-center p-4">
          <div className="bg-white rounded-[3rem] w-full max-w-sm p-8 space-y-6 shadow-2xl">
            <h2 className="text-2xl font-black italic">ADD TEAM MEMBER</h2>
            <div className="space-y-4 text-left">
              <input 
                type="text" 
                placeholder="Name" 
                value={newUser.name} 
                onChange={(e) => setNewUser({ ...newUser, name: e.target.value })} 
                className="w-full p-5 bg-slate-50 rounded-3xl font-bold border focus:outline-none" 
              />
              <select 
                value={newUser.role} 
                onChange={(e) => setNewUser({ ...newUser, role: e.target.value })}
                className="w-full p-5 bg-slate-50 rounded-3xl font-bold border focus:outline-none"
              >
                <option value="user">User</option>
                <option value="admin">Admin</option>
              </select>
            </div>
            <div className="flex flex-col gap-2">
              <button onClick={addUser} className="w-full bg-blue-600 text-white py-5 rounded-3xl font-black">ADD USER</button>
              <button onClick={() => { setShowAddUser(false); setNewUser({ name: '', role: 'user' }); }} className="w-full py-4 text-slate-400 font-black text-xs uppercase">Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* FLOATING ACTION */}
      {currentPage === 'dashboard' && (
        <button onClick={() => setShowAddCalf(true)} className="fixed bottom-8 right-8 bg-green-500 text-white p-5 rounded-full shadow-2xl z-30"><Plus size={32} /></button>
      )}

      {/* ADD CALF MODAL */}
      {showAddCalf && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-md z-50 flex items-end sm:items-center justify-center p-4">
          <div className="bg-white rounded-[3rem] w-full max-w-sm p-8 space-y-6 shadow-2xl">
            <h2 className="text-2xl font-black italic">NEW CALF</h2>
            <div className="space-y-4 text-left">
              <input type="text" placeholder="Name (Optional)" value={newCalf.name} onChange={(e) => setNewCalf({ ...newCalf, name: e.target.value })} className="w-full p-5 bg-slate-50 rounded-3xl font-bold border focus:outline-none" />
              <input type="datetime-local" value={newCalf.birthDate} onChange={(e) => setNewCalf({ ...newCalf, birthDate: e.target.value })} className="w-full p-5 bg-slate-50 rounded-3xl font-bold border focus:outline-none" />
            </div>
            <div className="flex flex-col gap-2">
              <button onClick={addCalf} className="w-full bg-blue-600 text-white py-5 rounded-3xl font-black">ADD AS #{settings.nextCalfNumber}</button>
              <button onClick={() => setShowAddCalf(false)} className="w-full py-4 text-slate-400 font-black text-xs uppercase">Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
