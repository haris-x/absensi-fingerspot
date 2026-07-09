'use client';

import { useState, useEffect, useCallback } from 'react';
import { 
  ClipboardList, 
  Search, 
  Calendar, 
  Download, 
  RefreshCw, 
  X,
  Plus,
  Trash2,
  AlertCircle,
  Loader2
} from 'lucide-react';

export default function Logs() {
  const [logs, setLogs] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Filters state
  const [search, setSearch] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  
  // Applied filters state for API requests
  const [appliedSearch, setAppliedSearch] = useState('');
  const [appliedStartDate, setAppliedStartDate] = useState('');
  const [appliedEndDate, setAppliedEndDate] = useState('');

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalLoading, setModalLoading] = useState(false);
  const [modalError, setModalError] = useState(null);

  // Form State
  const [selectedPin, setSelectedPin] = useState('');
  const [manualDate, setManualDate] = useState('');
  const [manualTime, setManualTime] = useState('');
  const [manualStatus, setManualStatus] = useState('0'); // '0' for In, '1' for Out

  // Searchable Dropdown State
  const [empSearchQuery, setEmpSearchQuery] = useState('');
  const [isEmpDropdownOpen, setIsEmpDropdownOpen] = useState(false);

  // Pagination State
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 50;

  const totalPages = Math.ceil(logs.length / itemsPerPage);
  const paginatedLogs = logs.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  const filteredEmployees = employees.filter(emp =>
    emp.name.toLowerCase().includes(empSearchQuery.toLowerCase()) ||
    emp.pin_raw.includes(empSearchQuery) ||
    emp.department.toLowerCase().includes(empSearchQuery.toLowerCase())
  );

  const fetchEmployees = useCallback(async () => {
    try {
      const res = await fetch('/api/employees');
      const json = await res.json();
      if (json.status === 'success') {
        const active = json.data.filter(emp => emp.status === 1);
        setEmployees(active);
      }
    } catch (err) {
      console.error('Gagal memuat data karyawan:', err.message);
    }
  }, []);

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    try {
      let url = '/api/logs?limit=2000';
      if (appliedStartDate) url += `&startDate=${appliedStartDate}`;
      if (appliedEndDate) url += `&endDate=${appliedEndDate}`;
      if (appliedSearch) url += `&search=${encodeURIComponent(appliedSearch)}`;

      const res = await fetch(url);
      const json = await res.json();

      if (json.status === 'success') {
        setLogs(json.data);
      } else {
        setError(json.message);
      }
    } catch (err) {
      setError('Gagal memuat log absensi dari server.');
    } finally {
      setLoading(false);
    }
  }, [appliedSearch, appliedStartDate, appliedEndDate]);

  useEffect(() => {
    fetchEmployees();
    fetchLogs();
  }, [fetchEmployees, fetchLogs]);

  useEffect(() => {
    setCurrentPage(1);
  }, [appliedSearch, appliedStartDate, appliedEndDate]);

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    setAppliedSearch(search);
  };

  const handleResetFilters = () => {
    setSearch('');
    setStartDate('');
    setEndDate('');
    setAppliedSearch('');
    setAppliedStartDate('');
    setAppliedEndDate('');
  };

  const handleManualSubmit = async (e) => {
    e.preventDefault();
    if (!selectedPin) {
      setModalError('Silakan pilih karyawan yang valid dari daftar pencarian.');
      return;
    }
    if (!manualDate || !manualTime) return;

    setModalLoading(true);
    setModalError(null);
    try {
      const res = await fetch('/api/logs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pin: selectedPin,
          date: manualDate,
          time: manualTime.includes(':') && manualTime.split(':').length === 2 ? `${manualTime}:00` : manualTime,
          status: parseInt(manualStatus)
        })
      });
      const json = await res.json();
      if (json.status === 'success') {
        setIsModalOpen(false);
        setSelectedPin('');
        setEmpSearchQuery('');
        setManualDate('');
        setManualTime('');
        setManualStatus('0');
        fetchLogs();
      } else {
        setModalError(json.message);
      }
    } catch (err) {
      setModalError('Gagal menghubungi server untuk menambah log scan.');
    } finally {
      setModalLoading(false);
    }
  };

  const handleDeleteLog = async (pinRaw, dateTime) => {
    if (!confirm(`Apakah Anda yakin ingin menghapus log scan manual karyawan ini?`)) return;
    try {
      const res = await fetch(`/api/logs?pin=${pinRaw}&dateTime=${dateTime}`, {
        method: 'DELETE'
      });
      const json = await res.json();
      if (json.status === 'success') {
        fetchLogs();
      } else {
        alert(json.message);
      }
    } catch (err) {
      alert('Gagal menghapus log scan manual.');
    }
  };

  const exportToCSV = () => {
    if (logs.length === 0) return;

    // Headers
    const headers = ['Tanggal & Waktu', 'PIN', 'Nama Karyawan', 'Departemen', 'Status', 'Metode Verifikasi'];

    // Map rows
    const rows = logs.map(log => [
      log.date_time,
      log.pin_raw,
      log.employee_name,
      log.department,
      log.status === 0 ? 'Masuk' : 'Keluar',
      log.verified_label
    ]);

    // Create CSV content (UTF-8 BOM is added for correct Microsoft Excel encoding)
    const csvContent = "\uFEFF" + [
      headers.join(','),
      ...rows.map(row => row.map(val => `"${String(val).replace(/"/g, '""')}"`).join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `Log_Absensi_${new Date().toLocaleDateString('sv-SE')}.csv`);
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
            <ClipboardList className="text-blue-600" size={28} />
            <span>Log Absensi</span>
          </h2>
          <p className="text-sm text-slate-500 mt-1">
            Lihat, saring, atau masukkan log scan absensi secara manual. Menampilkan {logs.length} data.
          </p>
        </div>
        
        <div className="flex items-center gap-2">
          {/* Add Manual Scan Button */}
          <button
            onClick={() => {
              setIsModalOpen(true);
              setSelectedPin('');
              setEmpSearchQuery('');
            }}
            className="flex items-center justify-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold text-sm rounded-xl transition shadow-md shadow-blue-500/10"
          >
            <Plus size={16} />
            <span>Input Log Manual</span>
          </button>

          {logs.length > 0 && (
            <button
              onClick={exportToCSV}
              className="flex items-center justify-center gap-2 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-sm rounded-xl transition shadow-md shadow-emerald-500/10"
            >
              <Download size={16} />
              <span>Ekspor CSV</span>
            </button>
          )}
        </div>
      </div>

      {/* Filter Panels */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-sm space-y-4">
        <form onSubmit={handleSearchSubmit} className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
          {/* Search Field */}
          <div className="space-y-1">
            <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Cari Karyawan / PIN</label>
            <div className="relative">
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Nama atau Nomor PIN..."
                className="w-full pl-10 pr-4 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-blue-500 transition bg-slate-50/50"
              />
              <Search className="absolute left-3 top-2.5 text-slate-400" size={16} />
            </div>
          </div>

          {/* Start Date Field */}
          <div className="space-y-1">
            <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Tanggal Mulai</label>
            <div className="relative">
              <input
                type="date"
                value={startDate}
                onChange={(e) => {
                  setStartDate(e.target.value);
                  setAppliedStartDate(e.target.value);
                }}
                className="w-full pl-10 pr-4 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-blue-500 transition bg-slate-50/50"
              />
              <Calendar className="absolute left-3 top-2.5 text-slate-400" size={16} />
            </div>
          </div>

          {/* End Date Field */}
          <div className="space-y-1">
            <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Tanggal Selesai</label>
            <div className="relative">
              <input
                type="date"
                value={endDate}
                onChange={(e) => {
                  setEndDate(e.target.value);
                  setAppliedEndDate(e.target.value);
                }}
                className="w-full pl-10 pr-4 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-blue-500 transition bg-slate-50/50"
              />
              <Calendar className="absolute left-3 top-2.5 text-slate-400" size={16} />
            </div>
          </div>

          {/* Submit & Reset Buttons */}
          <div className="flex gap-2">
            <button
              type="submit"
              className="flex-1 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-semibold transition"
            >
              Cari
            </button>
            {(appliedSearch || appliedStartDate || appliedEndDate) && (
              <button
                type="button"
                onClick={handleResetFilters}
                className="p-2 border border-slate-200 text-slate-500 hover:bg-slate-50 rounded-xl transition"
                title="Reset Saringan"
              >
                <X size={18} />
              </button>
            )}
          </div>
        </form>
      </div>

      {/* Logs Table Area */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3">
            <RefreshCw className="animate-spin text-blue-600" size={28} />
            <p className="text-sm font-medium text-slate-500">Memuat log absensi...</p>
          </div>
        ) : error ? (
          <div className="p-8 text-center text-red-600 font-medium">{error}</div>
        ) : logs.length === 0 ? (
          <div className="py-20 text-center text-slate-400 text-sm font-medium">
            Tidak ditemukan data log absensi untuk kriteria saringan ini.
          </div>
        ) : (
          <div className="overflow-x-auto max-h-[60vh] overflow-y-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200/80 sticky top-0 z-10">
                  <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-wider">Tanggal & Waktu</th>
                  <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-wider">PIN</th>
                  <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-wider">Nama Karyawan</th>
                  <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-wider">Departemen</th>
                  <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-wider">Status</th>
                  <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-wider">Metode Verifikasi</th>
                  <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-wider text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {paginatedLogs.map((log, idx) => (
                  <tr key={idx} className="hover:bg-slate-50/50 transition">
                    <td className="px-6 py-3.5 text-sm font-bold text-slate-800">
                      {new Date(log.date_time).toLocaleString('id-ID', {
                        year: 'numeric',
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                        second: '2-digit'
                      })}
                    </td>
                    <td className="px-6 py-3.5 text-sm font-semibold text-slate-500">
                      {log.pin_raw}
                    </td>
                    <td className="px-6 py-3.5 text-sm font-extrabold text-slate-800">
                      {log.employee_name}
                    </td>
                    <td className="px-6 py-3.5 text-sm">
                      <span className="px-2.5 py-1 text-xs font-semibold rounded-full bg-slate-100 text-slate-600">
                        {log.department}
                      </span>
                    </td>
                    <td className="px-6 py-3.5 text-sm">
                      <span className={`px-2.5 py-1 text-xs font-bold uppercase tracking-wider rounded-full ${
                        log.status === 0 
                          ? 'bg-emerald-50 text-emerald-600' 
                          : 'bg-orange-50 text-orange-600'
                      }`}>
                        {log.status === 0 ? 'Masuk' : 'Keluar'}
                      </span>
                    </td>
                    <td className="px-6 py-3.5 text-sm text-slate-500 font-medium">
                      <span className={`px-2 py-0.5 rounded text-xs ${
                        log.verified === 15 
                          ? 'bg-blue-50 border border-blue-100 text-blue-600 font-semibold' 
                          : 'bg-transparent text-slate-500'
                      }`}>
                        {log.verified_label}
                      </span>
                    </td>
                    <td className="px-6 py-3.5 text-sm text-right">
                      {log.verified === 15 && (
                        <button
                          onClick={() => handleDeleteLog(log.pin_raw, log.date_time)}
                          className="p-1.5 bg-red-50 hover:bg-red-100 text-red-500 rounded-lg transition inline-flex items-center justify-center border border-red-100"
                          title="Hapus Log Manual"
                        >
                          <Trash2 size={14} />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {/* Pagination Controls */}
        {!loading && !error && logs.length > itemsPerPage && (
          <div className="px-6 py-4 border-t border-slate-100 flex flex-col sm:flex-row items-center justify-between gap-4 bg-slate-50/50">
            <span className="text-xs font-semibold text-slate-500">
              Menampilkan {Math.min((currentPage - 1) * itemsPerPage + 1, logs.length)} - {Math.min(currentPage * itemsPerPage, logs.length)} dari {logs.length} data
            </span>
            <div className="flex gap-2">
              <button
                onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                disabled={currentPage === 1}
                className="px-3 py-1.5 border border-slate-200 bg-white text-slate-600 rounded-xl text-xs font-bold hover:bg-slate-50 disabled:opacity-50 disabled:hover:bg-white transition"
              >
                Sebelumnya
              </button>
              <div className="flex items-center gap-1">
                {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                  let pageNum;
                  if (totalPages <= 5) {
                    pageNum = i + 1;
                  } else if (currentPage <= 3) {
                    pageNum = i + 1;
                  } else if (currentPage >= totalPages - 2) {
                    pageNum = totalPages - 4 + i;
                  } else {
                    pageNum = currentPage - 2 + i;
                  }
                  
                  return (
                    <button
                      key={pageNum}
                      onClick={() => setCurrentPage(pageNum)}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold transition ${
                        currentPage === pageNum
                          ? 'bg-blue-600 text-white'
                          : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                      }`}
                    >
                      {pageNum}
                    </button>
                  );
                })}
              </div>
              <button
                onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                disabled={currentPage === totalPages}
                className="px-3 py-1.5 border border-slate-200 bg-white text-slate-600 rounded-xl text-xs font-bold hover:bg-slate-50 disabled:opacity-50 disabled:hover:bg-white transition"
              >
                Selanjutnya
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Manual Input Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-md w-full overflow-hidden animate-in fade-in zoom-in duration-200">
            <div className="p-6 border-b border-slate-100 flex items-center justify-between">
              <h3 className="font-extrabold text-slate-800 text-lg flex items-center gap-2">
                <ClipboardList className="text-blue-600" size={20} />
                <span>Input Log Absen Manual</span>
              </h3>
              <button 
                onClick={() => { 
                  setIsModalOpen(false); 
                  setModalError(null); 
                  setSelectedPin('');
                  setEmpSearchQuery('');
                }}
                className="p-1.5 hover:bg-slate-100 rounded-xl text-slate-400 hover:text-slate-600 transition"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleManualSubmit} className="p-6 space-y-4">
              {modalError && (
                <div className="flex items-center gap-2 p-3.5 bg-red-50 border border-red-100 rounded-xl text-red-600 text-xs font-semibold">
                  <AlertCircle size={14} />
                  <span>{modalError}</span>
                </div>
              )}

              {/* Karyawan Searchable Select */}
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Karyawan</label>
                <div className="relative">
                  <input
                    type="text"
                    placeholder="Cari nama atau PIN karyawan..."
                    value={empSearchQuery}
                    onChange={(e) => {
                      setEmpSearchQuery(e.target.value);
                      setIsEmpDropdownOpen(true);
                      setSelectedPin('');
                    }}
                    onFocus={() => setIsEmpDropdownOpen(true)}
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-blue-500 font-semibold text-slate-700 bg-slate-50/50"
                    required
                  />

                  {isEmpDropdownOpen && (
                    <>
                      {/* Backdrop click-away */}
                      <div className="fixed inset-0 z-40" onClick={() => setIsEmpDropdownOpen(false)} />
                      
                      {/* Dropdown list */}
                      <div className="absolute left-0 right-0 top-full mt-1 bg-white border border-slate-200 rounded-xl shadow-lg max-h-60 overflow-y-auto z-50 divide-y divide-slate-50">
                        {filteredEmployees.length === 0 ? (
                          <div className="p-3 text-sm text-slate-400 text-center font-medium">Karyawan tidak ditemukan</div>
                        ) : (
                          filteredEmployees.map(emp => (
                            <button
                              key={emp.pin_raw}
                              type="button"
                              onClick={() => {
                                setSelectedPin(emp.pin_raw);
                                setEmpSearchQuery(`[${emp.pin_raw}] ${emp.name}`);
                                setIsEmpDropdownOpen(false);
                              }}
                              className="w-full text-left px-4 py-2 hover:bg-slate-50 text-sm font-semibold text-slate-700 transition"
                            >
                              [{emp.pin_raw}] {emp.name} ({emp.department})
                            </button>
                          ))
                        )}
                      </div>
                    </>
                  )}
                </div>
              </div>

              {/* Tanggal Input */}
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Tanggal Scan</label>
                <input
                  type="date"
                  value={manualDate}
                  onChange={(e) => setManualDate(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-blue-500 bg-slate-50/50"
                  required
                />
              </div>

              {/* Jam Input */}
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Jam Scan</label>
                <input
                  type="time"
                  step="1"
                  value={manualTime}
                  onChange={(e) => setManualTime(e.target.value)}
                  placeholder="HH:MM:SS"
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-blue-500 bg-slate-50/50"
                  required
                />
              </div>

              {/* Status Absen */}
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Status Absensi</label>
                <select
                  value={manualStatus}
                  onChange={(e) => setManualStatus(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-blue-500 font-medium text-slate-700 bg-slate-50/50"
                  required
                >
                  <option value="0">Masuk (Check In)</option>
                  <option value="1">Pulang (Check Out)</option>
                </select>
              </div>

              {/* Submit Button */}
              <button
                type="submit"
                disabled={modalLoading}
                className="w-full flex items-center justify-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white font-semibold text-sm rounded-xl transition shadow-md shadow-blue-500/10 mt-2"
              >
                {modalLoading ? (
                  <Loader2 className="animate-spin" size={16} />
                ) : (
                  <Plus size={16} />
                )}
                <span>Tambah Log Scan</span>
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
