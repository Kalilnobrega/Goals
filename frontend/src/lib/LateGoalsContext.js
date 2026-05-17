"use client";
import { createContext, useContext, useState } from "react";

const LateGoalsContext = createContext({
  lateCount: 0,
  setLateCount: () => {},
});

export function LateGoalsProvider({ children }) {
  const [lateCount, setLateCount] = useState(0);
  return (
    <LateGoalsContext.Provider value={{ lateCount, setLateCount }}>
      {children}
    </LateGoalsContext.Provider>
  );
}

export const useLateGoals = () => useContext(LateGoalsContext);
