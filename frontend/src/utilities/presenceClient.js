import { io } from 'socket.io-client';

const API_BASE_URL = process.env.REACT_APP_BACKEND_URL || '';
const PRESENCE_CLIENT_ID_KEY = 'sb.presence.clientId';

let socket = null;

export const getOrCreateClientId = () => {
  let clientId = window.sessionStorage.getItem(PRESENCE_CLIENT_ID_KEY);
  if (!clientId) {
    clientId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    window.sessionStorage.setItem(PRESENCE_CLIENT_ID_KEY, clientId);
  }
  return clientId;
};

export const connectPresenceSocket = () => {
  if (socket) return socket;

  const clientId = getOrCreateClientId();

  socket = io(API_BASE_URL, {
    transports: ['websocket'],
    auth: { clientId },
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
  });

  socket.on('connect', () => {
    // optional debug
    console.log('Presence socket connected:', socket.id);
  });

  socket.on('disconnect', (reason) => {
    // optional debug
    console.log('Presence socket disconnected:', reason);
  });

  socket.on('connect_error', (error) => {
    console.error('Presence socket connect error:', error?.message || error);
  });

  return socket;
};

export const disconnectPresenceSocket = () => {
  if (!socket) return;
  socket.disconnect();
  socket = null;
};

export const getPresenceSocket = () => socket;