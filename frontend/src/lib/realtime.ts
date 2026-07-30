/** Live sync: subscribe to the backend WebSocket and refresh affected queries.
 *
 * On a `unit_status` event we invalidate the shaxmatka tree so the grid
 * re-colors for every connected client — no polling, no manual refresh.
 */

import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { tokens } from "@/lib/api";

export function useRealtimeSync(): void {
  const qc = useQueryClient();

  useEffect(() => {
    const token = tokens.access;
    if (!token) return;

    let socket: WebSocket | null = null;
    let retryTimer: number | undefined;
    let disposed = false;

    const connect = () => {
      const proto = location.protocol === "https:" ? "wss" : "ws";
      socket = new WebSocket(`${proto}://${location.host}/api/ws?token=${token}`);

      socket.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.type === "unit_status") {
            qc.invalidateQueries({ queryKey: ["tree"] });
          } else if (msg.type === "lead_update") {
            qc.invalidateQueries({ queryKey: ["crm-board"] });
          }
        } catch {
          /* ignore malformed frames */
        }
      };

      // Reconnect with a short backoff unless we're tearing down.
      socket.onclose = () => {
        if (!disposed) retryTimer = window.setTimeout(connect, 2000);
      };
    };

    connect();

    return () => {
      disposed = true;
      window.clearTimeout(retryTimer);
      socket?.close();
    };
  }, [qc]);
}
