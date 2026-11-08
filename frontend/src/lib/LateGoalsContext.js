"use client";
import { createContext, useContext, useState } from "react";

const LateGoalsContext = createContext({
  lateCount: 0,
  setLateCount: () => {},
  streak: null,
  setStreak: () => {},
});

export function LateGoalsProvider({ children }) {
  const [lateCount, setLateCount] = useState(0);
  const [streak, setStreak] = useState(null);
  return (
    <LateGoalsContext.Provider
      value={{ lateCount, setLateCount, streak, setStreak }}
    >
      {children}
    </LateGoalsContext.Provider>
  );
}

export const useLateGoals = () => useContext(LateGoalsContext);
