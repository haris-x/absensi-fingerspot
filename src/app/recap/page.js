'use client';

import { useState, useEffect, useCallback } from 'react';
import { 
  FileSpreadsheet, 
  Search, 
  Calendar, 
  Download, 
  RefreshCw, 
  X,
  Users,
  CheckCircle2,
  AlertTriangle,
  Clock,
  ChevronRight
} from 'lucide-react';

export default function Recap() {
  const [recapData, setRecapData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState('');
  
  // Date range filters
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [appliedStartDate, setAppliedStartDate] = useState('');
  const [appliedEndDate, setAppliedEndDate] = useState('');

  // Selected employee for detail modal
  const [selectedEmployee, setSelectedEmployee] = useState(null);

  // Initialize date range defaults (first day of month to today)
  useEffect(() => {
    const today = new Date();
    const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
    
    const formatDate = (date) => {
      const y = date.getFullYear();
      const m = String(date.getMonth() + 1).padStart(2, '0');
      const d = String(date.getDate()).padStart(2, '0');
      return `${y}-${m}-${d}`;
    };

    const start = formatDate(firstDay);
    const end = formatDate(today);
    
    setStartDate(start);
    setEndDate(end);
    setAppliedStartDate(start);
    setAppliedEndDate(end);
  }, []);

  const fetchRecap = useCallback(async () => {
    if (!appliedStartDate || !appliedEndDate) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/recap?startDate=${appliedStartDate}&endDate=${appliedEndDate}`);
      const json = await res.json();

      if (json.status === 'success') {
        setRecapData(json.data);
      } else {
        setError(json.message);
      }
    } catch (err) {
      setError('Gagal memuat data rekap absensi dari server.');
    } finally {
      setLoading(false);
    }
  }, [appliedStartDate, appliedEndDate]);

  useEffect(() => {
    fetchRecap();
  }, [fetchRecap]);

  const handleSubmitFilters = (e) => {
    e.preventDefault();
    setAppliedStartDate(startDate);
    setAppliedEndDate(endDate);
  };

  const filteredData = recapData.filter(emp => 
    emp.name.toLowerCase().includes(search.toLowerCase()) ||
    emp.pin_raw.includes(search)
  );

  // Aggregated KPIs
  const totalEmployees = recapData.length;
  const totalHadir = recapData.reduce((acc, curr) => acc + curr.hadir, 0);
  const totalAbsen = recapData.reduce((acc, curr) => acc + curr.absen, 0);
  const totalLembur = recapData.reduce((acc, curr) => acc + curr.lembur, 0);

  const getDayName = (dateStr) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('id-ID', { weekday: 'long' });
  };

  const formatIndonesiaDate = (dateStr) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
  };

  const exportToCSV = () => {
    if (recapData.length === 0) return;

    const headers = ['PIN', 'Nama Karyawan', 'Departemen', 'Hari Kerja (Hadir)', 'Setengah Hari', 'Absen', 'Total Lembur (Jam)'];
    const rows = recapData.map(emp => [
      emp.pin_raw,
      emp.name,
      emp.department,
      emp.hadir,
      emp.setengah_hari || 0,
      emp.absen,
      emp.lembur
    ]);

    const csvContent = "\uFEFF" + [
      headers.join(','),
      ...rows.map(row => row.map(val => `"${String(val).replace(/"/g, '""')}"`).join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `Rekap_Absensi_${appliedStartDate}_s.d_${appliedEndDate}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-extrabold text-slate-800 tracking-tight flex items-center gap-3">
            <FileSpreadsheet className="text-blue-600" size={28} />
            <span>Rekap Absensi Karyawan</span>
          </h2>
          <p className="text-sm text-slate-500 mt-1">
            Tarik data rekap hari kerja, lembur, dan ketidakhadiran karyawan berdasarkan rentang tanggal.
          </p>
        </div>
        
        {recapData.length > 0 && (
          <button
            onClick={exportToCSV}
            className="flex items-center justify-center gap-2 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-sm rounded-xl transition shadow-md shadow-emerald-500/10"
          >
            <Download size={16} />
            <span>Ekspor Rekap (CSV)</span>
          </button>
        )}
      </div>

      {/* Date Filter Panel */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-sm">
        <form onSubmit={handleSubmitFilters} className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
          {/* Start Date */}
          <div className="space-y-1">
            <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Tanggal Mulai</label>
            <div className="relative">
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-blue-500 transition bg-slate-50/50"
                required
              />
              <Calendar className="absolute left-3 top-2.5 text-slate-400" size={16} />
            </div>
          </div>

          {/* End Date */}
          <div className="space-y-1">
            <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Tanggal Selesai</label>
            <div className="relative">
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-blue-500 transition bg-slate-50/50"
                required
              />
              <Calendar className="absolute left-3 top-2.5 text-slate-400" size={16} />
            </div>
          </div>

          {/* Submit Button */}
          <button
            type="submit"
            className="w-full flex items-center justify-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold text-sm rounded-xl transition shadow-md shadow-blue-500/10"
          >
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
            <span>Tarik Data Rekap</span>
          </button>
        </form>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Karyawan */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm flex items-center gap-4">
          <div className="p-3 bg-blue-50 rounded-xl text-blue-600">
            <Users size={24} />
          </div>
          <div>
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Total Karyawan</span>
            <p className="text-2xl font-extrabold text-slate-800 mt-0.5">{totalEmployees}</p>
          </div>
        </div>

        {/* Total Hadir */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm flex items-center gap-4">
          <div className="p-3 bg-emerald-50 rounded-xl text-emerald-600">
            <CheckCircle2 size={24} />
          </div>
          <div>
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Total Kehadiran</span>
            <p className="text-2xl font-extrabold text-slate-800 mt-0.5">{totalHadir} <span className="text-xs text-slate-400 font-normal">Hari</span></p>
          </div>
        </div>

        {/* Total Absen */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm flex items-center gap-4">
          <div className="p-3 bg-red-50 rounded-xl text-red-600">
            <AlertTriangle size={24} />
          </div>
          <div>
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Total Absen (Mangkir)</span>
            <p className="text-2xl font-extrabold text-slate-800 mt-0.5">{totalAbsen} <span className="text-xs text-slate-400 font-normal">Hari</span></p>
          </div>
        </div>

        {/* Total Lembur */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm flex items-center gap-4">
          <div className="p-3 bg-amber-50 rounded-xl text-amber-600">
            <Clock size={24} />
          </div>
          <div>
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Total Lembur</span>
            <p className="text-2xl font-extrabold text-slate-800 mt-0.5">{Math.round(totalLembur * 100) / 100} <span className="text-xs text-slate-400 font-normal">Jam</span></p>
          </div>
        </div>
      </div>

      {/* Main Table Panel */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
        {/* Table Header Filter */}
        <div className="p-5 border-b border-slate-100 flex flex-col sm:flex-row items-center justify-between gap-4">
          <span className="font-bold text-slate-700">Daftar Rekapitulasi</span>
          <div className="relative w-full sm:w-72">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Cari karyawan..."
              className="w-full pl-9 pr-4 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-blue-500 bg-slate-50/50"
            />
            <Search className="absolute left-3 top-2.5 text-slate-400" size={16} />
          </div>
        </div>

        {loading ? (
          <div className="p-12 text-center text-slate-500">
            <RefreshCw className="animate-spin inline-block text-blue-600 mb-3" size={24} />
            <p className="text-sm font-semibold">Memuat rekapitulasi data...</p>
          </div>
        ) : error ? (
          <div className="p-8 text-center text-red-500 font-medium">
            <p>{error}</p>
          </div>
        ) : filteredData.length === 0 ? (
          <div className="p-12 text-center text-slate-400">
            <Users className="inline-block text-slate-300 mb-3" size={32} />
            <p className="text-sm">Tidak ada data rekapitulasi ditemukan.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 text-slate-400 text-xs font-bold uppercase tracking-wider border-b border-slate-100">
                  <th className="px-6 py-4">PIN</th>
                  <th className="px-6 py-4">Nama Karyawan</th>
                  <th className="px-6 py-4">Departemen</th>
                  <th className="px-6 py-4 text-center">Hari Kerja (Hadir)</th>
                  <th className="px-6 py-4 text-center">Setengah Hari</th>
                  <th className="px-6 py-4 text-center">Absen</th>
                  <th className="px-6 py-4 text-center">Total Lembur</th>
                  <th className="px-6 py-4 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {filteredData.map((emp) => (
                  <tr key={emp.pin_raw} className="hover:bg-slate-50/40 transition">
                    <td className="px-6 py-4 font-mono font-bold text-slate-500">{emp.pin_raw}</td>
                    <td className="px-6 py-4 font-bold text-slate-800">{emp.name}</td>
                    <td className="px-6 py-4">
                      <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${
                        emp.department.toLowerCase() === 'admin' 
                          ? 'bg-purple-50 border border-purple-100 text-purple-600'
                          : emp.department.toLowerCase() === 'salesman'
                            ? 'bg-blue-50 border border-blue-100 text-blue-600'
                            : 'bg-slate-100 border border-slate-200 text-slate-600'
                      }`}>
                        {emp.department}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-center font-bold text-emerald-600">{emp.hadir} Hari</td>
                    <td className="px-6 py-4 text-center font-bold text-amber-600">{emp.setengah_hari || 0} Hari</td>
                    <td className="px-6 py-4 text-center font-bold text-red-500">{emp.absen} Hari</td>
                    <td className="px-6 py-4 text-center font-bold text-slate-700">{emp.lembur} Jam</td>
                    <td className="px-6 py-4 text-right">
                      <button
                        onClick={() => setSelectedEmployee(emp)}
                        className="inline-flex items-center gap-1 text-xs font-bold text-blue-600 hover:text-blue-700 bg-blue-50 hover:bg-blue-100 px-3 py-1.5 rounded-lg transition"
                      >
                        <span>Lihat Detail</span>
                        <ChevronRight size={14} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Detailed Modal Window */}
      {selectedEmployee && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl w-full max-w-4xl overflow-hidden flex flex-col">
            {/* Modal Header */}
            <div className="p-6 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h3 className="text-xl font-bold text-slate-800">Detail Rekap Karyawan</h3>
                <p className="text-sm text-slate-400 mt-1">
                  Nama: <span className="font-semibold text-slate-700">{selectedEmployee.name}</span> | PIN: <span className="font-mono font-semibold text-slate-700">{selectedEmployee.pin_raw}</span> | Departemen: <span className="font-semibold text-slate-700">{selectedEmployee.department}</span>
                </p>
              </div>
              <button
                onClick={() => setSelectedEmployee(null)}
                className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-xl transition"
              >
                <X size={20} />
              </button>
            </div>

            {/* Modal Content */}
            <div className="p-6 overflow-y-auto max-h-[60vh] space-y-4">
              <div className="flex items-center justify-between bg-slate-50 p-4 rounded-xl text-sm border border-slate-150">
                <span className="font-medium text-slate-500">Rentang Waktu: <strong className="text-slate-800">{formatIndonesiaDate(appliedStartDate)} s.d. {formatIndonesiaDate(appliedEndDate)}</strong></span>
                <span className="flex gap-4">
                  <span className="text-slate-500">Hadir: <strong className="text-emerald-600">{selectedEmployee.hadir} Hari</strong></span>
                  <span className="text-slate-500">Setengah Hari: <strong className="text-amber-600">{selectedEmployee.setengah_hari || 0} Hari</strong></span>
                  <span className="text-slate-500">Absen: <strong className="text-red-500">{selectedEmployee.absen} Hari</strong></span>
                  <span className="text-slate-500">Lembur: <strong className="text-amber-600">{selectedEmployee.lembur} Jam</strong></span>
                </span>
              </div>

              <div className="border border-slate-100 rounded-xl overflow-hidden">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-50 text-slate-400 font-bold uppercase border-b border-slate-100">
                      <th className="px-4 py-3">Tanggal</th>
                      <th className="px-4 py-3">Hari</th>
                      <th className="px-4 py-3 text-center">Status</th>
                      <th className="px-4 py-3 text-center">Jam Masuk</th>
                      <th className="px-4 py-3 text-center">Jam Pulang</th>
                      <th className="px-4 py-3 text-center">Lembur (Jam)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-medium">
                    {selectedEmployee.details.map((detail) => (
                      <tr key={detail.date} className="hover:bg-slate-50/50">
                        <td className="px-4 py-3 text-slate-600">{detail.date}</td>
                        <td className="px-4 py-3 text-slate-500 font-normal">{getDayName(detail.date)}</td>
                        <td className="px-4 py-3 text-center">
                          <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${
                            detail.status === 'Hadir' 
                              ? 'bg-emerald-50 border border-emerald-100 text-emerald-600'
                              : detail.status === 'Hadir (Setengah Hari)' || detail.status === 'Izin (Setengah Hari)'
                                ? 'bg-amber-50 border border-amber-100 text-amber-600 font-bold'
                                : detail.status === 'Absen'
                                  ? 'bg-red-50 border border-red-100 text-red-600'
                                  : 'bg-slate-100 border border-slate-200 text-slate-500'
                          }`}>
                            {detail.status}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-center text-slate-600 font-mono">{detail.check_in || '-'}</td>
                        <td className="px-4 py-3 text-center text-slate-600 font-mono">{detail.check_out || '-'}</td>
                        <td className="px-4 py-3 text-center font-bold text-amber-500">{detail.lembur > 0 ? `${detail.lembur} Jam` : '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="p-4 bg-slate-50 border-t border-slate-100 flex justify-end">
              <button
                onClick={() => setSelectedEmployee(null)}
                className="px-5 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 font-semibold text-sm rounded-xl transition"
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
