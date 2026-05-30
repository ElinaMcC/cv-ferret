import { useState, useRef, useEffect } from 'react';
import './InfoTip.css';

export default function InfoTip({ text }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    function handleClick(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  return (
    <span className="infotip" ref={ref}>
      <button
        type="button"
        className="infotip-trigger"
        onClick={() => setOpen(v => !v)}
        aria-label="More information"
        aria-expanded={open}
      >
        ℹ
      </button>
      {open && (
        <span className="infotip-bubble" role="tooltip">
          {text}
        </span>
      )}
    </span>
  );
}
