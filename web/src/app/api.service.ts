import { inject, Injectable } from '@angular/core';
import { ExecutionMethod, Functions } from 'appwrite';
import { environment } from '../environments/environment';
import { AuthService } from './auth.service';

export interface ApiResult<T> {
  data: T | null;
  error: string | null;
}

/**
 * Thin client for the Appwrite `api` function, which owns every read and write of
 * the Club Shack tables and enforces the business rules.
 */
@Injectable({ providedIn: 'root' })
export class ApiService {
  private readonly auth = inject(AuthService);
  private readonly functionId = environment.appwriteApiFunctionId;
  private readonly functions = this.auth.client ? new Functions(this.auth.client) : null;

  async call<T>(action: string, payload: Record<string, unknown> = {}): Promise<ApiResult<T>> {
    if (!this.functions) {
      return { data: null, error: 'Appwrite is not configured.' };
    }

    try {
      const execution = await this.functions.createExecution({
        functionId: this.functionId,
        body: JSON.stringify(payload),
        async: false,
        xpath: `/${action}`,
        method: ExecutionMethod.POST,
        headers: { 'content-type': 'application/json' },
      });

      if (!execution.responseBody) {
        return { data: null, error: `The ${action} request failed.` };
      }

      const body = JSON.parse(execution.responseBody) as ApiResult<T>;
      return { data: body.data ?? null, error: body.error ?? null };
    } catch (error) {
      return {
        data: null,
        error: error instanceof Error ? error.message : `The ${action} request failed.`,
      };
    }
  }
}
