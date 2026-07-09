'use client';

import { useState, useEffect, useCallback } from 'react';
import { 
  Calendar, 
  Plus, 
  Trash2, 
  AlertCircle, 
  CheckCircle2, 
  Loader2,
  CalendarDays
} from 'lucide-react';

export default function Holidays() {
  const [holidays, setHolidays] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitLoading, setSubmitLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  // Form State
  const [date, setDate] = useState('');
  const [description, setDescription] = useState('');

  const fetchHolidays = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/holidays');
      const json = await res.json();
      if (json.status === 'success') {
        setHolidays(json.data);
      } else {
        setError(json.message);
      }
    } catch (err) {
      setError('Gagal mengambil daftar hari libur.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchHolidays();
  }, [fetchHolidays]);

  const handleAddHoliday = async (e) => {
    e.preventDefault();
    if (!date || !description) return;
    
    setSubmitLoading(true);
    setError(null);
    setSuccess(null);
    
    try {
      const res = await fetch('/api/holidays', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date, description })
      });
      const json = await res.json();
      
      if (json.status === 'success') {
        setSuccess(`Berhasil menambahkan hari libur pada tanggal ${date}`);
        setDate('');
        setDescription('');
        fetchHolidays();
      } else {
        setError(json.message);
      }
    } catch (err) {
      setError('Gagal menghubungi server untuk menambah hari libur.');
    } finally {
      setSubmitLoading(false);
    }
  };

  const handleDeleteHoliday = async (targetDate) => {
    if (!confirm(`Apakah Anda yakin ingin menghapus tanggal libur ${targetDate}?`)) return;
    
    setError(null);
    setSuccess(null);
    
    try {
      const res = await fetch(`/api/holidays?date=${targetDate}`, {
        method: 'DELETE'
      });
      const json = await res.json();
      
      if (json.status === 'success') {
        setSuccess(`Berhasil menghapus tanggal libur ${targetDate}`);
        fetchHolidays();
      } else {
        setError(json.message);
      }
    } catch (err) {
      setError('Gagal menghapus hari libur.');
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
          <CalendarDays className="text-blue-600" size={28} />
          <span>Pengaturan Hari Libur</span>
        </h2>
        <p className="text-sm text-slate-500 mt-1">
          Kelola tanggal merah, hari raya, atau libur nasional agar tidak dihitung sebagai Absen (Mangkir) karyawan.
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
        {/* Add Holiday Form Card */}
        <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-sm h-fit">
          <h3 className="font-bold text-slate-700 mb-4 text-base">Tambah Tanggal Libur</h3>
          <form onSubmit={handleAddHoliday} className="space-y-4">
            {/* Date Input */}
            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Tanggal Libur</label>
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

            {/* Description Input */}
            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Keterangan / Deskripsi</label>
              <input
                type="text"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Misal: Libur Idul Fitri, Cuti Bersama..."
                className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-blue-500 bg-slate-50/50"
                required
              />
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
              <span>Simpan Tanggal Libur</span>
            </button>
          </form>
        </div>

        {/* Holidays List Card */}
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden lg:col-span-2">
          <div className="p-5 border-b border-slate-100">
            <span className="font-bold text-slate-700">Daftar Libur Terdaftar</span>
          </div>

          {loading ? (
            <div className="p-12 text-center text-slate-500">
              <Loader2 className="animate-spin inline-block text-blue-600 mb-3" size={24} />
              <p className="text-sm font-semibold">Memuat daftar libur...</p>
            </div>
          ) : holidays.length === 0 ? (
            <div className="p-12 text-center text-slate-400">
              <Calendar className="inline-block text-slate-300 mb-3" size={32} />
              <p className="text-sm">Belum ada tanggal libur khusus yang ditambahkan.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 text-slate-400 text-xs font-bold uppercase tracking-wider border-b border-slate-100">
                    <th className="px-6 py-4">Hari / Tanggal</th>
                    <th className="px-6 py-4">Keterangan</th>
                    <th className="px-6 py-4 text-right">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-sm">
                  {holidays.map((h) => (
                    <tr key={h.date} className="hover:bg-slate-50/40 transition">
                      <td className="px-6 py-4 font-semibold text-slate-700">
                        {formatIndonesiaDate(h.date)}
                      </td>
                      <td className="px-6 py-4 text-slate-600">
                        <span className="font-medium text-slate-800 bg-slate-100 border border-slate-200 px-2.5 py-1 rounded-lg">
                          {h.description}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <button
                          onClick={() => handleDeleteHoliday(h.date)}
                          className="p-2 bg-red-50 hover:bg-red-100 text-red-500 rounded-xl transition inline-flex items-center justify-center border border-red-100"
                          title="Hapus Tanggal Libur"
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
