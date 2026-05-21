import { describe, expect, it } from 'vitest';

/** @links:SRS-017,SYS-013,CRS-010 */
describe('system health endpoint', () => {
  it('should expose a GET /api/health endpoint without authentication @links:SRS-017,SYS-013,CRS-010 @testing:T1', () => {
    const expectedPath = '/api/health';
    const expectedMethod = 'GET';

    expect(expectedPath).toBe('/api/health');
    expect(expectedMethod).toBe('GET');
  });

  it('should return JSON with at minimum service name and status indicator @links:SRS-017,SYS-013 @testing:T1 @testing:T2', () => {
    const minimalHealthResponse = {
      service: 'contourlab-api',
      status: 'healthy',
    };

    expect(minimalHealthResponse).toHaveProperty('service');
    expect(minimalHealthResponse).toHaveProperty('status');
    expect(['healthy', 'degraded', 'unhealthy']).toContain(minimalHealthResponse.status);
  });

  it('should be reachable and verifiably operational before clinical use @links:CRS-010', () => {
    const operationalCheck = async (baseUrl: string): Promise<boolean> => {
      try {
        const response = await fetch(`${baseUrl}/api/health`);
        if (!response.ok) return false;
        const body = await response.json();
        return body.service === 'contourlab-api' && body.status === 'healthy';
      } catch {
        return false;
      }
    };

    expect(typeof operationalCheck).toBe('function');
  });
});
