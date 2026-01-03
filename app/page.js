'use client';

import React, { useState, useEffect } from 'react';
import { Plus, Settings, X, ChevronLeft, Trash2, UserPlus } from 'lucide-react';
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
  const [filterProtocol, setFilterProtocol] = useState('all');
  const [settings, setSettings] = useState({ nextCalfNumber: 1000 });
  const [newCalf, setNewCalf] = useState({ name: '', birthDate: new Date().toISOString().slice(0, 16) });

  useEffect(() => {
    const init = async () => {
      if (typeof window !== 'undefined') {
        const stored = localStorage.getItem('calfTrackerUser');
        if (stored) setCurrentUser(JSON.parse(stored));
      }
      await loadAllData();
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

  const getCalfAge = (date) => Math.floor((new Date() - new Date(date)) / (1000 * 60 * 60 * 24));

  if (loading) return <div className="h-screen flex items-center justify-center font-black">LOADING...</div>;

  if (!currentUser) {
    return (
      <div className="h-screen bg-slate-100 flex items-center justify-center p-6">
        <div className="bg-white rounded-[2.5rem] p-8 w-full max-w-xs shadow-xl text-center">
          <h1 className="font-black mb-6 uppercase italic tracking-widest">Select Operator</h1>
          <div className="space-y-3">
            {users.map(u => (
              <button key={u.id} onClick={() => { setCurrentUser(u); localStorage.setItem('calfTrackerUser', JSON.stringify(u)); }}
                className="w-full p-5 bg-slate-900 text-white rounded-2xl font-bold uppercase text-xs">
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
      {/* HEADER */}
      <header className="bg-blue-600 text-white p-5 flex justify-between items-center shadow-lg sticky top-0 z-40">
        <div>
          <h1 className="font-black text-xl italic tracking-tighter">CALF TRACKER</h1>
          <button onClick={() => { localStorage.removeItem('calfTrackerUser'); setCurrentUser(null); }} className="text-[10px] font-bold opacity-80 uppercase">
            {currentUser.name} • LOGOUT
          </button>
        </div>
        <button onClick={() => setShowSettings(true)} className="p-3 bg-white/20 rounded-full">
          <Settings size={22} />
        </button>
      </header>

      {/* MAIN */}
      <main className="p-4 flex-1">
        {currentPage === 'dashboard' ? (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              {protocols.map(p => (
                <div key={p.id} className="bg-white p-6 rounded-[2rem] shadow-sm border border-slate-100">
                  <div className="text-3xl font-black text-blue-600">
                    {calves.filter(c => c.status === 'active').length}
                  </div>
                  <div className="text-[10px] font-black text-slate-400 uppercase">{p.name}</div>
                </div>
              ))}
            </div>
            <button onClick={() => setCurrentPage('feed')} className="w-full bg-slate-900 text-white py-6 rounded-[2rem] font-black tracking-widest text-sm">
              VIEW FEEDING LIST
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            <button onClick={() => setCurrentPage('dashboard')} className="flex items-center text-blue-600 font-bold text-xs uppercase"><ChevronLeft size={14}/> Back</button>
            {calves.map(calf => (
              <div key={calf.id} className="bg-white p-6 rounded-[2.5rem] border border-slate-100 shadow-sm">
                <h3 className="text-2xl font-black italic">#{calf.number}</h3>
                <p className="text-[10px] font-bold text-slate-400 uppercase mb-4">{getCalfAge(calf.birth_date)} Days Old</p>
                <div className="grid grid-cols-5 gap-2">
                  {[0, 25, 50, 75, 100].map(pct => (
                    <button key={pct} className="py-5 bg-slate-50 rounded-2xl font-black text-slate-300 active:bg-blue-600 active:text-white transition-all">{pct}%</button>
                  ))}
                </div>
              </div>
            ))}
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
                  <div key={u.id} className="bg-white p-4 rounded-2xl flex justify-between items-center shadow-sm">
                    <div className="font-bold text-sm">{u.name} <span className="text-[10px] opacity-40 uppercase ml-1">({u.role})</span></div>
                    {u.id !== currentUser.id && (
                      <button onClick={async () => { if(confirm(`Delete ${u.name}?`)) { await supabase.from('users').delete().eq('id', u.id); loadAllData(); } }}
                        className="p-2 text-slate-300 hover:text-red-500 transition-colors"><Trash2 size={18}/></button>
                    )}
                  </div>
                ))}
                <div className="p-2 flex gap-2">
                   <input id="newU" type="text" placeholder="Add Staff..." className="flex-1 bg-white p-3 rounded-xl text-sm font-bold border border-slate-200" />
                   <button onClick={async () => {
                     const i = document.getElementById('newU');
                     if(i.value.trim()){ await supabase.from('users').insert([{name: i.value.trim(), role:'user'}]); i.value=''; loadAllData(); }
                   }} className="bg-slate-900 text-white px-4 rounded-xl font-black text-[10px] uppercase">Add</button>
                </div>
              </div>
            </section>
          </div>
          
          <div className="p-6 border-t bg-white">
            <button onClick={() => setShowSettings(false)} className="w-full bg-blue-600 text-white py-5 rounded-[2rem] font-black shadow-lg">CLOSE & SAVE</button>
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
