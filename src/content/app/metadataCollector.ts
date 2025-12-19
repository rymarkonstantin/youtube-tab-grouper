import { normalizeResolveCategoryMetadata } from "../../shared/categoryResolver";
import type { Metadata } from "../../shared/types";
import { extractVideoMetadata } from "../metadataExtractor";

export class MetadataCollector {
  collect(): Metadata {
    return normalizeResolveCategoryMetadata(extractVideoMetadata());
  }
}
