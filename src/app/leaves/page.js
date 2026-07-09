'use client';

import { useState, useEffect, useCallback } from 'react';
import { 
  ClipboardCheck, 
  Plus, 
  Trash2, 
  AlertCircle, 
  CheckCircle2, 
  Loader2,
  Calendar,
  User,
  FileText
} from 'lucide-react';

export default function Leaves() {
  const [leaves, setLeaves] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitLoading, setSubmitLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  // Form State
  const [selectedPin, setSelectedPin] = useState('');
  const [date, setDate] = useState('');
  const [type, setType] = useState('Izin Setengah Hari');
  const [description, setDescription] = useState('');

  // Searchable Dropdown State
  const [empSearchQuery, setEmpSearchQuery] = useState('');
  const [isEmpDropdownOpen, setIsEmpDropdownOpen] = useState(false);

  // Fetch employees and leaves
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
        // Filter only active employees (status === 1)
        const activeEmployees = json.data.filter(emp => emp.status === 1);
        setEmployees(activeEmployees);
      }
    } catch (err) {
      console.error('Gagal mengambil data karyawan:', err.message);
    }
  }, []);

  const fetchLeaves = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/leaves');
      const json = await res.json();
      if (json.status === 'success') {
        setLeaves(json.data);
      } else {
        setError(json.message);
      }
    } catch (err) {
      setError('Gagal mengambil daftar izin karyawan.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchEmployees();
    fetchLeaves();
  }, [fetchEmployees, fetchLeaves]);

  const handleAddLeave = async (e) => {
    e.preventDefault();
    if (!selectedPin) {
      setError('Silakan pilih karyawan yang valid dari daftar pencarian.');
      return;
    }
    if (!date || !type) return;

    setSubmitLoading(true);
    setError(null);
    setSuccess(null);

    try {
      const res = await fetch('/api/leaves', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          pin: selectedPin, 
          date, 
          type, 
          description 
        })
      });
      const json = await res.json();

      if (json.status === 'success') {
        const empName = employees.find(emp => emp.pin_raw === selectedPin)?.name || `PIN ${selectedPin}`;
        setSuccess(`Berhasil mencatat izin "${type}" untuk ${empName} pada tanggal ${date}`);
        setSelectedPin('');
        setEmpSearchQuery('');
        setDate('');
        setType('Izin Setengah Hari');
        setDescription('');
        fetchLeaves();
      } else {
        setError(json.message);
      }
    } catch (err) {
      setError('Gagal menghubungi server untuk menyimpan izin.');
    } finally {
      setSubmitLoading(false);
    }
  };

  const handleDeleteLeave = async (targetPin, targetDate) => {
    const empName = leaves.find(l => l.pin === targetPin)?.employee_name || `PIN ${targetPin}`;
    if (!confirm(`Apakah Anda yakin ingin menghapus izin untuk ${empName} pada tanggal ${targetDate}?`)) return;

    setError(null);
    setSuccess(null);

    try {
      const res = await fetch(`/api/leaves?pin=${targetPin}&date=${targetDate}`, {
        method: 'DELETE'
      });
      const json = await res.json();

      if (json.status === 'success') {
        setSuccess(`Berhasil menghapus izin untuk ${empName} pada tanggal ${targetDate}`);
        fetchLeaves();
      } else {
        setError(json.message);
      }
    } catch (err) {
      setError('Gagal menghapus catatan izin.');
    }
  };

  const formatIndonesiaDate = (dateStr) => {
    const dateObj = new Date(dateStr);
    return dateObj.toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div>
        <h2 className="text-3xl font-extrabold text-slate-800 tracking-tight flex items-center gap-3">
          <ClipboardCheck className="text-blue-600" size={28} />
          <span>Manajemen Izin Karyawan</span>
        </h2>
        <p className="text-sm text-slate-500 mt-1">
          Catat data izin sakit, cuti, izin setengah hari, atau izin penuh karyawan agar rekap absensi terhitung akurat.
        </p>
      </div>

      {/* Notifications */}
      {error && (
        <div className="flex items-center gap-3 p-4 bg-red-50 border border-red-100 rounded-xl text-red-600 text-sm font-semibold">
          <AlertCircle size={18} />
          <span>{error}</span>
        </div>
      )}
      {success && (
        <div className="flex items-center gap-3 p-4 bg-emerald-50 border border-emerald-100 rounded-xl text-emerald-600 text-sm font-semibold animate-fadeIn">
          <CheckCircle2 size={18} />
          <span>{success}</span>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Add Leave Form Card */}
        <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-sm h-fit">
          <h3 className="font-bold text-slate-700 mb-4 text-base">Catat Izin Karyawan</h3>
          <form onSubmit={handleAddLeave} className="space-y-4">
            {/* Employee Searchable Select */}
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
                  className="w-full pl-10 pr-4 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-blue-500 bg-slate-50/50 font-semibold text-slate-700 animate-transition"
                  required
                />
                <User className="absolute left-3 top-3.5 text-slate-400" size={16} />

                {isEmpDropdownOpen && (
                  <>
                    {/* Backdrop click-away */}
                    <div className="fixed inset-0 z-20" onClick={() => setIsEmpDropdownOpen(false)} />
                    
                    {/* Dropdown list */}
                    <div className="absolute left-0 right-0 top-full mt-1 bg-white border border-slate-200 rounded-xl shadow-lg max-h-60 overflow-y-auto z-30 divide-y divide-slate-50">
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
                            className="w-full text-left px-4 py-2.5 hover:bg-slate-50 text-sm font-semibold text-slate-700 transition"
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

            {/* Date Input */}
            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Tanggal Izin</label>
              <div className="relative">
                <input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-blue-500 bg-slate-50/50"
                  required
                />
                <Calendar className="absolute left-3 top-3 text-slate-400" size={16} />
              </div>
            </div>

            {/* Leave Type Select */}
            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Jenis Izin</label>
              <select
                value={type}
                onChange={(e) => setType(e.target.value)}
                className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-blue-500 bg-slate-50/50 font-medium text-slate-700"
                required
              >
                <option value="Izin Setengah Hari">Izin Setengah Hari (0.5 Hadir)</option>
                <option value="Izin Penuh">Izin Penuh (Bebas Mangkir)</option>
                <option value="Sakit">Sakit (Bebas Mangkir)</option>
                <option value="Cuti">Cuti (Bebas Mangkir)</option>
              </select>
            </div>

            {/* Description Input */}
            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Keterangan / Catatan</label>
              <div className="relative">
                <input
                  type="text"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Misal: Keperluan keluarga, Sakit gigi..."
                  className="w-full pl-10 pr-4 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-blue-500 bg-slate-50/50"
                />
                <FileText className="absolute left-3 top-3.5 text-slate-400" size={16} />
              </div>
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={submitLoading}
              className="w-full flex items-center justify-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white font-semibold text-sm rounded-xl transition shadow-md shadow-blue-500/10"
            >
              {submitLoading ? (
                <Loader2 size={16} className="animate-spin" />
              ) : (
                <Plus size={16} />
              )}
              <span>Simpan Izin Karyawan</span>
            </button>
          </form>
        </div>

        {/* Leaves List Card */}
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden lg:col-span-2">
          <div className="p-5 border-b border-slate-100">
            <span className="font-bold text-slate-700">Daftar Izin Karyawan Terdaftar</span>
          </div>

          {loading ? (
            <div className="p-12 text-center text-slate-500">
              <Loader2 className="animate-spin inline-block text-blue-600 mb-3" size={24} />
              <p className="text-sm font-semibold">Memuat daftar izin...</p>
            </div>
          ) : leaves.length === 0 ? (
            <div className="p-12 text-center text-slate-400">
              <ClipboardCheck className="inline-block text-slate-300 mb-3" size={32} />
              <p className="text-sm">Belum ada data izin khusus yang dicatat.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 text-slate-400 text-xs font-bold uppercase tracking-wider border-b border-slate-100">
                    <th className="px-6 py-4">Hari / Tanggal</th>
                    <th className="px-6 py-4">Karyawan</th>
                    <th className="px-6 py-4">Jenis Izin</th>
                    <th className="px-6 py-4">Keterangan</th>
                    <th className="px-6 py-4 text-right">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-sm">
                  {leaves.map((l) => (
                    <tr key={`${l.pin}-${l.date}`} className="hover:bg-slate-50/40 transition">
                      <td className="px-6 py-4 font-semibold text-slate-700">
                        {formatIndonesiaDate(l.date)}
                      </td>
                      <td className="px-6 py-4">
                        <div>
                          <p className="font-bold text-slate-800">{l.employee_name}</p>
                          <p className="text-xs text-slate-400 font-mono">PIN: {l.pin} | {l.department}</p>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span className={`px-2.5 py-1 rounded-full text-xs font-bold ${
                          l.type === 'Izin Setengah Hari'
                            ? 'bg-blue-50 border border-blue-100 text-blue-600'
                            : l.type === 'Sakit'
                              ? 'bg-red-50 border border-red-100 text-red-600'
                              : l.type === 'Cuti'
                                ? 'bg-emerald-50 border border-emerald-100 text-emerald-600'
                                : 'bg-amber-50 border border-amber-100 text-amber-600'
                        }`}>
                          {l.type}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-slate-500 font-medium">
                        {l.description || '-'}
                      </td>
                      <td className="px-6 py-4 text-right">
                        <button
                          onClick={() => handleDeleteLeave(l.pin, l.date)}
                          className="p-2 bg-red-50 hover:bg-red-100 text-red-500 rounded-xl transition inline-flex items-center justify-center border border-red-100"
                          title="Hapus Izin Karyawan"
                        >
                          <Trash2 size={16} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
