"use client";
import { createContext, useContext, useEffect, useState } from "react";

export type Language = "vi" | "en";
const labels: Record<string, [string, string]> = {
  LOW: ["Thấp", "Low"],
  MEDIUM: ["Trung bình", "Medium"],
  HIGH: ["Cao", "High"],
  URGENT: ["Khẩn cấp", "Urgent"],
  PLANNING: ["Lên kế hoạch", "Planning"],
  ACTIVE: ["Đang hoạt động", "Active"],
  ON_HOLD: ["Tạm dừng", "On hold"],
  COMPLETED: ["Hoàn thành", "Completed"],
  ARCHIVED: ["Lưu trữ", "Archived"],
  OVERLOADED: ["Quá tải", "Overloaded"],
  NORMAL: ["Bình thường", "Normal"],
  UNDERUTILIZED: ["Còn khả năng", "Underutilized"],
};
export function enumLabel(value: string, language: Language) {
  return labels[value]?.[language === "vi" ? 0 : 1] || value;
}
type LanguageContextValue = {
  language: Language;
  setLanguage: (language: Language) => void;
  t: (vietnamese: string, english: string) => string;
};
const LanguageContext = createContext<LanguageContextValue | null>(null);

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [language, setLanguage] = useState<Language>("vi");
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    const saved = localStorage.getItem("language");
    if (saved === "vi" || saved === "en") setLanguage(saved);
    setLoaded(true);
  }, []);
  useEffect(() => {
    if (!loaded) return;
    document.documentElement.lang = language;
    localStorage.setItem("language", language);
  }, [language, loaded]);
  return (
    <LanguageContext.Provider
      value={{
        language,
        setLanguage,
        t: (vi, en) => (language === "vi" ? vi : en),
      }}
    >
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const value = useContext(LanguageContext);
  if (!value) throw new Error("LanguageProvider is missing");
  return value;
}

export function LanguageSwitch() {
  const { language, setLanguage } = useLanguage();
  return (
    <div
      className="language-switch"
      role="group"
      aria-label="Language / Ngôn ngữ"
    >
      <button
        type="button"
        aria-pressed={language === "vi"}
        onClick={() => setLanguage("vi")}
      >
        VI
      </button>
      <button
        type="button"
        aria-pressed={language === "en"}
        onClick={() => setLanguage("en")}
      >
        EN
      </button>
    </div>
  );
}
