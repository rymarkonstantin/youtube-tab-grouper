import { buildNormalizedMetadata } from "../../shared/metadataSchema";
import type { Metadata } from "../../shared/types";
import { extractVideoMetadata } from "../metadataExtractor";

export class MetadataCollector {
  collect(): Metadata {
    return buildNormalizedMetadata(extractVideoMetadata());
  }
}
