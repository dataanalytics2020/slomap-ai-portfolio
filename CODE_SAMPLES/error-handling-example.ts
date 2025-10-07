// Sentryエラーハンドリング + カスタムエラークラス
// 本番環境でのエラー監視・通知システム

import * as Sentry from '@sentry/nextjs';
import { NextRequest, NextResponse } from 'next/server';

/**
 * カスタムAPIエラークラス
 */
export class ApiError extends Error {
  constructor(
    message: string,
    public statusCode: number = 500,
    public code?: string,
    public details?: any
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/**
 * データベースエラークラス
 */
export class DatabaseError extends ApiError {
  constructor(message: string, details?: any) {
    super(message, 500, 'DATABASE_ERROR', details);
    this.name = 'DatabaseError';
  }
}

/**
 * 認証エラークラス
 */
export class AuthenticationError extends ApiError {
  constructor(message: string = '認証が必要です') {
    super(message, 401, 'AUTHENTICATION_ERROR');
    this.name = 'AuthenticationError';
  }
}

/**
 * バリデーションエラークラス
 */
export class ValidationError extends ApiError {
  constructor(message: string, details?: any) {
    super(message, 400, 'VALIDATION_ERROR', details);
    this.name = 'ValidationError';
  }
}

/**
 * APIエラーハンドラー（Sentry統合）
 */
export function handleApiError(
  error: any,
  endpoint: string,
  method: string = 'GET',
  params?: Record<string, any>,
  request?: NextRequest
): NextResponse {
  // エラータイプ判定
  const isApiError = error instanceof ApiError;
  const statusCode = isApiError ? error.statusCode : 500;

  // Sentryにエラー送信
  Sentry.captureException(error, {
    tags: {
      endpoint,
      method,
      error_type: error.name || 'UnknownError',
      error_code: isApiError ? error.code : undefined,
    },
    contexts: {
      params: params || {},
      url: request?.url,
      headers: request ? Object.fromEntries(request.headers.entries()) : {},
    },
    level: statusCode >= 500 ? 'error' : 'warning',
  });

  // ログ出力（開発環境のみ詳細表示）
  if (process.env.NODE_ENV === 'development') {
    console.error(`[API Error] ${method} ${endpoint}:`, {
      message: error.message,
      statusCode,
      code: isApiError ? error.code : undefined,
      stack: error.stack,
    });
  }

  // クライアントへのレスポンス
  return NextResponse.json(
    {
      error: isApiError ? error.message : 'サーバーエラーが発生しました',
      code: isApiError ? error.code : 'INTERNAL_SERVER_ERROR',
      details: process.env.NODE_ENV === 'development' && isApiError
        ? error.details
        : undefined,
    },
    { status: statusCode }
  );
}

/**
 * TypeErrorの特別処理（型エラーは重大）
 */
export function handleTypeError(
  error: TypeError,
  context: string,
  request?: NextRequest
): NextResponse {
  // Sentryに重大エラーとして送信
  Sentry.captureException(error, {
    tags: {
      error_type: 'TypeError',
      context,
      critical: 'true',
    },
    contexts: {
      url: request?.url,
    },
    level: 'fatal',
  });

  // 開発環境ではスタックトレース表示
  if (process.env.NODE_ENV === 'development') {
    console.error('[TypeError]:', error.message);
    console.error(error.stack);
  }

  return NextResponse.json(
    {
      error: '型エラーが発生しました。管理者に通知されました。',
      code: 'TYPE_ERROR',
    },
    { status: 500 }
  );
}

/**
 * 使用例: API Route
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    // バリデーション
    if (!id) {
      throw new ValidationError('IDが指定されていません', { id });
    }

    const supabase = createClient();
    const { data, error } = await supabase
      .from('halls')
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      throw new DatabaseError('データベースクエリに失敗しました', error);
    }

    if (!data) {
      throw new ApiError('店舗が見つかりません', 404, 'NOT_FOUND');
    }

    return NextResponse.json({ data });
  } catch (error) {
    if (error instanceof TypeError) {
      return handleTypeError(error, 'GET /api/halls', request);
    }

    return handleApiError(error, '/api/halls', 'GET', {}, request);
  }
}

/**
 * 使用例: Server Component
 */
export async function HallDetailPage({ params }: { params: { id: string } }) {
  try {
    const supabase = createClient();
    const { data: hall, error } = await supabase
      .from('halls')
      .select('*')
      .eq('id', params.id)
      .single();

    if (error) {
      throw new DatabaseError('データ取得に失敗しました', error);
    }

    // 型チェック（TypeErrorを避ける）
    if (!hall || typeof hall.name !== 'string') {
      throw new TypeError('Invalid hall data structure');
    }

    return (
      <div>
        <h1>{hall.name}</h1>
        <p>{hall.description}</p>
      </div>
    );
  } catch (error) {
    if (error instanceof TypeError) {
      // Sentryに送信
      Sentry.captureException(error, {
        tags: { component: 'HallDetailPage', hall_id: params.id },
        level: 'fatal',
      });

      return (
        <div className="p-8 bg-red-50">
          <h1 className="text-2xl font-bold text-red-600">エラー</h1>
          <p className="mt-2">データ構造エラーが発生しました。</p>
        </div>
      );
    }

    if (error instanceof DatabaseError) {
      return (
        <div className="p-8 bg-yellow-50">
          <h1 className="text-2xl font-bold text-yellow-600">
            データベースエラー
          </h1>
          <p className="mt-2">
            データの取得に失敗しました。しばらくしてから再度お試しください。
          </p>
        </div>
      );
    }

    // 予期しないエラー
    Sentry.captureException(error);
    return (
      <div className="p-8 bg-gray-50">
        <h1 className="text-2xl font-bold">エラーが発生しました</h1>
      </div>
    );
  }
}

/**
 * グローバルエラーバウンダリ
 */
export function GlobalErrorBoundary({
  error,
  reset,
}: {
  error: Error;
  reset: () => void;
}) {
  // Sentryに送信
  Sentry.captureException(error, {
    tags: { boundary: 'global' },
    level: 'fatal',
  });

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100">
      <div className="bg-white p-8 rounded-lg shadow-md max-w-md">
        <h1 className="text-3xl font-bold text-red-600 mb-4">
          エラーが発生しました
        </h1>
        <p className="text-gray-600 mb-6">
          申し訳ございません。予期しないエラーが発生しました。
          エラー内容は自動的に管理者に報告されました。
        </p>
        <button
          onClick={reset}
          className="w-full bg-blue-600 text-white py-2 px-4 rounded-md
                     hover:bg-blue-700 transition-colors"
        >
          リトライ
        </button>
      </div>
    </div>
  );
}
