import { CheckCircle2, Info, X, XCircle } from 'lucide-react';
import React, { useEffect, useRef } from 'react';
import '../styles/Toast.css';

interface ToastProps {
  message: string;
  type: 'success' | 'error' | 'info';
  onClose: () => void;
}

const ICONS = {
  success: CheckCircle2,
  error: XCircle,
  info: Info,
};

const Toast: React.FC<ToastProps> = ({ message, type, onClose }) => {
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  useEffect(() => {
    const timer = setTimeout(() => onCloseRef.current(), 3000);
    return () => clearTimeout(timer);
  }, []);

  const Icon = ICONS[type];

  return (
    <div className={`toast toast-${type}`} role={type === 'error' ? 'alert' : 'status'}>
      <span className="toast-icon" aria-hidden="true">
        <Icon size={18} />
      </span>
      <span className="toast-message">{message}</span>
      <button className="toast-close" onClick={onClose} aria-label="Dismiss">
        <X size={16} />
      </button>
    </div>
  );
};

export default Toast;
