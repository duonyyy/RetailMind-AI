'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import Link from 'next/link';
import { ArrowRight, Bot, Laptop, MessageCircle, Scale, Send, ShoppingBag, Sparkles, RefreshCw, XCircle } from 'lucide-react';
import { useCurrentUser } from '@/features/auth/useCurrentUser';

type Citation = { title?: string; statute?: string; page?: number; snippet?: string; content?: string };
type Message = { role: 'user' | 'assistant'; text: string; citations?: Citation[] };

const getStorageKey = (userId?: string) => `retailmind.pending-operation.${userId || 'guest'}`;

export default function Home() {
  const { user } = useCurrentUser();
  const [query, setQuery] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);
  const [pendingOperation, setPendingOperation] = useState<string | null>(null);
  const [restored, setRestored] = useState(false);
  const session = useRef<string | null>(null);

  // Synchronize pending operation key scoped to user account
  useEffect(() => {
    const key = getStorageKey(user?.id);
    setPendingOperation(localStorage.getItem(key));
    setRestored(true);
  }, [user]);

  const checkPendingOperation = async () => {
    if (!pendingOperation || loading) return;
    setLoading(true);
    const key = getStorageKey(user?.id);
    try {
      const res = await fetch('/api/proxy/chat/operation-status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ operation_id: pendingOperation }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.outcome === 'confirmed') {
        localStorage.removeItem(key);
        setPendingOperation(null);
        setMessages((previous) => [
          ...previous,
          {
            role: 'assistant',
            text: 'Core API đã xác nhận thao tác trước đã được thực thi thành công. Bạn có thể kiểm tra trạng thái tương ứng trong tài khoản.',
          },
        ]);
      } else {
        setMessages((previous) => [
          ...previous,
          {
            role: 'assistant',
            text: 'Chưa thể đối soát kết quả thao tác từ máy chủ. Nếu đây là câu hỏi tư vấn chỉ đọc, bạn có thể chọn "Bỏ qua & tiếp tục tư vấn" bên dưới để tiếp tục hỏi đáp.',
          },
        ]);
      }
    } catch {
      setMessages((previous) => [
        ...previous,
        {
          role: 'assistant',
          text: 'Chưa thể kết nối để đối soát. Nếu đây là câu hỏi tìm kiếm hoặc tư vấn (chỉ đọc), bạn có thể mở khóa để tiếp tục.',
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const handleDismissPendingOperation = () => {
    const key = getStorageKey(user?.id);
    localStorage.removeItem(key);
    setPendingOperation(null);
    setMessages((prev) => [
      ...prev,
      {
        role: 'assistant',
        text: 'Đã mở khóa phiên trò chuyện. (Lưu ý: Core API hiện chưa hỗ trợ biên nhận lưu vết durable per-request receipt cho mọi yêu cầu hội thoại).',
      },
    ]);
  };

  async function ask(text: string) {
    const question = text.trim();
    if (!question || loading || pendingOperation || !restored) return;
    const operationId = crypto.randomUUID();
    const key = getStorageKey(user?.id);
    localStorage.setItem(key, operationId);
    setPendingOperation(operationId);
    setQuery('');
    setMessages((previous) => [...previous, { role: 'user', text: question }]);
    setLoading(true);
    try {
      const response = await fetch('/api/proxy/chat/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: question,
          operation_id: operationId,
          ...(session.current ? { session_id: session.current } : {}),
        }),
      });
      if (!response.ok || !response.body) throw new Error('unavailable');
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let answer = '';
      let citations: Citation[] = [];
      let finalStatus: string | undefined;

      const processLine = (line: string) => {
        if (!line.startsWith('data:')) return;
        const data = line.slice(5).trim();
        if (!data || data === '[DONE]') return;
        try {
          const event = JSON.parse(data);
          if (event.type === 'session' && typeof event.session_id === 'string') {
            session.current = event.resumable ? event.session_id : null;
          }
          if (event.type === 'answer' && typeof event.content === 'string') {
            answer = event.content;
            finalStatus = event.status;
          }
          if (event.type === 'citations' && Array.isArray(event.data)) {
            citations = event.data;
          }
          if (event.type === 'error') {
            answer = event.message || 'Không thể xử lý câu hỏi lúc này.';
          }
        } catch {
          // Ignore malformed stream events
        }
      };

      while (true) {
        const { done, value } = await reader.read();
        buffer += decoder.decode(value, { stream: !done });
        const lines = buffer.split(/\r?\n/);
        buffer = lines.pop() || '';
        for (const line of lines) {
          processLine(line);
        }
        if (done) {
          if (buffer.trim()) processLine(buffer);
          break;
        }
      }

      if (answer && finalStatus && finalStatus !== 'unknown_outcome') {
        localStorage.removeItem(key);
        setPendingOperation(null);
      }
      setMessages((previous) => [
        ...previous,
        {
          role: 'assistant',
          text: answer || 'Trợ lý chưa trả về câu trả lời. Vui lòng thử lại.',
          citations,
        },
      ]);
    } catch {
      setMessages((previous) => [
        ...previous,
        {
          role: 'assistant',
          text: 'Hiện không thể kết nối tới trợ lý. Vui lòng thử lại sau.',
        },
      ]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="bg-[#f7f9fc] min-h-full">
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-8 sm:py-10 space-y-10">
        {/* Hero Section */}
        <section className="relative overflow-hidden rounded-[28px] bg-[#102d53] text-white p-7 sm:p-12 lg:p-14">
          <div className="absolute right-0 top-0 h-72 w-72 rounded-full bg-cyan-400/10 blur-3xl" aria-hidden="true" />
          <div className="relative grid gap-10 lg:grid-cols-[1.2fr_0.8fr] lg:items-center">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1.5 text-xs font-semibold text-cyan-100">
                <Sparkles className="h-3.5 w-3.5" /> MUA SẮM THÔNG MINH HƠN
              </div>
              <h1 className="mt-6 max-w-xl text-4xl font-bold leading-[1.12] tracking-tight sm:text-5xl">
                Tìm chiếc laptop <span className="text-cyan-300">phù hợp với bạn.</span>
              </h1>
              <p className="mt-5 max-w-lg text-sm leading-7 text-slate-300 sm:text-base">
                Từ học tập, công việc đến sáng tạo nội dung, RetailMind giúp bạn khám phá lựa chọn và tìm hiểu thông số một cách dễ dàng và minh bạch.
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <Link
                  href="/catalog"
                  className="inline-flex items-center gap-2 rounded-xl bg-white px-5 py-3 text-sm font-bold text-slate-900 transition hover:bg-cyan-50 shadow-xs"
                >
                  Khám phá laptop <ArrowRight className="h-4 w-4" />
                </Link>
                <a
                  href="#tro-ly"
                  className="inline-flex items-center gap-2 rounded-xl border border-white/25 px-5 py-3 text-sm font-semibold text-white transition hover:bg-white/10"
                >
                  <MessageCircle className="h-4 w-4" /> Hỏi trợ lý AI
                </a>
              </div>
            </div>
            <div className="hidden lg:block rounded-3xl border border-white/15 bg-white/10 p-6 backdrop-blur-xs">
              <div className="flex items-center gap-3">
                <div className="rounded-2xl bg-cyan-300 p-3 text-slate-900">
                  <Laptop className="h-6 w-6" />
                </div>
                <div>
                  <p className="font-semibold">Lựa chọn theo nhu cầu</p>
                  <p className="mt-1 text-xs text-slate-300">Bắt đầu với điều quan trọng với bạn</p>
                </div>
              </div>
              <div className="mt-7 grid grid-cols-2 gap-3">
                {['Học tập & văn phòng', 'Thiết kế & sáng tạo', 'Giải trí & gaming', 'Mỏng nhẹ & di động'].map(
                  (item) => (
                    <div
                      key={item}
                      className="rounded-xl border border-white/10 bg-white/5 px-4 py-4 text-sm font-medium text-slate-100"
                    >
                      {item}
                    </div>
                  )
                )}
              </div>
            </div>
          </div>
        </section>

        {/* Feature Cards */}
        <section aria-labelledby="explore-heading">
          <div className="flex items-end justify-between gap-4">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-blue-600">BẮT ĐẦU TỪ ĐÂY</p>
              <h2 id="explore-heading" className="mt-2 text-2xl font-bold tracking-tight text-slate-900">
                Bạn muốn làm gì hôm nay?
              </h2>
            </div>
          </div>
          <div className="mt-5 grid gap-4 md:grid-cols-3">
            {[
              {
                href: '/catalog',
                icon: Laptop,
                title: 'Khám phá sản phẩm',
                desc: 'Tìm laptop chính hãng theo nhu cầu và ngân sách của bạn.',
              },
              {
                href: '/compare',
                icon: Scale,
                title: 'So sánh laptop',
                desc: 'Đặt các lựa chọn cạnh nhau để dễ dàng đối chiếu thông số.',
              },
              {
                href: '/orders',
                icon: ShoppingBag,
                title: 'Đơn hàng của tôi',
                desc: 'Theo dõi tiến độ đơn hàng và thông tin bảo hành đã xác nhận.',
              },
            ].map(({ href, icon: Icon, title, desc }) => (
              <Link
                key={href}
                href={href}
                className="group rounded-2xl border border-slate-200 bg-white p-6 transition hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-lg hover:shadow-slate-200/60"
              >
                <div className="flex items-start justify-between">
                  <span className="rounded-xl bg-blue-50 p-3 text-blue-600">
                    <Icon className="h-5 w-5" />
                  </span>
                  <ArrowRight className="h-4 w-4 text-slate-400 transition group-hover:translate-x-1 group-hover:text-blue-600" />
                </div>
                <h3 className="mt-6 font-bold text-slate-900">{title}</h3>
                <p className="mt-2 text-sm leading-6 text-slate-500">{desc}</p>
              </Link>
            ))}
          </div>
        </section>

        {/* AI Assistant Section */}
        <section
          id="tro-ly"
          className="grid scroll-mt-6 gap-6 rounded-3xl border border-slate-200 bg-white p-6 sm:p-8 lg:grid-cols-[0.8fr_1.2fr]"
          aria-labelledby="assistant-heading"
        >
          <div>
            <div className="inline-flex rounded-xl bg-cyan-50 p-3 text-cyan-700">
              <Bot className="h-6 w-6" />
            </div>
            <p className="mt-5 text-xs font-bold uppercase tracking-[0.16em] text-blue-600">
              TRỢ LÝ TƯ VẤN RETAILMIND
            </p>
            <h2 id="assistant-heading" className="mt-2 text-2xl font-bold tracking-tight text-slate-900">
              Bạn cần tư vấn thiết bị?
            </h2>
            <p className="mt-3 max-w-sm text-sm leading-6 text-slate-500">
              Chia sẻ nhu cầu sử dụng hoặc đặt câu hỏi để nhận gợi ý laptop phù hợp.
            </p>
            <div className="mt-5 flex flex-wrap gap-2">
              {['Laptop cho sinh viên kinh tế', 'Laptop đồ họa mỏng nhẹ', 'Chọn RAM bao nhiêu là đủ?'].map(
                (s) => (
                  <button
                    key={s}
                    type="button"
                    disabled={loading}
                    onClick={() => ask(s)}
                    className="rounded-full border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:border-blue-300 hover:text-blue-700 disabled:opacity-50 transition"
                  >
                    {s}
                  </button>
                )
              )}
            </div>
          </div>

          <div className="flex min-h-[300px] flex-col rounded-2xl bg-slate-50 p-4 sm:p-5 border border-slate-200">
            <div className="flex-1 space-y-3 overflow-y-auto max-h-[400px] pr-1" aria-live="polite">
              <div className="max-w-[90%] rounded-2xl rounded-tl-sm bg-white p-4 text-sm leading-6 text-slate-700 shadow-xs border border-slate-100">
                Xin chào! Tôi có thể giúp bạn tìm mẫu laptop phù hợp với nhu cầu và ngân sách của bạn. Bạn đang quan tâm đến dòng máy nào?
              </div>
              {messages.map((message, index) => (
                <div
                  key={index}
                  className={`max-w-[90%] whitespace-pre-wrap rounded-2xl p-4 text-sm leading-6 ${
                    message.role === 'user'
                      ? 'ml-auto rounded-tr-sm bg-blue-600 text-white shadow-xs'
                      : 'rounded-tl-sm bg-white text-slate-700 shadow-xs border border-slate-100'
                  }`}
                >
                  {message.text}
                  {!!message.citations?.length && (
                    <div className="mt-3 border-t border-slate-200 pt-3 text-xs text-slate-500">
                      <p className="font-semibold text-slate-700">Tài liệu tham khảo:</p>
                      {message.citations.map((citation, i) => (
                        <p key={i} className="mt-1">
                          {citation.title || citation.statute || 'Tài liệu'}
                          {citation.page != null ? ` · Trang ${citation.page}` : ''}
                          {citation.snippet || citation.content
                            ? `: ${citation.snippet || citation.content}`
                            : ''}
                        </p>
                      ))}
                    </div>
                  )}
                </div>
              ))}
              {loading && (
                <div className="flex items-center gap-2 text-xs font-semibold text-slate-500 py-1" role="status">
                  <RefreshCw className="w-3.5 h-3.5 animate-spin text-blue-600" />
                  <span>Đang phân tích và tìm câu trả lời...</span>
                </div>
              )}
            </div>

            {/* Pending Operation Recovery Banner */}
            {pendingOperation && !loading && (
              <div className="mt-4 p-3.5 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-900 space-y-2">
                <p className="font-semibold">
                  Kết quả yêu cầu trước chưa được xác nhận bởi hệ thống.
                </p>
                <p className="text-[11px] text-amber-800 break-all">
                  Mã đối soát: <code className="font-mono font-bold">{pendingOperation}</code>
                </p>
                <div className="flex flex-wrap items-center gap-3 pt-1">
                  <button
                    type="button"
                    onClick={() => void checkPendingOperation()}
                    className="font-bold underline text-amber-900 hover:text-amber-950"
                  >
                    Kiểm tra kết quả
                  </button>
                  <span className="text-slate-300">|</span>
                  <button
                    type="button"
                    onClick={handleDismissPendingOperation}
                    className="font-semibold text-slate-600 hover:text-slate-900 underline"
                  >
                    Bỏ qua &amp; tiếp tục tư vấn
                  </button>
                </div>
              </div>
            )}

            {/* Query Input Form */}
            <form
              className="mt-4 flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                void ask(query);
              }}
            >
              <label htmlFor="assistant-query" className="sr-only">
                Câu hỏi của bạn
              </label>
              <input
                id="assistant-query"
                value={query}
                maxLength={4000}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Nhập câu hỏi hoặc nhu cầu của bạn..."
                className="min-w-0 flex-1 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              />
              <button
                type="submit"
                disabled={loading || !!pendingOperation || !restored || !query.trim()}
                className="rounded-xl bg-blue-600 px-4 text-white hover:bg-blue-700 disabled:opacity-50 transition flex items-center justify-center"
                aria-label="Gửi câu hỏi"
              >
                <Send className="h-4 w-4" />
              </button>
            </form>
          </div>
        </section>

        {/* Footer */}
        <footer className="py-6 text-xs text-slate-400 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-3">
          <span>© RetailMind AI · Nền tảng tư vấn và thương mại bán lẻ</span>
          <Link href="/status" className="text-slate-500 hover:text-blue-600 transition">
            Trạng thái hệ thống →
          </Link>
        </footer>
      </div>
    </div>
  );
}
