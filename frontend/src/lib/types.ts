export type User = {
  id: number;
  name: string;
  email: string;
  username: string;
  active: boolean;
};
export type Workspace = {
  id: number;
  name: string;
  description: string;
  owner_id: number;
};
export type Member = {
  user_id: number;
  name: string;
  email: string;
  username: string;
  role: string;
  capacity_hours: number;
};
export type Project = {
  id: number;
  workspace_id: number;
  name: string;
  description: string;
  status: string;
  start_date?: string;
  end_date?: string;
};
export type Column = {
  id: number;
  project_id: number;
  name: string;
  position: number;
  is_done: boolean;
};
export type Task = {
  id: number;
  project_id: number;
  column_id: number;
  title: string;
  description: string;
  priority: string;
  assignee_id: number | null;
  reporter_id: number;
  estimated_hours: number;
  actual_hours: number;
  estimate_source: string;
  due_date: string | null;
  position: number;
  version: number;
};
export type Paged<T> = {
  items: T[];
  total: number;
  page: number;
  size: number;
};
export type SkillMatrix = {
  skills: { id: number; name: string }[];
  levels: { skill_id: number; user_id: number; level: number }[];
};
export type Workload = {
  start: string;
  end: string;
  members: {
    user_id: number;
    capacity_hours: number;
    assigned_hours: number;
    percentage: number | null;
    task_count: number;
    status: string;
  }[];
};
export type Analytics = {
  total_tasks: number;
  completed_tasks: number;
  overdue_tasks: number;
  completion_rate: number;
  by_status: Record<string, number>;
  by_priority: Record<string, number>;
  estimated_hours: number;
  actual_hours: number;
  mape: number | null;
  ai_mape: number | null;
  human_mape: number | null;
};
export type AIPlan = {
  summary: string;
  tasks: {
    title: string;
    description: string;
    estimated_hours: number;
    priority: string;
    required_skills: string[];
    subtasks: { title: string; description: string; estimated_hours: number }[];
  }[];
};
export type ProjectDocument = {
  id: number;
  project_id: number;
  filename: string;
  media_type: string;
  size_bytes: number;
  uploaded_by: number;
  created_at: string;
};
