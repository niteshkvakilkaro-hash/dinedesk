import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useLocation } from 'react-router';
import { useTranslation } from 'react-i18next';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { MessageCircle, Send, X } from 'lucide-react';
import { api } from '@/lib/api';
import { usePublicConfig, whatsappUrl } from '@/lib/publicConfig';

interface Msg {
  role: 'visitor' | 'bot';
  text: string;
  wa?: string | null;
}
interface ChatReply {
  chat_id: string;
  reply: string;
  handoff: boolean;
  whatsapp_url: string | null;
}

const KEY = 'nb_help_chat';

function load(): { id: string | null; msgs: Msg[] } {
  try {
    return JSON.parse(sessionStorage.getItem(KEY) ?? '') as { id: string | null; msgs: Msg[] };
  } catch {
    return { id: null, msgs: [] };
  }
}

function WhatsAppIcon({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2Zm0 18.2c-1.5 0-3-.4-4.3-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2Zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8-.2-.1-.4-.1-.6.1l-.8 1c-.1.2-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.3-.4.2-.4.7-1.4.1-.2 0-.3 0-.5l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 0 0-.7.3c-.3.3-1 1-1 2.4s1 2.8 1.2 3c.1.2 2 3.1 4.9 4.3 1.8.8 2.5.8 3.4.7.6-.1 1.5-.6 1.7-1.2.2-.6.2-1.1.2-1.2-.1-.1-.3-.2-.5-.3Z" />
    </svg>
  );
}

/**
 * Help for visitors and businesses: a WhatsApp button and the NikoBite assistant (chats are saved
 * for the super admin, who follows up on WhatsApp). Hidden on full-screen work pages.
 */
export function HelpChat({ compact = false }: { compact?: boolean }) {
  const { t } = useTranslation();
  const reduce = useReducedMotion();
  const { pathname } = useLocation();
  const config = usePublicConfig().data;
  const [open, setOpen] = useState(false);
  const [{ id, msgs }, setChat] = useState(load);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    try {
      sessionStorage.setItem(KEY, JSON.stringify({ id, msgs: msgs.slice(-40) }));
    } catch {
      /* private mode: the chat just isn't kept across pages */
    }
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: reduce ? 'auto' : 'smooth' });
  }, [id, msgs, reduce]);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  const wa = config?.support.whatsapp;
  const waLink = whatsappUrl(wa, t('help.waText'));
  if (!config || (!wa && !config.support.chatbot)) return null;

  const send = async (message: string) => {
    const m = message.trim();
    if (!m || busy) return;
    setChat((c) => ({ ...c, msgs: [...c.msgs, { role: 'visitor', text: m }] }));
    setText('');
    setBusy(true);
    try {
      const r = (await api.post<ChatReply>('/support/chat', { chat_id: id, message: m, page: pathname })).data;
      setChat((c) => ({ id: r.chat_id, msgs: [...c.msgs, { role: 'bot', text: r.reply, wa: r.handoff ? r.whatsapp_url : null }] }));
    } catch (e) {
      setChat((c) => ({ ...c, msgs: [...c.msgs, { role: 'bot', text: (e as Error).message || t('help.error'), wa: waLink }] }));
    } finally {
      setBusy(false);
    }
  };
  const submit = (e: FormEvent) => {
    e.preventDefault();
    void send(text);
  };
  const quick = t('help.quick', { returnObjects: true }) as string[];

  return (
    <div className={`fixed z-50 flex flex-col items-end gap-3 ${compact ? 'bottom-4 right-4' : 'bottom-5 right-5'} print:hidden`}>
      <AnimatePresence>
        {open && (
          <motion.section
            role="dialog"
            aria-label={t('help.title')}
            initial={reduce ? false : { opacity: 0, y: 16, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, y: 16, scale: 0.97 }}
            transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
            className="flex h-[min(34rem,calc(100svh-7rem))] w-[min(23rem,calc(100vw-2.5rem))] flex-col overflow-hidden rounded-3xl border border-line bg-surface shadow-2xl shadow-ink/20"
          >
            <header className="flex items-center gap-3 bg-ink px-4 py-3.5 text-paper">
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-brand text-white">
                <MessageCircle className="h-5 w-5" aria-hidden="true" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="font-extrabold leading-tight">{t('help.title')}</p>
                <p className="flex items-center gap-1.5 text-xs text-paper/70">
                  <span className="h-1.5 w-1.5 rounded-full bg-[#4ade80]" aria-hidden="true" />
                  {t('help.subtitle')}
                </p>
              </div>
              <button type="button" onClick={() => setOpen(false)} className="rounded-full p-2 hover:bg-paper/10" aria-label={t('help.close')}>
                <X className="h-5 w-5" aria-hidden="true" />
              </button>
            </header>

            <div ref={listRef} className="flex-1 space-y-3 overflow-y-auto bg-paper px-4 py-4" aria-live="polite">
              <Bubble role="bot" text={t('help.greeting')} />
              {msgs.map((m, i) => (
                <Bubble key={i} role={m.role} text={m.text} wa={m.wa} waLabel={t('help.handoff')} />
              ))}
              {busy && (
                <p className="flex items-center gap-1 px-1 text-xs text-muted" role="status">
                  <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted" />
                  <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted [animation-delay:120ms]" />
                  <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted [animation-delay:240ms]" />
                  <span className="sr-only">{t('help.typing')}</span>
                </p>
              )}
              {msgs.length === 0 && config.support.chatbot && (
                <div className="flex flex-wrap gap-2 pt-1">
                  {quick.map((q) => (
                    <button key={q} type="button" onClick={() => void send(q)} className="rounded-full border border-brand/30 bg-surface px-3 py-1.5 text-sm font-semibold text-brand-strong transition-colors hover:bg-brand-soft">
                      {q}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {config.support.chatbot ? (
              <form onSubmit={submit} className="flex items-center gap-2 border-t border-line bg-surface p-3">
                <input
                  ref={inputRef}
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  maxLength={1000}
                  placeholder={t('help.placeholder')}
                  aria-label={t('help.placeholder')}
                  className="field-input !min-h-11 flex-1 !rounded-full"
                />
                <button type="submit" disabled={busy || !text.trim()} className="btn-brand !min-h-11 !w-11 !rounded-full !p-0" aria-label={t('help.send')}>
                  <Send className="h-4 w-4" aria-hidden="true" />
                </button>
              </form>
            ) : null}
            {waLink && (
              <a href={waLink} target="_blank" rel="noopener noreferrer" className="flex items-center justify-center gap-2 border-t border-line bg-[#e7f8ee] px-4 py-2.5 text-sm font-bold text-[#0f6b3a] hover:bg-[#d8f3e3]">
                <WhatsAppIcon className="h-4 w-4" />
                {t('help.whatsapp')}
              </a>
            )}
          </motion.section>
        )}
      </AnimatePresence>

      <div className="flex items-center gap-3">
        {waLink && !open && (
          <a href={waLink} target="_blank" rel="noopener noreferrer" className="flex h-12 w-12 items-center justify-center rounded-full bg-[#25d366] text-white shadow-lg shadow-black/20 transition-transform hover:scale-105" aria-label={t('help.whatsapp')}>
            <WhatsAppIcon className="h-6 w-6" />
          </a>
        )}
        {config.support.chatbot && (
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            aria-expanded={open}
            aria-label={open ? t('help.close') : t('help.open')}
            className="flex h-14 min-w-14 items-center justify-center gap-2 rounded-full bg-brand px-5 font-bold text-white shadow-xl shadow-brand/30 ring-2 ring-white/70 transition-transform hover:scale-[1.03]"
          >
            {open ? <X className="h-5 w-5" aria-hidden="true" /> : <MessageCircle className="h-5 w-5" aria-hidden="true" />}
            <span className={compact ? 'sr-only' : 'hidden sm:inline'}>{open ? t('help.close') : t('help.open')}</span>
          </button>
        )}
      </div>
    </div>
  );
}

function Bubble({ role, text, wa, waLabel }: { role: 'visitor' | 'bot'; text: string; wa?: string | null; waLabel?: string }) {
  const mine = role === 'visitor';
  // Links in the assistant's text become clickable.
  const parts = text.split(/(https?:\/\/[^\s]+)/g);
  return (
    <div className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
      <div className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed ${mine ? 'rounded-br-md bg-brand text-white' : 'rounded-bl-md border border-line bg-surface text-ink'}`}>
        <p className="whitespace-pre-wrap break-words">
          {parts.map((p, i) =>
            /^https?:\/\//.test(p) ? (
              <a key={i} href={p} className={`font-semibold underline ${mine ? 'text-white' : 'text-brand-strong'}`} target="_blank" rel="noopener noreferrer">
                {p.replace(/^https?:\/\//, '')}
              </a>
            ) : (
              <span key={i}>{p}</span>
            ),
          )}
        </p>
        {wa && waLabel && (
          <a href={wa} target="_blank" rel="noopener noreferrer" className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-[#25d366] px-3 py-1.5 text-xs font-bold text-white">
            <WhatsAppIcon className="h-3.5 w-3.5" />
            {waLabel}
          </a>
        )}
      </div>
    </div>
  );
}
