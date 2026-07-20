"use client";

import { useEffect } from "react";
import { warmSodium } from "@/lib/crypto";

export function CryptoWarmup() {
  useEffect(() => {
    void warmSodium();
  }, []);

  return null;
}

