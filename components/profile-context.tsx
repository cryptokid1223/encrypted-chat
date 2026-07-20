"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { DEFAULT_AVATAR_ID } from "@/lib/avatars";
import { createClient } from "@/lib/supabase/client";

type ProfileContextValue = {
  avatarId: string;
  username: string;
  setAvatarId: (id: string) => void;
  refreshProfile: () => Promise<void>;
};

const ProfileContext = createContext<ProfileContextValue | null>(null);

async function fetchProfile(): Promise<{
  avatarId: string;
  username: string;
}> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { avatarId: DEFAULT_AVATAR_ID, username: "" };
  }

  const { data } = await supabase
    .from("profiles")
    .select("avatar_id, username")
    .eq("id", user.id)
    .maybeSingle();

  return {
    avatarId: (data?.avatar_id as string | undefined) ?? DEFAULT_AVATAR_ID,
    username: (data?.username as string | undefined) ?? "",
  };
}

export function ProfileProvider({ children }: { children: ReactNode }) {
  const [avatarId, setAvatarId] = useState(DEFAULT_AVATAR_ID);
  const [username, setUsername] = useState("");

  const refreshProfile = useCallback(async () => {
    const profile = await fetchProfile();
    setAvatarId(profile.avatarId);
    setUsername(profile.username);
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const profile = await fetchProfile();
      if (cancelled) return;
      setAvatarId(profile.avatarId);
      setUsername(profile.username);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <ProfileContext.Provider
      value={{ avatarId, username, setAvatarId, refreshProfile }}
    >
      {children}
    </ProfileContext.Provider>
  );
}

export function useProfile(): ProfileContextValue {
  const ctx = useContext(ProfileContext);
  if (!ctx) {
    throw new Error("useProfile must be used within ProfileProvider");
  }
  return ctx;
}
