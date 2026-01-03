'use client';

import React, { useState, useEffect } from 'react';
import { Plus, Settings, AlertCircle, X, ChevronLeft, Save, Edit3 } from 'lucide-react';
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
  const [protocols, setProtocols] = useState([]); // Now dynamic
  const [loading, setLoading] = useState(true);
  
  const [showSettings, setShowSettings] = useState(false);
  const [settings, setSettings] = useState({
    flagFeedingCount: 2,
    flagPercentage: 50,
    missedFeedingHours: 12,
    nextCalfNumber: 3047
  });

  const [showAddCalf, setShowAddCalf] = useState(false);
  const [showNumberPrompt, setShowNumberPrompt] = useState(false);
  const [customNumber, setCustomNumber] = useState('');
  const [filterProtocol, setFilterProtocol] = useState('all');
  const [newCalf, setNewCalf] = useState({
    name: '',
    birthDate: new Date().toISOString().slice(0, 16),
    birthNotes: ''
  });

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
        supabase.from('calves').select('*').order('birth_date', { ascending: false }),
        supabase.from('feedings').select('*').order('timestamp', { ascending: false }),
        supabase.from('users').select('*'),
        supabase.from('settings').select('*'),
        supabase.from('protocols').select('*').order('order', { ascending: true })
      ]);

      if (calvesData.data) setCalves(calvesData.data);
      if (feedingsData.data) setFeedings(feedingsData.data);
      if (usersData.data) setUsers(usersData.data);
      if (protocolsData.data) setProtocols(protocolsData.data);
      
      if (settingsData.data) {
        const settingsObj = { ...settings };
        settingsData.data.forEach(s => {
          if (s.setting_key === 'next_calf_number') settingsObj.nextCalfNumber = parseInt(s.setting_value);
          if (s.setting_key === 'flag_feeding_count') settingsObj.flagFeedingCount = parseInt(s.setting_value);
          if (s.setting_key === 'flag_percentage') settingsObj.flagPercentage = parseInt(s.setting_value);
          if (s.setting_key === 'missed_feeding_hours') settingsObj.missedFeedingHours = parseInt(s.setting_value);
        });
        setSettings(settingsObj);
      }
    } catch (error) {
      console.error('Error loading data:', error);
    }
  };

  const saveSettings = async (key, val) => {
    setSettings(prev => ({ ...prev, [key]: val }));
    const dbKey = key.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
    await supabase.from('settings').update({ setting_value: val.toString() }).eq('setting_key', dbKey);
  };

  const updateProtocolValue = async (id, newValue) => {
    setProtocols(prev => prev.map(p => p.id === id ? { ...p, value: newValue } : p));
    await supabase.from('protocols').update({ value: newValue }).eq('id', id);
  };

  // Logic Helpers
  const getCalfAge = (birthDate) => Math.floor((new Date() - new Date(birthDate)) / (1000 * 60 * 60 * 24));
  const getCalfFeedingCount = (calfNumber) => feedings.filter(f => f.calf_number === calfNumber).length;
  
  const getProtocolStatus = (calf) => {
    if (protocols.length === 0) return 'Loading...';
    const age = getCalfAge(calf.birth_date);
    const feedingCount = getCalfFeedingCount(calf.number);
    
    for (let p of protocols) {
      if (p.type === 'feedings' && feedingCount < p.value) return p.name;
      if (p.type === 'days' && age < p.value) return p.name;
    }
    return protocols[protocols.length - 1]?.name || 'Unknown';
  };

  const shouldFlagCalf = (calf) => {
    const calfFeedings = feedings.filter(f => f.calf_number === calf.number).slice(0, settings.flagFeedingCount);
    if (calfFeedings.length < settings.flagFeedingCount) return null;
    if (calfFeedings.every(f => f.consumption <= settings.flagPercentage)) return 'low-consumption';
    return null;
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
    } catch (error) { console.error(error); }
  };

  const confirmCalfNumber = async (useNext) => {
    let num = useNext ? settings.nextCalfNumber : parseInt(customNumber);
    const { error } = await supabase.from('calves').insert([{
      number: num,
      name: newCalf.name.trim() || null,
      birth_date: newCalf.birthDate,
      status: 'active'
    }]);
    if (!error) {
      if (useNext) saveSettings('nextCalfNumber', settings.nextCalfNumber + 1);
      setShowAddCalf(false);
      setShowNumberPrompt(false);
      setNewCalf({ name: '', birthDate: new Date().toISOString().slice(0, 16), birthNotes: '' });
      await loadAllData();
    }
  };

  if (loading) return <div className="min-h-screen flex items-center justify-center font-bold text-blue-600">LOADING...</div>;

  if (!currentUser) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="bg-white rounded-3xl shadow-xl p-8 w-full max-w-xs text-center">
          <h1 className="text-2xl font-black mb-8">WHATS YOUR NAME?</h1>
          <div className="space-y-3">
            {users.map(u => (
              <button key={u.id} onClick={() => { setCurrentUser(u); localStorage.setItem('calfTrackerUser', JSON.stringify(u)); }}
                className="w-full p-4 bg-blue-600 text-white rounded-2xl font-bold shadow-lg shadow-blue-100 active:scale-95 transition-all">
                {u.name}
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      {/* HEADER */}
      <header className="bg-blue-600 text-white p-4 sticky top-0 z-40 flex justify-between items-center shadow-lg">
        <div>
          <h1 className="font-black text-xl tracking-tight">CALF TRACKER</h1>
          <button onClick={() => { localStorage.removeItem('calfTrackerUser'); setCurrentUser(null); }} className="text-[10px] font-bold opacity-70 uppercase">
            {currentUser.name} • LOGOUT
          </button>
        </div>
        {currentUser.role === 'admin' && (
          <button onClick={() => setShowSettings(true)} className="p-2 bg-white/20 rounded-full">
            <Settings size={22} />
          </button>
        )}
      </header>

      <main className="p-4 pb-28">
        {currentPage === 'dashboard' ? (
          <div className="space-y-6">
            <div className="grid grid-cols-2 gap-3">
              {protocols.map(p => {
                const count = calves.filter(c => c.status === 'active' && getProtocolStatus(c) === p.name).length;
                return (
                  <button key={p.id} onClick={() => { setFilterProtocol(p.name); setCurrentPage('feed'); }}
                    className="bg-white p-5 rounded-3xl shadow-sm border border-slate-100 text-left active:scale-95 transition-all">
                    <div className="text-4xl font-black text-blue-600 mb-1">{count}</div>
                    <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{p.name}</div>
                  </button>
                );
              })}
            </div>
            <button onClick={() => { setFilterProtocol('all'); setCurrentPage('feed'); }}
              className="w-full bg-blue-600 text-white py-5 rounded-3xl font-black shadow-xl shadow-blue-200 active:scale-[0.98] transition-all">
              GO TO FEEDING LIST
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            <button onClick={() => setCurrentPage('dashboard')} className="flex items-center text-blue-600 font-black text-sm mb-2">
              <ChevronLeft size={18} /> DASHBOARD
            </button>
            <div className="flex gap-2 overflow-x-auto no-scrollbar py-2">
              {['all', ...protocols.map(p => p.name)].map(tab => (
                <button key={tab} onClick={() => setFilterProtocol(tab)}
                  className={`px-5 py-2 rounded-full whitespace-nowrap text-xs font-black transition-all ${filterProtocol === tab ? 'bg-blue-600 text-white shadow-lg' : 'bg-white text-slate-400 border border-slate-100'}`}>
                  {tab.toUpperCase()}
                </button>
              ))}
            </div>
            {calves.filter(c => filterProtocol === 'all' ? true : getProtocolStatus(c) === filterProtocol).map(calf => (
              <div key={calf.number} className="bg-white p-5 rounded-3xl shadow-sm border border-slate-100">
                <div className="flex justify-between items-start mb-4">
                  <div>
                    <h3 className="text-2xl font-black text-slate-800">#{calf.number}</h3>
                    <p className="text-[10px] font-black text-blue-500 uppercase">{getProtocolStatus(calf)} • {getCalfAge(calf.birth_date)} DAYS</p>
                  </div>
                </div>
                <div className="grid grid-cols-5 gap-2">
                  {[0, 25, 50, 75, 100].map(pct => {
                    const active = feedings.find(f => f.calf_number === calf.number && f.timestamp.startsWith(new Date().toISOString().slice(0, 10)))?.consumption === pct;
                    return (
                      <button key={pct} onClick={() => recordFeeding(calf.number, pct)}
                        className={`py-4 rounded-2xl font-black transition-all ${active ? 'bg-blue-600 text-white scale-105 shadow-md' : 'bg-slate-50 text-slate-300'}`}>
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

      {/* MODALS */}
{showSettings && (
  <div className="fixed inset-0 bg-white z-[100] flex flex-col animate-in slide-in-from-bottom duration-300">
    {/* Header */}
    <div className="p-6 flex justify-between items-center border-b bg-slate-50">
      <h2 className="text-2xl font-black italic tracking-tighter text-slate-900">SYSTEM CONTROL</h2>
      <button onClick={() => setShowSettings(false)} className="p-3 bg-white shadow-sm border border-slate-200 rounded-full active:scale-90 transition-all text-slate-400">
        <X size={24}/>
      </button>
    </div>
    
    <div className="flex-1 overflow-y-auto p-6 space-y-8 pb-12">
      
      {/* 1. SYSTEM CONFIG */}
      <section className="space-y-4">
        <h3 className="text-[10px] font-black text-slate-400 tracking-widest uppercase italic ml-2">App Configuration</h3>
        <div className="bg-slate-50 rounded-[2rem] p-2 space-y-1">
          <div className="bg-white p-4 rounded-2xl flex justify-between items-center shadow-sm">
            <span className="font-bold text-sm text-slate-700">Next Auto-Number</span>
            <input type="number" value={settings.nextCalfNumber} 
              onChange={(e) => saveSettings('nextCalfNumber', parseInt(e.target.value))}
              className="w-20 text-right font-black text-blue-600 focus:outline-none bg-blue-50/50 px-2 py-1 rounded-lg" />
          </div>
        </div>
      </section>

      {/* 2. PROTOCOL EDITOR */}
      <section className="space-y-4">
        <h3 className="text-[10px] font-black text-slate-400 tracking-widest uppercase italic ml-2">Feeding Protocols</h3>
        <div className="bg-slate-50 rounded-[2rem] p-2 space-y-1">
          {protocols.map(p => (
            <div key={p.id} className="bg-white p-4 rounded-2xl flex justify-between items-center shadow-sm">
              <div>
                <div className="font-bold text-sm text-slate-800">{p.name}</div>
                <div className="text-[9px] text-slate-400 uppercase font-black tracking-tighter">Order: {p.order}</div>
              </div>
              <div className="flex items-center gap-2">
                <input type="number" value={p.value} 
                  onChange={(e) => updateProtocolValue(p.id, parseInt(e.target.value))}
                  className="w-12 text-center font-black bg-blue-50 text-blue-600 rounded-xl py-2 focus:outline-none" />
                <span className="text-[10px] font-black text-slate-400 uppercase">{p.type}</span>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* 3. TEAM MANAGEMENT */}
      <section className="space-y-4">
        <h3 className="text-[10px] font-black text-slate-400 tracking-widest uppercase italic ml-2">User Access Control</h3>
        <div className="bg-slate-50 rounded-[2rem] p-2 space-y-1">
          {users.map(u => (
            <div key={u.id} className="bg-white p-4 rounded-2xl flex justify-between items-center shadow-sm">
              <div>
                <div className="font-bold text-sm text-slate-800">{u.name}</div>
                <button 
                  disabled={u.id === currentUser.id}
                  onClick={async () => {
                    const newRole = u.role === 'admin' ? 'user' : 'admin';
                    await supabase.from('users').update({ role: newRole }).eq('id', u.id);
                    loadAllData();
                  }}
                  className={`text-[9px] font-black px-2.5 py-1 rounded-full uppercase tracking-tighter transition-colors ${
                    u.role === 'admin' ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-500'
                  }`}
                >
                  {u.role}
                </button>
              </div>
              {u.id !== currentUser.id && (
                <button 
                  onClick={async () => {
                    if(confirm(`Permanently remove ${u.name}?`)) {
                      await supabase.from('users').delete().eq('id', u.id);
                      loadAllData();
                    }
                  }}
                  className="p-3 text-slate-300 active:text-red-500 active:bg-red-50 rounded-2xl transition-all"
                >
                  <X size={18} />
                </button>
              )}
            </div>
          ))}
          
          {/* Add User Field */}
          <div className="p-2 pt-4 flex gap-2">
            <input 
              id="newUserName"
              type="text" 
              placeholder="Staff Member Name..." 
              className="flex-1 bg-white border border-slate-100 rounded-2xl px-4 py-4 text-sm font-bold focus:outline-none shadow-inner"
            />
            <button 
              onClick={async () => {
                const input = document.getElementById('newUserName');
                const name = input.value.trim();
                if (name) {
                  await supabase.from('users').insert([{ name, role: 'user' }]);
                  input.value = '';
                  loadAllData();
                }
              }}
              className="bg-slate-900 text-white px-6 rounded-2xl font-black text-[10px] active:scale-95 transition-all shadow-lg shadow-slate-200"
            >
              ADD
            </button>
          </div>
        </div>
      </section>

    </div>
    
    <div className="p-6 border-t bg-white">
      <button onClick={() => setShowSettings(false)} className="w-full bg-blue-600 text-white py-5 rounded-[2rem] font-black shadow-xl shadow-blue-100 active:scale-95 transition-all">
        SAVE ALL CHANGES
      </button>
    </div>
  </div>
)}
          
          <div className="p-6 border-t">
            <button onClick={() => setShowSettings(false)} className="w-full bg-slate-900 text-white py-5 rounded-3xl font-black">
              SAVE & EXIT
            </button>
          </div>
        </div>
      )}

      {/* Floating Add Calf Button */}
      {currentPage === 'dashboard' && (
        <button onClick={() => setShowAddCalf(true)} className="fixed bottom-8 right-8 bg-green-500 text-white p-5 rounded-full shadow-2xl shadow-green-200 active:scale-90 transition-all z-30">
          <Plus size={32} />
        </button>
      )}

      {/* Add Calf Modal */}
      {showAddCalf && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-md z-50 flex items-end sm:items-center justify-center p-4">
          <div className="bg-white rounded-[40px] w-full max-w-sm p-8 space-y-6 shadow-2xl animate-in slide-in-from-bottom duration-300">
            <h2 className="text-2xl font-black italic tracking-tighter">NEW CALF</h2>
            <div className="space-y-4">
              <div className="space-y-1">
                <label className="text-[10px] font-black text-slate-400 ml-2 uppercase tracking-widest">Name (Optional)</label>
                <input type="text" placeholder="e.g. Bessie" value={newCalf.name}
                  onChange={(e) => setNewCalf({ ...newCalf, name: e.target.value })}
                  className="w-full p-5 bg-slate-50 rounded-3xl focus:outline-none focus:ring-2 ring-blue-500 font-bold" />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-black text-slate-400 ml-2 uppercase tracking-widest">Birth Date</label>
                <input type="datetime-local" value={newCalf.birthDate}
                  onChange={(e) => setNewCalf({ ...newCalf, birthDate: e.target.value })}
                  className="w-full p-5 bg-slate-50 rounded-3xl focus:outline-none font-bold" />
              </div>
            </div>
            <div className="flex flex-col gap-2">
              <button onClick={() => confirmCalfNumber(true)} className="w-full bg-blue-600 text-white py-5 rounded-3xl font-black shadow-lg shadow-blue-100">
                ADD AS #{settings.nextCalfNumber}
              </button>
              <button onClick={() => setShowAddCalf(false)} className="w-full py-4 text-slate-400 font-black text-xs">CANCEL</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

