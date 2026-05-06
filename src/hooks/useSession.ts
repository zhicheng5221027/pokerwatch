// Session lifecycle: creates a row in `sessions` on start, marks ended_at on stop.
// Falls back to a local UUID + console-only logging if Supabase is unconfigured.
import { useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { getDeviceId } from "@/lib/deviceId";
import { useSessionStore } from "@/store/session";
import { useSettings } from "@/store/settings";

function newId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `sess_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

export interface UseSessionReturn {
  id: string | null;
  isActive: boolean;
  start: () => Promise<string>;
  stop: () => Promise<void>;
}

export function useSession(): UseSessionReturn {
  const id = useSessionStore((s) => s.id);
  const isActive = useSessionStore((s) => s.isActive);
  const startSession = useSessionStore((s) => s.startSession);
  const endSession = useSessionStore((s) => s.endSession);
  const platform = useSettings((s) => s.platform);

  const start = useCallback(async (): Promise<string> => {
    const localId = newId();
    startSession(localId);

    // Best-effort cloud row. Don't block UI on it.
    try {
      const userId = getDeviceId();
      const { data, error } = await supabase
        .from("sessions")
        .insert({ id: localId, user_id: userId, platform })
        .select("id")
        .single();
      if (error) {
        console.warn("[useSession] insert failed; staying local-only", error.message);
      } else if (data?.id) {
        // server accepted our id; nothing else to do
      }
    } catch (e) {
      console.warn("[useSession] cloud insert threw", e);
    }
    return localId;
  }, [platform, startSession]);

  const stop = useCallback(async () => {
    const sid = useSessionStore.getState().id;
    endSession();
    if (!sid) return;
    try {
      const { error } = await supabase
        .from("sessions")
        .update({ ended_at: new Date().toISOString() })
        .eq("id", sid);
      if (error) {
        console.warn("[useSession] update on stop failed", error.message);
      }
    } catch (e) {
      console.warn("[useSession] cloud update threw", e);
    }
  }, [endSession]);

  return { id, isActive, start, stop };
}
