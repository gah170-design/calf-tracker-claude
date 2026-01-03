'use client';

import React, { useState, useEffect } from 'react';
import { Plus, Settings, AlertCircle, X, ChevronLeft, Save } from 'lucide-react';
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
  const [loading, setLoading] = useState(true);
  
  // Settings State
  const [showSettings, setShowSettings] = useState(false);
  const [settings, setSettings] = useState({
    flagFeedingCount: 2,
    flagPercentage: 50,
    missedFeedingHours: 12,
    nextCalfNumber: 3047
  });

  // UI States
  const [showAddCalf, setShowAddCalf] = useState(false);
  const [showNumberPrompt, setShowNumberPrompt] = useState(false);
  const [customNumber, setCustomNumber] = useState('');
  const [filterProtocol, setFilterProtocol] = useState('all');
  const [newCalf, setNewCalf] = useState({
    name: '',
    birthDate: new Date().toISOString().slice(0, 16),
    birthNotes: ''
  });

  const protocols = [
    { id: 1, name: 'Colostrum', type: 'feedings', value: 3, order: 1 },
    { id: 2, name: 'Bottles', type: 'days', value: 5, order: 2 },
    { id: 3, name: 'Regular', type: 'days', value: 35, order: 3 },
    { id: 4, name: 'PM Only', type: 'days', value: 40, order: 4 },
    { id: 5, name: 'Weaned', type: 'days', value: 41, order: 5 }
  ];

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
      const [calvesData, feedingsData, usersData, settingsData] = await Promise.all([
        supabase.from('calves').select('*').order('birth_date', { ascending: false }),
        supabase.from('feedings').select('*').order('timestamp', { ascending: false }),
        supabase.from('users').select('*'),
        supabase.from('settings').select('*')
      ]);

      if (calvesData.data) setCalves(calvesData.data);
      if (feedingsData.data) setFeedings(feedingsData.data);
      if (usersData.data) setUsers(usersData.data);
      
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

  const saveSettings = async (updatedSettings) => {
    setSettings(updatedSettings);
    try {
      const updates = [
        { setting_key: 'next_calf_number', setting_value: updatedSettings.nextCalfNumber.toString() },
        { setting_key: 'flag_feeding_count', setting_value: updatedSettings.flagFeedingCount.toString() },
        { setting_key: 'flag_percentage', setting_value: updatedSettings.flagPercentage.toString() }
      ];

      for (const item of updates) {
        await supabase.from('settings')
          .update({ setting_value: item.setting_value })
          .eq('setting_key', item.setting_key);
      }
    } catch (err) {
      console.error("Failed to save settings", err);
    }
  };

  // Helper Functions
  const getCalfAge = (birthDate) => Math.floor((new Date() - new Date(birthDate)) / (1000 * 60 * 60 * 24));
  const getCalfFeedingCount = (calfNumber) => feedings.filter(f => f.calf_number === calfNumber).length;
  
  const getProtocolStatus = (calf) => {
    const age = getCalfAge(calf.birth_date);
    const feedingCount = getCalfFeedingCount(calf.number);
    for (let protocol of protocols) {
      if (protocol.type === 'feedings' && feedingCount < protocol.value) return protocol.name;
      if (protocol.type === 'days' && age < protocol.value) return protocol.name;
    }
    return protocols[protocols.length - 1].name;
  };

  const shouldFlagCalf = (calf) => {
    const calfFeedings = feedings.filter(f => f.calf_number === calf.number).slice(0, settings.flagFeedingCount);
    if (calfFeedings.length < settings.flagFeedingCount) return null;
    if (calfFeedings.every(f => f.consumption <= settings.flagPercentage)) return 'low-consumption';
    const last = calfFeedings[0];
    if (last?.notes) return 'has-notes';
    return null;
  };

  // Action Handlers
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

  const addCalf = async () => {
    if (newCalf.name?.trim()) { setShowNumberPrompt(true); return; }
    confirmCalfNumber(true);
  };

  const confirmCalfNumber = async (useNext) => {
    let calfNumber = useNext ? settings.nextCalfNumber : parseInt(customNumber);
    try {
      const { error } = await supabase.from('calves').insert([{
        number: calfNumber,
        name: newCalf.name.trim() || null,
        birth_date: newCalf.birthDate,
        status: 'active'
      }]);
      if (error) throw error;
      if (useNext) saveSettings({ ...settings, nextCalfNumber: settings.nextCalfNumber + 1 });
      
      setShowAddCalf(false);
      setShowNumberPrompt(false);
      setNewCalf({ name: '', birthDate: new Date().toISOString().slice(0, 16), birthNotes: '' });
      await loadAllData();
    } catch (error) { alert(error.message); }
  };

  // --- RENDERING LOGIC ---

  if (loading) return <div className="min-h-screen flex items-center justify-center bg-gray-50">Loading Tracker...</div>;

  if (!currentUser) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center p-6">
        <div className="bg-white rounded-2xl shadow-xl p-8 w-full max-w-sm">
          <h1 className="text-2xl font-bold mb-8 text-center text-gray-800">Calf Tracker</h1>
          <div className="space-y-4">
            {users.map(user => (
              <button key={user.id} onClick={() => { setCurrentUser(user); localStorage.setItem('calfTrackerUser', JSON.stringify(user)); }}
                className="w-full p-4 bg-blue-600 text-white rounded-xl font-semibold shadow-md active:scale-95 transition-transform">
                {user.name}
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-24">
      {/* Header */}
      <div className="bg-blue-600 text-white p-4 sticky top-0 z-40 shadow-md flex justify-between items-center">
        <div>
          <h1 className="font-bold text-lg">Calf Tracker</h1>
          <button onClick={() => { localStorage.removeItem('calfTrackerUser'); setCurrentUser(null); }} className="text-xs opacity-80 uppercase tracking-wider">
            {currentUser.name} • Switch User
          </button>
        </div>
        {currentUser.role === 'admin' && (
          <button onClick={() => setShowSettings(true)} className="p-2 bg-blue-700 rounded-full active:bg-blue-800">
            <Settings size={22} />
          </button>
        )}
      </div>

      {/* Page Content */}
      <main className="p-4">
        {currentPage === 'dashboard' ? (
          <div className="space-y-6">
            {/* Flags */}
            {calves.filter(c => shouldFlagCalf(c)).length > 0 && (
              <div className="bg-red-50 border-l-4 border-red-500 p-4 rounded-r-lg flex items-center gap-3">
                <AlertCircle className="text-red-500" />
                <span className="text-red-800 font-medium">Attention: {calves.filter(c => shouldFlagCalf(c)).length} calves flagged</span>
              </div>
            )}

            {/* Protocols Grid */}
            <div className="grid grid-cols-2 gap-3">
              {protocols.map(p => {
                const count = calves.filter(c => c.status === 'active' && getProtocolStatus(c) === p.name).length;
                return (
                  <button key={p.id} onClick={() => { setFilterProtocol(p.name); setCurrentPage('feed'); }}
                    className="bg-white p-4 rounded-2xl shadow-sm border border-gray-100 active:bg-gray-50">
                    <div className="text-3xl font-black text-blue-600">{count}</div>
                    <div className="text-sm font-medium text-gray-500 uppercase">{p.name}</div>
                  </button>
                );
              })}
            </div>

            <button onClick={() => { setFilterProtocol('all'); setCurrentPage('feed'); }}
              className="w-full bg-blue-600 text-white py-4 rounded-2xl font-bold shadow-lg shadow-blue-200">
              View All Calves
            </button>
          </div>
        ) : (
          /* Feed Entry Page */
          <div className="space-y-4">
            <button onClick={() => setCurrentPage('dashboard')} className="flex items-center text-blue-600 font-semibold mb-2">
              <ChevronLeft size={20} /> Back to Dashboard
            </button>
            
            {/* Filter Tabs */}
            <div className="flex gap-2 overflow-x-auto no-scrollbar py-2">
              {['all', 'flagged', ...protocols.map(p => p.name)].map(tab => (
                <button key={tab} onClick={() => setFilterProtocol(tab)}
                  className={`px-4 py-2 rounded-full whitespace-nowrap text-sm font-bold border transition-colors ${filterProtocol === tab ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-600 border-gray-200'}`}>
                  {tab.toUpperCase()}
                </button>
              ))}
            </div>

            {/* Calf Cards */}
            {calves
              .filter(c => filterProtocol === 'all' ? true : filterProtocol === 'flagged' ? shouldFlagCalf(c) : getProtocolStatus(c) === filterProtocol)
              .map(calf => {
                const todayFeed = feedings.find(f => f.calf_number === calf.number && f.timestamp.startsWith(new Date().toISOString().slice(0, 10)));
                const flag = shouldFlagCalf(calf);
                return (
                  <div key={calf.number} className={`bg-white p-4 rounded-2xl shadow-sm border-2 ${flag ? 'border-red-400' : 'border-transparent'}`}>
                    <div className="flex justify-between items-start mb-3">
                      <div>
                        <h3 className="text-xl font-black text-gray-800">#{calf.number} {calf.name && <span className="text-gray-400 font-normal">| {calf.name}</span>}</h3>
                        <p className="text-xs text-gray-500 uppercase font-bold">{getProtocolStatus(calf)} • {getCalfAge(calf.birth_date)} Days Old</p>
                      </div>
                    </div>
                    
                    <div className="grid grid-cols-5 gap-2">
                      {[0, 25, 50, 75, 100].map(pct => (
                        <button key={pct} onClick={() => recordFeeding(calf.number, pct)}
                          className={`py-3 rounded-xl font-bold transition-all ${todayFeed?.consumption === pct ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-400'}`}>
                          {pct}%
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })}
          </div>
        )}
      </main>

      {/* Floating Add Button */}
      {currentPage === 'dashboard' && (
        <button onClick={() => setShowAddCalf(true)} className="fixed bottom-8 right-8 bg-green-500 text-white p-5 rounded-full shadow-2xl active:scale-90 transition-transform z-30">
          <Plus size={32} />
        </button>
      )}

      {/* --- MODALS --- */}

      {/* Settings Modal (Overlay) */}
      {showSettings && (
        <div className="fixed inset-0 bg-white z-[100] flex flex-col animate-in slide-in-from-bottom">
          <div className="p-4 bg-gray-50 border-b flex justify-between items-center">
            <h2 className="text-xl font-black text-gray-800">SYSTEM SETTINGS</h2>
            <button onClick={() => setShowSettings(false)} className="p-2 text-gray-400"><X size={24}/></button>
          </div>
          <div className="p-6 space-y-8 flex-1 overflow-y-auto">
            <div className="space-y-4">
              <label className="block text-xs font-bold text-gray-400 uppercase">Calf Numbering</label>
              <div className="flex items-center justify-between bg-gray-50 p-4 rounded-xl">
                <span className="font-semibold">Next Auto Number</span>
                <input type="number" value={settings.nextCalfNumber} 
                  onChange={(e) => saveSettings({...settings, nextCalfNumber: parseInt(e.target.value)})}
                  className="w-20 bg-transparent text-right font-bold text-blue-600 focus:outline-none" />
              </div>
            </div>
            <div className="space-y-4">
              <label className="block text-xs font-bold text-gray-400 uppercase">Health Alerts</label>
              <div className="bg-gray-50 rounded-xl divide-y">
                <div className="p-4 flex justify-between items-center">
                  <span>Flag below (%)</span>
                  <input type="number" value={settings.flagPercentage} 
                    onChange={(e) => saveSettings({...settings, flagPercentage: parseInt(e.target.value)})}
                    className="w-16 text-right font-bold" />
                </div>
                <div className="p-4 flex justify-between items-center">
                  <span>Consecutive feedings</span>
                  <input type="number" value={settings.flagFeedingCount} 
                    onChange={(e) => saveSettings({...settings, flagFeedingCount: parseInt(e.target.value)})}
                    className="w-16 text-right font-bold" />
                </div>
              </div>
            </div>
          </div>
          <div className="p-6">
            <button onClick={() => setShowSettings(false)} className="w-full bg-blue-600 text-white py-4 rounded-2xl font-bold">CLOSE SETTINGS</button>
          </div>
        </div>
      )}

      {/* Add Calf Modal */}
      {showAddCalf && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl w-full max-w-sm overflow-hidden shadow-2xl">
            <div className="p-6 space-y-4">
              <h2 className="text-xl font-bold">New Calf</h2>
              <input type="text" placeholder="Name (e.g. Bessie)" value={newCalf.name}
                onChange={(e) => setNewCalf({ ...newCalf, name: e.target.value })}
                className="w-full p-4 bg-gray-100 rounded-xl focus:outline-none focus:ring-2 ring-blue-500" />
              <input type="datetime-local" value={newCalf.birthDate}
                onChange={(e) => setNewCalf({ ...newCalf, birthDate: e.target.value })}
                className="w-full p-4 bg-gray-100 rounded-xl focus:outline-none" />
              <div className="flex gap-2 pt-4">
                <button onClick={() => setShowAddCalf(false)} className="flex-1 py-4 text-gray-500 font-bold">Cancel</button>
                <button onClick={addCalf} className="flex-1 bg-blue-600 text-white py-4 rounded-2xl font-bold">Add Calf</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
