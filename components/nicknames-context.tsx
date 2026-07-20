"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import {
  deleteContactNickname,
  fetchContactNicknames,
  upsertContactNickname,
} from "@/lib/contact-nicknames";

type NicknamesContextValue = {
  nicknames: Record<string, string>;
  loaded: boolean;
  loadNicknames: () => Promise<Record<string, string>>;
  getNickname: (contactId: string) => string | null;
  setNicknameOptimistic: (contactId: string, nickname: string | null) => void;
  saveNickname: (
    contactId: string,
    nickname: string,
  ) => Promise<{ ok: true } | { ok: false; error: string }>;
  clearNickname: (
    contactId: string,
  ) => Promise<{ ok: true } | { ok: false; error: string }>;
};

const NicknamesContext = createContext<NicknamesContextValue | null>(null);

export function NicknamesProvider({ children }: { children: ReactNode }) {
  const [nicknames, setNicknames] = useState<Record<string, string>>({});
  const [loaded, setLoaded] = useState(false);

  const loadNicknames = useCallback(async () => {
    const map = await fetchContactNicknames();
    setNicknames(map);
    setLoaded(true);
    return map;
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const map = await fetchContactNicknames();
      if (cancelled) return;
      setNicknames(map);
      setLoaded(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const getNickname = useCallback(
    (contactId: string) => nicknames[contactId] ?? null,
    [nicknames],
  );

  const setNicknameOptimistic = useCallback(
    (contactId: string, nickname: string | null) => {
      setNicknames((prev) => {
        const next = { ...prev };
        if (!nickname?.trim()) {
          delete next[contactId];
        } else {
          next[contactId] = nickname.trim();
        }
        return next;
      });
    },
    [],
  );

  const saveNickname = useCallback(
    async (contactId: string, nickname: string) => {
      const trimmed = nickname.trim();
      const previous = nicknames[contactId] ?? null;
      setNicknameOptimistic(contactId, trimmed);

      const result = await upsertContactNickname(contactId, trimmed);
      if (!result.ok) {
        setNicknameOptimistic(contactId, previous);
      }
      return result;
    },
    [nicknames, setNicknameOptimistic],
  );

  const clearNickname = useCallback(
    async (contactId: string) => {
      const previous = nicknames[contactId] ?? null;
      setNicknameOptimistic(contactId, null);

      const result = await deleteContactNickname(contactId);
      if (!result.ok) {
        setNicknameOptimistic(contactId, previous);
      }
      return result;
    },
    [nicknames, setNicknameOptimistic],
  );

  return (
    <NicknamesContext.Provider
      value={{
        nicknames,
        loaded,
        loadNicknames,
        getNickname,
        setNicknameOptimistic,
        saveNickname,
        clearNickname,
      }}
    >
      {children}
    </NicknamesContext.Provider>
  );
}

export function useNicknames(): NicknamesContextValue {
  const ctx = useContext(NicknamesContext);
  if (!ctx) {
    throw new Error("useNicknames must be used within NicknamesProvider");
  }
  return ctx;
}
