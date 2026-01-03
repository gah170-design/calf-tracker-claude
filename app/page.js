
'use client';

import React, { useState, useEffect } from 'react';
import { Plus, Settings, AlertCircle } from 'lucide-react';
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
  const protocols = [
    { id: 1, name: 'Colostrum', type: 'feedings', value: 3, order: 1 },
    { id: 2, name: 'Bottles', type: 'days', value: 5, order: 2 },
    { id: 3, name: 'Regular', type: 'days', value: 35, order: 3 },
    { id: 4, name: 'PM Only', type: 'days', value: 40, order: 4 },
    { id: 5, name: 'Weaned', type: 'days', value: 41, order: 5 }
  ];
  const [settings, setSettings] = useState({
    flagFeedingCount: 2,
    flagPercentage: 50,
    missedFeedingHours: 12,
    nextCalfNumber: 3047
  });
  const [filterProtocol, setFilterProtocol] = useState('all');
  const [showAddCalf, setShowAddCalf] = useState(false);
  const [showNumberPrompt, setShowNumberPrompt] = useState(false);
  const [customNumber, setCustomNumber] = useState('');
  const [newCalf, setNewCalf] = useState({
    name: '',
    birthDate: new Date().toISOString().slice(0, 16),
    birthNotes: ''
  });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const storedUser = localStorage.getItem('calfTrackerUser');
      if (storedUser) {
        setCurrentUser(JSON.parse(storedUser));
      }
    }
    loadAllData();
  }, []);

  const loadAllData = async () => {
    setLoading(true);
    try {
      const [calvesData, feedingsData, usersData, settingsData] = await Promise.all([
        supabase.from('calves').select('*').order('birth_date'),
        supabase.from('feedings').select('*').order('timestamp', { ascending: false }),
        supabase.from('users').select('*'),
        supabase.from('settings').select('*')
      ]);

      if (calvesData.data) setCalves(calvesData.data);
      if (feedingsData.data) setFeedings(feedingsData.data);
      if (usersData.data) setUsers(usersData.data);
      
      if (settingsData.data) {
        const settingsObj = {};
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
    setLoading(false);
  };

  const selectUser = (user) => {
    setCurrentUser(user);
    if (typeof window !== 'undefined') {
      localStorage.setItem('calfTrackerUser', JSON.stringify(user));
    }
  };

  const getCalfAge = (birthDate) => {
    const birth = new Date(birthDate);
    const now = new Date();
    return Math.floor((now - birth) / (1000 * 60 * 60 * 24));
  };

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
    return protocols[protocols.length - 1].name;
  };

  const getCalfFeedings = (calfNumber, count = 3) => {
    return feedings
      .filter(f => f.calf_number === calfNumber)
      .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp))
      .slice(-count);
  };

  const shouldFlagCalf = (calf) => {
    const recentFeedings = getCalfFeedings(calf.number, settings.flagFeedingCount);
    if (recentFeedings.length < settings.flagFeedingCount) return null;
    
    const allLow = recentFeedings.every(f => f.consumption <= settings.flagPercentage);
    if (allLow) return 'low-consumption';
    
    const lastFeeding = recentFeedings[recentFeedings.length - 1];
    if (lastFeeding && lastFeeding.notes) return 'has-notes';
    
    if (lastFeeding) {
      const hoursSince = (new Date() - new Date(lastFeeding.timestamp)) / (1000 * 60 * 60);
      if (hoursSince > settings.missedFeedingHours) return 'missed-feeding';
    }
    
    return null;
  };

  const addCalf = async () => {
    if (newCalf.name && newCalf.name.trim() !== '') {
      setShowNumberPrompt(true);
      return;
    }

    try {
      const { error } = await supabase.from('calves').insert([{
        number: settings.nextCalfNumber,
        name: newCalf.name.trim() || null,
        birth_date: newCalf.birthDate || new Date().toISOString(),
        birth_notes: newCalf.birthNotes || null,
        status: 'active'
      }]);

      if (error) throw error;

      await supabase.from('settings')
        .update({ setting_value: (settings.nextCalfNumber + 1).toString() })
        .eq('setting_key', 'next_calf_number');

      setNewCalf({ name: '', birthDate: new Date().toISOString().slice(0, 16), birthNotes: '' });
      setShowAddCalf(false);
      await loadAllData();
    } catch (error) {
      console.error('Error adding calf:', error);
      alert('Error adding calf: ' + error.message);
    }
  };

  const confirmCalfNumber = async (useNext) => {
    let calfNumber = useNext ? settings.nextCalfNumber : parseInt(customNumber);
    
    if (!useNext && (isNaN(calfNumber) || !customNumber.trim())) {
      alert('Please enter a valid number');
      return;
    }

    try {
      const { error } = await supabase.from('calves').insert([{
        number: calfNumber,
        name: newCalf.name.trim() || null,
        birth_date: newCalf.birthDate || new Date().toISOString(),
        birth_notes: newCalf.birthNotes || null,
        status: 'active'
      }]);

      if (error) throw error;

      if (calfNumber === settings.nextCalfNumber) {
        await supabase.from('settings')
          .update({ setting_value: (settings.nextCalfNumber + 1).toString() })
          .eq('setting_key', 'next_calf_number');
      }

      setNewCalf({ name: '', birthDate: new Date().toISOString().slice(0, 16), birthNotes: '' });
      setCustomNumber('');
      setShowNumberPrompt(false);
      setShowAddCalf(false);
      await loadAllData();
    } catch (error) {
      console.error('Error adding calf:', error);
      alert('Error adding calf: ' + error.message);
    }
  };

  const recordFeeding = async (calfNumber, consumption) => {
    const now = new Date();
    const period = now.getHours() < 12 ? 'AM' : 'PM';
    const today = now.toISOString().slice(0, 10);
    const calf = calves.find(c => c.number === calfNumber);
    
    try {
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
    } catch (error) {
      console.error('Error recording feeding:', error);
    }
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
      try {
        await supabase.from('feedings')
          .update({ notes })
          .eq('id', existing.id);
      } catch (error) {
        console.error('Error updating notes:', error);
      }
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
      try {
        await supabase.from('feedings')
          .update({ treatment: !existing.treatment })
          .eq('id', existing.id);
        await loadAllData();
      } catch (error) {
        console.error('Error toggling treatment:', error);
      }
    }
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

  const getFlaggedCount = () => {
    return calves.filter(c => c.status === 'active' && shouldFlagCalf(c)).length;
  };

  const getFilteredCalves = () => {
    let filtered = calves.filter(c => c.status === 'active');
    
    if (filterProtocol !== 'all') {
      filtered = filtered.filter(c => getProtocolStatus(c) === filterProtocol);
    }
    
    return filtered.sort((a, b) => new Date(a.birth_date) - new Date(b.birth_date));
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

  if (loading && !currentUser) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <div className="text-xl">Loading...</div>
      </div>
    );
  }

  if (!currentUser) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center p-4">
        <div className="bg-white rounded-lg shadow-lg p-8 max-w-md w-full">
          <h1 className="text-2xl font-bold mb-6 text-center">Select User</h1>
          <div className="space-y-3">
            {users.map(user => (
              <button
                key={user.id}
                onClick={() => selectUser(user)}
                className="w-full p-4 bg-blue-500 text-white rounded-lg hover:bg-blue-600 font-medium"
              >
                {user.name}
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }
if (currentPage === 'dashboard') {
    const protocolCounts = getProtocolCounts();
    const flaggedCount = getFlaggedCount();

    return (
      <div className="min-h-screen bg-gray-100">
        <div className="bg-blue-600 text-white p-4 flex justify-between items-center">
          <div>
            <h1 className="text-xl font-bold">Calf Tracker</h1>
            <button 
              onClick={() => {
        localStorage.removeItem('calfTrackerUser');
        setCurrentUser(null);
      }}
      className="text-sm opacity-90 hover:underline"
    >
      
  {currentUser.name} (Switch User)
          </button>
        </div>
        {currentUser.role === 'admin' && (
          <button
            onClick={() => setShowSettings(true)}
            className="p-2 hover:bg-blue-700 rounded"
          >
            <Settings size={24} />
          </button>
        )}
      </div>

        <div className="p-4">
          {flaggedCount > 0 && (
            <div className="bg-red-100 border-l-4 border-red-500 p-4 mb-4 rounded">
              <div className="flex items-center">
                <AlertCircle className="text-red-500 mr-2" />
                <span className="font-medium">{flaggedCount} calves flagged for attention</span>
              </div>
            </div>
          )}

          <h2 className="text-lg font-semibold mb-3">Feeding Protocols</h2>
          <div className="grid grid-cols-2 gap-3 mb-4">
            {protocols.map(protocol => (
              <button
                key={protocol.id}
                onClick={() => {
                  setFilterProtocol(protocol.name);
                  setCurrentPage('feed');
                }}
                className="bg-white p-4 rounded-lg shadow hover:shadow-md transition-shadow"
              >
                <div className="text-2xl font-bold text-blue-600">
                  {protocolCounts[protocol.name] || 0}
                </div>
                <div className="text-sm text-gray-600">{protocol.name}</div>
              </button>
            ))}
          </div>

          <button
            onClick={() => setCurrentPage('feed')}
            className="w-full bg-blue-500 text-white py-3 rounded-lg font-medium hover:bg-blue-600"
          >
            Go to Feed Entry
          </button>
        </div>

        <button
          onClick={() => setShowAddCalf(true)}
          className="fixed bottom-6 right-6 bg-green-500 text-white p-4 rounded-full shadow-lg hover:bg-green-600"
        >
          <Plus size={28} />
        </button>

        {showNumberPrompt && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-lg p-6 max-w-md w-full">
              <h2 className="text-xl font-bold mb-4">Choose Calf Number</h2>
              <p className="mb-4">Named calf: <strong>{newCalf.name}</strong></p>
              
              <button
                onClick={() => confirmCalfNumber(true)}
                className="w-full bg-blue-500 text-white py-3 rounded mb-3 hover:bg-blue-600 font-medium"
              >
                Use Next Available: #{settings.nextCalfNumber}
              </button>
              
              <div className="mb-3">
                <label className="block text-sm font-medium mb-1">Or Enter Custom Number:</label>
                <input
                  type="number"
                  value={customNumber}
                  onChange={(e) => setCustomNumber(e.target.value)}
                  placeholder="e.g., 001"
                  className="w-full p-2 border rounded"
                />
              </div>
              
              <div className="flex gap-2">
                <button
                  onClick={() => confirmCalfNumber(false)}
                  className="flex-1 bg-green-500 text-white py-3 rounded hover:bg-green-600 font-medium"
                >
                  Use Custom Number
                </button>
                <button
                  onClick={() => {
                    setShowNumberPrompt(false);
                    setCustomNumber('');
                  }}
                  className="flex-1 bg-gray-300 py-3 rounded hover:bg-gray-400 font-medium"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}

        {showAddCalf && !showNumberPrompt && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-lg p-6 max-w-md w-full">
              <h2 className="text-xl font-bold mb-4">Add New Calf</h2>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-1">Name (Optional)</label>
                  <input
                    type="text"
                    value={newCalf.name}
                    onChange={(e) => setNewCalf({ ...newCalf, name: e.target.value })}
                    className="w-full p-2 border rounded"
                    placeholder="Leave blank for auto-number"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Birth Date/Time</label>
                  <input
                    type="datetime-local"
                    value={newCalf.birthDate}
                    onChange={(e) => setNewCalf({ ...newCalf, birthDate: e.target.value })}
                    className="w-full p-2 border rounded"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Birth Notes</label>
                  <textarea
                    value={newCalf.birthNotes}
                    onChange={(e) => setNewCalf({ ...newCalf, birthNotes: e.target.value })}
                    className="w-full p-2 border rounded"
                    rows="3"
                  />
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={addCalf}
                    className="flex-1 bg-green-500 text-white py-3 rounded hover:bg-green-600 font-medium"
                  >
                    Add Calf
                  </button>
                  <button
                    onClick={() => setShowAddCalf(false)}
                    className="flex-1 bg-gray-300 py-3 rounded hover:bg-gray-400 font-medium"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  if (currentPage === 'feed') {
    const filteredCalves = getFilteredCalves();

    return (
      <div className="min-h-screen bg-gray-100 pb-20">
        <div className="bg-blue-600 text-white p-4">
          <button
            onClick={() => setCurrentPage('dashboard')}
            className="text-sm mb-2 hover:underline"
          >
            ← Back to Dashboard
          </button>
          <h1 className="text-xl font-bold">Feed Entry</h1>
        </div>

        <div className="p-4">
          <div className="flex gap-2 overflow-x-auto pb-2 mb-4">
            <button
              onClick={() => setFilterProtocol('all')}
              className={`px-4 py-2 rounded whitespace-nowrap ${
                filterProtocol === 'all' ? 'bg-blue-500 text-white' : 'bg-white'
              }`}
            >
              All
            </button>
            <button
              onClick={() => setFilterProtocol('flagged')}
              className={`px-4 py-2 rounded whitespace-nowrap ${
                filterProtocol === 'flagged' ? 'bg-blue-500 text-white' : 'bg-white'
              }`}
            >
              Flagged
            </button>
            {protocols.map(protocol => (
              <button
                key={protocol.id}
                onClick={() => setFilterProtocol(protocol.name)}
                className={`px-4 py-2 rounded whitespace-nowrap ${
                  filterProtocol === protocol.name ? 'bg-blue-500 text-white' : 'bg-white'
                }`}
              >
                {protocol.name}
              </button>
            ))}
          </div>

          <div className="space-y-4">
            {filteredCalves
              .filter(calf => filterProtocol === 'flagged' ? shouldFlagCalf(calf) : true)
              .map(calf => {
                const age = getCalfAge(calf.birth_date);
                const protocol = getProtocolStatus(calf);
                const recentFeedings = getCalfFeedings(calf.number, 3);
                const flag = shouldFlagCalf(calf);
                const todayFeeding = getTodayFeeding(calf.number);

                let borderClass = 'border-gray-300';
                if (flag === 'low-consumption') borderClass = 'border-red-500 border-4';
                else if (flag === 'has-notes') borderClass = 'border-yellow-400 border-4';
                else if (flag === 'missed-feeding') borderClass = 'border-orange-500 border-4';

                return (
                  <div key={calf.number} className={`bg-white p-4 rounded-lg shadow border-2 ${borderClass}`}>
                    <div className="font-bold text-lg mb-1">
                      {calf.number}{calf.name && ` (${calf.name})`}
                    </div>
                    <div className="text-sm text-gray-600 mb-2">
                      Born: {new Date(calf.birth_date).toLocaleDateString()} ({age} days) - {protocol}
                    </div>
                    
                    <div className="flex gap-2 mb-3">
                      {recentFeedings.map((f, i) => {
                        let color = 'bg-green-500';
                        if (f.consumption < 50) color = 'bg-red-500';
                        else if (f.consumption < 75) color = 'bg-yellow-500';
                        
                        return (
                          <div key={i} className={`${color} text-white px-3 py-1 rounded text-sm font-medium`}>
                            {f.consumption}%
                          </div>
                        );
                      })}
                    </div>

                    {recentFeedings.length > 0 && recentFeedings[recentFeedings.length - 1]?.notes && (
                      <div className="bg-yellow-50 p-2 rounded mb-3 text-sm">
                        📝 {recentFeedings[recentFeedings.length - 1].notes}
                      </div>
                    )}

                    <div className="mb-3">
                      <div className="text-sm font-medium mb-2">Today's feeding:</div>
                      <div className="flex gap-2">
                        {[0, 25, 50, 75, 100].map(pct => (
                          <button
                            key={pct}
                            onClick={() => recordFeeding(calf.number, pct)}
                            className={`flex-1 py-3 rounded font-bold ${
                              todayFeeding?.consumption === pct
                                ? 'bg-blue-600 text-white'
                                : 'bg-gray-200 hover:bg-gray-300'
                            }`}
                          >
                            {pct}%
                          </button>
                        ))}
                      </div>
                    </div>

                    <textarea placeholder="Notes..." value={todayFeeding?.notes || ''} onChange={(e) => updateFeedingNotes(calf.number, e.target.value)} className="w-full p-2 border rounded text-sm mb-2" rows="2" />

                    <label className="flex items-center text-sm">
                      <input
                        type="checkbox"
                        checked={todayFeeding?.treatment || false}
                        onChange={() => toggleTreatment(calf.number)}
                        className="mr-2"
                      />
                      Treatment given
                    </label>
                  </div>
                );
              })}
          </div>
        </div>
      </div>
    );
  }
if (showSettings) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
        <div className="bg-white rounded-lg p-6 max-w-md w-full">
          <h2 className="text-xl font-bold mb-4">Settings</h2>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1">Next Calf Number:</label>
              <input
                type="number"
                value={settings.nextCalfNumber}
                onChange={(e) => setSettings({ ...settings, nextCalfNumber: parseInt(e.target.value) })}
                className="w-full p-2 border rounded"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Flag After (consecutive low feedings):</label>
              <input
                type="number"
                value={settings.flagFeedingCount}
                onChange={(e) => setSettings({ ...settings, flagFeedingCount: parseInt(e.target.value) })}
                className="w-full p-2 border rounded"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Flag If Below (%):</label>
              <input
                type="number"
                value={settings.flagPercentage}
                onChange={(e) => setSettings({ ...settings, flagPercentage: parseInt(e.target.value) })}
                className="w-full p-2 border rounded"
              />
            </div>
            <div className="flex gap-2">
              <button onClick={() => setShowSettings(false)} className="flex-1 bg-gray-300 py-2 rounded">
                Close
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }
  return null;

}




