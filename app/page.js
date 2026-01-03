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
  );
}

