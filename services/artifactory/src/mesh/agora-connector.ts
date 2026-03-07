/**
 * THE ARTIFACTORY — Agora Connector
 * Integration with the-agora (Community & Collaboration Hub).
 * Port: 3017
 *
 * Publishes artifact activity feeds, enables community reviews,
 * and surfaces artifact documentation to the collaboration layer.
 *
 * @module mesh/agora-connector
 * @version 1.0.0
 */

import { BaseMeshConnector, createMeshServiceConfig, type MeshResponse } from './base-connector.js';

interface ArtifactActivityEvent {
  artifactId: string;
  artifactName: string;
  artifactType: string;
  version: string;
  action: 'published' | 'promoted' | 'quarantined' | 'deprecated' | 'deleted';
  tenantId: string;
  actor: string;
  timestamp: string;
  metadata?: Record<string, unknown>;
}

interface ArtifactReview {
  artifactId: string;
  reviewerId: string;
  rating: number;
  comment: string;
  tags: string[];
}

interface ArtifactDocumentation {
  artifactId: string;
  artifactName: string;
  version: string;
  readme: string;
  changelog?: string;
  examples?: string[];
  apiDocs?: string;
}

export class AgoraConnector extends BaseMeshConnector {
  constructor(baseUrl: string) {
    super(createMeshServiceConfig('the-agora', baseUrl, 3017));
  }

  /**
   * Publish an artifact activity event to the community feed.
   */
  async publishActivity(event: ArtifactActivityEvent): Promise<MeshResponse> {
    return this.request('POST', '/api/v1/feeds/artifacts', {
      body: event,
    });
  }

  /**
   * Fetch community reviews for an artifact.
   */
  async getReviews(artifactId: string): Promise<MeshResponse<ArtifactReview[]>> {
    return this.request<ArtifactReview[]>('GET', `/api/v1/artifacts/${artifactId}/reviews`);
  }

  /**
   * Publish artifact documentation to the community knowledge base.
   */
  async publishDocumentation(docs: ArtifactDocumentation): Promise<MeshResponse> {
    return this.request('POST', '/api/v1/knowledge/artifacts', {
      body: docs,
    });
  }

  /**
   * Notify the-agora of a new package available for community use.
   */
  async announcePackage(announcement: {
    artifactName: string;
    version: string;
    description: string;
    tenantId: string;
    tags: string[];
    category: string;
  }): Promise<MeshResponse> {
    return this.request('POST', '/api/v1/announcements', {
      body: { ...announcement, source: 'the-artifactory' },
    });
  }
}