import { useState, useEffect } from 'react';

export function LiveClock() {
  const [time, setTime] = useState(() => new Date());

  useEffect(() => {
    const t = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const h = String(time.getUTCHours()).padStart(2, '0');
  const m = String(time.getUTCMinutes()).padStart(2, '0');
  const s = String(time.getUTCSeconds()).padStart(2, '0');
  const dateStr = time.toUTCString().slice(5, 11);

  return (
    <div className="topbar-clock">
      <span className="topbar-clock-time">{h}:{m}:{s}Z</span>
      <span className="topbar-clock-label">{dateStr} UTC</span>
    </div>
  );
}
