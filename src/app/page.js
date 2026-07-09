'use client';

import { useState, useEffect } from 'react';
import {
  Users,
  ClipboardList,
  UserCheck,
  Clock,
  RefreshCw,
  ArrowRight,
  TrendingUp,
  MessageSquare,
  Fingerprint,
  CheckCircle2
} from 'lucide-react';
import Link from 'next/link';

export default function Dashboard() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [syncing, setSyncing] = useState(false);
  const [activeTab, setActiveTab] = useState('recent');
  const [waStatus, setWaStatus] = useState({ connected: false, group_configured: false, qrCodeUrl: null });
  const [sendingWa, setSendingWa] = useState(false);
  const [waResult, setWaResult] = useState(null);
  const [syncResult, setSyncResult] = useState(null);

  const fetchStats = async () => {
    try {
      const res = await fetch('/api/stats');
      const json = await res.json();
      if (json.status === 'success') {
        setData(json.data);
      } else {
        setError(json.message);
      }
    } catch (err) {
      setError('Gagal mengambil data dari server.');
    } finally {
      setLoading(false);
    }
  };

  const checkWaStatus = async () => {
    try {
      const res = await fetch('/api/whatsapp');
      const json = await res.json();
      if (json.status === 'success') {
        setWaStatus({ 
          connected: json.connected, 
          group_configured: json.group_configured,
          qrCodeUrl: json.qrCodeUrl 
        });
      } else {
        setWaStatus({ connected: false, group_configured: false, qrCodeUrl: null });
      }
    } catch (err) {
      setWaStatus({ connected: false, group_configured: false, qrCodeUrl: null });
    }
  };

  const handleSendWa = async () => {
    setSendingWa(true);
    setWaResult(null);
    try {
      const res = await fetch('/api/whatsapp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      const json = await res.json();
      if (json.status === 'success') {
        setWaResult({ type: 'success', message: 'Laporan berhasil dikirim ke WhatsApp!' });
        setTimeout(() => setWaResult(null), 4000);
      } else {
        setWaResult({ type: 'error', message: json.message || 'Gagal mengirim laporan.' });
      }
    } catch (err) {
      setWaResult({ type: 'error', message: 'Gagal terhubung ke API WhatsApp Bot.' });
    } finally {
      setSendingWa(false);
    }
  };

  useEffect(() => {
    fetchStats();
    checkWaStatus();
    // Auto refresh stats every 30 seconds
    const interval = setInterval(() => {
      fetchStats();
      checkWaStatus();
    }, 30000);
    return () => clearInterval(interval);
  }, []);

  const handleSync = async () => {
    setSyncing(true);
    setSyncResult(null);
    try {
      const res = await fetch('/api/sync', { method: 'POST' });
      const json = await res.json();
      if (json.status === 'success') {
        setSyncResult({ type: 'success', message: json.message, stats: json.stats });
        // Refresh dashboard data setelah sync
        await fetchStats();
        setTimeout(() => setSyncResult(null), 6000);
      } else {
        setSyncResult({ type: 'error', message: json.message });
        setTimeout(() => setSyncResult(null), 6000);
      }
    } catch (err) {
      setSyncResult({ type: 'error', message: 'Gagal terhubung ke server sinkronisasi.' });
      setTimeout(() => setSyncResult(null), 6000);
    } finally {
      setSyncing(false);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-3">
        <RefreshCw className="animate-spin text-blue-600" size={32} />
        <p className="text-sm font-medium text-slate-500">Memuat data dashboard...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6 rounded-2xl bg-red-50 border border-red-100 text-red-700 max-w-lg mx-auto mt-12">
        <h3 className="font-bold text-lg mb-1">Gagal Memuat Dashboard</h3>
        <p className="text-sm mb-4">{error}</p>
        <button 
          onClick={fetchStats}
          className="px-4 py-2 bg-red-600 text-white rounded-xl text-sm font-semibold hover:bg-red-700 transition"
        >
          Coba Lagi
        </button>
      </div>
    );
  }

  const { logs_today, total_employees, present_today, late_today, chart_data, recent_logs, absent_employees } = data;

  // Calculate highest count for SVG chart scaling
  const maxScanCount = Math.max(...chart_data.map(d => d.count), 1);

  return (
    <div className="space-y-8">
      {/* Welcome Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-extrabold text-slate-800 tracking-tight">Selamat Datang di Fingerspot Link</h2>
          <p className="text-sm text-slate-500 mt-1">Pantau kehadiran karyawan CV Alief Jaya secara waktu nyata.</p>
        </div>
        <button
          onClick={handleSync}
          disabled={syncing}
          className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold text-sm rounded-xl transition shadow-md shadow-blue-500/10 disabled:opacity-75"
        >
          {syncing ? (
            <RefreshCw className="w-4 h-4 animate-spin" />
          ) : (
            <Fingerprint className="w-4 h-4" />
          )}
          <span>{syncing ? 'Menarik data dari mesin...' : 'Sync Mesin Absensi'}</span>
        </button>
      </div>

      {/* Sync Result Notification */}
      {syncResult && (
        <div className={`p-4 rounded-2xl border flex items-start gap-3 ${
          syncResult.type === 'success'
            ? 'bg-emerald-50 border-emerald-100'
            : 'bg-red-50 border-red-100'
        }`}>
          {syncResult.type === 'success' ? (
            <CheckCircle2 className="text-emerald-600 mt-0.5 shrink-0" size={18} />
          ) : (
            <RefreshCw className="text-red-600 mt-0.5 shrink-0" size={18} />
          )}
          <div>
            <p className={`text-sm font-bold ${syncResult.type === 'success' ? 'text-emerald-700' : 'text-red-700'}`}>
              {syncResult.type === 'success' ? 'Sinkronisasi Berhasil' : 'Sinkronisasi Gagal'}
            </p>
            <p className={`text-xs mt-0.5 ${syncResult.type === 'success' ? 'text-emerald-600' : 'text-red-600'}`}>
              {syncResult.message}
            </p>
            {syncResult.stats && (
              <div className="flex gap-3 mt-2">
                <span className="text-[10px] font-bold bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full">
                  +{syncResult.stats.inserted} baru
                </span>
                <span className="text-[10px] font-bold bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full">
                  {syncResult.stats.skipped} sudah ada
                </span>
                <span className="text-[10px] font-bold bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">
                  {syncResult.stats.deviceLogs} total di mesin
                </span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* KPI Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        {/* Card 1: Total Employees */}
        <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-sm hover:translate-y-[-2px] transition-all duration-200">
          <div className="flex justify-between items-start">
            <div className="space-y-1">
              <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Total Karyawan</span>
              <p className="text-3xl font-extrabold text-slate-800">{total_employees}</p>
            </div>
            <div className="p-3 bg-blue-50 text-blue-600 rounded-xl">
              <Users size={22} />
            </div>
          </div>
          <div className="mt-4 text-xs font-medium text-slate-400">
            Terdaftar di mesin absensi
          </div>
        </div>

        {/* Card 2: Logs Today */}
        <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-sm hover:translate-y-[-2px] transition-all duration-200">
          <div className="flex justify-between items-start">
            <div className="space-y-1">
              <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Total Scan Hari Ini</span>
              <p className="text-3xl font-extrabold text-slate-800">{logs_today}</p>
            </div>
            <div className="p-3 bg-indigo-50 text-indigo-600 rounded-xl">
              <ClipboardList size={22} />
            </div>
          </div>
          <div className="mt-4 text-xs font-medium text-indigo-500 flex items-center gap-1">
            <TrendingUp size={14} />
            <span>Aktivitas check-in/out aktif</span>
          </div>
        </div>

        {/* Card 3: Present Today */}
        <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-sm hover:translate-y-[-2px] transition-all duration-200">
          <div className="flex justify-between items-start">
            <div className="space-y-1">
              <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Hadir Hari Ini</span>
              <p className="text-3xl font-extrabold text-slate-800">{present_today}</p>
            </div>
            <div className="p-3 bg-emerald-50 text-emerald-600 rounded-xl">
              <UserCheck size={22} />
            </div>
          </div>
          <div className="mt-4 text-xs font-medium text-slate-400">
            {total_employees > 0 ? Math.round((present_today / total_employees) * 100) : 0}% tingkat kehadiran hari ini
          </div>
        </div>

        {/* Card 4: Late Today */}
        <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-sm hover:translate-y-[-2px] transition-all duration-200">
          <div className="flex justify-between items-start">
            <div className="space-y-1">
              <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Terlambat Hari Ini</span>
              <p className="text-3xl font-extrabold text-slate-800">{late_today}</p>
            </div>
            <div className="p-3 bg-amber-50 text-amber-600 rounded-xl">
              <Clock size={22} />
            </div>
          </div>
          <div className="mt-4 text-xs font-medium text-amber-600">
            Pertama scan setelah pukul 08:00
          </div>
        </div>
      </div>

      {/* Grid Layout: Chart & Recent Logs */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Weekly Chart Container */}
        <div className="lg:col-span-2 bg-white p-6 rounded-2xl border border-slate-200/80 shadow-sm flex flex-col">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h3 className="font-bold text-slate-800 text-lg">Tren Kehadiran Mingguan</h3>
              <p className="text-xs text-slate-400">Jumlah log absensi tercatat selama 7 hari terakhir</p>
            </div>
          </div>
          
          {/* SVG Bar Chart */}
          <div className="flex-1 flex items-end justify-between gap-2 h-64 px-2 pt-4 border-b border-slate-100">
            {chart_data.map((day, idx) => {
              // Calculate percentage height
              const heightPercent = (day.count / maxScanCount) * 80 + 5; // offset by 5% minimum
              return (
                <div key={idx} className="flex-1 flex flex-col items-center gap-2 group h-full justify-end">
                  <div className="relative w-full flex-1 flex items-end justify-center">
                    {/* Tooltip on hover */}
                    <span className="absolute bottom-full mb-2 bg-slate-800 text-white text-[10px] font-bold px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition duration-150 pointer-events-none z-10 whitespace-nowrap shadow-md">
                      {day.count} scan
                    </span>
                    {/* Bar */}
                    <div 
                      style={{ height: `${heightPercent}%` }}
                      className="w-8 sm:w-12 bg-blue-100 group-hover:bg-blue-600 rounded-t-lg transition-all duration-300 ease-out"
                    ></div>
                  </div>
                  <span className="text-[10px] font-bold text-slate-400 group-hover:text-slate-700 select-none">
                    {day.label}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Tabbed Side Panel: Recent Logs & Absent Employees */}
        <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-sm flex flex-col min-h-[420px]">
          {/* Tab Header */}
          <div className="flex border-b border-slate-100 mb-6">
            <button
              onClick={() => setActiveTab('recent')}
              className={`flex-1 pb-3 text-sm font-bold border-b-2 transition-all ${
                activeTab === 'recent'
                  ? 'border-blue-600 text-slate-800'
                  : 'border-transparent text-slate-400 hover:text-slate-600'
              }`}
            >
              Aktivitas Terkini
            </button>
            <button
              onClick={() => setActiveTab('absent')}
              className={`flex-1 pb-3 text-sm font-bold border-b-2 transition-all relative ${
                activeTab === 'absent'
                  ? 'border-blue-600 text-slate-800'
                  : 'border-transparent text-slate-400 hover:text-slate-600'
              }`}
            >
              Tidak Hadir
              {absent_employees.length > 0 && (
                <span className="absolute top-0 right-2 w-4 h-4 rounded-full bg-red-500 text-[9px] font-bold text-white flex items-center justify-center">
                  {absent_employees.length}
                </span>
              )}
            </button>
          </div>

          {/* WhatsApp Integration Card */}
          {activeTab === 'absent' && (
            <div className="px-1 mb-4 p-3 bg-slate-50 border border-slate-200/80 rounded-xl space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <span className={`w-2 h-2 rounded-full ${waStatus.connected ? 'bg-emerald-500 animate-pulse' : 'bg-red-400'}`}></span>
                  <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                    {waStatus.connected ? 'WhatsApp Terhubung' : 'WhatsApp Terputus (Scan QR)'}
                  </span>
                </div>
                <span className="text-[9px] font-semibold text-slate-400">via Server API</span>
              </div>

              {!waStatus.connected && waStatus.qrCodeUrl && (
                <div className="flex flex-col items-center justify-center bg-white p-3 rounded-lg border border-slate-200/60 shadow-inner my-1">
                  <p className="text-[10px] font-bold text-slate-500 text-center mb-1">
                    Scan QR ini untuk menghubungkan:
                  </p>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img 
                    src={waStatus.qrCodeUrl} 
                    alt="WhatsApp QR Code" 
                    className="w-32 h-32 border border-slate-100 rounded" 
                  />
                  <p className="text-[8px] text-slate-400 text-center mt-1">
                    Buka WhatsApp &gt; Perangkat Tertaut &gt; Tautkan Perangkat
                  </p>
                </div>
              )}

              <button
                onClick={handleSendWa}
                disabled={sendingWa || !waStatus.connected}
                className="w-full flex items-center justify-center gap-2 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-200 disabled:text-slate-400 text-white font-bold text-xs rounded-lg transition"
              >
                {sendingWa ? (
                  <RefreshCw className="animate-spin w-3.5 h-3.5" />
                ) : (
                  <MessageSquare className="w-3.5 h-3.5" />
                )}
                <span>Kirim Laporan WA</span>
              </button>

              {waResult && (
                <div className={`p-2 text-[10px] rounded-md font-medium text-center border ${
                  waResult.type === 'success' 
                    ? 'bg-emerald-50 border-emerald-100 text-emerald-700' 
                    : 'bg-red-50 border-red-100 text-red-700'
                }`}>
                  {waResult.message}
                </div>
              )}
            </div>
          )}

          {/* Tab Content */}
          <div className="flex-1 overflow-y-auto max-h-[350px] pr-1 space-y-4">
            {activeTab === 'recent' ? (
              recent_logs.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-slate-400 text-sm py-10">
                  Belum ada aktivitas hari ini.
                </div>
              ) : (
                recent_logs.map((log, idx) => (
                  <div key={idx} className="flex items-center justify-between p-3 rounded-xl hover:bg-slate-50 transition border border-transparent hover:border-slate-100">
                    <div className="flex items-center gap-3">
                      <div className={`w-2.5 h-2.5 rounded-full ${log.status === 0 ? 'bg-emerald-500' : 'bg-orange-500'}`}></div>
                      <div>
                        <h4 className="text-sm font-bold text-slate-800 leading-tight">{log.employee_name}</h4>
                        <p className="text-[10px] text-slate-400 mt-0.5">
                          {log.verified_label} • PIN {log.pin}
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <span className="text-xs font-semibold text-slate-700 block">
                        {new Date(log.date_time).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}
                      </span>
                      <span className={`text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full ${
                        log.status === 0 
                          ? 'bg-emerald-50 text-emerald-600' 
                          : 'bg-orange-50 text-orange-600'
                      }`}>
                        {log.status === 0 ? 'Masuk' : 'Keluar'}
                      </span>
                    </div>
                  </div>
                ))
              )
            ) : (
              absent_employees.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-slate-400 text-sm py-10">
                  Semua karyawan hadir hari ini! 🎉
                </div>
              ) : (
                absent_employees.map((emp, idx) => (
                  <div key={idx} className="flex items-center justify-between p-3 rounded-xl hover:bg-slate-50 transition border border-transparent hover:border-slate-100">
                    <div className="flex items-center gap-3">
                      <div className="w-2.5 h-2.5 rounded-full bg-red-500"></div>
                      <div>
                        <h4 className="text-sm font-bold text-slate-800 leading-tight">{emp.name}</h4>
                        <p className="text-[10px] text-slate-400 mt-0.5">
                          {emp.department} • PIN {emp.pin}
                        </p>
                      </div>
                    </div>
                    <div>
                      <span className="text-[9px] font-bold uppercase tracking-wider px-2 py-1 rounded-full bg-red-50 text-red-600">
                        Absen
                      </span>
                    </div>
                  </div>
                ))
              )
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
