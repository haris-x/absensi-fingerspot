'use client';

import { useState, useEffect } from 'react';
import { 
  Settings, 
  Database, 
  CheckCircle2, 
  XCircle, 
  RefreshCw,
  MessageSquare,
  Clock,
  Settings2,
  Save
} from 'lucide-react';

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState('database'); // 'database', 'whatsapp', 'hours'

  // DB test connection state
  const [testResult, setTestResult] = useState(null);
  const [testing, setTesting] = useState(false);

  // WhatsApp status & config state
  const [waStatus, setWaStatus] = useState(null);
  const [groups, setGroups] = useState([]);
  const [loadingWa, setLoadingWa] = useState(true);
  
  // Form states for WhatsApp
  const [selectedGroup, setSelectedGroup] = useState('');
  const [sendTime, setSendTime] = useState('07:35');
  const [reconciliationEnabled, setReconciliationEnabled] = useState(false);
  const [savingConfig, setSavingConfig] = useState(false);
  const [saveResult, setSaveResult] = useState(null);

  // Work Hours states
  const [hoursConfig, setHoursConfig] = useState(null);
  const [loadingHours, setLoadingHours] = useState(true);
  const [savingHours, setSavingHours] = useState(false);
  const [hoursResult, setHoursResult] = useState(null);

  // Load WhatsApp status and list of groups
  const loadWhatsAppSettings = async () => {
    setLoadingWa(true);
    try {
      // 1. Fetch current status
      const resStatus = await fetch('/api/whatsapp');
      const jsonStatus = await resStatus.json();
      setWaStatus(jsonStatus);
      
      if (jsonStatus.status === 'success') {
        setSelectedGroup(jsonStatus.group_jid || '');
        setSendTime(jsonStatus.send_time || '07:35');
        setReconciliationEnabled(!!jsonStatus.reconciliation_enabled);
        
        // 2. Fetch groups list if connected
        if (jsonStatus.connected) {
          try {
            const resGroups = await fetch('/api/whatsapp?action=groups');
            const jsonGroups = await resGroups.json();
            if (jsonGroups.status === 'success') {
              setGroups(jsonGroups.groups || []);
            }
          } catch (err) {
            console.error('Gagal memuat grup:', err);
          }
        }
      }
    } catch (err) {
      console.error('Gagal mengambil status WhatsApp:', err);
    } finally {
      setLoadingWa(false);
    }
  };

  const loadHoursSettings = async () => {
    setLoadingHours(true);
    try {
      const res = await fetch('/api/settings/hours');
      const json = await res.json();
      if (json.status === 'success') {
        setHoursConfig(json.data);
      }
    } catch (err) {
      console.error('Gagal mengambil pengaturan jam kerja:', err);
    } finally {
      setLoadingHours(false);
    }
  };

  const handleDefaultChange = (field, value) => {
    setHoursConfig(prev => ({
      ...prev,
      defaultSettings: {
        ...prev.defaultSettings,
        [field]: value
      }
    }));
  };

  const handleDivisionChange = (id, field, value) => {
    setHoursConfig(prev => ({
      ...prev,
      divisionSettings: prev.divisionSettings.map(ds => {
        if (ds.id === id) {
          return {
            ...ds,
            [field]: value === '' ? null : value
          };
        }
        return ds;
      })
    }));
  };

  const handleSaveHoursConfig = async (e) => {
    e.preventDefault();
    setSavingHours(true);
    setHoursResult(null);
    try {
      const res = await fetch('/api/settings/hours', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(hoursConfig)
      });
      const json = await res.json();
      if (json.status === 'success') {
        setHoursResult({
          status: 'success',
          message: json.message
        });
        setTimeout(() => setHoursResult(null), 3000);
      } else {
        setHoursResult({
          status: 'error',
          message: json.message || 'Gagal menyimpan jam kerja.'
        });
      }
    } catch (err) {
      setHoursResult({
        status: 'error',
        message: 'Gagal menghubungi server: ' + err.message
      });
    } finally {
      setSavingHours(false);
    }
  };

  useEffect(() => {
    loadWhatsAppSettings();
    loadHoursSettings();
  }, []);

  const handleTestConnection = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await fetch('/api/settings/test');
      const json = await res.json();
      setTestResult(json);
    } catch (err) {
      setTestResult({
        status: 'error',
        message: 'Gagal menghubungi server untuk menguji koneksi.'
      });
    } finally {
      setTesting(false);
    }
  };

  const handleSaveWhatsAppConfig = async (e) => {
    e.preventDefault();
    setSavingConfig(true);
    setSaveResult(null);
    try {
      const res = await fetch('/api/whatsapp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'save-config',
          groupJid: selectedGroup,
          sendTime: sendTime,
          reconciliationEnabled: reconciliationEnabled
        })
      });
      const json = await res.json();
      if (json.status === 'success') {
        setSaveResult({
          status: 'success',
          message: json.message
        });
        // Reload settings after a brief delay
        setTimeout(() => {
          loadWhatsAppSettings();
          setSaveResult(null);
        }, 3000);
      } else {
        setSaveResult({
          status: 'error',
          message: json.message || 'Gagal menyimpan pengaturan.'
        });
      }
    } catch (err) {
      setSaveResult({
        status: 'error',
        message: 'Gagal menghubungi API server: ' + err.message
      });
    } finally {
      setSavingConfig(false);
    }
  };

  const configParams = [
    { label: 'Host Database', value: '127.0.0.1 (Localhost)' },
    { label: 'Port Database', value: '3309 (Fingerspot MySQL)' },
    { label: 'Username', value: 'root' },
    { label: 'Nama Database', value: 'fin_pro' },
    { label: 'Layanan Windows', value: 'MYSQL_FINAPP (Auto Run)' },
  ];

  return (
    <div className="space-y-8 max-w-4xl pb-12">
      {/* Page Title */}
      <div>
        <h1 className="text-4xl font-extrabold text-slate-800 tracking-tight flex items-center gap-3">
          <Settings className="text-blue-600" size={36} />
          <span>Pengaturan Sistem</span>
        </h1>
        <p className="text-sm text-slate-500 mt-2">
          Kelola koneksi database, integrasi WhatsApp bot, dan pengaturan jam kerja divisi di satu tempat.
        </p>
      </div>

      {/* Tab Bar Navigation */}
      <div className="flex border-b border-slate-200">
        <button
          onClick={() => setActiveTab('database')}
          className={`flex items-center gap-2 px-6 py-3.5 border-b-2 font-bold text-sm transition-all duration-200 ${
            activeTab === 'database'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
          }`}
        >
          <Database size={16} />
          <span>Koneksi & Database</span>
        </button>
        <button
          onClick={() => setActiveTab('whatsapp')}
          className={`flex items-center gap-2 px-6 py-3.5 border-b-2 font-bold text-sm transition-all duration-200 ${
            activeTab === 'whatsapp'
              ? 'border-emerald-600 text-emerald-600'
              : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
          }`}
        >
          <MessageSquare size={16} />
          <span>WhatsApp Bot</span>
        </button>
        <button
          onClick={() => setActiveTab('hours')}
          className={`flex items-center gap-2 px-6 py-3.5 border-b-2 font-bold text-sm transition-all duration-200 ${
            activeTab === 'hours'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
          }`}
        >
          <Clock size={16} />
          <span>Jam Kerja Divisi</span>
        </button>
      </div>

      {/* Tab Contents */}
      <div className="pt-4">
        {/* Tab 1: Database Settings */}
        {activeTab === 'database' && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              {/* Connection Parameters List */}
              <div className="md:col-span-2 bg-white p-6 rounded-2xl border border-slate-200/80 shadow-sm space-y-6">
                <div className="flex items-center gap-2 pb-4 border-b border-slate-100">
                  <Database className="text-slate-400" size={20} />
                  <h3 className="font-bold text-slate-800">Detail Koneksi Database</h3>
                </div>

                <div className="space-y-4">
                  {configParams.map((param, idx) => (
                    <div key={idx} className="flex justify-between items-center py-2 border-b border-slate-50 last:border-0">
                      <span className="text-sm font-semibold text-slate-400">{param.label}</span>
                      <span className="text-sm font-bold text-slate-800 bg-slate-50 px-3 py-1 rounded-xl border border-slate-100">
                        {param.value}
                      </span>
                    </div>
                  ))}
                </div>

                {/* Test Connection Action */}
                <div className="pt-4 flex justify-between items-center border-t border-slate-100">
                  <p className="text-xs text-slate-400 max-w-sm">
                    Gunakan tombol ini untuk memvalidasi apakah server web Next.js dapat terhubung dengan sukses ke database MySQL Fingerspot.
                  </p>
                  <button
                    onClick={handleTestConnection}
                    disabled={testing}
                    className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-500 text-white font-semibold text-sm rounded-xl transition shadow-md shadow-blue-500/10"
                  >
                    {testing ? <RefreshCw className="animate-spin w-4 h-4" /> : null}
                    <span>{testing ? 'Menguji...' : 'Test Koneksi'}</span>
                  </button>
                </div>
              </div>

              {/* Connection Status Indicator */}
              <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-sm flex flex-col justify-between h-full min-h-[300px]">
                <div>
                  <h3 className="font-bold text-slate-800 mb-2">Status Koneksi</h3>
                  <p className="text-xs text-slate-400">Hasil pengujian koneksi database waktu nyata.</p>
                </div>

                <div className="my-8 flex flex-col items-center justify-center text-center">
                  {testResult === null ? (
                    <div className="space-y-2">
                      <div className="w-16 h-16 rounded-full bg-slate-100 flex items-center justify-center text-slate-400 mx-auto">
                        <Database size={28} />
                      </div>
                      <p className="text-xs font-semibold text-slate-500">Klik &quot;Test Koneksi&quot; untuk memulai pengujian.</p>
                    </div>
                  ) : testResult.status === 'success' ? (
                    <div className="space-y-2">
                      <CheckCircle2 className="text-emerald-500 mx-auto" size={48} />
                      <p className="text-sm font-extrabold text-emerald-600">Terhubung</p>
                      {testResult.latency && (
                        <span className="text-[10px] bg-emerald-50 border border-emerald-100 text-emerald-600 font-bold px-2 py-0.5 rounded-full">
                          Latency: {testResult.latency} ms
                        </span>
                      )}
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <XCircle className="text-red-500 mx-auto" size={48} />
                      <p className="text-sm font-extrabold text-red-600">Terputus</p>
                    </div>
                  )}
                </div>

                <div className="text-[11px] font-medium text-slate-400 bg-slate-50 border border-slate-100 p-3 rounded-xl">
                  {testResult ? testResult.message : 'Silakan lakukan pengetesan koneksi untuk melihat status.'}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Tab 2: WhatsApp Bot Settings */}
        {activeTab === 'whatsapp' && (
          <div className="space-y-6">
            {loadingWa ? (
              <div className="flex flex-col items-center justify-center py-12 bg-white rounded-2xl border border-slate-200/80 shadow-sm gap-3">
                <RefreshCw className="animate-spin text-emerald-600" size={28} />
                <p className="text-sm font-medium text-slate-500">Memuat konfigurasi WhatsApp Bot...</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                {/* Form settings */}
                <div className="md:col-span-2 bg-white p-6 rounded-2xl border border-slate-200/80 shadow-sm">
                  <div className="flex items-center gap-2 pb-4 border-b border-slate-100 mb-6">
                    <Settings2 className="text-slate-400" size={20} />
                    <h3 className="font-bold text-slate-800">Form Pengaturan Bot</h3>
                  </div>

                  {waStatus?.connected ? (
                    <form onSubmit={handleSaveWhatsAppConfig} className="space-y-6">
                      {/* Dropdown WhatsApp Group */}
                      <div className="space-y-2">
                        <label className="block text-sm font-semibold text-slate-700">Grup WhatsApp Target Laporan</label>
                        <select
                          value={selectedGroup}
                          onChange={(e) => setSelectedGroup(e.target.value)}
                          className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 font-semibold"
                        >
                          <option value="">-- Pilih Grup Target Laporan --</option>
                          {groups.map((g) => (
                            <option key={g.id} value={g.id}>
                              {g.name}
                            </option>
                          ))}
                        </select>
                        <p className="text-xs text-slate-400">
                          Pilih grup WhatsApp yang akan menerima laporan karyawan tidak hadir setiap pagi.
                        </p>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                        {/* Time Input for send time */}
                        <div className="space-y-2">
                          <label className="block text-sm font-semibold text-slate-700 flex items-center gap-1.5">
                            <Clock size={16} className="text-slate-400" />
                            <span>Waktu Pengiriman</span>
                          </label>
                          <input
                            type="time"
                            value={sendTime}
                            onChange={(e) => setSendTime(e.target.value)}
                            className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 font-semibold"
                            required
                          />
                          <p className="text-xs text-slate-400">Jam pengiriman laporan otomatis harian.</p>
                        </div>

                        {/* Reconciliation switch */}
                        <div className="space-y-2">
                          <label className="block text-sm font-semibold text-slate-700">Verifikasi Laporan Kasir</label>
                          <div className="flex items-center gap-3 pt-2">
                            <button
                              type="button"
                              onClick={() => setReconciliationEnabled(!reconciliationEnabled)}
                              className={`w-12 h-6 flex items-center rounded-full p-1 cursor-pointer transition-colors duration-300 focus:outline-none ${
                                reconciliationEnabled ? 'bg-emerald-500' : 'bg-slate-300'
                              }`}
                            >
                              <div
                                className={`bg-white w-4 h-4 rounded-full shadow-md transform transition-transform duration-300 ${
                                  reconciliationEnabled ? 'translate-x-6' : 'translate-x-0'
                                }`}
                              />
                            </button>
                            <span className="text-sm font-semibold text-slate-600">
                              {reconciliationEnabled ? 'Aktif' : 'Nonaktif'}
                            </span>
                          </div>
                          <p className="text-xs text-slate-400">
                            Otomatis mencocokkan laporan shift kasir dengan database iPOS 5.
                          </p>
                        </div>
                      </div>

                      {/* Save result message */}
                      {saveResult && (
                        <div className={`p-4 rounded-xl border text-sm font-semibold text-center ${
                          saveResult.status === 'success'
                            ? 'bg-emerald-50 border-emerald-100 text-emerald-700'
                            : 'bg-red-50 border-red-100 text-red-700'
                        }`}>
                          {saveResult.message}
                        </div>
                      )}

                      {/* Action Button */}
                      <div className="pt-4 border-t border-slate-100 flex justify-end">
                        <button
                          type="submit"
                          disabled={savingConfig}
                          className="flex items-center gap-2 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-500 text-white font-semibold text-sm rounded-xl transition shadow-md shadow-emerald-500/10"
                        >
                          {savingConfig ? (
                            <RefreshCw className="animate-spin w-4 h-4" />
                          ) : (
                            <Save className="w-4 h-4" />
                          )}
                          <span>{savingConfig ? 'Menyimpan...' : 'Simpan Pengaturan Bot'}</span>
                        </button>
                      </div>
                    </form>
                  ) : (
                    <div className="flex flex-col items-center justify-center text-center py-12 px-6 bg-slate-50 rounded-2xl border border-slate-100">
                      <MessageSquare className="text-slate-300 mb-3" size={36} />
                      <h4 className="font-bold text-slate-700 text-sm mb-1">Konfigurasi Dikunci</h4>
                      <p className="text-xs text-slate-400 max-w-sm leading-relaxed">
                        WhatsApp Bot belum terhubung ke perangkat. Silakan tautkan WhatsApp Anda terlebih dahulu menggunakan QR Code di panel sebelah kanan agar dapat mengonfigurasi grup dan otomatisasi.
                      </p>
                    </div>
                  )}
                </div>

                {/* WA Connection Status & QR Code panel */}
                <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-sm flex flex-col justify-between h-full min-h-[300px]">
                  <div>
                    <h3 className="font-bold text-slate-800 mb-2">Status WhatsApp Bot</h3>
                    <p className="text-xs text-slate-400">Status koneksi waktu nyata dengan perangkat WhatsApp.</p>
                  </div>

                  <div className="my-6 flex flex-col items-center justify-center text-center">
                    {waStatus?.connected ? (
                      <div className="space-y-2">
                        <CheckCircle2 className="text-emerald-500 mx-auto animate-pulse" size={48} />
                        <p className="text-sm font-extrabold text-emerald-600">Terhubung</p>
                        {waStatus.group_jid ? (
                          <span className="text-[10px] bg-slate-100 border border-slate-200 text-slate-600 font-bold px-2 py-0.5 rounded-full block max-w-[200px] truncate mx-auto">
                            JID: {waStatus.group_jid}
                          </span>
                        ) : (
                          <span className="text-[10px] bg-amber-50 border border-amber-100 text-amber-600 font-bold px-2 py-0.5 rounded-full">
                            Grup belum dipilih
                          </span>
                        )}
                      </div>
                    ) : waStatus?.qrCodeUrl ? (
                      <div className="space-y-2">
                        <p className="text-[10px] font-bold text-slate-500">Scan QR Code untuk Menghubungkan:</p>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img 
                          src={waStatus.qrCodeUrl} 
                          alt="WhatsApp QR Code" 
                          className="w-32 h-32 border border-slate-100 rounded-xl mx-auto shadow-sm" 
                        />
                        <p className="text-[9px] text-slate-400 max-w-[180px] mx-auto">
                          Buka WhatsApp &gt; Perangkat Tertaut &gt; Tautkan Perangkat.
                        </p>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        <XCircle className="text-red-500 mx-auto" size={48} />
                        <p className="text-sm font-extrabold text-red-600">Terputus</p>
                        <p className="text-[10px] text-slate-400">Menunggu inisialisasi QR Code dari bot...</p>
                      </div>
                    )}
                  </div>

                  <div className="text-[10px] font-semibold text-slate-500 bg-slate-50 border border-slate-100 p-3 rounded-xl flex items-center justify-between">
                    <span>Metode Integrasi:</span>
                    <span className="bg-emerald-50 text-emerald-700 border border-emerald-100 px-2 py-0.5 rounded-full font-extrabold text-[9px]">
                      Local Proxy API
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Tab 3: Division Work Hours Settings */}
        {activeTab === 'hours' && (
          <div className="space-y-6">
            {loadingHours ? (
              <div className="flex flex-col items-center justify-center py-12 bg-white rounded-2xl border border-slate-200/80 shadow-sm gap-3">
                <RefreshCw className="animate-spin text-blue-600" size={28} />
                <p className="text-sm font-medium text-slate-500">Memuat konfigurasi jam kerja...</p>
              </div>
            ) : (
              <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-sm">
                <form onSubmit={handleSaveHoursConfig} className="space-y-8">
                  {/* Default System Settings Card */}
                  <div className="p-5 bg-slate-50 border border-slate-200/80 rounded-2xl space-y-4">
                    <div>
                      <h3 className="font-bold text-slate-800 text-base">Default Sistem</h3>
                      <p className="text-xs text-slate-400">Digunakan sebagai fallback jika divisi tertentu belum dikonfigurasi khusus.</p>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
                      <div className="space-y-2">
                        <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider">Jam Masuk</label>
                        <input
                          type="time"
                          value={hoursConfig?.defaultSettings?.jam_masuk || '08:00'}
                          onChange={(e) => handleDefaultChange('jam_masuk', e.target.value)}
                          className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2.5 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 font-semibold"
                          required
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider">Batas Terlambat</label>
                        <input
                          type="time"
                          value={hoursConfig?.defaultSettings?.jam_terlambat || '08:00'}
                          onChange={(e) => handleDefaultChange('jam_terlambat', e.target.value)}
                          className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2.5 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 font-semibold"
                          required
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider">Jam Pulang</label>
                        <input
                          type="time"
                          value={hoursConfig?.defaultSettings?.jam_pulang || '16:00'}
                          onChange={(e) => handleDefaultChange('jam_pulang', e.target.value)}
                          className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2.5 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 font-semibold"
                          required
                        />
                      </div>
                    </div>
                  </div>

                  {/* Division Settings Table */}
                  <div className="space-y-4">
                    <div>
                      <h3 className="font-bold text-slate-800 text-base">Jadwal Khusus Divisi</h3>
                      <p className="text-xs text-slate-400">Kosongkan kolom waktu (pilih --:--) jika ingin divisi tersebut mengikuti Default Sistem.</p>
                    </div>

                    <div className="overflow-x-auto border border-slate-200/80 rounded-2xl">
                      <table className="w-full text-left border-collapse">
                        <thead>
                          <tr className="bg-slate-50 border-b border-slate-200/80">
                            <th className="p-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Nama Divisi</th>
                            <th className="p-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Jam Masuk</th>
                            <th className="p-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Batas Terlambat</th>
                            <th className="p-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Jam Pulang</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {hoursConfig?.divisionSettings?.map((ds) => (
                            <tr key={ds.id} className="hover:bg-slate-50/50 transition-colors">
                              <td className="p-4 text-sm font-bold text-slate-700">{ds.name}</td>
                              <td className="p-4">
                                <input
                                  type="time"
                                  value={ds.jam_masuk || ''}
                                  onChange={(e) => handleDivisionChange(ds.id, 'jam_masuk', e.target.value)}
                                  className="bg-slate-50/50 border border-slate-200 rounded-lg px-3 py-1.5 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 font-semibold"
                                />
                              </td>
                              <td className="p-4">
                                <input
                                  type="time"
                                  value={ds.jam_terlambat || ''}
                                  onChange={(e) => handleDivisionChange(ds.id, 'jam_terlambat', e.target.value)}
                                  className="bg-slate-50/50 border border-slate-200 rounded-lg px-3 py-1.5 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 font-semibold"
                                />
                              </td>
                              <td className="p-4">
                                <input
                                  type="time"
                                  value={ds.jam_pulang || ''}
                                  onChange={(e) => handleDivisionChange(ds.id, 'jam_pulang', e.target.value)}
                                  className="bg-slate-50/50 border border-slate-200 rounded-lg px-3 py-1.5 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 font-semibold"
                                />
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* Message result */}
                  {hoursResult && (
                    <div className={`p-4 rounded-xl border text-sm font-semibold text-center ${
                      hoursResult.status === 'success'
                        ? 'bg-emerald-50 border-emerald-100 text-emerald-700'
                        : 'bg-red-50 border-red-100 text-red-700'
                    }`}>
                      {hoursResult.message}
                    </div>
                  )}

                  {/* Submit Button */}
                  <div className="pt-4 border-t border-slate-100 flex justify-end">
                    <button
                      type="submit"
                      disabled={savingHours}
                      className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-500 text-white font-semibold text-sm rounded-xl transition shadow-md shadow-blue-500/10"
                    >
                      {savingHours ? (
                        <RefreshCw className="animate-spin w-4 h-4" />
                      ) : (
                        <Save className="w-4 h-4" />
                      )}
                      <span>{savingHours ? 'Menyimpan...' : 'Simpan Jam Kerja'}</span>
                    </button>
                  </div>
                </form>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
