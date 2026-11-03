'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { BrandSectionBackground } from '@/components/patterns';
import {
  ShieldAlert,
  CheckCircle2,
  XCircle,
  Clock,
  UserCheck,
  AlertTriangle,
  History,
  RefreshCw,
  Inbox,
} from 'lucide-react';

interface HitlTaskItem {
  taskId: string;
  customerName: string;
  phone: string;
  requestedAction: string;
  reason: string;
  thresholdPolicy: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  createdAt: string;
  reviewedBy?: string;
}

export default function AdminHitlPage() {
  const [tasks, setTasks] = useState<HitlTaskItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const fetchQueue = useCallback(async () => {
    setIsLoading(true);
    setFeedback(null);
    try {
      const res = await fetch('/api/proxy/hitl/queue', {
        headers: { Accept: 'application/json' },
        cache: 'no-store',
      });

      if (!res.ok) {
        throw new Error(`Mã lỗi HTTP ${res.status}`);
      }

      const raw = await res.json();
      const list = Array.isArray(raw) ? raw : raw?.data || [];

      const mapped: HitlTaskItem[] = list.map((item: any) => ({
        taskId: item.task_id || item.approval_id || item.taskId || 'Chưa có thông tin',
        customerName: item.customer_name || item.customerName || 'Chưa có thông tin',
        phone: item.phone || 'Chưa có thông tin',
        requestedAction:
          item.requested_action ||
          item.requestedAction ||
          (item.tool_name ? `Thực thi công cụ: ${item.tool_name}` : 'Hành động vượt hạn mức'),
        reason: item.reason || 'Yêu cầu hành động nhạy cảm vượt hạn mức tự động của Agent',
        thresholdPolicy:
          item.threshold_policy ||
          item.thresholdPolicy ||
          'Chính sách phân cấp tài chính & HITL Gate theo Hiến pháp AGENTS.md',
        status: (item.status?.toUpperCase() || 'PENDING') as 'PENDING' | 'APPROVED' | 'REJECTED',
        createdAt: item.timestamp || item.created_at || item.createdAt || 'Vừa xong',
        reviewedBy: item.reviewed_by || item.reviewedBy,
      }));

      setTasks(mapped);
    } catch (err: any) {
      console.warn('[HITL Queue Fetch Warning]:', err.message);
      // Fallback empty list if backend has no pending tasks
      setTasks([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchQueue();
  }, [fetchQueue]);

  const handleReview = async (taskId: string, decision: 'approved' | 'rejected') => {
    setActionLoadingId(taskId);
    setFeedback(null);
    try {
      const res = await fetch('/api/proxy/hitl/review', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          task_id: taskId,
          decision,
          reviewer: 'Nguyễn Quản Trị (ADMIN-01)',
          reason: decision === 'approved' ? 'Quản lý phê duyệt thực thi' : 'Quản lý từ chối yêu cầu',
        }),
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.detail || errorData.message || `Lỗi xử lý ${res.status}`);
      }

      const data = await res.json();
      setFeedback({
        type: 'success',
        message: data.message || `Đã ${decision === 'approved' ? 'phê duyệt' : 'từ chối'} tác vụ [${taskId}].`,
      });

      // Update local state and refetch
      setTasks((prev) =>
        prev.map((t) =>
          t.taskId === taskId
            ? {
                ...t,
                status: decision === 'approved' ? 'APPROVED' : 'REJECTED',
                reviewedBy: 'Nguyễn Quản Trị (ADMIN-01)',
              }
            : t
        )
      );
    } catch (err: any) {
      setFeedback({
        type: 'error',
        message: `Không thể cập nhật tác vụ [${taskId}]: ${err.message}`,
      });
    } finally {
      setActionLoadingId(null);
    }
  };

  return (
    <BrandSectionBackground
      variant="soft-blue"
      pattern="dot"
      patternOpacity={0.05}
      withGlow={true}
      className="min-h-full p-6 sm:p-8 space-y-6"
    >
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
            <ShieldAlert className="w-5 h-5 text-rose-600" />
            Cổng Phê Duyệt Con Người — Human-in-the-Loop Gate (UC07)
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Hàng đợi kiểm duyệt thời gian thực các hành động nhạy cảm vượt hạn mức tự động của Agent theo Điều 10 Đạo luật AI và Hiến pháp AGENTS.md.
          </p>
        </div>

        <button
          type="button"
          onClick={fetchQueue}
          disabled={isLoading}
          className="ts-cta text-xs py-2 px-4 inline-flex items-center gap-1.5 self-start sm:self-auto"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
          <span>Làm Mới Hàng Đợi</span>
        </button>
      </div>

      {feedback && (
        <div
          className={`p-4 rounded-2xl text-xs font-bold flex items-center justify-between ${
            feedback.type === 'success' ? 'ts-badge-success text-emerald-800' : 'ts-badge-danger text-rose-800'
          }`}
        >
          <div className="flex items-center gap-2">
            {feedback.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            ) : (
              <XCircle className="w-4 h-4 text-rose-600 shrink-0" />
            )}
            <span>{feedback.message}</span>
          </div>
        </div>
      )}

      {isLoading && tasks.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center space-y-3 shadow-xs">
          <RefreshCw className="w-6 h-6 text-blue-600 animate-spin mx-auto" />
          <p className="text-xs text-slate-500 font-medium">Đang tải danh sách tác vụ từ hàng đợi HITL...</p>
        </div>
      ) : tasks.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center space-y-3 shadow-xs">
          <Inbox className="w-8 h-8 text-slate-300 mx-auto" />
          <h3 className="text-sm font-bold text-slate-800">Hàng đợi đang trống</h3>
          <p className="text-xs text-slate-500 max-w-md mx-auto">
            Không có tác vụ nào đang chờ phê duyệt. Mọi hành động của AI Agent hiện tại đều nằm trong hạn mức tự hành an toàn.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {tasks.map((task) => (
            <div key={task.taskId} className="ts-feature-card p-6 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-3">
                <div className="flex items-center gap-3">
                  <span className="font-mono text-xs font-bold text-blue-600">
                    {task.taskId}
                  </span>
                  <span
                    className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                      task.status === 'PENDING'
                        ? 'ts-badge-warning animate-pulse'
                        : task.status === 'APPROVED'
                        ? 'ts-badge-success'
                        : 'ts-badge-danger'
                    }`}
                  >
                    {task.status === 'PENDING'
                      ? 'Chờ Quản Lý Duyệt'
                      : task.status === 'APPROVED'
                      ? 'Đã Phê Duyệt'
                      : 'Đã Từ Chối'}
                  </span>
                </div>
                <span className="text-xs text-slate-400">Thời gian: {task.createdAt}</span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                <div className="space-y-2">
                  <div>
                    <span className="text-slate-400 block">Khách hàng &amp; SĐT:</span>
                    <span className="font-bold text-slate-800">{task.customerName} ({task.phone})</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block">Hành động yêu cầu:</span>
                    <span className="font-bold text-blue-700 text-sm">{task.requestedAction}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block">Lý do:</span>
                    <p className="text-slate-600">{task.reason}</p>
                  </div>
                </div>

                <div className="bg-slate-50 p-4 rounded-xl border border-slate-200/80 space-y-2">
                  <div>
                    <span className="text-slate-400 font-bold block mb-1">Căn cứ kích hoạt HITL:</span>
                    <p className="text-slate-600">{task.thresholdPolicy}</p>
                  </div>
                  {task.reviewedBy && (
                    <div className="pt-2 border-t border-slate-200 text-slate-500">
                      Người duyệt: <span className="font-semibold text-slate-800">{task.reviewedBy}</span>
                    </div>
                  )}
                </div>
              </div>

              {task.status === 'PENDING' && (
                <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-3">
                  <button
                    disabled={actionLoadingId === task.taskId}
                    onClick={() => handleReview(task.taskId, 'rejected')}
                    className="px-4 py-2 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 text-xs font-bold transition disabled:opacity-50"
                  >
                    {actionLoadingId === task.taskId ? 'Đang xử lý...' : 'Từ Chối Yêu Cầu'}
                  </button>
                  <button
                    disabled={actionLoadingId === task.taskId}
                    onClick={() => handleReview(task.taskId, 'approved')}
                    className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition shadow-xs disabled:opacity-50"
                  >
                    {actionLoadingId === task.taskId ? 'Đang xử lý...' : 'Phê Duyệt Cho Phép Thực Thi'}
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </BrandSectionBackground>
  );
}
