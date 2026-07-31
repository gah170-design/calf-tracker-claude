'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Plus, Settings, X, ChevronLeft, ChevronRight, Activity, ShoppingCart, Ghost, CheckCircle2, Trash2, ListChecks, Hash, BarChart3, Download, Beef, TrendingUp, AlertTriangle, Users } from 'lucide-react';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

const getETDate = () => {
  const now = new Date();
  const etString = now.toLocaleString("en-US", { timeZone: "America/New_York" });
  return new Date(etString);
};

const getETDateString = (date) => {
  const etDate = new Date(date.toLocaleString("en-US", { timeZone: "America/New_York" }));
  const year = etDate.getFullYear();
  const month = String(etDate.getMonth() + 1).padStart(2, '0');
  const day = String(etDate.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const utcToETDateString = (utcTimestamp) => {
  const utcDate = new Date(utcTimestamp);
  return getETDateString(utcDate);
};

const getETPeriod = () => {
  const etNow = getETDate();
  return etNow.getHours() < 12 ? 'AM' : 'PM';
};

// Same before-noon-ET-is-AM rule as getETPeriod, but for a specific past
// timestamp instead of "right now" -- used to figure out which shift a
// treatment log actually falls in, not just which day.
const utcToETPeriod = (utcTimestamp) => {
  const etDate = new Date(new Date(utcTimestamp).toLocaleString("en-US", { timeZone: "America/New_York" }));
  return etDate.getHours() < 12 ? 'AM' : 'PM';
};

const getCalfAgeDays = (birthDateString) => {
  const birthDate = new Date(birthDateString);
  const birthETString = getETDateString(birthDate);
  const todayETString = getETDateString(getETDate());
  const birthET = new Date(birthETString);
  const todayET = new Date(todayETString);
  const diffTime = todayET - birthET;
  const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
  return diffDays;
};

const DIAGNOSES = ['Scours', 'Respiratory/Pneumonia', 'High Fever', 'Unknown'];

// Small red cross badge marking a treatment day on feeding bars/graphs.
// Built as raw SVG rather than a named icon import so it can't silently
// break if an icon library's export names change.
function TreatmentBadge({ size = 16, className = '', title = 'Treatment given' }) {
  return (
    <div
      className={`bg-red-500 rounded-full flex items-center justify-center shadow ${className}`}
      style={{ width: size, height: size, minWidth: size }}
      title={title}
    >
      <svg viewBox="0 0 24 24" width={size * 0.55} height={size * 0.55} fill="none" stroke="white" strokeWidth="4" strokeLinecap="round">
        <line x1="12" y1="4" x2="12" y2="20" />
        <line x1="4" y1="12" x2="20" y2="12" />
      </svg>
    </div>
  );
}

export default function CalfTracker() {
  const [currentUser, setCurrentUser] = useState(null);
  const [currentPage, setCurrentPage] = useState('dashboard');
  const [calves, setCalves] = useState([]);
  const [feedings, setFeedings] = useState([]);
  const [users, setUsers] = useState([]);
  const [protocols, setProtocols] = useState([]);
  const [medicines, setMedicines] = useState([]);
  const [treatmentPlans, setTreatmentPlans] = useState([]);
  // Lightweight lifetime record (active + completed) used only to answer "has this
  // calf ever been treated" / "was there a treatment on this date" for history/graph
  // badges. Nothing is ever deleted from the DB on Complete -- this just also loads
  // the completed rows the main `treatmentPlans` state intentionally excludes.
  const [allTreatmentHistory, setAllTreatmentHistory] = useState([]);
  const [treatmentMedicines, setTreatmentMedicines] = useState([]);
  const [treatmentLogs, setTreatmentLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showSettings, setShowSettings] = useState(false);
  const [showAddCalf, setShowAddCalf] = useState(false);
  const [showAnalytics, setShowAnalytics] = useState(false);
  const [selectedCalfHistory, setSelectedCalfHistory] = useState(null);
  const [historyNavList, setHistoryNavList] = useState([]);
  const [showPinEntry, setShowPinEntry] = useState(false);
  const [selectedUser, setSelectedUser] = useState(null);
  const [pinInput, setPinInput] = useState('');
  const [filterProtocol, setFilterProtocol] = useState('all');
  const [showNamedOnly, setShowNamedOnly] = useState(false);
  const [settings, setSettings] = useState({ nextCalfNumber: 1000, nextBullNumber: 1 });
  const [newCalf, setNewCalf] = useState({
    name: '',
    birthDate: new Date(getETDate().getTime() - getETDate().getTimezoneOffset() * 60000).toISOString().slice(0, 16),
    isBull: false,
    useCustomNumber: false,
    customNumber: ''
  });
  const [numberCheck, setNumberCheck] = useState({ status: null });
  const [noteBuffer, setNoteBuffer] = useState({});
  const [feedingRecordIds, setFeedingRecordIds] = useState({});
  const [showNewDiagnosis, setShowNewDiagnosis] = useState(false);
  const [showTreatmentPlan, setShowTreatmentPlan] = useState(false);
  const [selectedCalfForTreatment, setSelectedCalfForTreatment] = useState(null);
  const [newDiagnosis, setNewDiagnosis] = useState('Scours');
  const [newTreatmentMedicines, setNewTreatmentMedicines] = useState([]);
  const [showMedicineForm, setShowMedicineForm] = useState(false);
  const [newMedicine, setNewMedicine] = useState({ name: '', dosage: '', hours: 24, totalTreatments: 5 });
  const [editingTreatmentId, setEditingTreatmentId] = useState(null);
  const [addExistingMedicine, setAddExistingMedicine] = useState({ name: '', dosage: '', hours: 24, totalTreatments: 5 });
  const pendingInsertRef = useRef({});

  // ── Mobile back-button fix ──────────────────────────────────────────────
  // The app is a single URL with everything (pages, modals) driven by React
  // state, so the phone's hardware/gesture back button has nothing of ours to
  // step through by default and just leaves the site. Fix: every time we open
  // a page-level view or modal, we also push a browser history entry and
  // remember how to close it (backStackRef). Every close action -- whether
  // triggered by the hardware back button OR an in-app X/Cancel/Back button --
  // goes through the SAME path (goBack -> history.back() -> popstate handler),
  // so the two can never fall out of sync.
  const backStackRef = useRef([]);

  const pushBack = (closer) => {
    window.history.pushState({ claudeNav: true }, '');
    backStackRef.current.push(closer);
  };

  // Swaps what the TOP entry closes without adding a new history depth level --
  // used when one overlay directly replaces another (e.g. Settings -> Analytics)
  // so back from the new one skips the old one instead of re-showing it.
  const replaceTopBack = (closer) => {
    if (backStackRef.current.length > 0) {
      backStackRef.current[backStackRef.current.length - 1] = closer;
    } else {
      pushBack(closer);
    }
  };

  const goBack = () => {
    if (backStackRef.current.length > 0) {
      window.history.back();
    }
  };

  useEffect(() => {
    const handlePopState = () => {
      const closer = backStackRef.current.pop();
      if (closer) closer();
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  useEffect(() => {
    const init = async () => {
      await loadAllData();
      const savedUser = localStorage.getItem('calfTrackerUser');
      if (savedUser) {
        try {
          const user = JSON.parse(savedUser);
          setCurrentUser(user);
        } catch (err) {
          console.error('Error loading saved user:', err);
          localStorage.removeItem('calfTrackerUser');
        }
      }
      setLoading(false);
    };
    init();
  }, []);

  // PERF FIX (#5): batched update instead of one-by-one loop; returns archived ids
  const autoArchiveWeanedCalves = async (calvesList) => {
    const weanedIds = calvesList
      .filter(c => c.type !== 'bull' && getCalfAgeDays(c.birth_date) >= 53)
      .map(c => c.id);
    if (weanedIds.length > 0) {
      await supabase.from('calves').update({ status: 'inactive' }).in('id', weanedIds);
    }
    return weanedIds;
  };

  const loadAllData = async () => {
    try {
      // PERF FIX (#2): filter status='active' in the query itself instead of fetching
      // every calf ever created (5+ years of history) and filtering client-side.
      const { data: c } = await supabase.from('calves').select('*').eq('status', 'active').order('created_at', { ascending: false });
      if (c) {
        const weanedIds = await autoArchiveWeanedCalves(c);
        const activeCalves = c.filter(calf => !weanedIds.includes(calf.id));
        setCalves(activeCalves);
        const activeCalfNumbers = activeCalves.filter(calf => calf.type !== 'bull').map(calf => calf.number);
        const activeBullNumbers = activeCalves.filter(calf => calf.type === 'bull').map(calf => calf.bull_number);
        if (activeCalfNumbers.length > 0 || activeBullNumbers.length > 0) {
          const orConditions = [];
          if (activeCalfNumbers.length > 0) orConditions.push(`calf_number.in.(${activeCalfNumbers.join(',')})`);
          if (activeBullNumbers.length > 0) orConditions.push(`bull_number.in.(${activeBullNumbers.join(',')})`);
          const { data: f } = await supabase
            .from('feedings')
            .select('*')
            .or(orConditions.join(','))
            .order('timestamp', { ascending: false });
          if (f) {
            setFeedings(f);
            // Seed the record-id cache so hot-path saves (recordFeeding/saveNote)
            // can update directly by id instead of re-deriving from the array or reloading.
            const idMap = {};
            f.forEach(rec => {
              const key = rec.bull_number || rec.calf_number;
              const dateStr = utcToETDateString(rec.timestamp);
              idMap[`${key}_${dateStr}_${rec.period}`] = rec.id;
            });
            setFeedingRecordIds(idMap);
          }
        } else {
          setFeedings([]);
          setFeedingRecordIds({});
        }
      }
      const { data: u } = await supabase.from('users').select('*').order('name', { ascending: true });
      if (u) setUsers(u);
      const { data: p } = await supabase.from('protocols').select('*').order('order', { ascending: true });
      if (p) setProtocols(p);
      const { data: m } = await supabase.from('medicines').select('*').order('name', { ascending: true });
      if (m) setMedicines(m);
      const { data: tp } = await supabase.from('treatment_plans').select('*').eq('completed', false);
      if (tp) setTreatmentPlans(tp);
      const { data: allTp } = await supabase.from('treatment_plans').select('id, calf_id, diagnosis, completed');
      if (allTp) setAllTreatmentHistory(allTp);
      const { data: tm } = await supabase.from('treatment_medicines').select('*');
      if (tm) setTreatmentMedicines(tm);
      const { data: tl } = await supabase.from('treatment_logs').select('*').order('timestamp', { ascending: false });
      if (tl) setTreatmentLogs(tl);
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

  // Custom-number modal support: checks uniqueness across ALL calves (any status),
  // since the `number` column is unique for the life of the table, not just active rows.
  const checkCustomNumberAvailability = async (num) => {
    if (!num) { setNumberCheck({ status: null }); return; }
    setNumberCheck({ status: 'checking' });
    const { data } = await supabase.from('calves').select('id').eq('number', parseInt(num)).limit(1);
    setNumberCheck({ status: data && data.length > 0 ? 'taken' : 'available' });
  };

  const addCalf = async () => {
    let bullNumber = null;
    let dbNumberValue;
    let usedBullCounter = settings.nextBullNumber;
    let usedCalfCounter = settings.nextCalfNumber;
    if (newCalf.isBull) {
      bullNumber = `M${usedBullCounter}`;
      dbNumberValue = -usedBullCounter;
    } else {
      if (newCalf.useCustomNumber && newCalf.customNumber) {
        if (numberCheck.status === 'taken') {
          alert('That number is already in use. Choose a different one.');
          return;
        }
        dbNumberValue = parseInt(newCalf.customNumber);
      } else {
        dbNumberValue = usedCalfCounter;
      }
    }

    let { error } = await supabase.from('calves').insert([{
      number: dbNumberValue,
      bull_number: bullNumber,
      name: newCalf.name.trim() || null,
      birth_date: newCalf.birthDate,
      status: 'active',
      type: newCalf.isBull ? 'bull' : 'heifer'
    }]);

    // FIX: this used to fail completely silently (Create button "did nothing") if the
    // saved counter had drifted out of sync with numbers actually in use -- e.g. the
    // bull counter pointing at M3 when M3-M70 already existed, hitting the database's
    // uniqueness rule on every attempt. Now: on a duplicate-number error, we self-heal
    // by finding the true highest number in use, correct the saved counter, and retry
    // once automatically. Any other failure now surfaces a real alert instead of
    // silently doing nothing.
    if (error && error.code === '23505') {
      const { data: existing } = await supabase.from('calves').select('number, bull_number').not('number', 'is', null);
      if (newCalf.isBull) {
        const maxBull = Math.max(0, ...(existing || []).filter(c => c.bull_number).map(c => parseInt((c.bull_number || '').replace(/\D/g, '')) || 0));
        usedBullCounter = maxBull + 1;
        await saveGlobalSetting('nextBullNumber', usedBullCounter);
        bullNumber = `M${usedBullCounter}`;
        dbNumberValue = -usedBullCounter;
      } else if (!newCalf.useCustomNumber) {
        const maxNumber = Math.max(0, ...(existing || []).map(c => c.number || 0));
        usedCalfCounter = maxNumber + 1;
        await saveGlobalSetting('nextCalfNumber', usedCalfCounter);
        dbNumberValue = usedCalfCounter;
      }
      ({ error } = await supabase.from('calves').insert([{
        number: dbNumberValue,
        bull_number: bullNumber,
        name: newCalf.name.trim() || null,
        birth_date: newCalf.birthDate,
        status: 'active',
        type: newCalf.isBull ? 'bull' : 'heifer'
      }]));
    }

    if (error) {
      console.error('addCalf error:', error);
      alert(`Could not create this entry: ${error.message || 'unknown error'}. Nothing was saved -- please try again.`);
      return;
    }

    if (newCalf.isBull) await saveGlobalSetting('nextBullNumber', usedBullCounter + 1);
    else if (!newCalf.useCustomNumber) await saveGlobalSetting('nextCalfNumber', usedCalfCounter + 1);
    setNewCalf({
      name: '',
      birthDate: new Date(getETDate().getTime() - getETDate().getTimezoneOffset() * 60000).toISOString().slice(0, 16),
      isBull: false,
      useCustomNumber: false,
      customNumber: ''
    });
    setNumberCheck({ status: null });
    goBack();
    await loadAllData();
  };

  // PERF FIX (#1) + button-disable fix: no more freezing the button while a full
  // 8-query reload runs. Instead we cache the feeding row's id locally the first time
  // it's created, then subsequent taps for that calf/period update that row directly
  // and patch local state -- no reload, no disabled state, and a calf that drinks more
  // later can still be corrected instantly without navigating to Edit.
  const recordFeeding = async (calf, consumption) => {
    const calfKey = calf.bull_number || calf.number;
    const period = getETPeriod();
    const todayET = getETDateString(getETDate());
    const cacheKey = `${calfKey}_${todayET}_${period}`;
    const cachedId = feedingRecordIds[cacheKey];

    const existingRecord = cachedId ? feedings.find(f => f.id === cachedId) : null;
    const notes = noteBuffer[calfKey] !== undefined ? noteBuffer[calfKey] : (existingRecord ? existingRecord.notes : null);

    const feedingData = {
      consumption,
      timestamp: new Date().toISOString(),
      notes,
      treatment: false,
      user_name: currentUser.name,
      calf_number: calf.type !== 'bull' ? calf.number : null,
      bull_number: calf.type === 'bull' ? calf.bull_number : null,
      calf_name: calf.name || null,
      period,
    };

    try {
      if (cachedId) {
        await supabase.from('feedings').update(feedingData).eq('id', cachedId);
        setFeedings(prev => prev.map(f => f.id === cachedId ? { ...f, ...feedingData } : f));
      } else {
        // Guard only the brief window of the very first insert for this calf/period,
        // to prevent a genuine double-tap race from creating two rows.
        if (pendingInsertRef.current[cacheKey]) return;
        pendingInsertRef.current[cacheKey] = true;
        const { data, error } = await supabase.from('feedings').insert([feedingData]).select();
        pendingInsertRef.current[cacheKey] = false;
        if (!error && data && data[0]) {
          setFeedingRecordIds(prev => ({ ...prev, [cacheKey]: data[0].id }));
          setFeedings(prev => [data[0], ...prev]);
        }
      }
      setNoteBuffer(prev => { const n = { ...prev }; delete n[calfKey]; return n; });
    } catch (err) {
      console.error('recordFeeding error:', err);
    }
  };

  // Dedicated note save -- updates existing feeding record directly by cached id,
  // or holds in buffer until a % is clicked if no feeding exists yet today.
  const saveNote = async (calf, noteText) => {
    const calfKey = calf.bull_number || calf.number;
    const period = getETPeriod();
    const todayET = getETDateString(getETDate());
    const cacheKey = `${calfKey}_${todayET}_${period}`;
    const cachedId = feedingRecordIds[cacheKey];

    if (cachedId) {
      await supabase.from('feedings').update({ notes: noteText }).eq('id', cachedId);
      setFeedings(prev => prev.map(f => f.id === cachedId ? { ...f, notes: noteText } : f));
      setNoteBuffer(prev => { const n = { ...prev }; delete n[calfKey]; return n; });
    }
    // If no feeding yet, note stays in buffer and saves when % is clicked
  };

  // ── ADMIN: edit an existing feeding record directly ──
  const adminUpdateFeeding = async (feedingId, updates) => {
    await supabase.from('feedings').update(updates).eq('id', feedingId);
    await loadAllData();
  };

  // ── ADMIN: delete a feeding record (e.g. accidental duplicate) ──
  const adminDeleteFeeding = async (feedingId) => {
    await supabase.from('feedings').delete().eq('id', feedingId);
    await loadAllData();
  };

  const getCalfFeedings = (calf) => feedings.filter(f =>
    calf.type === 'bull' ? f.bull_number === calf.bull_number : f.calf_number == calf.number
  ).sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

  const getProtocolStatus = (calf) => {
    if (calf.type === 'bull') return 'Bull (Bottle)';
    const age = getCalfAgeDays(calf.birth_date);
    const count = getCalfFeedings(calf).length;
    const sortedProtocols = [...protocols].sort((a, b) => a.order - b.order);
    for (let p of sortedProtocols) {
      if (p.type === 'feedings' && count < p.value) return p.name;
      if (p.type === 'days' && age < p.value) return p.name;
    }
    const lastProtocol = sortedProtocols[sortedProtocols.length - 1];
    return lastProtocol ? lastProtocol.name : "Weaned";
  };

  const getCalfTreatmentPlans = (calf) => treatmentPlans.filter(tp => tp.calf_id === calf.id);

  const getTreatmentMedicinesForPlan = (planId) => treatmentMedicines.filter(tm => tm.treatment_plan_id === planId);

  // Has this calf EVER had a treatment plan (active or completed)? Used for the
  // "treated at some point" badge near the calf number in History.
  const calfHasEverBeenTreated = (calf) => allTreatmentHistory.some(tp => tp.calf_id === calf.id);

  // Map of "date_period" key (e.g. "2026-07-29_AM") -> { diagnosis, medicines }
  // for every shift this calf was actually treated in, across every plan it's
  // ever had. Matching on shift instead of just date means a single-dose
  // treatment given in the AM only badges that AM feeding -- not the PM feeding
  // on the same day too. If two different diagnoses/plans somehow land on the
  // same shift, their names and medicines are merged together.
  const getCalfTreatmentShifts = (calf) => {
    const calfPlans = allTreatmentHistory.filter(tp => tp.calf_id === calf.id);
    const planIdToDiagnosis = {};
    const planIdToMedicines = {};
    calfPlans.forEach(tp => {
      planIdToDiagnosis[String(tp.id)] = tp.diagnosis;
      planIdToMedicines[String(tp.id)] = getTreatmentMedicinesForPlan(tp.id).map(m => ({ name: m.medicine_name, dosage: m.dosage }));
    });
    const shifts = new Map();
    treatmentLogs.forEach(tl => {
      const planKey = String(tl.treatment_plan_id);
      const diagnosis = planIdToDiagnosis[planKey];
      if (diagnosis) {
        const key = `${utcToETDateString(tl.timestamp)}_${utcToETPeriod(tl.timestamp)}`;
        const meds = planIdToMedicines[planKey] || [];
        const existing = shifts.get(key);
        if (existing) {
          shifts.set(key, {
            diagnosis: existing.diagnosis === diagnosis ? existing.diagnosis : `${existing.diagnosis}, ${diagnosis}`,
            medicines: [...existing.medicines, ...meds]
          });
        } else {
          shifts.set(key, { diagnosis, medicines: meds });
        }
      }
    });
    return shifts;
  };

  // FIX: checkbox was gated on an internal "is this plan still within its day-count"
  // check, which silently excluded plans (and made the checkbox unclickable/inert)
  // once a course reached its expected length, even though the plan hadn't been
  // explicitly marked Complete. Now any non-completed plan counts, matching what's
  // actually visible on the card. Also switched to AND logic so "given" only shows
  // once every active plan has today's log, matching the checkbox's own label
  // ("Check when all meds administered") instead of the old any-one-plan OR logic.
  const getTreatmentGivenToday = (calf) => {
    const todayET = getETDateString(getETDate());
    const plans = getCalfTreatmentPlans(calf);
    if (plans.length === 0) return false;
    return plans.every(plan =>
      treatmentLogs.some(tl => tl.treatment_plan_id === plan.id && utcToETDateString(tl.timestamp) === todayET)
    );
  };

  // Optimistic + error-surfacing: the checkbox now flips instantly instead of
  // waiting on a full reload, and a failed save shows an alert instead of silently
  // doing nothing (which is what made the original bug so hard to notice/diagnose).
  const markTreatmentGiven = async (calf) => {
    const todayET = getETDateString(getETDate());
    const plans = getCalfTreatmentPlans(calf);
    const plansNeedingLog = plans.filter(plan =>
      !treatmentLogs.some(tl => tl.treatment_plan_id === plan.id && utcToETDateString(tl.timestamp) === todayET)
    );
    if (plansNeedingLog.length === 0) return;

    const optimisticLogs = plansNeedingLog.map(plan => ({
      id: `optimistic_${plan.id}_${Date.now()}`,
      treatment_plan_id: plan.id,
      user_name: currentUser.name,
      timestamp: new Date().toISOString()
    }));
    setTreatmentLogs(prev => [...optimisticLogs, ...prev]);

    try {
      for (let plan of plansNeedingLog) {
        const { error } = await supabase.from('treatment_logs').insert([{
          treatment_plan_id: plan.id,
          user_name: currentUser.name,
          timestamp: new Date().toISOString()
        }]);
        if (error) throw error;

        // Auto-complete: once this plan's logged days reach the longest course
        // among its medicines (same max used for "Day X of Y" progress), the
        // plan is done -- no manual "Complete" button needed anymore.
        const meds = getTreatmentMedicinesForPlan(plan.id);
        if (meds.length > 0) {
          const maxTreatments = Math.max(...meds.map(m => m.total_treatments));
          const loggedCount = treatmentLogs.filter(tl => tl.treatment_plan_id === plan.id).length + 1; // +1 for the log we just inserted
          if (loggedCount >= maxTreatments) {
            await supabase.from('treatment_plans').update({ completed: true, completed_at: new Date().toISOString() }).eq('id', plan.id);
          }
        }
      }
      await loadAllData();
    } catch (err) {
      console.error('markTreatmentGiven error:', err);
      alert('Could not save treatment log — check your connection and try again.');
      setTreatmentLogs(prev => prev.filter(tl => !optimisticLogs.some(o => o.id === tl.id)));
    }
  };

  // Medicine template system: saving a brand-new medicine now stores its default
  // dosage/interval/treatment-count on the `medicines` row itself, so picking it
  // again later autofills those fields. Single-dose vs multi-dose variants of the
  // same drug are just saved as separate named entries (e.g. "Banamine (Single Dose)").
  const addMedicineToNewDiagnosis = async () => {
    if (!newMedicine.name || !newMedicine.dosage) { alert('Fill in medicine name and dosage'); return; }
    const existingMed = medicines.find(m => m.name === newMedicine.name);
    if (!existingMed) {
      await supabase.from('medicines').insert([{
        name: newMedicine.name,
        default_dosage: newMedicine.dosage,
        default_frequency_hours: newMedicine.hours,
        default_total_treatments: newMedicine.totalTreatments
      }]);
      await loadAllData();
    }
    setNewTreatmentMedicines([...newTreatmentMedicines, { ...newMedicine, id: Date.now() }]);
    setNewMedicine({ name: '', dosage: '', hours: 24, totalTreatments: 5 });
    setShowMedicineForm(false);
  };

  // Autofill dosage/interval/treatments when an existing medicine is picked from the dropdown.
  const handleMedicineNameSelect = (name) => {
    const med = medicines.find(m => m.name === name);
    if (med) {
      setNewMedicine({
        name: med.name,
        dosage: med.default_dosage || '',
        hours: med.default_frequency_hours || 24,
        totalTreatments: med.default_total_treatments || 5
      });
    } else {
      setNewMedicine({ ...newMedicine, name });
    }
  };

  const handleExistingMedicineNameSelect = (name) => {
    const med = medicines.find(m => m.name === name);
    if (med) {
      setAddExistingMedicine({
        name: med.name,
        dosage: med.default_dosage || '',
        hours: med.default_frequency_hours || 24,
        totalTreatments: med.default_total_treatments || 5
      });
    } else {
      setAddExistingMedicine({ ...addExistingMedicine, name });
    }
  };

  const saveDiagnosis = async () => {
    if (newTreatmentMedicines.length === 0) { alert('Add at least one medicine'); return; }
    const { data: plan, error: planError } = await supabase.from('treatment_plans').insert([{
      calf_id: selectedCalfForTreatment.id,
      diagnosis: newDiagnosis,
      start_date: new Date().toISOString()
    }]).select();
    if (!planError && plan) {
      const planId = plan[0].id;
      for (let med of newTreatmentMedicines) {
        await supabase.from('treatment_medicines').insert([{
          treatment_plan_id: planId,
          medicine_name: med.name,
          dosage: med.dosage,
          frequency_hours: med.hours,
          total_treatments: med.totalTreatments,
          completed_treatments: 0
        }]);
      }
      setNewTreatmentMedicines([]);
      setNewDiagnosis('Scours');
      goBack();
      await loadAllData();
    }
  };

  const addMedicineToExisting = async (treatmentPlanId) => {
    if (!addExistingMedicine.name || !addExistingMedicine.dosage) { alert('Fill in all medicine fields'); return; }
    const existingMed = medicines.find(m => m.name === addExistingMedicine.name);
    if (!existingMed) {
      await supabase.from('medicines').insert([{
        name: addExistingMedicine.name,
        default_dosage: addExistingMedicine.dosage,
        default_frequency_hours: addExistingMedicine.hours,
        default_total_treatments: addExistingMedicine.totalTreatments
      }]);
    }
    await supabase.from('treatment_medicines').insert([{
      treatment_plan_id: treatmentPlanId,
      medicine_name: addExistingMedicine.name,
      dosage: addExistingMedicine.dosage,
      frequency_hours: addExistingMedicine.hours,
      total_treatments: addExistingMedicine.totalTreatments,
      completed_treatments: 0
    }]);
    setAddExistingMedicine({ name: '', dosage: '', hours: 24, totalTreatments: 5 });
    setEditingTreatmentId(null);
    await loadAllData();
  };

  const deleteTreatmentPlan = async (planId) => {
    if (confirm('Delete this treatment plan?')) {
      await supabase.from('treatment_plans').delete().eq('id', planId);
      await loadAllData();
    }
  };

  const deleteTreatmentMedicine = async (medicineId) => {
    if (confirm('Remove this medicine?')) {
      await supabase.from('treatment_medicines').delete().eq('id', medicineId);
      await loadAllData();
    }
  };

  const getShiftSchedule = (hours) => {
    if (hours === 12) return 'AM & PM';
    if (hours === 24) return 'Once Daily';
    if (hours === 48) return 'Every Other Day';
    if (hours === 72) return 'Every 3 Days';
    return `Every ${hours}hrs`;
  };

  const calculateProgress = (planId) => {
    const planLogs = treatmentLogs.filter(tl => tl.treatment_plan_id === planId);
    const meds = getTreatmentMedicinesForPlan(planId);
    if (meds.length === 0) return 'Day 1';
    const maxTreatments = Math.max(...meds.map(m => m.total_treatments));
    const currentDay = planLogs.length;
    if (currentDay >= maxTreatments) return 'Complete';
    return `Day ${currentDay + 1} of ${maxTreatments}`;
  };

  // CSV export now includes active/past diagnoses and their medicines as extra
  // trailing columns, additive to the original layout so existing spreadsheet
  // workflows built on the old column order aren't disrupted.
  const exportToCSV = () => {
    const csvData = [];
    csvData.push(['Calf Number', 'Name', 'Type', 'Birth Date', 'Age (Days)', 'Protocol', 'Status', 'Date', 'Period', 'Consumption', 'Notes', 'User', 'Diagnoses', 'Treatment Medicines']);
    calves.forEach(calf => {
      const calfFeedings = getCalfFeedings(calf);
      const age = getCalfAgeDays(calf.birth_date);
      const protocol = getProtocolStatus(calf);
      const plans = getCalfTreatmentPlans(calf);
      const diagnosesSummary = plans.map(p => `${p.diagnosis}${p.completed ? ' (completed)' : ''}`).join('; ');
      const medsSummary = plans.flatMap(p => getTreatmentMedicinesForPlan(p.id).map(m => `${m.medicine_name} ${m.dosage} (${getShiftSchedule(m.frequency_hours)})`)).join('; ');
      if (calfFeedings.length === 0) {
        csvData.push([calf.bull_number || calf.number, calf.name || '', calf.type, calf.birth_date, age, protocol, calf.status, '', '', '', '', '', diagnosesSummary, medsSummary]);
      } else {
        calfFeedings.forEach(f => {
          csvData.push([calf.bull_number || calf.number, calf.name || '', calf.type, calf.birth_date, age, protocol, calf.status, new Date(f.timestamp).toLocaleDateString(), f.period, f.consumption, f.notes || '', f.user_name, diagnosesSummary, medsSummary]);
        });
      }
    });
    const csvContent = csvData.map(row => row.map(cell => `"${cell}"`).join(',')).join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `calf-data-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
  };

  // ── sorted list helper used by both the feed page and history nav ──
  const getSortedList = (page, protocol) => {
    const activeHeifers = calves.filter(c => c.status === 'active' && c.type !== 'bull');
    const activeBulls = calves.filter(c => c.status === 'active' && c.type === 'bull');
    const flaggedCalves = activeHeifers.filter(c => {
      const history = getCalfFeedings(c).slice(0, 2);
      return history.length >= 2 && history.every(f => f.consumption <= 50);
    });

    let list;
    if (page === 'bulls') list = activeBulls;
    else if (page === 'flagged') list = flaggedCalves;
    else {
      list = protocol === 'all' ? activeHeifers : activeHeifers.filter(c => getProtocolStatus(c) === protocol);
      if (page === 'feed' && showNamedOnly) list = list.filter(c => c.name);
    }

    return [...list].sort((a, b) =>
      (b.bull_number ? parseInt(b.bull_number.replace(/\D/g, '')) : b.number) -
      (a.bull_number ? parseInt(a.bull_number.replace(/\D/g, '')) : a.number)
    );
  };

  // dashboard -> feed/bulls/flagged, with a back-stack entry so hardware back
  // (or the in-app Back button) returns to the dashboard.
  const navigateToPage = (page, protocol = 'all') => {
    setFilterProtocol(protocol);
    setCurrentPage(page);
    pushBack(() => { setCurrentPage('dashboard'); setFilterProtocol('all'); setShowNamedOnly(false); });
  };

  // ── history nav handlers ──
  const openHistory = (calf, navList) => {
    setSelectedCalfHistory(calf);
    setHistoryNavList(navList);
    pushBack(() => setSelectedCalfHistory(null));
  };

  const navigateHistory = (direction) => {
    const idx = historyNavList.findIndex(c => c.id === selectedCalfHistory.id);
    const nextIdx = idx + direction;
    if (nextIdx >= 0 && nextIdx < historyNavList.length) {
      setSelectedCalfHistory(historyNavList[nextIdx]);
    }
  };

  if (loading) return <div className="h-screen flex items-center justify-center font-black uppercase italic text-blue-600">Syncing Farm Data...</div>;

  const activeHeifers = calves.filter(c => c.status === 'active' && c.type !== 'bull');
  const activeBulls = calves.filter(c => c.status === 'active' && c.type === 'bull');
  const heifersOnProtocol = activeHeifers.filter(c => getProtocolStatus(c) !== 'Weaned');
  const flaggedCalves = activeHeifers.filter(c => {
    const history = getCalfFeedings(c).slice(0, 2);
    return history.length >= 2 && history.every(f => f.consumption <= 50);
  });

  const currentSortedList = currentPage !== 'dashboard' ? getSortedList(currentPage, filterProtocol) : [];
  const historyNavIndex = selectedCalfHistory ? historyNavList.findIndex(c => c.id === selectedCalfHistory.id) : -1;

  return (
    <div className="min-h-screen bg-slate-50 pb-28 font-sans">
      {!currentUser ? (
        <div className="h-screen bg-slate-900 flex items-center justify-center p-6 text-center">
          <div className="bg-white rounded-[3rem] p-10 w-full max-w-sm shadow-2xl">
            <h1 className="font-black text-3xl mb-8 italic tracking-tighter uppercase text-slate-900 leading-none">Operator Login</h1>
            <div className="space-y-4 text-left overflow-y-auto max-h-[60vh]">
              {users.map(u => (
                <button key={u.id} onClick={() => { setSelectedUser(u); setShowPinEntry(true); pushBack(() => { setShowPinEntry(false); setPinInput(''); }); }} className="w-full p-6 bg-slate-100 rounded-3xl font-black transition-all uppercase flex justify-between items-center group text-slate-700 active:bg-blue-600 active:text-white">
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
                <button onClick={() => {
                  if (pinInput === selectedUser.pin) {
                    setCurrentUser(selectedUser);
                    localStorage.setItem('calfTrackerUser', JSON.stringify(selectedUser));
                    setPinInput('');
                    goBack();
                  } else {
                    alert("Wrong Pin");
                    setPinInput('');
                  }
                }} className="w-full bg-blue-600 text-white py-5 rounded-3xl font-black text-lg uppercase">Unlock</button>
                <button onClick={goBack} className="w-full text-slate-400 font-black text-xs uppercase">Cancel</button>
              </div>
            </div>
          )}
        </div>
      ) : (
        <>
          <header className="bg-blue-700 text-white p-6 sticky top-0 z-40 shadow-lg flex justify-between items-center">
            <div>
              <h1 className="font-black text-2xl italic tracking-tighter uppercase">Calf Tracker</h1>
              <p className="text-[10px] font-bold opacity-70 uppercase tracking-widest">{currentUser.name} • {getETPeriod()} Shift</p>
            </div>
            <button onClick={() => { setShowSettings(true); pushBack(() => { setShowSettings(false); loadAllData(); }); }} className="p-3 bg-white/20 rounded-full active:scale-90 transition-transform"><Settings size={20} /></button>
          </header>

          <main className="p-4 max-w-2xl mx-auto space-y-4">
            {currentPage === 'dashboard' ? (
              <div className="space-y-4">
                {flaggedCalves.length > 0 && (
                  <button onClick={() => navigateToPage('flagged')} className="w-full bg-red-500 text-white p-6 rounded-[2.5rem] flex justify-between items-center shadow-lg animate-pulse">
                    <div>
                      <div className="text-3xl font-black">{flaggedCalves.length}</div>
                      <div className="text-[10px] font-black uppercase tracking-widest text-left">Attention Required</div>
                    </div>
                    <Activity size={32} />
                  </button>
                )}
                <div className="grid grid-cols-2 gap-4">
                  <button onClick={() => navigateToPage('feed')} className="bg-white p-8 rounded-[3rem] shadow-sm border border-slate-200 text-left active:scale-95 transition-transform">
                    <div className="text-4xl font-black text-blue-600">{heifersOnProtocol.length}</div>
                    <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Heifers</div>
                  </button>
                  <button onClick={() => navigateToPage('bulls')} className="bg-white p-8 rounded-[3rem] shadow-sm border border-slate-200 text-left active:scale-95 transition-transform">
                    <div className="text-4xl font-black text-blue-800">{activeBulls.length}</div>
                    <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Bulls</div>
                  </button>
                </div>
                <div className="bg-white p-6 rounded-[3rem] shadow-sm border border-slate-200">
                  <h3 className="text-[10px] font-black text-slate-300 uppercase tracking-widest mb-4 px-2 italic text-center">Protocol Groups</h3>
                  <div className="grid grid-cols-2 gap-3">
                    {protocols.map(p => (
                      <button key={p.id} onClick={() => navigateToPage('feed', p.name)} className="bg-slate-50 p-4 rounded-2xl text-left border border-slate-100 active:bg-blue-50">
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
                  <button onClick={goBack} className="flex items-center text-blue-600 font-black text-xs uppercase bg-blue-50 px-4 py-2 rounded-full w-fit"><ChevronLeft size={16} /> Back</button>
                  {currentPage !== 'flagged' && currentPage !== 'bulls' && (
                    <div className="flex gap-2 overflow-x-auto pb-2">
                      <button onClick={() => setFilterProtocol('all')} className={`px-5 py-2 rounded-full font-black text-[10px] uppercase whitespace-nowrap transition-all ${filterProtocol === 'all' ? 'bg-blue-600 text-white' : 'bg-white text-slate-400 border border-slate-200'}`}>All Heifers</button>
                      {protocols.map(p => (
                        <button key={p.id} onClick={() => setFilterProtocol(p.name)} className={`px-5 py-2 rounded-full font-black text-[10px] uppercase whitespace-nowrap transition-all ${filterProtocol === p.name ? 'bg-blue-600 text-white' : 'bg-white text-slate-400 border border-slate-200'}`}>{p.name}</button>
                      ))}
                      {currentPage === 'feed' && (
                        <button onClick={() => setShowNamedOnly(prev => !prev)} className={`px-5 py-2 rounded-full font-black text-[10px] uppercase whitespace-nowrap transition-all flex items-center gap-1 ${showNamedOnly ? 'bg-orange-500 text-white' : 'bg-white text-slate-400 border border-slate-200'}`}>
                          <Beef size={12} /> Named
                        </button>
                      )}
                    </div>
                  )}
                </div>

                {currentSortedList.map(calf => (
                  <CalfCard
                    key={calf.id}
                    calf={calf}
                    age={getCalfAgeDays(calf.birth_date)}
                    protocol={getProtocolStatus(calf)}
                    history={getCalfFeedings(calf)}
                    currentPeriod={getETPeriod()}
                    onRecord={(pct) => recordFeeding(calf, pct)}
                    onSaveNote={(note) => saveNote(calf, note)}
                    onStatus={(id, s) => {
                      if (confirm(`Mark as ${s}?`)) {
                        if (calf.type === 'bull') {
                          supabase.from('feedings').delete().eq('bull_number', calf.bull_number).then(() => {
                            supabase.from('calves').delete().eq('id', id).then(loadAllData);
                          });
                        } else {
                          supabase.from('calves').update({ status: s }).eq('id', id).then(loadAllData);
                        }
                      }
                    }}
                    onShowHistory={() => openHistory(calf, currentSortedList)}
                    noteValue={noteBuffer[calf.bull_number || calf.number]}
                    setNoteValue={(val) => setNoteBuffer(prev => ({ ...prev, [calf.bull_number || calf.number]: val }))}
                    treatmentPlans={getCalfTreatmentPlans(calf)}
                    treatmentGivenToday={getTreatmentGivenToday(calf)}
                    onMarkTreatmentGiven={() => markTreatmentGiven(calf)}
                    onNewDiagnosis={() => { setSelectedCalfForTreatment(calf); setShowNewDiagnosis(true); pushBack(() => { setShowNewDiagnosis(false); setSelectedCalfForTreatment(null); setNewTreatmentMedicines([]); }); }}
                    onViewTreatment={() => { setSelectedCalfForTreatment(calf); setShowTreatmentPlan(true); pushBack(() => { setShowTreatmentPlan(false); setSelectedCalfForTreatment(null); }); }}
                    calculateProgress={calculateProgress}
                    treatmentShifts={getCalfTreatmentShifts(calf)}
                  />
                ))}
              </div>
            )}
          </main>
        </>
      )}

      {/* ── SETTINGS MODAL ── */}
      {showSettings && (
        <div className="fixed inset-0 bg-white z-[100] flex flex-col overflow-y-auto pb-10">
          <div className="p-6 border-b flex justify-between items-center bg-slate-50 sticky top-0 z-10">
            <h2 className="text-3xl font-black italic uppercase tracking-tighter">Farm Settings</h2>
            <button onClick={goBack} className="p-3 bg-slate-200 rounded-full"><X size={24} /></button>
          </div>
          <div className="p-6 space-y-10">
            <section className="space-y-4">
              <div className="flex items-center gap-2 text-blue-600 font-black uppercase text-xs tracking-widest"><Hash size={16} /> Counter Control</div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-400 uppercase">Next Heifer #</label>
                  <input type="number" value={settings.nextCalfNumber} onChange={(e) => saveGlobalSetting('nextCalfNumber', e.target.value)} className="w-full p-4 bg-slate-100 rounded-2xl font-black text-xl border-0" />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-400 uppercase">Next Bull #</label>
                  <input type="number" value={settings.nextBullNumber} onChange={(e) => saveGlobalSetting('nextBullNumber', e.target.value)} className="w-full p-4 bg-slate-100 rounded-2xl font-black text-xl border-0" />
                </div>
              </div>
            </section>
            <section className="space-y-4">
              <div className="flex items-center justify-between text-blue-600 font-black uppercase text-xs">
                <div className="flex items-center gap-2"><ListChecks size={16} /> Protocols</div>
                <button onClick={() => {
                  const name = prompt("Protocol Name");
                  if (name) supabase.from('protocols').insert([{ name, type: 'feedings', value: 4, order: protocols.length }]).then(() => loadAllData());
                }} className="p-2 bg-blue-50 rounded-xl"><Plus size={18} /></button>
              </div>
              <div className="space-y-3">
                {protocols.map(p => (
                  <div key={p.id} className="p-4 bg-slate-50 rounded-2xl border flex items-center gap-4">
                    <div className="flex-1">
                      <input defaultValue={p.name} onBlur={(e) => supabase.from('protocols').update({ name: e.target.value }).eq('id', p.id)} className="font-black uppercase bg-transparent text-sm w-full outline-none" />
                    </div>
                    <button onClick={() => { if (confirm("Delete?")) supabase.from('protocols').delete().eq('id', p.id).then(() => loadAllData()) }} className="text-red-300"><Trash2 size={18} /></button>
                  </div>
                ))}
              </div>
            </section>
            {currentUser.role === 'admin' && (
              <button onClick={() => { setShowSettings(false); setShowAnalytics(true); replaceTopBack(() => setShowAnalytics(false)); }} className="w-full p-6 bg-blue-50 text-blue-600 rounded-[2rem] font-black uppercase flex items-center justify-center gap-2"><TrendingUp size={20} /> Analytics</button>
            )}
            <button onClick={exportToCSV} className="w-full p-6 bg-green-50 text-green-600 rounded-[2rem] font-black uppercase flex items-center justify-center gap-2"><Download size={20} /> Export CSV</button>
            <button onClick={() => { setCurrentUser(null); localStorage.removeItem('calfTrackerUser'); setShowSettings(false); }} className="w-full p-6 bg-red-50 text-red-600 rounded-[2rem] font-black uppercase">Logout</button>
          </div>
        </div>
      )}

      {/* ── ANALYTICS PAGE (admin only) ── */}
      {showAnalytics && <AnalyticsPage onClose={goBack} />}

      {/* ── HISTORY MODAL with prev/next nav ── */}
      {selectedCalfHistory && (
        <HistoryModal
          calf={selectedCalfHistory}
          onClose={goBack}
          history={getCalfFeedings(selectedCalfHistory)}
          historyNavIndex={historyNavIndex}
          historyNavList={historyNavList}
          navigateHistory={navigateHistory}
          isAdmin={currentUser.role === 'admin'}
          onUpdateFeeding={adminUpdateFeeding}
          onDeleteFeeding={adminDeleteFeeding}
          treatmentShifts={getCalfTreatmentShifts(selectedCalfHistory)}
          everTreated={calfHasEverBeenTreated(selectedCalfHistory)}
        />
      )}

      {/* ── ADD CALF MODAL ── */}
      <div className="fixed bottom-0 left-0 right-0 p-6 flex justify-center z-30 pointer-events-none">
        <button onClick={() => { setShowAddCalf(true); pushBack(() => { setShowAddCalf(false); setNumberCheck({ status: null }); }); }} className="bg-slate-900 text-white w-full max-w-xs py-5 rounded-[2.5rem] font-black shadow-2xl flex items-center justify-center gap-3 pointer-events-auto active:scale-95 transition-transform">
          <Plus size={24} /> ADD NEW CALF
        </button>
      </div>

      {showAddCalf && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[60] flex items-center justify-center p-4">
          <div className="bg-white rounded-[3rem] p-8 w-full max-w-sm space-y-6 shadow-2xl">
            <h2 className="text-2xl font-black italic text-slate-800 uppercase">New Entry</h2>
            <div className="flex gap-2 p-1.5 bg-slate-100 rounded-2xl">
              <button onClick={() => setNewCalf({ ...newCalf, isBull: false })} className={`flex-1 py-3 rounded-xl font-black text-xs transition-all ${!newCalf.isBull ? 'bg-white shadow-md text-blue-600' : 'text-slate-400'}`}>HEIFER</button>
              <button onClick={() => setNewCalf({ ...newCalf, isBull: true })} className={`flex-1 py-3 rounded-xl font-black text-xs transition-all ${newCalf.isBull ? 'bg-white shadow-md text-blue-800' : 'text-slate-400'}`}>BULL</button>
            </div>
            <div className="space-y-4 text-left">
              <input type="text" placeholder="Name (Optional)" value={newCalf.name} onChange={(e) => setNewCalf({ ...newCalf, name: e.target.value })} className="w-full p-5 bg-slate-50 rounded-2xl font-bold border-0 outline-none text-slate-800" />
              <div>
                <label className="text-[10px] font-black text-slate-400 uppercase ml-2 tracking-widest">Birth Date</label>
                <input type="datetime-local" value={newCalf.birthDate} onChange={(e) => setNewCalf({ ...newCalf, birthDate: e.target.value })} className="w-full p-5 bg-slate-50 rounded-2xl font-bold border-0 mt-1 outline-none text-slate-800" />
              </div>
              {!newCalf.isBull && newCalf.name.trim() !== '' && (
                <div className="space-y-3 p-4 bg-blue-50 rounded-2xl border border-blue-100">
                  <label className="text-[10px] font-black text-blue-600 uppercase tracking-widest">Number Assignment</label>
                  <div className="flex gap-2 p-1.5 bg-white rounded-2xl">
                    <button onClick={() => { setNewCalf({ ...newCalf, useCustomNumber: false, customNumber: '' }); setNumberCheck({ status: null }); }} className={`flex-1 py-2 rounded-xl font-black text-xs transition-all ${!newCalf.useCustomNumber ? 'bg-blue-600 text-white' : 'text-slate-400'}`}>Auto (#{settings.nextCalfNumber})</button>
                    <button onClick={() => setNewCalf({ ...newCalf, useCustomNumber: true })} className={`flex-1 py-2 rounded-xl font-black text-xs transition-all ${newCalf.useCustomNumber ? 'bg-blue-600 text-white' : 'text-slate-400'}`}>Custom</button>
                  </div>
                  {newCalf.useCustomNumber && (
                    <div>
                      <input
                        type="number"
                        placeholder="Enter custom number"
                        value={newCalf.customNumber}
                        onChange={(e) => { setNewCalf({ ...newCalf, customNumber: e.target.value }); setNumberCheck({ status: null }); }}
                        onBlur={() => checkCustomNumberAvailability(newCalf.customNumber)}
                        className="w-full p-4 bg-white rounded-2xl font-black border-0 outline-none"
                      />
                      {numberCheck.status === 'checking' && <p className="text-[10px] text-slate-400 font-bold mt-1 ml-2">Checking availability...</p>}
                      {numberCheck.status === 'taken' && <p className="text-[10px] text-red-500 font-black mt-1 ml-2 uppercase">Number already in use</p>}
                      {numberCheck.status === 'available' && <p className="text-[10px] text-green-600 font-black mt-1 ml-2 uppercase">Available</p>}
                    </div>
                  )}
                </div>
              )}
            </div>
            <button onClick={addCalf} className="w-full bg-blue-600 text-white py-5 rounded-3xl font-black text-lg shadow-lg uppercase">Create</button>
            <button onClick={goBack} className="w-full text-slate-400 font-black text-xs uppercase text-center">Cancel</button>
          </div>
        </div>
      )}

      {/* ── NEW DIAGNOSIS MODAL ── */}
      {showNewDiagnosis && selectedCalfForTreatment && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[70] flex items-center justify-center p-4">
          <div className="bg-white rounded-[3rem] p-8 w-full max-w-lg space-y-6 shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center">
              <h2 className="text-2xl font-black italic text-slate-800 uppercase">New Diagnosis</h2>
              <button onClick={goBack} className="p-2 hover:bg-slate-100 rounded-full"><X size={24} /></button>
            </div>
            <div className="p-3 bg-blue-50 rounded-2xl">
              <div className="font-black text-blue-900">Calf #{selectedCalfForTreatment.bull_number || selectedCalfForTreatment.number}</div>
              {selectedCalfForTreatment.name && <div className="text-xs text-blue-600 font-bold">{selectedCalfForTreatment.name}</div>}
              {!selectedCalfForTreatment.name && <div className="text-xs text-blue-600">No name</div>}
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-black text-slate-400 uppercase ml-2">Diagnosis</label>
              <select value={newDiagnosis} onChange={(e) => setNewDiagnosis(e.target.value)} className="w-full p-4 bg-slate-50 rounded-2xl font-bold border-0 outline-none">
                {DIAGNOSES.map(d => <option key={d} value={d}>{d}</option>)}
              </select>
            </div>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-[10px] font-black text-slate-400 uppercase">Medicines</label>
                <button onClick={() => setShowMedicineForm(true)} className="px-4 py-2 bg-blue-50 text-blue-600 rounded-xl font-black text-xs uppercase flex items-center gap-1"><Plus size={16} /> Add Medicine</button>
              </div>
              {newTreatmentMedicines.length === 0 && <div className="text-center py-8 text-slate-300 text-sm italic">No medicines added yet</div>}
              {newTreatmentMedicines.map((med, idx) => (
                <div key={med.id} className="p-4 bg-slate-50 rounded-2xl border border-slate-200">
                  <div className="flex justify-between items-start mb-2">
                    <div className="font-black text-slate-900">{med.name}</div>
                    <button onClick={() => setNewTreatmentMedicines(newTreatmentMedicines.filter((_, i) => i !== idx))} className="text-red-400 hover:text-red-600"><Trash2 size={16} /></button>
                  </div>
                  <div className="text-xs text-slate-600 space-y-1">
                    <div>Dosage: <span className="font-bold">{med.dosage}</span></div>
                    <div>Schedule: <span className="font-bold">{getShiftSchedule(med.hours)}</span></div>
                    <div>Duration: <span className="font-bold">{med.totalTreatments} treatments</span></div>
                  </div>
                </div>
              ))}
            </div>
            {showMedicineForm && (
              <div className="p-6 bg-blue-50 rounded-3xl space-y-4 border-2 border-blue-200">
                <div className="flex justify-between items-center">
                  <h3 className="font-black text-blue-900 uppercase text-sm">Add Medicine</h3>
                  <button onClick={() => setShowMedicineForm(false)} className="text-blue-400"><X size={20} /></button>
                </div>
                <div className="space-y-2">
                  <label className="text-[9px] font-black text-blue-600 uppercase ml-2">Medicine Name</label>
                  <select value={medicines.find(m => m.name === newMedicine.name) ? newMedicine.name : ''} onChange={(e) => handleMedicineNameSelect(e.target.value)} className="w-full p-3 bg-white rounded-xl font-bold border-0 text-sm">
                    <option value="">Select or type below...</option>
                    {medicines.map(m => <option key={m.id} value={m.name}>{m.name}</option>)}
                  </select>
                  <input type="text" placeholder="Or type custom medicine name (e.g. Banamine (Single Dose))" value={newMedicine.name} onChange={(e) => handleMedicineNameSelect(e.target.value)} className="w-full p-3 bg-white rounded-xl font-bold border-0 text-sm" />
                  <p className="text-[9px] text-blue-500 ml-2 italic">Selecting a saved drug autofills its usual dosage/schedule below. For drugs with both a single-dose and multi-day option, save them as two separate names.</p>
                </div>
                <div className="space-y-2">
                  <label className="text-[9px] font-black text-blue-600 uppercase ml-2">Dosage</label>
                  <input type="text" placeholder="e.g., 5ml, 2cc, 10mg" value={newMedicine.dosage} onChange={(e) => setNewMedicine({ ...newMedicine, dosage: e.target.value })} className="w-full p-3 bg-white rounded-xl font-bold border-0 text-sm" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <label className="text-[9px] font-black text-blue-600 uppercase ml-2">Every ___ Hours</label>
                    <input type="number" value={newMedicine.hours} onChange={(e) => setNewMedicine({ ...newMedicine, hours: parseInt(e.target.value) })} className="w-full p-3 bg-white rounded-xl font-bold border-0 text-sm" />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[9px] font-black text-blue-600 uppercase ml-2">Total Treatments</label>
                    <input type="number" value={newMedicine.totalTreatments} onChange={(e) => setNewMedicine({ ...newMedicine, totalTreatments: parseInt(e.target.value) })} className="w-full p-3 bg-white rounded-xl font-bold border-0 text-sm" />
                  </div>
                </div>
                <div className="text-xs text-blue-700 bg-blue-100 p-3 rounded-xl">
                  <strong>Schedule:</strong> {getShiftSchedule(newMedicine.hours)} for {newMedicine.totalTreatments} treatments
                </div>
                <button onClick={addMedicineToNewDiagnosis} disabled={!newMedicine.name || !newMedicine.dosage} className="w-full bg-blue-600 text-white py-3 rounded-2xl font-black text-sm uppercase disabled:opacity-50">Add Medicine</button>
              </div>
            )}
            <button onClick={saveDiagnosis} disabled={newTreatmentMedicines.length === 0} className="w-full bg-green-600 text-white py-5 rounded-3xl font-black text-lg uppercase disabled:opacity-50">Save Diagnosis & Treatment</button>
          </div>
        </div>
      )}

      {/* ── TREATMENT PLAN MODAL ── */}
      {showTreatmentPlan && selectedCalfForTreatment && (
        <div className="fixed inset-0 bg-white z-[70] flex flex-col">
          <div className="p-6 border-b flex justify-between items-center bg-slate-50 sticky top-0">
            <h2 className="text-2xl font-black italic uppercase tracking-tighter">Treatment Plans</h2>
            <button onClick={goBack} className="p-3 bg-slate-200 rounded-full"><X size={24} /></button>
          </div>
          <div className="flex-1 overflow-y-auto p-6 space-y-6">
            {getCalfTreatmentPlans(selectedCalfForTreatment).map(treatment => (
              <div key={treatment.id} className="bg-white p-6 rounded-3xl border-2 border-red-200 shadow-sm">
                <div className="flex justify-between items-start mb-4">
                  <div>
                    <h3 className="text-xl font-black text-red-900 uppercase">{treatment.diagnosis}</h3>
                    <p className="text-xs text-slate-500">Started {new Date(treatment.start_date).toLocaleDateString()}</p>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => deleteTreatmentPlan(treatment.id)} className="px-4 py-2 bg-red-100 text-red-700 rounded-xl font-black text-xs uppercase hover:bg-red-200">Delete</button>
                  </div>
                </div>
                <div className="space-y-3">
                  {getTreatmentMedicinesForPlan(treatment.id).map((med) => (
                    <div key={med.id} className="p-4 bg-slate-50 rounded-2xl relative">
                      <button onClick={() => deleteTreatmentMedicine(med.id)} className="absolute top-2 right-2 text-red-400 hover:text-red-600 bg-white rounded-lg p-1"><Trash2 size={16} /></button>
                      <div className="font-black text-slate-900 mb-2 pr-8">{med.medicine_name}</div>
                      <div className="grid grid-cols-2 gap-2 text-xs text-slate-600">
                        <div>Dosage: <span className="font-bold text-slate-900">{med.dosage}</span></div>
                        <div>Schedule: <span className="font-bold text-slate-900">{getShiftSchedule(med.frequency_hours)}</span></div>
                        <div>Progress: <span className="font-bold text-blue-600">{calculateProgress(treatment.id)}</span></div>
                        <div>Total: <span className="font-bold text-orange-600">{med.total_treatments} doses</span></div>
                      </div>
                    </div>
                  ))}
                  {editingTreatmentId === treatment.id ? (
                    <div className="p-4 bg-blue-50 rounded-2xl space-y-3 border-2 border-blue-200">
                      <div className="flex justify-between items-center">
                        <h4 className="font-black text-blue-900 uppercase text-xs">Add Medicine</h4>
                        <button onClick={() => setEditingTreatmentId(null)} className="text-blue-400"><X size={18} /></button>
                      </div>
                      <div className="space-y-2">
                        <select value={medicines.find(m => m.name === addExistingMedicine.name) ? addExistingMedicine.name : ''} onChange={(e) => handleExistingMedicineNameSelect(e.target.value)} className="w-full p-2 bg-white rounded-xl font-bold border-0 text-xs">
                          <option value="">Select medicine...</option>
                          {medicines.map(m => <option key={m.id} value={m.name}>{m.name}</option>)}
                        </select>
                        <input type="text" placeholder="Or type custom name" value={addExistingMedicine.name} onChange={(e) => handleExistingMedicineNameSelect(e.target.value)} className="w-full p-2 bg-white rounded-xl font-bold border-0 text-xs" />
                      </div>
                      <input type="text" placeholder="Dosage (e.g., 5ml)" value={addExistingMedicine.dosage} onChange={(e) => setAddExistingMedicine({ ...addExistingMedicine, dosage: e.target.value })} className="w-full p-2 bg-white rounded-xl font-bold border-0 text-xs" />
                      <div className="grid grid-cols-2 gap-2">
                        <input type="number" placeholder="Hours" value={addExistingMedicine.hours} onChange={(e) => setAddExistingMedicine({ ...addExistingMedicine, hours: parseInt(e.target.value) })} className="w-full p-2 bg-white rounded-xl font-bold border-0 text-xs" />
                        <input type="number" placeholder="Treatments" value={addExistingMedicine.totalTreatments} onChange={(e) => setAddExistingMedicine({ ...addExistingMedicine, totalTreatments: parseInt(e.target.value) })} className="w-full p-2 bg-white rounded-xl font-bold border-0 text-xs" />
                      </div>
                      <button onClick={() => addMedicineToExisting(treatment.id)} className="w-full bg-blue-600 text-white py-2 rounded-xl font-black text-xs uppercase">Add Medicine</button>
                    </div>
                  ) : (
                    <button onClick={() => setEditingTreatmentId(treatment.id)} className="w-full p-3 bg-blue-50 text-blue-600 rounded-xl font-black text-xs uppercase flex items-center justify-center gap-2 hover:bg-blue-100"><Plus size={16} /> Add Medicine to This Plan</button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── HISTORY MODAL COMPONENT (with admin edit/delete) ──
function HistoryModal({ calf, onClose, history, historyNavIndex, historyNavList, navigateHistory, isAdmin, onUpdateFeeding, onDeleteFeeding, treatmentShifts, everTreated }) {
  const [editingId, setEditingId] = useState(null);
  const [editData, setEditData] = useState({ consumption: 0, period: 'AM', notes: '' });

  const startEdit = (f) => {
    setEditingId(f.id);
    setEditData({ consumption: f.consumption, period: f.period, notes: f.notes || '' });
  };

  const saveEdit = async (f) => {
    await onUpdateFeeding(f.id, {
      consumption: parseInt(editData.consumption),
      period: editData.period,
      notes: editData.notes || null
    });
    setEditingId(null);
  };

  const removeFeeding = async (f) => {
    if (confirm(`Delete this ${f.period} feeding (${f.consumption}%) from ${new Date(f.timestamp).toLocaleDateString()}? This cannot be undone.`)) {
      await onDeleteFeeding(f.id);
    }
  };

  return (
    <div className="fixed inset-0 bg-white z-[100] flex flex-col">
      <div className="p-6 border-b flex justify-between items-center bg-slate-50 sticky top-0 z-10">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-3xl font-black italic text-slate-900 uppercase">#{calf.bull_number || calf.number}</h2>
            {everTreated && <TreatmentBadge size={20} title="Has treatment history" />}
          </div>
          {calf.name && (
            <p className="text-sm font-black text-slate-500 uppercase tracking-widest">{calf.name}</p>
          )}
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-1">Timeline (Past 14 Shifts)</p>
        </div>
        <button onClick={onClose} className="p-3 bg-slate-100 rounded-full"><X size={24} /></button>
      </div>

      <div className="flex items-center justify-between px-6 py-3 border-b bg-white">
        <button
          onClick={() => navigateHistory(-1)}
          disabled={historyNavIndex <= 0}
          className="flex items-center gap-1 px-4 py-2 bg-slate-100 rounded-full font-black text-xs uppercase text-slate-600 disabled:opacity-30 disabled:cursor-not-allowed active:bg-slate-200"
        >
          <ChevronLeft size={16} /> Prev
        </button>
        <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
          {historyNavIndex + 1} of {historyNavList.length}
        </span>
        <button
          onClick={() => navigateHistory(1)}
          disabled={historyNavIndex >= historyNavList.length - 1}
          className="flex items-center gap-1 px-4 py-2 bg-slate-100 rounded-full font-black text-xs uppercase text-slate-600 disabled:opacity-30 disabled:cursor-not-allowed active:bg-slate-200"
        >
          Next <ChevronRight size={16} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-6 bg-slate-50">
        <div className="bg-white p-6 rounded-[2.5rem] shadow-sm border border-slate-100">
          <div className="flex items-center gap-2 mb-6 text-blue-600">
            <BarChart3 size={18} />
            <span className="text-xs font-black uppercase tracking-widest">Growth Curve</span>
          </div>
          <div className="relative h-40 bg-slate-50 rounded-xl p-4">
            <div className="flex items-end justify-between h-full gap-1">
              {(() => {
                const latest14 = [...history].slice(0, 14).reverse();
                if (latest14.length === 0) {
                  return <div className="w-full h-full flex items-center justify-center text-[10px] font-black text-slate-300 uppercase italic">No Data Yet</div>;
                }
                return latest14.map((f, i) => {
                  const heightPercent = Math.max(f.consumption, 5);
                  const shift = treatmentShifts && treatmentShifts.get(`${utcToETDateString(f.timestamp)}_${f.period}`);
                  const tooltip = shift ? `${shift.diagnosis}${shift.medicines.length ? ' — ' + shift.medicines.map(m => `${m.name} (${m.dosage})`).join(', ') : ''}` : '';
                  return (
                    <div key={i} className="flex-1 flex flex-col items-center justify-end h-full relative">
                      {shift && <TreatmentBadge size={14} className="absolute -top-1 z-10" title={tooltip} />}
                      <div
                        className={`w-full rounded-t transition-all ${f.consumption >= 100 ? 'bg-green-500' : f.consumption >= 50 ? 'bg-yellow-500' : 'bg-red-500'}`}
                        style={{ height: `${heightPercent}%` }}
                      />
                      <div className="text-[7px] font-black text-slate-400 mt-1 uppercase">{f.period}</div>
                      {shift && <div className="text-[6px] font-black text-red-500 uppercase leading-tight text-center truncate max-w-[36px]" title={tooltip}>{shift.diagnosis}</div>}
                    </div>
                  );
                });
              })()}
            </div>
          </div>
        </div>
        <div className="space-y-3 pb-10">
          {history.map((f, i) => (
            <div key={i} className="p-5 bg-white rounded-3xl border border-slate-100 shadow-sm">
              {editingId === f.id ? (
                <div className="space-y-3">
                  <div className="flex gap-2">
                    <div className="flex-1">
                      <label className="text-[9px] font-black text-slate-400 uppercase">Consumption %</label>
                      <select
                        value={editData.consumption}
                        onChange={(e) => setEditData({ ...editData, consumption: e.target.value })}
                        className="w-full p-3 bg-slate-50 rounded-xl font-black text-sm border-0"
                      >
                        {[0, 25, 50, 75, 100].map(pct => <option key={pct} value={pct}>{pct}%</option>)}
                      </select>
                    </div>
                    <div className="flex-1">
                      <label className="text-[9px] font-black text-slate-400 uppercase">Period</label>
                      <select
                        value={editData.period}
                        onChange={(e) => setEditData({ ...editData, period: e.target.value })}
                        className="w-full p-3 bg-slate-50 rounded-xl font-black text-sm border-0"
                      >
                        <option value="AM">AM</option>
                        <option value="PM">PM</option>
                      </select>
                    </div>
                  </div>
                  <div>
                    <label className="text-[9px] font-black text-slate-400 uppercase">Notes</label>
                    <input
                      type="text"
                      value={editData.notes}
                      onChange={(e) => setEditData({ ...editData, notes: e.target.value })}
                      className="w-full p-3 bg-slate-50 rounded-xl font-bold text-sm border-0"
                    />
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => saveEdit(f)} className="flex-1 bg-blue-600 text-white py-3 rounded-xl font-black text-xs uppercase">Save</button>
                    <button onClick={() => setEditingId(null)} className="flex-1 bg-slate-100 text-slate-500 py-3 rounded-xl font-black text-xs uppercase">Cancel</button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="flex justify-between items-center mb-2">
                    <span className={`px-4 py-2 rounded-2xl text-white font-black text-xs ${f.consumption >= 100 ? 'bg-green-500' : f.consumption >= 50 ? 'bg-yellow-500' : 'bg-red-500'}`}>{f.consumption}%</span>
                    <span className="text-[10px] font-black text-slate-400 uppercase">{f.user_name}</span>
                  </div>
                  {treatmentShifts && treatmentShifts.get(`${utcToETDateString(f.timestamp)}_${f.period}`) && (() => {
                    const shift = treatmentShifts.get(`${utcToETDateString(f.timestamp)}_${f.period}`);
                    return (
                      <div className="flex items-start gap-2 bg-red-50 px-3 py-2 rounded-xl mb-2">
                        <TreatmentBadge size={16} className="mt-0.5" />
                        <div className="text-xs">
                          <div className="font-black text-red-700 uppercase">{shift.diagnosis}</div>
                          {shift.medicines.length > 0 && (
                            <div className="text-red-500 font-bold">
                              {shift.medicines.map((m, mi) => (
                                <div key={mi}>{m.name}{m.dosage ? ` — ${m.dosage}` : ''}</div>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })()}
                  {f.notes && <p className="text-sm italic text-slate-600 bg-slate-50 p-3 rounded-xl mb-2">"{f.notes}"</p>}
                  <div className="flex justify-between items-center">
                    <p className="text-[10px] font-black text-slate-400 uppercase">{new Date(f.timestamp).toLocaleDateString()} • {f.period}</p>
                    {isAdmin && (
                      <div className="flex gap-2">
                        <button onClick={() => startEdit(f)} className="px-3 py-1.5 bg-blue-50 text-blue-600 rounded-lg font-black text-[10px] uppercase">Edit</button>
                        <button onClick={() => removeFeeding(f)} className="px-3 py-1.5 bg-red-50 text-red-500 rounded-lg font-black text-[10px] uppercase">Delete</button>
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── CALF CARD COMPONENT ──
function CalfCard({ calf, age, protocol, history, currentPeriod, onRecord, onSaveNote, onStatus, onShowHistory, noteValue, setNoteValue, treatmentPlans, treatmentGivenToday, onMarkTreatmentGiven, onNewDiagnosis, onViewTreatment, calculateProgress, treatmentShifts }) {
  const latest = [...history].slice(0, 3).reverse();
  const todayET = getETDateString(getETDate());
  const todayFeeding = history.find(f => {
    const feedingET = utcToETDateString(f.timestamp);
    return feedingET === todayET && f.period === currentPeriod;
  });

  const displayNote = noteValue !== undefined ? noteValue : (todayFeeding?.notes || '');

  return (
    <div className={`bg-white p-6 rounded-[2.5rem] shadow-sm border-2 transition-all ${todayFeeding ? 'border-green-200 opacity-90' : (calf.type === 'bull' ? 'border-blue-200' : 'border-slate-100')}`}>
      <div className="flex justify-between items-start mb-4">
        <div onClick={onShowHistory} className="cursor-pointer">
          <div className="flex items-center gap-2">
            <h3 className="text-4xl font-black italic tracking-tighter text-slate-900 leading-none">#{calf.bull_number || calf.number}</h3>
            {todayFeeding && <CheckCircle2 className="text-green-500" size={24} />}
            {calf.name && <Beef className="text-orange-500" size={20} title="Named / Special" />}
          </div>
          {/* FIX: show name if present */}
          {calf.name && <p className="text-sm font-black text-slate-600 uppercase tracking-wide mt-0.5">{calf.name}</p>}
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-1 leading-none">{age} Days • {protocol}</p>
        </div>
        <div className="flex gap-2">
          {calf.type === 'bull' && <button onClick={() => onStatus(calf.id, 'sold')} className="p-3 bg-blue-50 text-blue-600 rounded-2xl transition-colors"><ShoppingCart size={20} /></button>}
          <button onClick={() => onStatus(calf.id, 'died')} className="p-3 bg-red-50 text-red-400 rounded-2xl transition-colors"><Ghost size={20} /></button>
        </div>
      </div>

      {treatmentPlans.length > 0 && (
        <div onClick={onViewTreatment} className="mb-4 p-4 bg-red-50 border-2 border-red-200 rounded-2xl cursor-pointer hover:bg-red-100 transition-all">
          <div className="flex items-center gap-3 mb-2">
            <div className="bg-red-500 text-white p-2 rounded-xl"><Activity size={20} /></div>
            <div className="flex-1">
              <div className="font-black text-sm text-red-900 uppercase">Active Treatment</div>
              <div className="text-xs text-red-600">Tap to view details</div>
            </div>
          </div>
          {treatmentPlans.map(tp => (
            <div key={tp.id} className="text-xs font-bold text-red-800 ml-11">{tp.diagnosis} - {calculateProgress(tp.id)}</div>
          ))}
        </div>
      )}

      {treatmentPlans.length > 0 && (
        <div className="mb-6">
          <label className="flex items-center gap-3 p-4 bg-green-50 border-2 border-green-200 rounded-2xl cursor-pointer hover:bg-green-100 transition-all">
            <input type="checkbox" checked={treatmentGivenToday} onChange={onMarkTreatmentGiven} className="w-6 h-6 rounded-lg" />
            <div>
              <div className="font-black text-sm text-green-900 uppercase">Treatments Given</div>
              <div className="text-xs text-green-600">Check when all meds administered</div>
            </div>
            {treatmentGivenToday && <CheckCircle2 className="ml-auto text-green-600" size={24} />}
          </label>
        </div>
      )}

      <button onClick={onNewDiagnosis} className="w-full p-4 bg-blue-50 text-blue-600 rounded-2xl font-black text-sm uppercase flex items-center justify-center gap-2 hover:bg-blue-100 transition-all mb-6">
        <Plus size={20} /> New Diagnosis
      </button>

      <div className="grid grid-cols-3 gap-2 mb-4" onClick={onShowHistory}>
        {latest.length > 0 ? latest.map((f, i) => {
          const shift = treatmentShifts && treatmentShifts.get(`${utcToETDateString(f.timestamp)}_${f.period}`);
          const tooltip = shift ? `${shift.diagnosis}${shift.medicines.length ? ' — ' + shift.medicines.map(m => `${m.name} (${m.dosage})`).join(', ') : ''}` : '';
          return (
            <div key={i} className="flex flex-col items-center">
              <div className="relative w-full">
                <div className={`w-full py-2 rounded-xl text-center text-white text-[9px] font-black shadow-sm ${f.consumption >= 100 ? 'bg-green-500' : f.consumption >= 50 ? 'bg-yellow-500' : 'bg-red-500'}`}>{f.consumption}%</div>
                {shift && <TreatmentBadge size={16} className="absolute -top-1.5 -right-1.5" title={tooltip} />}
              </div>
              <div className="text-[11px] font-black text-slate-600 uppercase mt-1 tracking-tight text-center leading-tight">
                <div>{new Date(f.timestamp).toLocaleDateString(undefined, { month: 'numeric', day: 'numeric' })}</div>
                <div className="text-blue-600">{f.period}</div>
                {shift && <div className="text-red-500 text-[9px] font-black normal-case truncate max-w-[72px]" title={tooltip}>{shift.diagnosis}</div>}
                {shift && shift.medicines.length > 0 && (
                  <div className="text-red-400 text-[8px] font-bold normal-case truncate max-w-[72px]" title={tooltip}>
                    {shift.medicines.map(m => m.name).join(', ')}
                  </div>
                )}
              </div>
            </div>
          );
        }) : <div className="col-span-3 py-2 border-2 border-dashed border-slate-50 rounded-xl text-center text-[8px] font-black text-slate-200 uppercase tracking-widest flex items-center justify-center italic">No Feedings</div>}
      </div>

      {/* FIX: note input with dedicated save button */}
      <div className="flex gap-2 items-center mb-6">
        <input
          type="text"
          placeholder="Shift notes..."
          value={displayNote}
          onChange={(e) => setNoteValue(e.target.value)}
          onBlur={() => {
            if (todayFeeding && noteValue !== undefined) {
              onSaveNote(noteValue);
            }
          }}
          className="flex-1 p-3 bg-slate-50 border-0 rounded-xl text-xs font-bold outline-none text-slate-800"
        />
        {noteValue !== undefined && noteValue !== (todayFeeding?.notes || '') && (
          <button
            onClick={() => onSaveNote(noteValue)}
            className="px-3 py-3 bg-blue-600 text-white rounded-xl font-black text-xs uppercase whitespace-nowrap"
          >
            Save
          </button>
        )}
      </div>

      <div className="space-y-3">
        <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-2">{currentPeriod} Feeding</div>
        <div className="grid grid-cols-5 gap-2">
          {[0, 25, 50, 75, 100].map(pct => (
            <button
              key={pct}
              onClick={() => onRecord(pct)}
              className={`py-5 rounded-2xl font-black text-sm transition-all shadow-sm ${todayFeeding?.consumption === pct ? 'bg-blue-600 text-white ring-4 ring-blue-100 scale-95' : 'bg-slate-50 text-slate-300 active:bg-slate-100'}`}
            >
              {pct}%
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── ANALYTICS PAGE (admin only) ──
// Fetches its own bounded, date-ranged dataset independently of the main app
// state, so opening Analytics never slows down normal feeding entry, and the
// query cost stays flat as feeding history grows across years.
function AnalyticsPage({ onClose }) {
  const [rangeDays, setRangeDays] = useState(90);
  const [loadingData, setLoadingData] = useState(true);
  const [calvesData, setCalvesData] = useState([]);
  const [feedingsData, setFeedingsData] = useState([]);
  const [treatmentLogsData, setTreatmentLogsData] = useState([]);
  const [treatmentPlansData, setTreatmentPlansData] = useState([]);

  useEffect(() => {
    const load = async () => {
      setLoadingData(true);
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - rangeDays);
      const cutoffISO = cutoff.toISOString();

      const { data: f } = await supabase.from('feedings').select('*').gte('timestamp', cutoffISO);
      const { data: c } = await supabase.from('calves').select('id, number, bull_number, name, birth_date, type, status');
      const { data: tl } = await supabase.from('treatment_logs').select('*').gte('timestamp', cutoffISO);
      const { data: tp } = await supabase.from('treatment_plans').select('*');

      setFeedingsData(f || []);
      setCalvesData(c || []);
      setTreatmentLogsData(tl || []);
      setTreatmentPlansData(tp || []);
      setLoadingData(false);
    };
    load();
  }, [rangeDays]);

  const ageBuckets = [
    { label: '0-5 Days (Colostrum/Bottles)', min: 0, max: 5 },
    { label: '6-35 Days (Regular)', min: 6, max: 35 },
    { label: '36-40 Days (PM Only)', min: 36, max: 40 },
    { label: '41+ Days (Weaned)', min: 41, max: Infinity },
  ];

  const calfByNumber = {};
  calvesData.forEach(c => {
    if (c.bull_number) calfByNumber[`b_${c.bull_number}`] = c;
    if (c.number !== null && c.number !== undefined) calfByNumber[`n_${c.number}`] = c;
  });

  const bucketStats = ageBuckets.map(b => ({ ...b, total: 0, count: 0 }));
  feedingsData.forEach(f => {
    const calf = f.bull_number ? calfByNumber[`b_${f.bull_number}`] : calfByNumber[`n_${f.calf_number}`];
    if (!calf || !calf.birth_date) return;
    const ageAtFeeding = Math.floor((new Date(f.timestamp) - new Date(calf.birth_date)) / (1000 * 60 * 60 * 24));
    const bucket = bucketStats.find(b => ageAtFeeding >= b.min && ageAtFeeding <= b.max);
    if (bucket) { bucket.total += f.consumption; bucket.count += 1; }
  });

  const dayPeriodMap = {};
  feedingsData.forEach(f => {
    if (f.consumption > 50) return;
    const dateStr = utcToETDateString(f.timestamp);
    const key = `${dateStr}_${f.period}`;
    if (!dayPeriodMap[key]) dayPeriodMap[key] = [];
    dayPeriodMap[key].push(f);
  });
  const outbreakDays = Object.entries(dayPeriodMap)
    .filter(([key, arr]) => new Set(arr.map(f => f.bull_number || f.calf_number)).size >= 3)
    .map(([key, arr]) => {
      const [dateStr, period] = key.split('_');
      const uniqueCalves = new Set(arr.map(f => f.bull_number || f.calf_number));
      return { date: dateStr, period, calfCount: uniqueCalves.size };
    })
    .sort((a, b) => new Date(b.date) - new Date(a.date));

  const employeeStats = {};
  feedingsData.forEach(f => {
    if (!employeeStats[f.user_name]) employeeStats[f.user_name] = { total: 0, count: 0 };
    employeeStats[f.user_name].total += f.consumption;
    employeeStats[f.user_name].count += 1;
  });
  const employeeRows = Object.entries(employeeStats)
    .map(([name, s]) => ({ name, avg: s.total / s.count, count: s.count }))
    .sort((a, b) => b.count - a.count);

  return (
    <div className="fixed inset-0 bg-white z-[80] flex flex-col">
      <div className="p-6 border-b flex justify-between items-center bg-slate-50 sticky top-0 z-10">
        <div>
          <h2 className="text-3xl font-black italic uppercase tracking-tighter">Analytics</h2>
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Admin Only</p>
        </div>
        <button onClick={onClose} className="p-3 bg-slate-200 rounded-full"><X size={24} /></button>
      </div>

      <div className="p-4 flex gap-2 bg-white border-b">
        {[30, 90, 365].map(d => (
          <button key={d} onClick={() => setRangeDays(d)} className={`px-4 py-2 rounded-full font-black text-[10px] uppercase ${rangeDays === d ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-400'}`}>Last {d} Days</button>
        ))}
      </div>

      {loadingData ? (
        <div className="flex-1 flex items-center justify-center font-black uppercase italic text-blue-600">Crunching Numbers...</div>
      ) : (
        <div className="flex-1 overflow-y-auto p-6 space-y-8 bg-slate-50">
          <section className="bg-white p-6 rounded-[2.5rem] shadow-sm border border-slate-100">
            <div className="flex items-center gap-2 mb-4 text-blue-600"><TrendingUp size={18} /><span className="text-xs font-black uppercase tracking-widest">Consumption by Age Group</span></div>
            <div className="space-y-4">
              {bucketStats.map(b => {
                const avg = b.count > 0 ? Math.round(b.total / b.count) : null;
                return (
                  <div key={b.label}>
                    <div className="flex justify-between text-xs font-black text-slate-500 uppercase mb-1">
                      <span>{b.label}</span>
                      <span>{avg !== null ? `${avg}% avg (${b.count} feedings)` : 'No data'}</span>
                    </div>
                    <div className="h-4 bg-slate-100 rounded-full overflow-hidden">
                      {avg !== null && (
                        <div className={`h-full rounded-full ${avg >= 75 ? 'bg-green-500' : avg >= 50 ? 'bg-yellow-500' : 'bg-red-500'}`} style={{ width: `${avg}%` }} />
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          <section className="bg-white p-6 rounded-[2.5rem] shadow-sm border border-slate-100">
            <div className="flex items-center gap-2 mb-4 text-red-500"><AlertTriangle size={18} /><span className="text-xs font-black uppercase tracking-widest">Outbreak Watch (3+ Calves ≤50% Same Shift)</span></div>
            {outbreakDays.length === 0 ? (
              <p className="text-sm text-slate-400 italic text-center py-6">No multi-calf decline patterns in this window.</p>
            ) : (
              <div className="space-y-2">
                {outbreakDays.map((o, i) => (
                  <div key={i} className="p-4 bg-red-50 rounded-2xl flex justify-between items-center">
                    <span className="font-black text-red-900 text-sm">{new Date(o.date).toLocaleDateString()} • {o.period}</span>
                    <span className="text-xs font-black text-red-600 uppercase">{o.calfCount} calves affected</span>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="bg-white p-6 rounded-[2.5rem] shadow-sm border border-slate-100">
            <div className="flex items-center gap-2 mb-4 text-blue-600"><Users size={18} /><span className="text-xs font-black uppercase tracking-widest">Feeding Log by Employee</span></div>
            <p className="text-[10px] text-slate-400 mb-4 italic">Reflects logging patterns, not calf outcomes -- feeder assignment isn't random, so treat this as a conversation starter, not a verdict.</p>
            <div className="space-y-3">
              {employeeRows.map(e => (
                <div key={e.name} className="flex justify-between items-center p-4 bg-slate-50 rounded-2xl">
                  <span className="font-black text-slate-800">{e.name}</span>
                  <span className="text-xs font-black text-slate-500">{Math.round(e.avg)}% avg • {e.count} feedings</span>
                </div>
              ))}
              {employeeRows.length === 0 && <p className="text-sm text-slate-400 italic text-center py-6">No feedings logged in this window.</p>}
            </div>
          </section>

          <section className="bg-white p-6 rounded-[2.5rem] shadow-sm border border-slate-100">
            <div className="flex items-center gap-2 mb-4 text-red-500"><Activity size={18} /><span className="text-xs font-black uppercase tracking-widest">Treatment Correlation</span></div>
            {treatmentLogsData.length === 0 ? (
              <p className="text-sm text-slate-400 italic text-center py-6">Not enough treatment data yet -- this view will populate once treatments start being logged.</p>
            ) : (
              <div className="space-y-2 text-sm text-slate-600">
                <p>{treatmentPlansData.length} treatment plan(s) and {treatmentLogsData.length} treatment log(s) recorded in this window.</p>
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
