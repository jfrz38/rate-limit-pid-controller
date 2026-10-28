import { readFileSync } from 'node:fs';

import { instantiate } from './generated/adaptive-admission.js';
import type {
  Action,
  AdmissionController as GeneratedController,
  Config,
  ControllerDiagnostics,
  ControllerError,
  Outcome,
  StatisticsSnapshot,
  Submission,
  SubmitError,
} from './generated/interfaces/jfrz38-adaptive-admission-controller.js';

export type ComponentAction = Action;
export type ComponentConfig = Config;
export type ComponentControllerDiagnostics = ControllerDiagnostics;
export type ComponentControllerError = ControllerError;
export type ComponentOutcome = Outcome;
export type ComponentStatisticsSnapshot = StatisticsSnapshot;
export type ComponentSubmission = Submission;
export type ComponentSubmitError = SubmitError;

function getCoreModule(path: string): WebAssembly.Module {
  const bytes = readFileSync(new URL(`./generated/${path}`, import.meta.url));
  return new WebAssembly.Module(bytes);
}

const root = instantiate(getCoreModule, {});
const component = root.controller;

export function defaultComponentConfig(): ComponentConfig {
  return component.defaultConfig();
}

export function createComponentController(configuration: ComponentConfig): GeneratedController {
  return component.create(configuration);
}

export function latestComponentDiagnostics(controller: GeneratedController): ComponentControllerDiagnostics {
  return controller.latestDiagnostics();
}

export function componentErrorPayload(error: unknown): unknown {
  if (typeof error === 'object' && error !== null && 'payload' in error) {
    return (error as { payload: unknown }).payload;
  }
  if (typeof error === 'object' && error !== null && 'tag' in error) {
    return error;
  }
  return undefined;
}
