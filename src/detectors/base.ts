/** Base detector interface. All pathology detectors implement this. */

import type { Pathology } from "../models/findings.js";
import type { Finding } from "../models/findings.js";
import type { AgentLogBundle } from "../models/canonical.js";
import type { AgentDoctorConfig } from "../models/config.js";

export interface BaseDetector {
  readonly pathology: Pathology;
  readonly name: string;
  detect(bundle: AgentLogBundle, config: AgentDoctorConfig): Finding[];
}
