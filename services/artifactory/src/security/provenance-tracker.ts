/**
 * THE ARTIFACTORY — Provenance Tracker (SLSA Level 3)
 * Tracks artifact build provenance for supply chain integrity.
 * Part of the Trancendos Ecosystem.
 *
 * Implements SLSA (Supply-chain Levels for Software Artifacts)
 * provenance attestation, verification, and querying.
 *
 * @module security/provenance-tracker
 * @version 1.0.0
 */

import { createModuleLogger } from '../utils/logger.js';

const logger = createModuleLogger('provenance-tracker');

// ─── Types ───────────────────────────────────────────────────────────

export type SLSALevel = 0 | 1 | 2 | 3 | 4;

export interface BuildProvenance {
  id: string;
  artifactId: string;
  tenantId: string;
  subject: {
    name: string;
    digest: Record<string, string>; // { sha256: "...", sha512: "..." }
  };
  predicateType: string;
  predicate: {
    builder: {
      id: string;
      version?: string;
    };
    buildType: string;
    invocation: {
      configSource: {
        uri: string;
        digest: Record<string, string>;
        entryPoint: string;
      };
      parameters: Record<string, unknown>;
      environment?: Record<string, string>;
    };
    buildConfig?: Record<string, unknown>;
    metadata: {
      buildInvocationId: string;
      buildStartedOn: string;
      buildFinishedOn: string;
      completeness: {
        parameters: boolean;
        environment: boolean;
        materials: boolean;
      };
      reproducible: boolean;
    };
    materials: Array<{
      uri: string;
      digest: Record<string, string>;
    }>;
  };
  slsaLevel: SLSALevel;
  verified: boolean;
  verifiedAt?: string;
  verifiedBy?: string;
  attestation?: string;
  createdAt: string;
}

export interface ProvenanceQuery {
  artifactId?: string;
  tenantId?: string;
  builderId?: string;
  slsaLevel?: SLSALevel;
  verified?: boolean;
  since?: string;
  limit: number;
  offset: number;
}

export interface ProvenanceVerificationResult {
  valid: boolean;
  slsaLevel: SLSALevel;
  builder: string;
  buildTimestamp: string;
  sourceUri: string;
  materialCount: number;
  completeness: {
    parameters: boolean;
    environment: boolean;
    materials: boolean;
  };
  reproducible: boolean;
  errors: string[];
  warnings: string[];
}

// ─── Storage Interface ───────────────────────────────────────────────

export interface ProvenanceStore {
  saveProvenance(provenance: BuildProvenance): Promise<void>;
  getProvenance(artifactId: string): Promise<BuildProvenance | null>;
  queryProvenance(query: ProvenanceQuery): Promise<{
    records: BuildProvenance[];
    total: number;
  }>;
  deleteProvenance(artifactId: string): Promise<void>;
  updateVerification(
    artifactId: string,
    verified: boolean,
    verifiedBy: string
  ): Promise<void>;
}

// ─── Provenance Tracker ──────────────────────────────────────────────

export class ProvenanceTracker {
  private readonly store?: ProvenanceStore;
  private readonly trustedBuilders: Set<string>;
  private readonly requiredLevel: SLSALevel;

  constructor(options: {
    store?: ProvenanceStore;
    trustedBuilders?: string[];
    requiredLevel?: SLSALevel;
  } = {}) {
    this.store = options.store;
    this.trustedBuilders = new Set(options.trustedBuilders ?? [
      'https://github.com/Trancendos',
      'https://github.com/actions/runner',
      'https://cloudbuild.googleapis.com/GoogleHostedWorker',
    ]);
    this.requiredLevel = options.requiredLevel ?? 2;
  }

  /**
   * Record build provenance for an artifact.
   */
  async recordProvenance(
    artifactId: string,
    tenantId: string,
    attestation: {
      subject: BuildProvenance['subject'];
      builder: { id: string; version?: string };
      buildType: string;
      sourceUri: string;
      sourceDigest: Record<string, string>;
      entryPoint: string;
      parameters?: Record<string, unknown>;
      environment?: Record<string, string>;
      buildInvocationId: string;
      buildStartedOn: string;
      buildFinishedOn: string;
      materials: Array<{ uri: string; digest: Record<string, string> }>;
      reproducible?: boolean;
    }
  ): Promise<BuildProvenance> {
    const slsaLevel = this.assessSLSALevel(attestation);

    const provenance: BuildProvenance = {
      id: crypto.randomUUID(),
      artifactId,
      tenantId,
      subject: attestation.subject,
      predicateType: 'https://slsa.dev/provenance/v1',
      predicate: {
        builder: attestation.builder,
        buildType: attestation.buildType,
        invocation: {
          configSource: {
            uri: attestation.sourceUri,
            digest: attestation.sourceDigest,
            entryPoint: attestation.entryPoint,
          },
          parameters: attestation.parameters ?? {},
          environment: attestation.environment,
        },
        metadata: {
          buildInvocationId: attestation.buildInvocationId,
          buildStartedOn: attestation.buildStartedOn,
          buildFinishedOn: attestation.buildFinishedOn,
          completeness: {
            parameters: attestation.parameters !== undefined,
            environment: attestation.environment !== undefined,
            materials: attestation.materials.length > 0,
          },
          reproducible: attestation.reproducible ?? false,
        },
        materials: attestation.materials,
      },
      slsaLevel,
      verified: false,
      createdAt: new Date().toISOString(),
    };

    if (this.store) {
      await this.store.saveProvenance(provenance);
    }

    logger.info(
      {
        artifactId,
        slsaLevel,
        builder: attestation.builder.id,
        materialCount: attestation.materials.length,
      },
      'Build provenance recorded'
    );

    return provenance;
  }

  /**
   * Verify the provenance of an artifact.
   */
  async verifyProvenance(
    artifactId: string,
    expectedDigest: Record<string, string>
  ): Promise<ProvenanceVerificationResult> {
    let provenance: BuildProvenance | null = null;

    if (this.store) {
      provenance = await this.store.getProvenance(artifactId);
    }

    if (!provenance) {
      return {
        valid: false,
        slsaLevel: 0,
        builder: 'unknown',
        buildTimestamp: '',
        sourceUri: '',
        materialCount: 0,
        completeness: { parameters: false, environment: false, materials: false },
        reproducible: false,
        errors: ['No provenance record found for artifact'],
        warnings: [],
      };
    }

    const errors: string[] = [];
    const warnings: string[] = [];

    // Verify subject digest matches
    for (const [algo, hash] of Object.entries(expectedDigest)) {
      const provenanceHash = provenance.subject.digest[algo];
      if (!provenanceHash) {
        warnings.push(`Provenance missing ${algo} digest`);
      } else if (provenanceHash !== hash) {
        errors.push(
          `Digest mismatch for ${algo}: expected ${hash}, provenance has ${provenanceHash}`
        );
      }
    }

    // Verify builder is trusted
    if (!this.trustedBuilders.has(provenance.predicate.builder.id)) {
      warnings.push(
        `Builder "${provenance.predicate.builder.id}" is not in the trusted builders list`
      );
    }

    // Verify SLSA level meets requirements
    if (provenance.slsaLevel < this.requiredLevel) {
      errors.push(
        `SLSA level ${provenance.slsaLevel} does not meet required level ${this.requiredLevel}`
      );
    }

    // Verify build timestamps are reasonable
    const buildStart = new Date(provenance.predicate.metadata.buildStartedOn);
    const buildEnd = new Date(provenance.predicate.metadata.buildFinishedOn);
    if (buildEnd < buildStart) {
      errors.push('Build end time is before start time');
    }

    const buildDuration = buildEnd.getTime() - buildStart.getTime();
    if (buildDuration > 24 * 60 * 60 * 1000) {
      warnings.push('Build duration exceeds 24 hours — unusual');
    }

    // Verify completeness
    const completeness = provenance.predicate.metadata.completeness;
    if (!completeness.materials) {
      warnings.push('Build materials are incomplete');
    }

    const valid = errors.length === 0;

    // Update verification status
    if (this.store) {
      await this.store.updateVerification(
        artifactId,
        valid,
        'the-artifactory-provenance-verifier'
      );
    }

    const result: ProvenanceVerificationResult = {
      valid,
      slsaLevel: provenance.slsaLevel,
      builder: provenance.predicate.builder.id,
      buildTimestamp: provenance.predicate.metadata.buildStartedOn,
      sourceUri: provenance.predicate.invocation.configSource.uri,
      materialCount: provenance.predicate.materials.length,
      completeness,
      reproducible: provenance.predicate.metadata.reproducible,
      errors,
      warnings,
    };

    logger.info(
      {
        artifactId,
        valid,
        slsaLevel: provenance.slsaLevel,
        errorCount: errors.length,
      },
      'Provenance verification complete'
    );

    return result;
  }

  /**
   * Query provenance records.
   */
  async queryProvenance(query: Partial<ProvenanceQuery>): Promise<{
    records: BuildProvenance[];
    total: number;
  }> {
    if (!this.store) {
      return { records: [], total: 0 };
    }

    return this.store.queryProvenance({
      ...query,
      limit: query.limit ?? 50,
      offset: query.offset ?? 0,
    });
  }

  /**
   * Get the required SLSA level.
   */
  getRequiredLevel(): SLSALevel {
    return this.requiredLevel;
  }

  /**
   * Check if a builder is trusted.
   */
  isBuilderTrusted(builderId: string): boolean {
    return this.trustedBuilders.has(builderId);
  }

  /**
   * Add a trusted builder.
   */
  addTrustedBuilder(builderId: string): void {
    this.trustedBuilders.add(builderId);
    logger.info({ builderId }, 'Trusted builder added');
  }

  // ─── Private Methods ─────────────────────────────────────────────

  private assessSLSALevel(attestation: {
    builder: { id: string };
    sourceUri: string;
    sourceDigest: Record<string, string>;
    parameters?: Record<string, unknown>;
    environment?: Record<string, string>;
    materials: Array<{ uri: string; digest: Record<string, string> }>;
    reproducible?: boolean;
  }): SLSALevel {
    let level: SLSALevel = 0;

    // Level 1: Build process exists and produces provenance
    if (attestation.builder.id && attestation.sourceUri) {
      level = 1;
    }

    // Level 2: Hosted build service, authenticated provenance
    if (
      level >= 1 &&
      this.trustedBuilders.has(attestation.builder.id) &&
      Object.keys(attestation.sourceDigest).length > 0
    ) {
      level = 2;
    }

    // Level 3: Hardened build platform, non-falsifiable provenance
    if (
      level >= 2 &&
      attestation.materials.length > 0 &&
      attestation.materials.every(m => Object.keys(m.digest).length > 0) &&
      attestation.parameters !== undefined &&
      attestation.environment !== undefined
    ) {
      level = 3;
    }

    // Level 4: Hermetic, reproducible build
    if (level >= 3 && attestation.reproducible) {
      level = 4;
    }

    return level;
  }
}