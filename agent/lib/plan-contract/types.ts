// ── Plan data types ─────────────────────────────────────────────────

export interface PlanHeader {
  goal: string;
  architectureSummary: string;
  techStack: string;
}

export interface FileStructureEntry {
  path: string;
  action: "Create" | "Modify";
  description: string;
}

export interface PlanTask {
  number: number;
  title: string;
  files: {
    create: string[];
    modify: string[];
    test: string[];
  };
  steps: string[];
  acceptanceCriteria: string[];
  modelRecommendation: "cheap" | "standard" | "capable" | null;
}

/** Task number -> dependency task numbers. */
export type PlanDependencies = Map<number, number[]>;

export interface Plan {
  header: PlanHeader;
  fileStructure: FileStructureEntry[];
  tasks: PlanTask[];
  dependencies: PlanDependencies;
  risks: string;
  testCommand: string | null;
  rawContent: string;
  sourceTodoId: string | null;
  fileName: string;
}
