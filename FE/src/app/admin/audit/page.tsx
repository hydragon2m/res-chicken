'use client';

import { useCallback, useEffect, useState } from 'react';
import { Search, RefreshCw, ShieldAlert } from 'lucide-react';
import { apiRequest } from '@/lib/auth';
import { useActiveStore } from '@/lib/store-context';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';

type AuditLog = {
  id: string;
  storeId?: string | null;
  targetType: string;
  targetId?: string | null;
  action: string;
  actorId?: string | null;
  metadata?: Record<string, unknown> | null;
  createdAt: string;
  actor?: { email: string; role: string } | null;
};

export default function AuditLogsPage() {
  const { currentStoreId: storeId, currentStore } = useActiveStore();
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterTargetType, setFilterTargetType] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedLog, setSelectedLog] = useState<AuditLog | null>(null);
  const [loadError, setLoadError] = useState('');

  const loadAuditLogs = useCallback(async () => {
    if (!storeId) return;
    setLoading(true);
    setLoadError('');
    try {
      const data = await apiRequest<AuditLog[]>(
        `/audit-logs?storeId=${encodeURIComponent(storeId)}&take=100`,
      );
      setLogs(Array.isArray(data) ? data : []);
    } catch (err: unknown) {
      setLoadError(
        err instanceof Error ? err.message : 'Không thể tải nhật ký kiểm toán (Audit Logs).',
      );
      setLogs([]);
    } finally {
      setLoading(false);
    }
  }, [storeId]);

  useEffect(() => {
    if (storeId) {
      void loadAuditLogs();
    }
  }, [storeId, loadAuditLogs]);

  const filteredLogs = logs.filter((log) => {
    if (filterTargetType && log.targetType !== filterTargetType) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      const matchEntity =
        (log.targetType ?? '').toLowerCase().includes(q) ||
        (log.targetId ?? '').toLowerCase().includes(q);
      const matchAction = (log.action ?? '').toLowerCase().includes(q);
      const matchActor =
        (log.actor?.email ?? '').toLowerCase().includes(q) ||
        (log.actorId ?? '').toLowerCase().includes(q);
      return matchEntity || matchAction || matchActor;
    }
    return true;
  });

  const targetTypes = Array.from(new Set(logs.map((l) => l.targetType).filter(Boolean)));

  return (
    <div className="w-full p-4 sm:p-6 lg:px-8 space-y-6 font-sans">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-2.5">
          <div className="size-9 rounded-xl bg-amber-500 text-white flex items-center justify-center shadow-sm">
            <ShieldAlert className="size-5" />
          </div>
          <div>
            <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">
              Nhật Ký Kiểm Toán Bảo Mật (Audit Logs)
            </h1>
            <p className="text-xs text-slate-500 mt-0.5">
              Chi nhánh:{' '}
              <span className="font-semibold text-slate-700">
                {currentStore?.name ?? 'Chick Res Main'}
              </span>{' '}
              • Truy vết toàn bộ thao tác đơn hàng, thanh toán, tồn kho và phân quyền
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          <Button
            variant="outline"
            size="sm"
            onClick={() => void loadAuditLogs()}
            className="flex items-center gap-1.5 cursor-pointer"
          >
            <RefreshCw className={`size-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>Làm mới</span>
          </Button>
        </div>
      </div>

      {loadError && (
        <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-700 font-medium flex items-center justify-between">
          <span>Lỗi đồng bộ dữ liệu: {loadError}</span>
          <Button variant="outline" size="xs" onClick={() => void loadAuditLogs()}>
            Thử lại
          </Button>
        </div>
      )}

      {/* Filter and Search Bar */}
      <Card className="rounded-2xl border border-slate-200/90 shadow-2xs">
        <CardContent className="p-4">
          <div className="flex flex-col sm:flex-row items-center gap-3">
            <div className="relative flex-1 w-full">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-slate-400" />
              <Input
                placeholder="Tìm theo hành động, mã đối tượng, ID nhân sự..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 h-9 text-xs"
              />
            </div>

            <div className="w-full sm:w-56">
              <select
                aria-label="Lọc theo phân hệ"
                value={filterTargetType}
                onChange={(e) => setFilterTargetType(e.target.value)}
                className="w-full h-9 px-3 rounded-lg border border-slate-200 bg-white text-xs font-semibold text-slate-700 focus:border-amber-500 outline-none"
              >
                <option value="">Tất cả phân hệ ({logs.length})</option>
                {targetTypes.map((t) => (
                  <option key={t} value={t}>
                    Phân hệ: {t}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Audit Log Data Table */}
      <Card className="rounded-2xl border border-slate-200/90 shadow-2xs overflow-hidden">
        <CardHeader className="px-6 py-4 border-b border-slate-100 bg-slate-50/50 flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-sm font-bold text-slate-900">
              Danh sách sự kiện ghi nhận ({filteredLogs.length})
            </CardTitle>
            <CardDescription className="text-xs text-slate-500">
              Bản ghi nhật ký bất biến phục vụ kiểm toán nội bộ
            </CardDescription>
          </div>
          <span className="text-[11px] text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-0.5 rounded-full font-semibold">
            Immutable Log
          </span>
        </CardHeader>

        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead className="bg-slate-50/90 border-b border-slate-200 text-slate-500 font-bold uppercase text-[11px]">
                <tr>
                  <th className="px-6 py-3.5">Thời điểm</th>
                  <th className="px-4 py-3.5">Hành động (Action)</th>
                  <th className="px-4 py-3.5">Phân hệ</th>
                  <th className="px-4 py-3.5">Mã đối tượng</th>
                  <th className="px-4 py-3.5">Tác nhân (Actor)</th>
                  <th className="px-6 py-3.5 text-right">Dữ liệu JSON</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {loading ? (
                  <tr>
                    <td colSpan={6} className="px-6 py-10 text-center text-slate-400">
                      Đang tải nhật ký kiểm toán...
                    </td>
                  </tr>
                ) : filteredLogs.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-6 py-10 text-center text-slate-400">
                      Không tìm thấy bản ghi nhật ký nào phù hợp.
                    </td>
                  </tr>
                ) : (
                  filteredLogs.map((log) => (
                    <tr key={log.id} className="hover:bg-slate-50/70 transition-colors">
                      <td className="px-6 py-3.5 text-slate-600 font-mono text-[11px] whitespace-nowrap">
                        {new Date(log.createdAt).toLocaleString('vi-VN')}
                      </td>
                      <td className="px-4 py-3.5">
                        <span className="px-2 py-0.5 rounded-md bg-amber-50 border border-amber-200 text-amber-900 font-bold font-mono text-[11px]">
                          {log.action}
                        </span>
                      </td>
                      <td className="px-4 py-3.5 font-bold text-slate-800">{log.targetType}</td>
                      <td className="px-4 py-3.5 text-slate-600 font-mono text-[11px]">
                        {log.targetId ? `#${log.targetId.slice(0, 8).toUpperCase()}` : '—'}
                      </td>
                      <td className="px-4 py-3.5 text-slate-700 font-mono text-[11px]">
                        {log.actor?.email ? (
                          <span>{log.actor.email}</span>
                        ) : log.actorId &&
                          log.actorId !== '00000000-0000-0000-0000-000000000000' ? (
                          <span>NV #{log.actorId.slice(0, 8)}</span>
                        ) : (
                          <span className="text-slate-400 font-sans italic">Hệ thống / Khách</span>
                        )}
                      </td>
                      <td className="px-6 py-3.5 text-right">
                        <Button
                          variant="outline"
                          size="xs"
                          onClick={() => setSelectedLog(log)}
                          className="text-xs cursor-pointer"
                        >
                          Xem chi tiết
                        </Button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Log Detail Modal */}
      {selectedLog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
          <div className="w-full max-w-lg bg-white rounded-2xl shadow-2xl border border-slate-200 p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-slate-900">Chi tiết Bản ghi Audit</h3>
                <p className="text-xs font-mono text-amber-700 font-bold">{selectedLog.action}</p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedLog(null)}
                className="text-slate-400 hover:text-slate-600 font-bold cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="p-3 rounded-xl bg-slate-900 text-slate-100 text-xs font-mono max-h-80 overflow-y-auto">
              <pre>{JSON.stringify(selectedLog, null, 2)}</pre>
            </div>

            <div className="flex justify-end pt-2">
              <Button
                size="sm"
                onClick={() => setSelectedLog(null)}
                className="bg-amber-500 hover:bg-amber-600 text-white"
              >
                Đóng
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
