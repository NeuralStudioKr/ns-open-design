import { listProjects } from "../state/projects";
import type { Project } from "../types";
import { isTeamverEmbedMode } from "./designApiBase";
import {
  formatTeamverProjectRegistryErrorMessage,
  TeamverProjectRegistryError,
} from "./projectRegistry";

export type LoadProjectListResult =
  | { ok: true; projects: Project[] }
  | { ok: false; errorMessage: string };

/** Fetch daemon projects + embed registry filter; surface registry outages instead of silent []. */
export async function loadProjectListSafe(): Promise<LoadProjectListResult> {
  try {
    const projects = await listProjects();
    return { ok: true, projects };
  } catch (err) {
    if (isTeamverEmbedMode() && err instanceof TeamverProjectRegistryError) {
      return {
        ok: false,
        errorMessage: formatTeamverProjectRegistryErrorMessage(err.code),
      };
    }
    return { ok: true, projects: [] };
  }
}
