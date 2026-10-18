"use client";

import { type ReactNode, useState } from "react";

import { Tabs } from "./charts/Tabs";

/** Switches between server-rendered views of the same data (e.g. table vs. chart). */
export function ViewSwitch({ views }: { views: { key: string; label: string; node: ReactNode }[] }) {
  const [key, setKey] = useState(views[0].key);
  return (
    <div>
      <Tabs options={views.map((v) => ({ key: v.key, label: v.label }))} value={key} onChange={setKey} />
      {views.map((v) => (
        <div key={v.key} hidden={v.key !== key}>
          {v.node}
        </div>
      ))}
    </div>
  );
}
