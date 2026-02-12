import { useEffect, useRef, useState, useCallback } from "react";

interface AnalysisUpdate {
  jobId: string;
  phase: string;
  status: "pending" | "processing" | "completed" | "error";
  payload?: any;
  error?: string;
}

const MIN_RECONNECT_DELAY = 1000;
const MAX_RECONNECT_DELAY = 30000;

export function useWebSocket(onMessage?: (update: AnalysisUpdate) => void) {
  const wsRef = useRef<WebSocket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout>();
  const reconnectDelayRef = useRef(MIN_RECONNECT_DELAY);
  const onMessageRef = useRef(onMessage);

  // Keep ref up to date without causing reconnects
  onMessageRef.current = onMessage;

  useEffect(() => {
    let unmounted = false;

    const connect = () => {
      if (unmounted) return;

      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      const wsUrl = `${protocol}//${window.location.host}/ws`;

      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        console.log("WebSocket connected");
        setIsConnected(true);
        reconnectDelayRef.current = MIN_RECONNECT_DELAY; // Reset on success
      };

      ws.onmessage = (event) => {
        try {
          const update: AnalysisUpdate = JSON.parse(event.data);
          onMessageRef.current?.(update);
        } catch (error) {
          console.error("Failed to parse WebSocket message:", error);
        }
      };

      ws.onerror = (error) => {
        console.error("WebSocket error:", error);
      };

      ws.onclose = () => {
        console.log("WebSocket disconnected");
        setIsConnected(false);

        if (unmounted) return;

        // Exponential backoff with jitter
        const delay = reconnectDelayRef.current;
        const jitter = delay * 0.3 * Math.random();
        reconnectTimeoutRef.current = setTimeout(() => {
          reconnectDelayRef.current = Math.min(delay * 2, MAX_RECONNECT_DELAY);
          connect();
        }, delay + jitter);
      };
    };

    connect();

    return () => {
      unmounted = true;
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, []); // Stable — uses refs for callbacks

  const sendMessage = useCallback((message: any) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(message));
      return true;
    }
    return false;
  }, []);

  const cancelJob = useCallback((jobId: string) => {
    return sendMessage({ type: "cancel", jobId });
  }, [sendMessage]);

  return { isConnected, sendMessage, cancelJob };
}
