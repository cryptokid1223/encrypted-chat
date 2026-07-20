"use client";

import { createContext, useContext, type ReactNode, type RefObject } from "react";

const PhotoViewerHostContext = createContext<RefObject<HTMLDivElement | null> | null>(
  null,
);

export function PhotoViewerHostProvider({
  hostRef,
  children,
}: {
  hostRef: RefObject<HTMLDivElement | null>;
  children: ReactNode;
}) {
  return (
    <PhotoViewerHostContext.Provider value={hostRef}>
      {children}
    </PhotoViewerHostContext.Provider>
  );
}

export function usePhotoViewerHost(): RefObject<HTMLDivElement | null> | null {
  return useContext(PhotoViewerHostContext);
}
