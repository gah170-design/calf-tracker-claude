'use client';

import React, { useState, useEffect } from 'react';
import { Plus, Settings, X, ChevronLeft } from 'lucide-react';
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
      // Fetch each table individually so one error doesn't kill the whole app
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
    } catch (err) {
      console.error("Critical Load Error:", err);
    }
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

  const recordFeeding = async (calfNumber, consumption) => {
    const now = new Date();
    const period = now.getHours() < 12 ? 'AM' : 'PM';
    const today = now.toISOString().slice(0, 10);
    const calf = calves.find(c => c.number === calfNumber);
    const existing = feedings.find(f => f.calf_number === calfNumber && f.timestamp.startsWith(today) && f.period === period);

    if (existing) {
      await supabase.from('feedings').update({ consumption, timestamp: now.toISOString() }).eq('id', existing.id);
    } else {
      await supabase.from('feedings').insert([{
        calf_number: calfNumber, calf_name: calf?.name || null,
        timestamp: now.toISOString(), period, consumption, user_name: currentUser.name
      }]);
    }
    await loadAllData();
  };

  if (loading) return <div className="h-screen flex items-center justify-center font-black">LOADING...</div>;

  if (!currentUser) {
    return (
      <div className="h-screen bg-slate-100 flex items-center justify-center p-6 text-center">
        <div className="bg-white rounded-[2rem] p-8 w-full max-w-xs shadow-xl">
          <h1 className="text-lg font-black mb-6 uppercase italic">Select User</h1>
          <div className="space-y-2">
            {users.length > 0 ? users.map(u => (
              <button key={u.id} onClick={() => { setCurrentUser(u); localStorage.setItem('calfTrackerUser', JSON.stringify(u)); }}
                className="w-full p-4 bg-slate-900 text-white rounded-xl font-bold uppercase text-xs tracking-widest">
                {u.name}
              </button>
            )) : <p className="text-xs text-slate-400">Connecting to database...</p>}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <header className="bg-blue-600 text-white p-5 flex justify-between items-center shadow-lg">
        <div>
          <h1 className="font-black text-xl italic tracking-tighter">CALF TRACKER</h1>
          <button onClick={() => { localStorage.removeItem('calfTrackerUser'); setCurrentUser(null); }} className="text-[10px] font-bold opacity-80 uppercase">
            {currentUser.name} • LOGOUT
          </button>
        </div>
        {/* Force Settings button to show for testing, then we can lock it back to admins later */}
        <button onClick={() => setShowSettings(true)} className="p-3 bg-white/20 rounded-full">
          <Settings size={22} />
        </button>
      </header>

      <main className="p-4 flex-1">
        {currentPage === 'dashboard' ? (
          <div className="grid grid-cols-2 gap-3">
             {protocols.map(p => (
               <div key={p.id} className="bg-white p-6 rounded-[2rem] shadow-sm border border-slate-100">
                 <div className="text-3xl font-black text-blue-600">{calves.length}</div>
                 <div className="text-[10px] font-black text-slate-400 uppercase">{p.name}</div>
               </div>
             ))}
             <button onClick={() => setCurrentPage('feed')} className="col-span-2 bg-slate-900 text-white py-6 rounded-[2rem] font-black mt-4">VIEW ALL CALVES</button>
          </div>
        ) : (
          <div className="space-y-4">
            <button onClick={() => setCurrentPage('dashboard')} className="text-blue-600 font-bold text-xs uppercase flex items-center gap-1">
              <ChevronLeft size={14}/> Back
            </button>
            {calves.map(calf => (
              <div key={calf.id} className="bg-white p-6 rounded-[2rem] shadow-sm border border-slate-100">
                <h3 className="text-xl font-black">#{calf.number}</h3>
                <div className="grid grid-cols-5 gap-1 mt-4">
                  {[0, 25, 50, 75, 100].map(pct => (
                    <button key={pct} onClick={() => recordFeeding(calf.number, pct)} className="py-4 bg-slate-50 rounded-xl font-black text-xs text-slate-400 active:bg-blue-600 active:text-white">
                      {pct}%
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      {showSettings && (
        <div className="fixed inset-0 bg-white z-[100] flex flex-col">
          <div className="p-6 flex justify-between items-center border-b shrink-0">
            <h2 className="text-xl font-black italic">SETTINGS</h2>
            <button onClick={() => setShowSettings(false)} className="p-2 bg-slate-100 rounded-full"><X size={20}/></button>
          </div>
          <div className="flex-1 overflow-y-auto p-6 space-y-8">
            <section>
              <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4">Users</h3>
              <div className="space-y-2">
                {users.map(u => (
                  <div key={u.id} className="flex justify-between items-center p-4 bg-slate-50 rounded-2xl">
                    <span className="font-bold text-sm">{u.name} ({u.role})</span>
                    <button onClick={async () => { if(confirm('Delete?')) { await supabase.from('users').delete().eq('id', u.id); loadAllData(); } }} className="text-red-400 text-xs font-bold">REMOVE</button>
                  </div>
                ))}
              </div>
            </section>
          </div>
          <div className="p-6 border-t">
            <button onClick={() => setShowSettings(false)} className="w-full bg-blue-600 text-white py-5 rounded-3xl font-black">CLOSE</button>
          </div>
        </div>
      )}
    </div>
  );
}
