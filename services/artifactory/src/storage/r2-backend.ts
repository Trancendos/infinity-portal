/**
 * Cloudflare R2 Storage Backend
 * 
 * S3-compatible implementation targeting Cloudflare R2.
 * Zero egress fees. 10GB free tier. Works with any S3-compatible
 * storage (MinIO for local dev, AWS S3 as fallback).
 * 
 * Storage layout:
 *   {bucket}/tenants/{tenantId}/{artifactType}/{repository}/{name}/{version}/{contentHash}
 */

import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  DeleteObjectCommand,
  DeleteObjectsCommand,
  ListObjectsV2Command,
  CopyObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { getConfig } from '../config/environment.js';
import { createModuleLogger } from '../utils/logger.js';
import type {
  StorageBackend,
  PutOptions,
  GetResult,
  HeadResult,
  ListOptions,
  ListResult,
} from './backend.js';

const log = createModuleLogger('storage:r2');

export class R2StorageBackend implements StorageBackend {
  private client: S3Client;
  private bucket: string;

  constructor() {
    const config = getConfig();
    this.bucket = config.R2_BUCKET;

    this.client = new S3Client({
      endpoint: config.R2_ENDPOINT,
      region: config.R2_REGION,
      credentials: {
        accessKeyId: config.R2_ACCESS_KEY_ID,
        secretAccessKey: config.R2_SECRET_ACCESS_KEY,
      },
      forcePathStyle: true,
    });

    log.info({ bucket: this.bucket, endpoint: config.R2_ENDPOINT }, 'R2 storage backend initialised');
  }

  async put(key: string, data: Buffer, options?: PutOptions): Promise<void> {
    const startTime = Date.now();

    try {
      await this.client.send(new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: data,
        ContentType: options?.contentType || 'application/octet-stream',
        CacheControl: options?.cacheControl || 'public, max-age=31536000, immutable',
        Metadata: options?.metadata || {},
      }));

      const duration = Date.now() - startTime;
      log.info({ key, size: data.length, duration }, 'Blob stored');
    } catch (error) {
      log.error({ key, error }, 'Failed to store blob');
      throw new StorageError(`Failed to store blob: ${key}`, error);
    }
  }

  async get(key: string): Promise<GetResult> {
    const startTime = Date.now();

    try {
      const response = await this.client.send(new GetObjectCommand({
        Bucket: this.bucket,
        Key: key,
      }));

      const bodyArray = await response.Body?.transformToByteArray();
      if (!bodyArray) {
        throw new StorageError(`Empty response body for key: ${key}`);
      }

      const data = Buffer.from(bodyArray);
      const duration = Date.now() - startTime;

      log.debug({ key, size: data.length, duration }, 'Blob retrieved');

      return {
        data,
        contentType: response.ContentType || 'application/octet-stream',
        size: response.ContentLength || data.length,
        etag: response.ETag || '',
        metadata: (response.Metadata as Record<string, string>) || {},
        lastModified: response.LastModified || new Date(),
      };
    } catch (error: any) {
      if (error?.name === 'NoSuchKey' || error?.$metadata?.httpStatusCode === 404) {
        throw new StorageNotFoundError(`Blob not found: ${key}`);
      }
      log.error({ key, error }, 'Failed to retrieve blob');
      throw new StorageError(`Failed to retrieve blob: ${key}`, error);
    }
  }

  async head(key: string): Promise<HeadResult | null> {
    try {
      const response = await this.client.send(new HeadObjectCommand({
        Bucket: this.bucket,
        Key: key,
      }));

      return {
        size: response.ContentLength || 0,
        contentType: response.ContentType || 'application/octet-stream',
        etag: response.ETag || '',
        metadata: (response.Metadata as Record<string, string>) || {},
        lastModified: response.LastModified || new Date(),
      };
    } catch (error: any) {
      if (error?.name === 'NotFound' || error?.$metadata?.httpStatusCode === 404) {
        return null;
      }
      log.error({ key, error }, 'Failed to head blob');
      throw new StorageError(`Failed to head blob: ${key}`, error);
    }
  }

  async delete(key: string): Promise<void> {
    try {
      await this.client.send(new DeleteObjectCommand({
        Bucket: this.bucket,
        Key: key,
      }));
      log.info({ key }, 'Blob deleted');
    } catch (error) {
      log.error({ key, error }, 'Failed to delete blob');
      throw new StorageError(`Failed to delete blob: ${key}`, error);
    }
  }

  async deleteMany(keys: string[]): Promise<void> {
    if (keys.length === 0) return;

    // S3 DeleteObjects supports max 1000 keys per request
    const batches: string[][] = [];
    for (let i = 0; i < keys.length; i += 1000) {
      batches.push(keys.slice(i, i + 1000));
    }

    for (const batch of batches) {
      try {
        await this.client.send(new DeleteObjectsCommand({
          Bucket: this.bucket,
          Delete: {
            Objects: batch.map(key => ({ Key: key })),
            Quiet: true,
          },
        }));
      } catch (error) {
        log.error({ batchSize: batch.length, error }, 'Failed to delete blob batch');
        throw new StorageError('Failed to delete blob batch', error);
      }
    }

    log.info({ count: keys.length }, 'Blobs batch deleted');
  }

  async list(prefix: string, options?: ListOptions): Promise<ListResult> {
    try {
      const response = await this.client.send(new ListObjectsV2Command({
        Bucket: this.bucket,
        Prefix: prefix,
        MaxKeys: options?.maxKeys || 1000,
        ContinuationToken: options?.continuationToken,
        Delimiter: options?.delimiter,
      }));

      const entries = (response.Contents || []).map(item => ({
        key: item.Key || '',
        size: item.Size || 0,
        lastModified: item.LastModified || new Date(),
        etag: item.ETag || '',
        metadata: {},
      }));

      return {
        entries,
        continuationToken: response.NextContinuationToken,
        isTruncated: response.IsTruncated || false,
      };
    } catch (error) {
      log.error({ prefix, error }, 'Failed to list blobs');
      throw new StorageError(`Failed to list blobs with prefix: ${prefix}`, error);
    }
  }

  async copy(sourceKey: string, destKey: string): Promise<void> {
    try {
      await this.client.send(new CopyObjectCommand({
        Bucket: this.bucket,
        CopySource: `${this.bucket}/${sourceKey}`,
        Key: destKey,
      }));
      log.info({ sourceKey, destKey }, 'Blob copied');
    } catch (error) {
      log.error({ sourceKey, destKey, error }, 'Failed to copy blob');
      throw new StorageError(`Failed to copy blob: ${sourceKey} → ${destKey}`, error);
    }
  }

  async getSignedUrl(key: string, expiresInSeconds: number): Promise<string> {
    try {
      const command = new GetObjectCommand({
        Bucket: this.bucket,
        Key: key,
      });
      return await getSignedUrl(this.client, command, { expiresIn: expiresInSeconds });
    } catch (error) {
      log.error({ key, error }, 'Failed to generate signed download URL');
      throw new StorageError(`Failed to generate signed URL for: ${key}`, error);
    }
  }

  async getSignedUploadUrl(key: string, expiresInSeconds: number, contentType?: string): Promise<string> {
    try {
      const command = new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        ContentType: contentType || 'application/octet-stream',
      });
      return await getSignedUrl(this.client, command, { expiresIn: expiresInSeconds });
    } catch (error) {
      log.error({ key, error }, 'Failed to generate signed upload URL');
      throw new StorageError(`Failed to generate signed upload URL for: ${key}`, error);
    }
  }

  async healthCheck(): Promise<boolean> {
    try {
      await this.client.send(new ListObjectsV2Command({
        Bucket: this.bucket,
        MaxKeys: 1,
      }));
      return true;
    } catch (error) {
      log.error({ error }, 'Storage health check failed');
      return false;
    }
  }
}

// ─── Storage Errors ──────────────────────────────────────────────────────────

export class StorageError extends Error {
  public readonly cause?: unknown;

  constructor(message: string, cause?: unknown) {
    super(message);
    this.name = 'StorageError';
    this.cause = cause;
  }
}

export class StorageNotFoundError extends StorageError {
  constructor(message: string) {
    super(message);
    this.name = 'StorageNotFoundError';
  }
}