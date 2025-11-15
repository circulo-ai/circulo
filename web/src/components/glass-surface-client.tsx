"use client";

import dynamic from "next/dynamic";

export const GlassSurfaceClient = dynamic(() => import("./glass-surface"), {
  ssr: false,
});
