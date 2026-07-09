'use client';

import { useState, useEffect } from 'react';
import { 
  Users, 
  Search, 
  Edit2, 
  X, 
  RefreshCw,
  Bookmark
} from 'lucide-react';

export default function Employees() {
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  
  // Search state
  const [search, setSearch] = useState('');

  // Modal edit state
  const [editingEmployee, setEditingEmployee] = useState(null);
  const [newName, setNewName] = useState('');
  const [newStatus, setNewStatus] = useState(1);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);
  const [saveSuccess, setSaveSuccess] = useState(null);

  const fetchEmployees = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/employees');
      const json = await res.json();
      if (json.status === 'success') {
        setEmployees(json.data);
      } else {
        setError(json.message);
      }
    } catch (err) {
      setError('Gagal memuat daftar karyawan.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchEmployees();
  }, []);

  const openEditModal = (emp) => {
    setEditingEmployee(emp);
    setNewName(emp.name);
    setNewStatus(emp.status !== undefined ? emp.status : 1);
    setSaveError(null);
    setSaveSuccess(null);
  };

  const closeEditModal = () => {
    setEditingEmployee(null);
    setNewName('');
    setNewStatus(1);
  };

  const handleUpdateEmployee = async (e) => {
    e.preventDefault();
    if (!newName.trim()) {
      setSaveError('Nama tidak boleh kosong.');
      return;
    }
    setSaving(true);
    setSaveError(null);
    try {
      const res = await fetch('/api/employees', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pin: editingEmployee.pin,
          name: newName.trim(),
          status: newStatus
        })
      });
      const json = await res.json();

      if (json.status === 'success') {
        setSaveSuccess('Nama & status karyawan berhasil diperbarui!');
        // Update local state immediately
        setEmployees(prev => prev.map(emp => 
          emp.pin === editingEmployee.pin ? { ...emp, name: newName.trim(), status: newStatus } : emp
        ));
        setTimeout(() => {
          closeEditModal();
        }, 1000);
      } else {
        setSaveError(json.message);
      }
    } catch (err) {
      setSaveError('Terjadi kesalahan saat menyimpan perubahan.');
    } finally {
      setSaving(false);
    }
  };

  // Helper to generate initials for avatar
  const getInitials = (name) => {
    if (!name) return '??';
    const parts = name.split(' ');
    if (parts.length >= 2) {
      return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return name.substring(0, 2).toUpperCase();
  };

  // Helper for department badge styles
  const getDeptStyles = (dept) => {
    const d = String(dept).toLowerCase();
    if (d.includes('admin')) return 'bg-blue-50 text-blue-600 border border-blue-100';
    if (d.includes('sales')) return 'bg-orange-50 text-orange-600 border border-orange-100';
    if (d.includes('staff')) return 'bg-purple-50 text-purple-600 border border-purple-100';
    return 'bg-slate-50 text-slate-600 border border-slate-200';
  };

  // Filtered employees
  const filteredEmployees = employees.filter(emp => 
    emp.name.toLowerCase().includes(search.toLowerCase()) || 
    emp.pin.toString().includes(search)
  );

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-extrabold text-slate-800 tracking-tight flex items-center gap-3">
            <Users className="text-blue-600" size={28} />
            <span>Data Karyawan</span>
          </h2>
          <p className="text-sm text-slate-500 mt-1">
            Manajemen nama dan informasi karyawan yang terdaftar di mesin absensi. Menampilkan {filteredEmployees.length} orang.
          </p>
        </div>
      </div>

      {/* Filter and Search */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-sm">
        <div className="relative max-w-md">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Cari karyawan berdasarkan nama atau nomor PIN..."
            className="w-full pl-10 pr-4 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-blue-500 transition bg-slate-50/50"
          />
          <Search className="absolute left-3 top-2.5 text-slate-400" size={16} />
        </div>
      </div>

      {/* Employees Grid */}
      {loading ? (
        <div className="flex flex-col items-center justify-center py-20 gap-3">
          <RefreshCw className="animate-spin text-blue-600" size={28} />
          <p className="text-sm font-medium text-slate-500">Memuat data karyawan...</p>
        </div>
      ) : error ? (
        <div className="p-8 text-center text-red-600 font-medium">{error}</div>
      ) : filteredEmployees.length === 0 ? (
        <div className="py-20 text-center text-slate-400 text-sm font-medium">
          Tidak ada karyawan yang cocok dengan pencarian Anda.
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredEmployees.map((emp) => (
            <div 
              key={emp.pin} 
              className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-sm flex items-center justify-between hover:translate-y-[-2px] hover:shadow-md transition-all duration-200 group"
            >
              <div className="flex items-center gap-4">
                {/* Avatar circle */}
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white font-extrabold text-sm shadow-sm select-none">
                  {getInitials(emp.name)}
                </div>
                
                <div className="space-y-1">
                  <h4 className="font-extrabold text-slate-800 group-hover:text-blue-600 transition leading-snug">
                    {emp.name}
                  </h4>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-bold text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded">
                      PIN {emp.pin}
                    </span>
                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                      emp.status === 1 
                        ? 'bg-emerald-50 text-emerald-600' 
                        : 'bg-red-50 text-red-600'
                    }`}>
                      {emp.status === 1 ? 'Aktif' : 'Resign'}
                    </span>
                    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${getDeptStyles(emp.department)}`}>
                      {emp.department}
                    </span>
                  </div>
                </div>
              </div>

              {/* Edit Action */}
              <button
                onClick={() => openEditModal(emp)}
                className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-xl transition-all"
                title="Edit Nama"
              >
                <Edit2 size={16} />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Edit Employee Name Modal */}
      {editingEmployee && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center z-50 p-4 transition-all">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xl max-w-md w-full overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50/50">
              <h3 className="font-bold text-slate-800 flex items-center gap-2">
                <Bookmark className="text-blue-600" size={18} />
                <span>Edit Nama Karyawan</span>
              </h3>
              <button 
                onClick={closeEditModal}
                className="text-slate-400 hover:text-slate-600 p-1 hover:bg-slate-100 rounded-lg transition"
              >
                <X size={18} />
              </button>
            </div>

            {/* Modal Body / Form */}
            <form onSubmit={handleUpdateEmployee} className="p-6 space-y-4">
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">PIN Mesin</label>
                <input
                  type="text"
                  disabled
                  value={editingEmployee.pin}
                  className="w-full px-4 py-2 border border-slate-200 rounded-xl text-sm bg-slate-100 text-slate-500 focus:outline-none"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Nama Karyawan</label>
                <input
                  type="text"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  className="w-full px-4 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-blue-500 transition"
                  placeholder="Ketik nama karyawan..."
                  autoFocus
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Status Kepegawaian</label>
                <select
                  value={newStatus}
                  onChange={(e) => setNewStatus(parseInt(e.target.value))}
                  className="w-full px-4 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-blue-500 transition bg-white"
                >
                  <option value={1}>Aktif</option>
                  <option value={2}>Resign / Keluar</option>
                </select>
              </div>

              {/* Status Alert Messages */}
              {saveError && (
                <div className="p-3 text-xs bg-red-50 border border-red-100 text-red-600 rounded-xl">
                  {saveError}
                </div>
              )}
              {saveSuccess && (
                <div className="p-3 text-xs bg-emerald-50 border border-emerald-100 text-emerald-600 rounded-xl">
                  {saveSuccess}
                </div>
              )}

              {/* Modal Actions */}
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={closeEditModal}
                  className="px-4 py-2 border border-slate-200 text-slate-500 hover:bg-slate-50 rounded-xl text-sm font-semibold transition"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-semibold transition flex items-center gap-1.5 disabled:opacity-75"
                >
                  {saving && <RefreshCw className="animate-spin" size={14} />}
                  <span>{saving ? 'Menyimpan...' : 'Simpan Perubahan'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
