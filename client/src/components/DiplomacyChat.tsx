'use client';

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { getDiplomacyMessages, sendDiplomacyMessage } from '../services/api';
import { useGameSocket } from '../hooks/useGameSocket';
import Username from './Username';

interface ChatMessage {
	id: number;
	content: string;
	createdAt: string;
	user: { id: number; username: string; isSupporter?: boolean; supporterTier?: string | null };
}

interface Props {
	treatyId: number;
	currentUserId?: number;
	partnerFactionName: string;
	onClose: () => void;
}

export default function DiplomacyChat({
	treatyId,
	currentUserId,
	partnerFactionName,
	onClose
}: Props) {
	const [messages, setMessages] = useState<ChatMessage[]>([]);
	const [draft, setDraft] = useState('');
	const [sending, setSending] = useState(false);
	const [loadingOlder, setLoadingOlder] = useState(false);
	const [hasOlder, setHasOlder] = useState(true);
	const [error, setError] = useState('');
	const bottomRef = useRef<HTMLDivElement>(null);
	const listRef = useRef<HTMLDivElement>(null);
	const isFirstLoad = useRef(true);

	const fetchInitial = useCallback(async () => {
		try {
			const res = await getDiplomacyMessages(treatyId);
			const data: ChatMessage[] = res.data;
			setMessages(data);
			if (data.length < 50) setHasOlder(false);
		} catch {
			setError('Failed to load messages');
		}
	}, [treatyId]);

	useEffect(() => {
		fetchInitial();
		isFirstLoad.current = true;
	}, [fetchInitial]);

	useEffect(() => {
		if (isFirstLoad.current && messages.length > 0) {
			bottomRef.current?.scrollIntoView({ behavior: 'instant' });
			isFirstLoad.current = false;
		}
	}, [messages]);

	const appendMessage = useCallback(
		(incomingTreatyId: number, msg: ChatMessage) => {
			if (incomingTreatyId !== treatyId) return;
			setMessages((prev) => {
				if (prev.some((m) => m.id === msg.id)) return prev;
				return [...prev, msg];
			});
			const list = listRef.current;
			if (list) {
				const nearBottom = list.scrollHeight - list.scrollTop - list.clientHeight < 120;
				if (nearBottom)
					setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 50);
			}
		},
		[treatyId]
	);

	useGameSocket({ onDiplomacyChat: appendMessage });

	const loadOlder = async () => {
		if (!hasOlder || loadingOlder || messages.length === 0) return;
		setLoadingOlder(true);
		const oldestId = messages[0].id;
		const list = listRef.current;
		const prevScrollHeight = list?.scrollHeight ?? 0;
		try {
			const res = await getDiplomacyMessages(treatyId, oldestId);
			const older: ChatMessage[] = res.data;
			if (older.length < 50) setHasOlder(false);
			setMessages((prev) => [...older, ...prev]);
			requestAnimationFrame(() => {
				if (list) list.scrollTop = list.scrollHeight - prevScrollHeight;
			});
		} catch {
			setError('Failed to load older messages');
		} finally {
			setLoadingOlder(false);
		}
	};

	const handleSend = async (e: React.FormEvent) => {
		e.preventDefault();
		const trimmed = draft.trim();
		if (!trimmed || sending) return;
		setSending(true);
		setError('');
		try {
			const res = await sendDiplomacyMessage(treatyId, trimmed);
			const msg: ChatMessage = res.data;
			setMessages((prev) => {
				if (prev.some((m) => m.id === msg.id)) return prev;
				return [...prev, msg];
			});
			setDraft('');
			setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 50);
		} catch (err) {
			setError(
				(err as { response?: { data?: { error?: string } } }).response?.data?.error ||
					'Failed to send'
			);
		} finally {
			setSending(false);
		}
	};

	const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
		if (e.key === 'Enter' && !e.shiftKey) {
			e.preventDefault();
			handleSend(e as unknown as React.FormEvent);
		}
	};

	const formatTime = (iso: string) =>
		new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

	const formatDate = (iso: string) => {
		const d = new Date(iso);
		const today = new Date();
		const yesterday = new Date(today);
		yesterday.setDate(today.getDate() - 1);
		if (d.toDateString() === today.toDateString()) return 'Today';
		if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
		return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
	};

	const grouped: { date: string; messages: ChatMessage[] }[] = [];
	for (const msg of messages) {
		const label = formatDate(msg.createdAt);
		if (!grouped.length || grouped[grouped.length - 1].date !== label) {
			grouped.push({ date: label, messages: [msg] });
		} else {
			grouped[grouped.length - 1].messages.push(msg);
		}
	}

	return (
		<div className="diplomacy-chat">
			<div className="diplomacy-chat-header">
				<span className="diplomacy-chat-title">Diplomatic Channel - {partnerFactionName}</span>
				<button className="diplomacy-chat-close" onClick={onClose} title="Close">
					✕
				</button>
			</div>

			<div className="faction-chat-messages diplomacy-chat-messages" ref={listRef}>
				{hasOlder && (
					<button className="faction-chat-load-older" onClick={loadOlder} disabled={loadingOlder}>
						{loadingOlder ? 'Loading...' : 'Load older messages'}
					</button>
				)}

				{messages.length === 0 && !hasOlder && (
					<div className="faction-chat-empty">No messages yet. Open the diplomatic channel!</div>
				)}

				{grouped.map((group) => (
					<div key={group.date}>
						<div className="faction-chat-date-divider">
							<span>{group.date}</span>
						</div>
						{group.messages.map((msg, i) => {
							const isMine = msg.user.id === currentUserId;
							const prev = group.messages[i - 1];
							const showAuthor = !prev || prev.user.id !== msg.user.id;
							return (
								<div
									key={msg.id}
									className={`faction-chat-msg${isMine ? ' faction-chat-msg--mine' : ''}`}
								>
									{showAuthor && (
										<div className="faction-chat-author">
											<Username
												name={msg.user.username}
												isSupporter={msg.user.isSupporter}
												supporterTier={msg.user.supporterTier as any}
												className="faction-chat-username"
											/>
											<span className="faction-chat-time">{formatTime(msg.createdAt)}</span>
										</div>
									)}
									<div className="faction-chat-bubble">{msg.content}</div>
								</div>
							);
						})}
					</div>
				))}
				<div ref={bottomRef} />
			</div>

			{error && <div className="faction-chat-error">{error}</div>}

			<form className="faction-chat-form" onSubmit={handleSend}>
				<textarea
					className="faction-chat-input"
					value={draft}
					onChange={(e) => setDraft(e.target.value)}
					onKeyDown={handleKeyDown}
					placeholder="Send a diplomatic message… (Enter to send)"
					rows={2}
					maxLength={1000}
					disabled={sending}
				/>
				<button type="submit" className="faction-chat-send" disabled={sending || !draft.trim()}>
					{sending ? '…' : 'Send'}
				</button>
			</form>
		</div>
	);
}
