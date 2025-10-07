// Next.js 15 Server Component + ISR パターン
// サーバーサイドでデータフェッチ → 静的HTML生成

import { createClient } from '@/lib/supabase/server';
import { HallCard } from '@/components/hall-card';
import { Suspense } from 'react';

// ISR: 30分キャッシュ（revalidate）
export const revalidate = 1800;

/**
 * メタデータ生成（SEO対策）
 */
export async function generateMetadata() {
  return {
    title: '店舗一覧 - スロマップAI',
    description: '全国のパチンコ・スロット店舗情報。穴場スコアで簡単検索。',
    openGraph: {
      title: '店舗一覧 - スロマップAI',
      description: '全国3,000店舗の取材・イベント情報',
      url: 'https://slo-map.com/halls',
    },
  };
}

/**
 * 店舗一覧ページ（Server Component）
 */
export default async function HallsPage({
  searchParams,
}: {
  searchParams: { prefecture?: string };
}) {
  const supabase = createClient();

  // サーバーサイドでデータフェッチ
  let query = supabase
    .from('halls')
    .select('*')
    .eq('is_public', true)
    .order('anaba_score', { ascending: false });

  // 都道府県フィルター（URLパラメータから）
  if (searchParams.prefecture) {
    query = query.eq('prefecture', searchParams.prefecture);
  }

  const { data: halls, error } = await query;

  if (error) {
    console.error('[Server Component Error]:', error);
    return (
      <div className="p-8">
        <h1 className="text-2xl font-bold text-red-600">
          エラーが発生しました
        </h1>
        <p className="mt-2 text-gray-600">
          データの取得に失敗しました。しばらくしてから再度お試しください。
        </p>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold mb-6">
        店舗一覧
        {searchParams.prefecture && ` - ${searchParams.prefecture}`}
      </h1>

      <div className="mb-4 text-gray-600">
        {halls.length}件の店舗が見つかりました
      </div>

      {/* Suspenseで遅延読み込み */}
      <Suspense fallback={<HallListSkeleton />}>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {halls.map((hall) => (
            <HallCard key={hall.id} hall={hall} />
          ))}
        </div>
      </Suspense>
    </div>
  );
}

/**
 * スケルトンUI（読み込み中表示）
 */
function HallListSkeleton() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      {[...Array(6)].map((_, i) => (
        <div
          key={i}
          className="h-64 bg-gray-200 rounded-lg animate-pulse"
        />
      ))}
    </div>
  );
}

/**
 * 店舗詳細ページ（SSG: ビルド時生成）
 */
export async function generateStaticParams() {
  const supabase = createClient();

  // ビルド時に全店舗のIDを取得
  const { data: halls } = await supabase
    .from('halls')
    .select('id')
    .eq('is_public', true);

  return halls.map((hall) => ({
    id: hall.id,
  }));
}

/**
 * 店舗詳細ページコンポーネント
 */
export async function HallDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const supabase = createClient();

  // N+1問題解決: JOINで一発取得
  const { data: hall, error } = await supabase
    .from('halls')
    .select(`
      *,
      coverage_events!inner (
        id,
        event_date,
        media_name,
        status,
        title,
        description
      )
    `)
    .eq('id', params.id)
    .eq('coverage_events.status', 'scheduled')
    .single();

  if (error || !hall) {
    return (
      <div className="p-8">
        <h1 className="text-2xl font-bold">店舗が見つかりません</h1>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="text-4xl font-bold mb-4">{hall.name}</h1>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        {/* 店舗情報 */}
        <div className="bg-white p-6 rounded-lg shadow-md">
          <h2 className="text-2xl font-semibold mb-4">店舗情報</h2>
          <dl className="space-y-2">
            <div>
              <dt className="font-medium text-gray-600">住所</dt>
              <dd className="text-lg">
                {hall.prefecture} {hall.city} {hall.address}
              </dd>
            </div>
            <div>
              <dt className="font-medium text-gray-600">穴場スコア</dt>
              <dd className="text-3xl font-bold text-blue-600">
                {hall.anaba_score}点
              </dd>
            </div>
          </dl>
        </div>

        {/* 取材イベント */}
        <div className="bg-white p-6 rounded-lg shadow-md">
          <h2 className="text-2xl font-semibold mb-4">取材予定</h2>
          <ul className="space-y-3">
            {hall.coverage_events.map((event) => (
              <li key={event.id} className="border-l-4 border-blue-500 pl-4">
                <div className="font-medium">{event.event_date}</div>
                <div className="text-gray-600">{event.media_name}</div>
                <div className="text-sm text-gray-500">{event.title}</div>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
