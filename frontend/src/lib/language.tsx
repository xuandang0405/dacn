"use client";
import { createContext, useContext, useEffect, useState } from "react";
import { messageText } from "./messages";

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
  NO_CAPACITY: ["Chưa có năng lực khả dụng", "No capacity"],
  BUSY: ["Bận", "Busy"],
  OWNER: ["Chủ sở hữu", "Owner"],
  ADMIN: ["Quản trị viên", "Administrator"],
  MEMBER: ["Thành viên", "Member"],
  BACKLOG: ["Danh sách chờ", "Backlog"],
  TODO: ["Cần làm", "To do"],
  IN_PROGRESS: ["Đang thực hiện", "In progress"],
  REVIEW: ["Đang kiểm tra", "Review"],
  DONE: ["Hoàn thành", "Done"],
  HUMAN: ["Con người", "Human"],
  "task.created": ["Tạo công việc", "Task created"],
  "task.updated": ["Cập nhật công việc", "Task updated"],
  "task.assigned": ["Phân công công việc", "Task assigned"],
  "task.moved": ["Di chuyển công việc", "Task moved"],
  "task.completed": ["Hoàn thành công việc", "Task completed"],
  "task.deleted": ["Xóa công việc", "Task deleted"],
  "project.created": ["Tạo dự án", "Project created"],
  "comment.created": ["Thêm bình luận", "Comment added"],
  "member.role_changed": ["Đổi vai trò thành viên", "Member role changed"],
  task: ["Công việc", "Task"],
  project: ["Dự án", "Project"],
  comment: ["Bình luận", "Comment"],
  user: ["Tài khoản", "Account"],
  task_assigned: ["Phân công", "Assignment"],
  role_changed: ["Thay đổi vai trò", "Role change"],
  invitation: ["Lời mời", "Invitation"],
  mention: ["Nhắc tên", "Mention"],
  task_overdue: ["Quá hạn", "Overdue"],
  deadline_soon: ["Sắp đến hạn", "Upcoming deadline"],
};
export function enumLabel(value: string, language: Language) {
  return labels[value]?.[language === "vi" ? 0 : 1] || value;
}
type LanguageContextValue = {
  language: Language;
  setLanguage: (language: Language) => void;
  t: (vietnamese: string, english: string) => string;
  message: (value: string) => string;
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
        message: (value) => messageText(value, language),
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
    <fieldset className="language-switch" aria-label="Language / Ngôn ngữ">
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
    </fieldset>
  );
}
