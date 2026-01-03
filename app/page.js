'use client';

import React, { useState, useEffect } from 'react';
import { Plus, Settings, AlertCircle, X, ChevronLeft, Save } from 'lucide-react';
import { createClient } from '@supabase/supabase-js';

// Initialize Supabase
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

export default function CalfTracker() {
  // --- STATE ---
  const [currentUser, setCurrentUser] = useState(null);
  const [currentPage, setCurrentPage] = useState('dashboard');
  const [calves, setCalves] = useState([]);
  const [feedings, setFeedings] = useState([]);
  const [users, setUsers] = useState([]);
  const [protocols, setProtocols] = useState([]);
  const [loading, setLoading] = useState(true);
  
  const [showSettings, setShowSettings] = useState(false);
  const [showAddCalf, setShowAddCalf] = useState(false);
  const [filterProtocol, setFilterProtocol] = useState('all');
  
  const [settings, setSettings] = useState({
    nextCalfNumber: 1000,
    flagFeedingCount: 2
  });

  const [newCalf, setNewCalf] = useState({
    name: '',
    birthDate: new Date().toISOString().slice(0, 16)
  });

  // --- INITIALIZATION ---
  useEffect(() => {
    const init = async () => {
      if (typeof window !== 'undefined') {
        const storedUser = localStorage.getItem('calfTrackerUser');
        if (storedUser) setCurrentUser(JSON.parse(storedUser));
      }
      await loadAllData();
      setLoading(false);
    };
    init();
  }, []);

  const loadAllData = async () => {
    try {
      const [calvesData, feedingsData, usersData, settingsData, protocolsData] = await Promise.all([
        supabase.from('calves').select('*').order('number', { ascending: false }),
        supabase.from('feedings').select('*').order('timestamp', { ascending: false }),
        supabase.from('users').select('*').order('name', { ascending: true }),
        supabase.from('settings').select('*'),
        supabase.from('protocols').select('*').order('order', { ascending: true })
      ]);

      if (calvesData.data) setCalves(calvesData.data);
      if (feedingsData.data) setFeedings(feedingsData.data);
      if (usersData.data) setUsers(usersData.data);
      if (protocolsData.data) setProtocols(protocolsData.data);
      
      if (settingsData.data) {
        const sObj = { ...settings };
        settingsData.data.forEach(s => {
          if (s.setting_key === 'next_calf_number') sObj.nextCalfNumber = parseInt(s.setting_value);
        });
        setSettings(sObj);
      }
    } catch (err) {
      console.error('Data Load Error:', err);
    }
  };

  // --- ACTIONS ---
  const saveSettings = async (key, val) => {
    setSettings(prev => ({ ...prev, [key]: val }));
    const dbKey = key.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
    await supabase.from('settings').update({ setting_value: val.toString() }).eq('setting_key', dbKey);
  };

  const updateProtocolValue = async (id, newValue) => {
    setProtocols(prev => prev.map(p => p.id === id ? { ...p, value: newValue } : p));
    await supabase.from('protocols').update({ value: newValue }).eq('id', id);
  };

  const recordFeeding = async (calfNumber, consumption) => {
    const now = new Date();
    const period = now.getHours() < 12 ? 'AM' : 'PM';
    const today = now.toISOString().slice(0, 10);
    const calf = calves.find(c => c.number === calfNumber);

    try {
      const existing = feedings.find(f => f.calf_number === calfNumber && f.timestamp.startsWith(today) && f.period === period);
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
    } catch (err) { console.error(err); }
  };

  const addCalf = async () => {
    const num = settings.nextCalfNumber;
    const { error } = await supabase.from('calves').insert([{
      number: num,
      name: newCalf.name.trim() || null,
      birth_date: newCalf.birthDate,
      status: 'active'
    }]);
    if (!error) {
      await saveSettings('nextCalfNumber', num + 1);
      setShowAddCalf(false);
      setNewCalf({ name: '', birthDate: new Date().toISOString().slice(0, 16) });
      await loadAllData();
    }
  };

  const getCalfAge = (birthDate) => Math.floor((new Date() - new Date(birthDate)) / (1000 * 60 * 60 * 24));
  
  const getProtocolStatus = (calf) => {
    if (!protocols.length) return '...';
    const age = getCalfAge(calf.birth_date);
    const feedingCount = feedings.filter(f => f.calf_number === calf.number).length;
    for (let p of protocols) {
      if (p.type === 'feedings' && feedingCount < p.value) return p.name;
      if (p.type === 'days' && age < p.value) return p.name;
    }
    return protocols[protocols.length - 1]?.name || 'Finished';
  };

  // --- RENDER LOGIC ---
  if (loading) return <div className="h-screen flex items-center justify-center font-black animate-pulse">LOADING SYSTEM...</div>;

  if (!currentUser) {
    return (
      <div className="h-screen bg-slate-100 flex items-center justify-center p-6">
        <div className="bg-white rounded-[2.5rem] p-8 w-full max-w-xs shadow-2xl">
          <h1 className="text-xl font-black mb-6 text-center italic tracking-tighter">SELECT OPERATOR</h1>
          <div className="space-y-3">
            {users.map(u => (
              <button key={u.id} onClick={() => { setCurrentUser(u); localStorage.setItem('calfTrackerUser', JSON.stringify(u)); }}
                className="w-full p-5 bg-slate-900 text-white rounded-2xl font-bold active:scale-95 transition-all uppercase text-sm tracking-widest">
                {u.name}
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      {/* GLOBAL HEADER */}
      <header className="bg-blue-600 text-white p-5 flex justify-between items-center shadow-lg sticky top-0 z-40">
        <div>
          <h1 className="font-black text-xl tracking-tighter italic">CALF TRACKER</h1>
          <button onClick={() => { localStorage.removeItem('calfTrackerUser'); setCurrentUser(null); }} className="text-[10px] font-black opacity-80 uppercase tracking-widest">
            {currentUser.name} • LOGOUT
          </button>
        </div>
        {currentUser.role === 'admin' && (
          <button onClick={() => setShowSettings(true)} className="p-3 bg-white/20 rounded-full active:scale-90 transition-all shadow-inner">
            <Settings size={22} />
          </button>
        )}
      </header>

      {/* PAGE CONTENT */}
      <main className="p-4 flex-1 pb-24">
        {currentPage === 'dashboard' ? (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              {protocols.map(p => {
                const count = calves.filter(c => c.status === 'active' && getProtocolStatus(c) === p.name).length;
                return (
                  <button key={p.id} onClick={() => { setFilterProtocol(p.name); setCurrentPage('feed'); }}
                    className="bg-white p-6 rounded-[2rem] shadow-sm border border-slate-100 text-left active:scale-95 transition-all">
                    <div className="text-4xl font-black text-blue-600">{count}</div>
                    <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-1">{p.name}</div>
                  </button>
                );
              })}
            </div>
            <button onClick={() => { setFilterProtocol('all'); setCurrentPage('feed'); }}
              className="w-full bg-slate-900 text-white py-6 rounded-[2rem] font-black shadow-xl active:scale-[0.98] transition-all tracking-widest text-sm">
              VIEW FEEDING LIST
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            <button onClick={() => setCurrentPage('dashboard')} className="flex items-center text-blue-600 font-black text-xs mb-2 tracking-widest">
              <ChevronLeft size={16} /> BACK TO DASHBOARD
            </button>
            <div className="flex gap-2 overflow-x-auto no-scrollbar pb-2">
              {['all', ...protocols.map(p => p.name)].map(tab => (
                <button key={tab} onClick={() => setFilterProtocol(tab)}
                  className={`px-5 py-2.5 rounded-full whitespace-nowrap text-[10px] font-black transition-all uppercase tracking-widest ${filterProtocol === tab ? 'bg-blue-600 text-white shadow-md' : 'bg-white text-slate-400 border border-slate-100'}`}>
                  {tab}
                </button>
              ))}
            </div>
            {calves.filter(c => filterProtocol === 'all' ? true : getProtocolStatus(c) === filterProtocol).map(calf => (
              <div key={calf.number} className="bg-white p-6 rounded-[2.5rem] shadow-sm border border-slate-100">
                <div className="mb-5">
                  <h3 className="text-2xl font-black text-slate-800 tracking-tighter">#{calf.number} {calf.name && <span className="text-slate-300 font-bold ml-1 text-lg italic">| {calf.name}</span>}</h3>
                  <div className="flex gap-2 mt-1">
                    <span className="text-[10px] font-black bg-blue-50 text-blue-500 px-2 py-0.5 rounded-md uppercase">{getProtocolStatus(calf)}</span>
                    <span className="text-[10px] font-black bg-slate-50 text-slate-400 px-2 py-0.5 rounded-md uppercase">{getCalfAge(calf.birth_date)} DAYS OLD</span>
                  </div>
                </div>
                <div className="grid grid-cols-5 gap-2">
                  {[0, 25, 50, 75, 100].map(pct => {
                    const isToday = feedings.find(f => f.calf_number === calf.number && f.timestamp.startsWith(new Date().toISOString().slice(0, 10)))?.consumption === pct;
                    return (
                      <button key={pct} onClick={() => recordFeeding(calf.number, pct)}
                        className={`py-5 rounded-2xl font-black transition-all text-sm ${isToday ? 'bg-blue-600 text-white shadow-lg scale-105 z-10' : 'bg-slate-50 text-slate-300 active:bg-slate-100'}`}>
                        {pct}%
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      {/* --- MODALS --- */}

      {/* 1. SETTINGS MODAL */}
      {showSettings && (
        <div className="fixed inset-0 bg-white z-[100] flex flex-col overflow-hidden">
          <div className="p-6 flex justify-between items-center border-b bg-slate-50 shrink-0">
            <h2 className="text-xl font-black tracking-tighter uppercase italic">System Control</h2>
            <button onClick={() => setShowSettings(false)} className="p-2 bg-white shadow-sm border rounded-full text-slate-400"><X size={20}/></button>
          </div>
          
          <div className="flex-1 overflow-y-auto p-6 space-y-10 pb-32">
            {/* CONFIG */}
            <section className="space-y-4">
              <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">App Configuration</h3>
              <div className="bg-slate-50 rounded-[2rem] p-4 flex justify-between items-center shadow-inner">
                <span className="font-bold text-sm text-slate-600">Next Calf Number</span>
                <input type="number" value={settings.nextCalfNumber} 
                  onChange={(e) => saveSettings('nextCalfNumber', parseInt(e.target.value))}
                  className="w-24 text-right font-black text-blue-600 bg-white rounded-xl px-3 py-2 border border-slate-200" />
              </div>
            </section>

            {/* PROTOCOLS */}
            <section className="space-y-4">
              <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Protocols</h3>
              <div className="bg-slate-50 rounded-[2rem] p-2 space-y-1">
                {protocols.map(p => (
                  <div key={p.id} className="bg-white p-4 rounded-2xl flex justify-between items-center shadow-sm">
                    <span className="font-bold text-sm text-slate-800">{p.name}</span>
                    <div className="flex items-center gap-2">
                      <input type="number" value={p.value} 
                        onChange={(e) => updateProtocolValue(p.id, parseInt(e.target.value))}
                        className="w-14 text-center font-black bg-blue-50 text-blue-600 rounded-xl py-2 focus:outline-none" />
                      <span className="text-[10px] font-black text-slate-400 uppercase">{p.type}</span>
                    </div>
                  </div>
                ))}
              </div>
            </section>

            {/* USERS (The Team Section) */}
            <section className="space-y-4">
              <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Team Management</h3>
              <div className="bg-slate-50 rounded-[2rem] p-2 space-y-1">
                {users.map(u => (
                  <div key={u.id} className="bg-white p-4 rounded-2xl flex justify-between items-center shadow-sm border border-slate-100">
                    <div>
                      <div className="font-bold text-sm text-slate-800">{u.name}</div>
                      <button 
                        disabled={u.id === currentUser.id}
                        onClick={async () => {
                          const newRole = u.role === 'admin' ? 'user' : 'admin';
                          await supabase.from('users').update({ role: newRole }).eq('id', u.id);
                          loadAllData();
                        }}
                        className={`text-[9px] font-black px-2.5 py-1 rounded-full uppercase tracking-tighter mt-1 ${
                          u.role === 'admin' ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-500'
                        }`}>
                        {u.role}
                      </button>
                    </div>
                    {u.id !== currentUser.id && (
                      <button onClick={async () => { if(confirm(`Remove ${u.name}?`)) { await supabase.from('users').delete().eq('id', u.id); loadAllData(); } }}
                        className="p-3 text-slate-300 active:text-red-500 transition-colors">
                        <X size={18} />
                      </button>
                    )}
                  </div>
                ))}
                
                {/* Add User Row */}
                <div className="p-2 pt-4 flex gap-2">
                  <input id="newUserField" type="text" placeholder="Add Staff Member..." 
                    className="flex-1 bg-white border border-slate-200 rounded-2xl px-4 py-4 text-sm font-bold focus:outline-none shadow-sm" />
                  <button onClick={async () => {
                      const input = document.getElementById('newUserField');
                      const name = input.value.trim();
                      if (name) {
                        await supabase.from('users').insert([{ name, role: 'user' }]);
                        input.value = '';
                        loadAllData();
                      }
                    }}
                    className="bg-slate-900 text-white px-6 rounded-2xl font-black text-[10px] active:scale-95 transition-all">
                    ADD
                  </button>
                </div>
              </div>
            </section>
          </div>
          
          <div className="p-6 border-t bg-white shrink-0 shadow-2xl">
            <button onClick={() => setShowSettings(false)} className="w-full bg-blue-600 text-white py-5 rounded-[2rem] font-black tracking-widest shadow-xl active:scale-95 transition-all">
              SAVE & CLOSE
            </button>
          </div>
        </div>
      )}

      {/* 2. ADD CALF MODAL */}
      {showAddCalf && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-50 flex items-end sm:items-center justify-center p-4">
          <div className="bg-white rounded-[3rem] w-full max-w-sm p-8 space-y-6 shadow-2xl animate-in slide-in-from-bottom duration-300">
            <h2 className="text-2xl font-black italic tracking-tighter text-slate-900 uppercase">New Calf</h2>
            <div className="space-y-4">
              <div className="space-y-1">
                <label className="text-[10px] font-black text-slate-400 ml-4 uppercase tracking-widest">Optional Name</label>
                <input type="text" placeholder="e.g. Daisy" value={newCalf.name}
                  onChange={(e) => setNewCalf({ ...newCalf, name: e.target.value })}
                  className="w-full p-5 bg-slate-50 rounded-[2rem] focus:outline-none focus:ring-2 ring-blue-500 font-bold" />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-black text-slate-400 ml-4 uppercase tracking-widest">Birth Date/Time</label>
                <input type="datetime-local" value={newCalf.birthDate}
                  onChange={(e) => setNewCalf({ ...newCalf, birthDate: e.target.value })}
                  className="w-full p-5 bg-slate-50 rounded-[2rem] focus:outline-none font-bold" />
              </div>
            </div>
            <div className="flex flex-col gap-2">
              <button onClick={addCalf} className="w-full bg-blue-600 text-white py-5 rounded-[2rem] font-black shadow-lg shadow-blue-200 tracking-widest">
                ADD AS #{settings.nextCalfNumber}
              </button>
              <button onClick={() => setShowAddCalf(false)} className="w-full py-4 text-slate-400 font-black text-[10px] tracking-widest uppercase">CANCEL</button>
            </div>
          </div>
        </div>
      )}

      {/* FLOATING ACTION BUTTON */}
      {currentPage === 'dashboard' && (
        <button onClick={() => setShowAddCalf(true)} className="fixed bottom-8 right-8 bg-green-500 text-white p-6 rounded-full shadow-2xl shadow-green-200 active:scale-90 transition-all z-30">
          <Plus size={32} />
        </button>
      )}
    </div>
  );
}
