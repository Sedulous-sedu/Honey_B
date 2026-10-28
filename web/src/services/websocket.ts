import { useAtcStore } from '../store/useAtcStore';

let socket: WebSocket | null = null;
let reconnectTimer: any = null;
let reconnectAttempts = 0;

export function initWebSocket() {
  if (socket && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)) {
    return;
  }

  const host = window.location.hostname || 'localhost';
  const url = `ws://${host}:8000/ws?role=controller`;

  console.log(`[Honey B WS] Connecting to ${url}...`);
  socket = new WebSocket(url);

  socket.onopen = () => {
    console.log('[Honey B WS] Connected');
    useAtcStore.getState().setConnected(true);
    reconnectAttempts = 0;
  };

  socket.onmessage = (event) => {
    try {
      const envelope = JSON.parse(event.data);
      const { type, payload } = envelope;

      const store = useAtcStore.getState();

      if (type === 'state.snapshot') {
        store.applySnapshot(payload);
      } else if (type === 'aircraft.state') {
        store.updateAircraft(payload);
      } else if (type === 'weather.updated') {
        store.updateWeather(payload);
      } else if (type === 'command.issued') {
        store.addOrUpdateCommand(payload);
      } else if (type === 'command.status') {
        store.updateCommandStatus(payload);
      } else if (type === 'stand.updated') {
        store.updateStand(payload);
      } else if (type === 'ground.metrics') {
        store.updateMetricsAndLogs(payload);
      }
    } catch (err) {
      console.warn('[Honey B WS] Error parsing message:', err);
    }
  };

  socket.onclose = () => {
    console.log('[Honey B WS] Disconnected');
    useAtcStore.getState().setConnected(false);
    scheduleReconnect();
  };

  socket.onerror = (err) => {
    console.warn('[Honey B WS] Socket error:', err);
    socket?.close();
  };
}

function scheduleReconnect() {
  if (reconnectTimer) clearTimeout(reconnectTimer);
  const delay = Math.min(10000, 1000 * Math.pow(1.5, reconnectAttempts));
  reconnectAttempts++;
  reconnectTimer = setTimeout(() => {
    initWebSocket();
  }, delay);
}
