// Next.js 15 API Route + Supabase SSR パターン
// Edge Runtime使用で高速レスポンス

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// Edge Runtime指定（レイテンシ削減）
export const runtime = 'edge';

/**
 * 店舗検索API
 * @param request - NextRequest（URLパラメータ含む）
 * @returns JSON形式の店舗一覧
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const prefecture = searchParams.get('prefecture');
    const minScore = searchParams.get('min_score');

    // Supabaseサーバークライアント作成
    const supabase = createClient();

    // クエリ構築
    let query = supabase
      .from('halls')
      .select('*')
      .eq('is_public', true)
      .order('anaba_score', { ascending: false });

    // 都道府県フィルター
    if (prefecture) {
      query = query.eq('prefecture', prefecture);
    }

    // 穴場スコアフィルター
    if (minScore) {
      query = query.gte('anaba_score', parseInt(minScore, 10));
    }

    const { data, error } = await query;

    if (error) {
      throw error;
    }

    // レスポンス返却（キャッシュ制御付き）
    return NextResponse.json(
      { data, count: data.length },
      {
        status: 200,
        headers: {
          // stale-while-revalidate戦略
          'Cache-Control': 's-maxage=60, stale-while-revalidate=300',
          'Content-Type': 'application/json',
        },
      }
    );
  } catch (error) {
    console.error('[API Error] /api/halls:', error);

    return NextResponse.json(
      {
        error: 'データ取得に失敗しました',
        message: process.env.NODE_ENV === 'development' ? error.message : undefined,
      },
      { status: 500 }
    );
  }
}

/**
 * 店舗登録API（認証必須）
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = createClient();

    // 認証チェック
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { error: '認証が必要です' },
        { status: 401 }
      );
    }

    // リクエストボディ取得
    const body = await request.json();

    // バリデーション
    if (!body.name || !body.prefecture || !body.city) {
      return NextResponse.json(
        { error: '必須項目が不足しています' },
        { status: 400 }
      );
    }

    // データ挿入
    const { data, error } = await supabase
      .from('halls')
      .insert([
        {
          name: body.name,
          prefecture: body.prefecture,
          city: body.city,
          address: body.address,
          latitude: body.latitude,
          longitude: body.longitude,
          is_public: false, // デフォルト非公開
        },
      ])
      .select()
      .single();

    if (error) {
      throw error;
    }

    return NextResponse.json(
      { data, message: '店舗を登録しました' },
      { status: 201 }
    );
  } catch (error) {
    console.error('[API Error] POST /api/halls:', error);

    return NextResponse.json(
      { error: '登録に失敗しました' },
      { status: 500 }
    );
  }
}
