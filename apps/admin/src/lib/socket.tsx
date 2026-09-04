import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { createSocket, deviceId, type JumaahSocket } from '@jumaah/ui';
import type { ServerToClientEvents } from '@jumaah/shared';
import { getSession } from '../api';
import { useAuth } from '../auth/AuthProvider';

const SocketContext = createContext<JumaahSocket | null>(null);

/** One admin socket per (token, tenant). Re-reads the access token on connect errors so refreshes are picked up. */
export function SocketProvider({ children }: { children: ReactNode }) {
  const { session, tenantId } = useAuth();
  const [socket, setSocket] = useState<JumaahSocket | null>(null);
  const token = session?.accessToken ?? null;

  useEffect(() => {
    if (!token || !tenantId) {
      setSocket(null);
      return;
    }
    const s = createSocket({ token, deviceId: deviceId(), tenantId });
    s.on('connect_error', () => {
      const cur = getSession();
      if (cur?.accessToken) s.auth = { token: cur.accessToken, deviceId: deviceId(), tenantId };
    });
    setSocket(s);
    return () => {
      s.removeAllListeners();
      s.disconnect();
    };
  }, [token, tenantId]);

  return <SocketContext.Provider value={socket}>{children}</SocketContext.Provider>;
}

export function useSocket(): JumaahSocket | null {
  return useContext(SocketContext);
}

/** Subscribe to one server event for the lifetime of the component. */
export function useSocketEvent<E extends keyof ServerToClientEvents>(event: E, handler: ServerToClientEvents[E]): void {
  const socket = useSocket();
  useEffect(() => {
    if (!socket) return;
    socket.on(event, handler as never);
    return () => {
      socket.off(event, handler as never);
    };
  }, [socket, event, handler]);
}

export function useSocketConnected(): boolean {
  const socket = useSocket();
  const [connected, setConnected] = useState(socket?.connected ?? false);
  useEffect(() => {
    if (!socket) {
      setConnected(false);
      return;
    }
    setConnected(socket.connected);
    const on = () => setConnected(true);
    const off = () => setConnected(false);
    socket.on('connect', on);
    socket.on('disconnect', off);
    return () => {
      socket.off('connect', on);
      socket.off('disconnect', off);
    };
  }, [socket]);
  return connected;
}
