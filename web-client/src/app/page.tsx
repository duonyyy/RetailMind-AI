'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, Bot, Laptop, MessageCircle, Scale, Send, ShoppingBag, Sparkles } from 'lucide-react';

type Citation = { title?: string; statute?: string; page?: number; snippet?: string; content?: string };
type Message = { role: 'user' | 'assistant'; text: string; citations?: Citation[] };
const PENDING_OPERATION_KEY = 'retailmind.pending-operation.v1';

export default function Home() {
  const [query, setQuery] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);
  const [pendingOperation, setPendingOperation] = useState<string | null>(null);
  const [restored, setRestored] = useState(false);
  const session = useRef<string | null>(null);

  useEffect(() => {
    setPendingOperation(localStorage.getItem(PENDING_OPERATION_KEY));
    setRestored(true);
  }, []);

  async function checkPendingOperation() {
    if (!pendingOperation || loading) return;
    setLoading(true);
    try {
      const res = await fetch('/api/proxy/chat/operation-status', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ operation_id: pendingOperation }),
      });
      const data = await res.json();
      if (res.ok && data.outcome === 'confirmed') {
        localStorage.removeItem(PENDING_OPERATION_KEY);
        setPendingOperation(null);
        setMessages(previous => [...previous, { role: 'assistant', text: 'Core xác nhận thao tác trước đã thực hiện. Bạn có thể kiểm tra trạng thái tương ứng trong tài khoản.' }]);
      } else {
        setMessages(previous => [...previous, { role: 'assistant', text: 'Chưa xác định được kết quả. Vui lòng liên hệ hỗ trợ để đối soát trước khi thực hiện lại.' }]);
      }
    } catch {
      setMessages(previous => [...previous, { role: 'assistant', text: 'Chưa thể kết nối để đối soát. Vui lòng thử kiểm tra lại sau.' }]);
    } finally { setLoading(false); }
  }

  async function ask(text: string) {
    const question = text.trim();
    if (!question || loading || pendingOperation || !restored) return;
    const operationId = crypto.randomUUID();
    localStorage.setItem(PENDING_OPERATION_KEY, operationId);
    setPendingOperation(operationId);
    setQuery('');
    setMessages(previous => [...previous, { role: 'user', text: question }]);
    setLoading(true);
    try {
      const response = await fetch('/api/proxy/chat/stream', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: question, operation_id: operationId, ...(session.current ? { session_id: session.current } : {}) }),
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
          if (event.type === 'session' && typeof event.session_id === 'string') session.current = event.session_id;
          if (event.type === 'answer' && typeof event.content === 'string') { answer = event.content; finalStatus = event.status; }
          if (event.type === 'citations' && Array.isArray(event.data)) citations = event.data;
          if (event.type === 'error') answer = event.message || 'Không thể xử lý câu hỏi lúc này.';
        } catch { /* Ignore malformed stream events. */ }
      };
      while (true) {
        const { done, value } = await reader.read();
        buffer += decoder.decode(value, { stream: !done });
        const lines = buffer.split(/\r?\n/);
        buffer = lines.pop() || '';
        lines.forEach(processLine);
        if (done) { processLine(buffer); break; }
      }
      if (answer && finalStatus && finalStatus !== 'unknown_outcome') {
        localStorage.removeItem(PENDING_OPERATION_KEY);
        setPendingOperation(null);
      }
      setMessages(previous => [...previous, { role: 'assistant', text: answer || 'Trợ lý chưa trả về câu trả lời. Vui lòng thử lại.', citations }]);
    } catch {
      setMessages(previous => [...previous, { role: 'assistant', text: 'Hiện không thể kết nối trợ lý. Vui lòng thử lại sau.' }]);
    } finally { setLoading(false); }
  }

  return (
    <div className="bg-[#f7f9fc] min-h-full">
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-8 sm:py-10">
        <section className="relative overflow-hidden rounded-[28px] bg-[#102d53] text-white p-7 sm:p-12 lg:p-14">
          <div className="absolute right-0 top-0 h-72 w-72 rounded-full bg-cyan-400/10 blur-3xl" aria-hidden="true" />
          <div className="relative grid gap-10 lg:grid-cols-[1.2fr_0.8fr] lg:items-center">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1.5 text-xs font-semibold text-cyan-100"><Sparkles className="h-3.5 w-3.5" /> MUA SẮM THÔNG MINH HƠN</div>
              <h1 className="mt-6 max-w-xl text-4xl font-bold leading-[1.12] tracking-tight sm:text-5xl">Tìm chiếc laptop <span className="text-cyan-300">phù hợp với bạn.</span></h1>
              <p className="mt-5 max-w-lg text-sm leading-7 text-slate-300 sm:text-base">Từ học tập, công việc đến sáng tạo, RetailMind giúp bạn khám phá lựa chọn và tìm hiểu thông tin dễ dàng hơn.</p>
              <div className="mt-8 flex flex-wrap gap-3">
                <Link href="/catalog" className="inline-flex items-center gap-2 rounded-xl bg-white px-5 py-3 text-sm font-bold text-slate-900 transition hover:bg-cyan-50">Khám phá laptop <ArrowRight className="h-4 w-4" /></Link>
                <a href="#tro-ly" className="inline-flex items-center gap-2 rounded-xl border border-white/25 px-5 py-3 text-sm font-semibold text-white transition hover:bg-white/10"><MessageCircle className="h-4 w-4" /> Hỏi trợ lý AI</a>
              </div>
            </div>
            <div className="hidden lg:block rounded-3xl border border-white/15 bg-white/10 p-6 backdrop-blur-sm">
              <div className="flex items-center gap-3"><div className="rounded-2xl bg-cyan-300 p-3 text-slate-900"><Laptop className="h-6 w-6" /></div><div><p className="font-semibold">Lựa chọn theo nhu cầu</p><p className="mt-1 text-xs text-slate-300">Bắt đầu với điều quan trọng với bạn</p></div></div>
              <div className="mt-7 grid grid-cols-2 gap-3">{['Học tập & văn phòng', 'Thiết kế & sáng tạo', 'Giải trí & gaming', 'Mỏng nhẹ & di động'].map(item => <div key={item} className="rounded-xl border border-white/10 bg-white/5 px-4 py-4 text-sm font-medium text-slate-100">{item}</div>)}</div>
            </div>
          </div>
        </section>

        <section className="mt-10" aria-labelledby="explore-heading">
          <div className="flex items-end justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-[0.16em] text-blue-600">BẮT ĐẦU TỪ ĐÂY</p><h2 id="explore-heading" className="mt-2 text-2xl font-bold tracking-tight text-slate-900">Bạn muốn làm gì hôm nay?</h2></div></div>
          <div className="mt-5 grid gap-4 md:grid-cols-3">
            {[{ href: '/catalog', icon: Laptop, title: 'Khám phá sản phẩm', desc: 'Tìm laptop theo nhu cầu và ngân sách.' }, { href: '/compare', icon: Scale, title: 'So sánh laptop', desc: 'Đặt các lựa chọn cạnh nhau để dễ cân nhắc.' }, { href: '/orders', icon: ShoppingBag, title: 'Đơn hàng của tôi', desc: 'Xem thông tin đơn hàng trong tài khoản của bạn.' }].map(({ href, icon: Icon, title, desc }) => <Link key={href} href={href} className="group rounded-2xl border border-slate-200 bg-white p-6 transition hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-lg hover:shadow-slate-200/60"><div className="flex items-start justify-between"><span className="rounded-xl bg-blue-50 p-3 text-blue-600"><Icon className="h-5 w-5" /></span><ArrowRight className="h-4 w-4 text-slate-400 transition group-hover:translate-x-1 group-hover:text-blue-600" /></div><h3 className="mt-6 font-bold text-slate-900">{title}</h3><p className="mt-2 text-sm leading-6 text-slate-500">{desc}</p></Link>)}
          </div>
        </section>

        <section id="tro-ly" className="mt-10 grid scroll-mt-6 gap-6 rounded-3xl border border-slate-200 bg-white p-6 sm:p-8 lg:grid-cols-[0.8fr_1.2fr]" aria-labelledby="assistant-heading">
          <div><div className="inline-flex rounded-xl bg-cyan-50 p-3 text-cyan-700"><Bot className="h-6 w-6" /></div><p className="mt-5 text-xs font-bold uppercase tracking-[0.16em] text-blue-600">TRỢ LÝ RETAILMIND</p><h2 id="assistant-heading" className="mt-2 text-2xl font-bold tracking-tight">Bạn cần tư vấn?</h2><p className="mt-3 max-w-sm text-sm leading-6 text-slate-500">Chia sẻ nhu cầu sử dụng hoặc đặt câu hỏi để bắt đầu cuộc trò chuyện.</p><div className="mt-5 flex flex-wrap gap-2">{['Laptop cho sinh viên', 'Chọn RAM bao nhiêu là đủ?'].map(s => <button key={s} type="button" disabled={loading} onClick={() => ask(s)} className="rounded-full border border-slate-200 px-3 py-2 text-xs font-medium text-slate-600 hover:border-blue-300 hover:text-blue-700 disabled:opacity-50">{s}</button>)}</div></div>
          <div className="flex min-h-[250px] flex-col rounded-2xl bg-slate-50 p-4 sm:p-5"><div className="flex-1 space-y-3" aria-live="polite"><div className="max-w-[90%] rounded-2xl rounded-tl-sm bg-white p-4 text-sm leading-6 text-slate-700 shadow-sm">Xin chào! Bạn đang tìm laptop cho nhu cầu nào?</div>{messages.map((message, index) => <div key={index} className={`max-w-[90%] whitespace-pre-wrap rounded-2xl p-4 text-sm leading-6 ${message.role === 'user' ? 'ml-auto rounded-tr-sm bg-blue-600 text-white' : 'rounded-tl-sm bg-white text-slate-700 shadow-sm'}`}>{message.text}{!!message.citations?.length && <div className="mt-3 border-t border-slate-200 pt-3 text-xs text-slate-500"><p className="font-semibold">Nguồn tham khảo</p>{message.citations.map((citation, i) => <p key={i} className="mt-2">{citation.title || citation.statute || 'Tài liệu'}{citation.page != null ? ` · Trang ${citation.page}` : ''}{citation.snippet || citation.content ? `: ${citation.snippet || citation.content}` : ''}</p>)}</div>}</div>)}{loading && <p className="text-sm text-slate-500" role="status">Đang tìm câu trả lời...</p>}</div>{pendingOperation && !loading && <div className="mt-4 text-sm text-amber-800"><p>Kết quả yêu cầu trước chưa được xác nhận. Hãy kiểm tra trước khi gửi yêu cầu mới.</p><p className="mt-1 break-all text-xs">Mã đối soát: {pendingOperation}</p><button type="button" onClick={() => void checkPendingOperation()} className="mt-2 font-semibold underline">Kiểm tra kết quả</button></div>}<form className="mt-5 flex gap-2" onSubmit={e => { e.preventDefault(); void ask(query); }}><label htmlFor="assistant-query" className="sr-only">Câu hỏi của bạn</label><input id="assistant-query" value={query} maxLength={4000} onChange={e => setQuery(e.target.value)} placeholder="Nhập câu hỏi của bạn..." className="min-w-0 flex-1 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100" /><button disabled={loading || !!pendingOperation || !restored || !query.trim()} className="rounded-xl bg-blue-600 px-4 text-white hover:bg-blue-700 disabled:opacity-50" aria-label="Gửi câu hỏi"><Send className="h-4 w-4" /></button></form></div>
        </section>
        <footer className="py-8 text-xs text-slate-500">© RetailMind AI · Đồng hành cùng lựa chọn của bạn</footer>
      </div>
    </div>
  );
}
