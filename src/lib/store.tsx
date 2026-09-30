import { createContext, useContext } from "react";
import type { Member, Overview, Subscription } from "../../shared/types";

export interface AppContextValue {
  data: Overview;
  subsById: Map<number, Subscription>;
  reload: () => Promise<void>;
  toast: (message: string, tone?: "ok" | "error") => void;
  logout: () => Promise<void>;
  openMember: (id: number) => void;
  openRenew: (member: Member) => void;
  openMemberForm: (opts: { member?: Member; subscriptionId?: number }) => void;
  openSubscriptionForm: (sub?: Subscription) => void;
}

export const AppContext = createContext<AppContextValue | null>(null);

export function useApp(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used inside AppContext");
  return ctx;
}
