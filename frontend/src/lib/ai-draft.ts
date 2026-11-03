import type { AIPlan } from "./types";

type DraftTask = Omit<AIPlan["tasks"][number], "subtasks"> & {
  localId: string;
  subtasks: (AIPlan["tasks"][number]["subtasks"][number] & {
    localId: string;
  })[];
};
export type DraftPlan = Omit<AIPlan, "tasks"> & { tasks: DraftTask[] };

export function toDraft(plan: AIPlan): DraftPlan {
  return {
    ...plan,
    tasks: plan.tasks.map((task) => ({
      ...task,
      localId: crypto.randomUUID(),
      subtasks: task.subtasks.map((child) => ({
        ...child,
        localId: crypto.randomUUID(),
      })),
    })),
  };
}

export function toPlan(draft: DraftPlan): AIPlan {
  return {
    summary: draft.summary,
    tasks: draft.tasks.map((task) => ({
      title: task.title,
      description: task.description,
      estimated_hours: task.estimated_hours,
      priority: task.priority,
      required_skills: task.required_skills,
      subtasks: task.subtasks.map((child) => ({
        title: child.title,
        description: child.description,
        estimated_hours: child.estimated_hours,
      })),
    })),
  };
}
