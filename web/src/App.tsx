import React, { useEffect } from 'react';
import { useAtcStore } from './store/useAtcStore';
import { initWebSocket } from './services/websocket';
import { Header } from './components/Header';
import { Page1MainWall } from './components/Page1MainWall';
import { Page2Operations } from './components/Page2Operations';

export const App: React.FC = () => {
  const activePage = useAtcStore((s) => s.activePage);
  const setActiveControllerId = useAtcStore((s) => s.setActiveControllerId);

  useEffect(() => {
    // Check if ?controller=... in URL
    const params = new URLSearchParams(window.location.search);
    const ctrlParam = params.get('controller');
    if (ctrlParam) {
      setActiveControllerId(ctrlParam);
    }

    // Initialize real-time WebSocket connection to ground server
    initWebSocket();
  }, [setActiveControllerId]);

  return (
    <div className="w-screen h-screen flex flex-col bg-[#070B12] text-slate-100 overflow-hidden font-sans">
      <Header />
      {activePage === 'wall' ? <Page1MainWall /> : <Page2Operations />}
    </div>
  );
};
export default App;
